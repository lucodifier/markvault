mod storage;
use base64::Engine;
use notify::{RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::{fs, path::{Path, PathBuf}, sync::Mutex};
use tauri::{Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use storage::{check_not_link, Entry, LocalFilesystemProvider, Result, Snapshot};
const MAX_MATCHES: usize = 200;

struct Vault {
    id: String,
    name: String,
    provider: LocalFilesystemProvider,
    _watcher: notify::RecommendedWatcher,
}
#[derive(Default)]
struct InnerState {
    vaults: Vec<Vault>,
    active_workspace: Option<String>,
    pending_open: Option<PathBuf>,
}
#[derive(Default)]
struct AppState(Mutex<InnerState>);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Workspace {
    name: String,
    path: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct InitialFile {
    workspace_path: String,
    path: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceSession {
    workspaces: Vec<Workspace>,
    #[serde(skip_serializing_if = "Option::is_none")]
    active_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    initial_file: Option<InitialFile>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ContentMatch {
    workspace_path: String,
    workspace_name: String,
    path: String,
    name: String,
    line: usize,
    text: String,
}
#[derive(Default, Deserialize, Serialize)]
struct SavedWorkspaces {
    folders: Vec<String>,
    active: Option<String>,
}

// `canonicalize` yields extended-length paths (`\\?\C:\...`); users copy this path into
// terminals, Explorer and chat prompts, so expose the plain Windows form instead.
fn display_path(path: &Path) -> String {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") { return format!(r"\\{rest}") }
    text.strip_prefix(r"\\?\").unwrap_or(&text).to_string()
}
fn extract_launch_path<I, S>(args: I) -> Option<PathBuf>
where I: IntoIterator<Item = S>, S: AsRef<str> {
    args.into_iter().skip(1).find_map(|raw| {
        let trimmed = raw.as_ref().trim();
        if trimmed.is_empty() || trimmed.starts_with('-') { None } else { Some(PathBuf::from(trimmed)) }
    })
}
fn resolve_launch_target(target: &Path, preferred_roots: &[PathBuf]) -> Result<(PathBuf, Option<String>)> {
    let meta = fs::symlink_metadata(target).map_err(|e| e.to_string())?;
    check_not_link(&meta)?;
    let canonical = target.canonicalize().map_err(|e| e.to_string())?;
    if canonical.is_dir() {
        return Ok((canonical, None));
    }
    if canonical.is_file() {
        let ext = canonical.extension().unwrap_or_default().to_string_lossy().to_lowercase();
        if ext != "md" {
            return Err("Somente documentos .md podem ser abertos no MarkVault.".into());
        }
        // Prefer the deepest already-open ancestor workspace containing this file.
        let mut best: Option<(usize, PathBuf, String)> = None;
        for root in preferred_roots {
            if let Ok(provider) = LocalFilesystemProvider::new(root) {
                if let Ok(rel) = canonical.strip_prefix(&provider.root) {
                    let relative = rel.to_string_lossy().replace('\\', "/");
                    if !relative.is_empty() && provider.resolve(&relative, true).is_ok() {
                        let depth = provider.root.components().count();
                        if best.as_ref().map(|(d, _, _)| depth > *d).unwrap_or(true) {
                            best = Some((depth, provider.root, relative));
                        }
                    }
                }
            }
        }
        if let Some((_, root, relative)) = best {
            return Ok((root, Some(relative)));
        }
        let parent = canonical.parent().ok_or("Não foi possível determinar a pasta do arquivo.")?.to_path_buf();
        let name = canonical.file_name().ok_or("Nome de arquivo inválido.")?.to_string_lossy().into_owned();
        let provider = LocalFilesystemProvider::new(&parent)?;
        provider.resolve(&name, true)?;
        return Ok((provider.root, Some(name)));
    }
    Err("Caminho selecionado não é uma pasta nem um documento .md.".into())
}
fn workspaces_file(app: &tauri::AppHandle) -> Result<PathBuf> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("workspaces.json"))
}
fn legacy_settings(app: &tauri::AppHandle) -> Result<PathBuf> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("workspace.json"))
}
fn load_saved_workspaces(app: &tauri::AppHandle) -> SavedWorkspaces {
    if let Ok(file) = workspaces_file(app) {
        if file.exists() {
            if let Ok(text) = fs::read_to_string(&file) {
                if let Ok(saved) = serde_json::from_str::<SavedWorkspaces>(&text) {
                    return saved;
                }
            }
        }
    }
    if let Ok(legacy) = legacy_settings(app) {
        if legacy.exists() {
            if let Ok(text) = fs::read_to_string(&legacy) {
                if let Ok(path) = serde_json::from_str::<String>(&text) {
                    return SavedWorkspaces { folders: vec![path.clone()], active: Some(path) };
                }
            }
        }
    }
    SavedWorkspaces::default()
}
fn persist_workspaces(app: &tauri::AppHandle, state: &InnerState) {
    let saved = SavedWorkspaces {
        folders: state.vaults.iter().map(|v| v.id.clone()).collect(),
        active: state.active_workspace.clone(),
    };
    if let Ok(file) = workspaces_file(app) {
        if let Some(parent) = file.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(serialized) = serde_json::to_string(&saved) {
            if let Err(error) = fs::write(file, serialized) {
                let _ = app.emit("workspace-watch-error", format!("A pasta foi aberta, mas não será lembrada: {error}"));
            }
        }
    }
}
fn snapshot_session(guard: &InnerState, initial_file: Option<InitialFile>) -> WorkspaceSession {
    WorkspaceSession {
        workspaces: guard.vaults.iter().map(|v| Workspace { name: v.name.clone(), path: v.id.clone() }).collect(),
        active_path: guard.active_workspace.clone().or_else(|| guard.vaults.first().map(|v| v.id.clone())),
        initial_file,
    }
}
fn attach_vault(app: &tauri::AppHandle, guard: &mut InnerState, path: &Path) -> Result<String> {
    let provider = LocalFilesystemProvider::new(path)?;
    let root = provider.root.clone();
    let id = display_path(&root);
    if guard.vaults.iter().any(|v| v.provider.root == root) {
        guard.active_workspace = Some(id.clone());
        return Ok(id);
    }
    let name: String = root.file_name().unwrap_or(root.as_os_str()).to_string_lossy().into();
    let handle = app.clone();
    let emit_id = id.clone();
    let mut watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        match event {
            Ok(event) if !matches!(event.kind, notify::EventKind::Access(_)) => { let _ = handle.emit("workspace-changed", emit_id.clone()); }
            Err(error) => { let _ = handle.emit("workspace-watch-error", error.to_string()); }
            _ => {}
        }
    }).map_err(|e| e.to_string())?;
    watcher.watch(&root, RecursiveMode::Recursive).map_err(|e| e.to_string())?;
    guard.vaults.push(Vault { id: id.clone(), name, provider, _watcher: watcher });
    guard.active_workspace = Some(id.clone());
    Ok(id)
}
fn with_workspace<T>(state: &AppState, workspace: Option<&str>, f: impl FnOnce(&LocalFilesystemProvider) -> Result<T>) -> Result<T> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let vault = match workspace {
        Some(id) => guard.vaults.iter().find(|v| v.id == id),
        None => guard.active_workspace.as_deref()
            .and_then(|id| guard.vaults.iter().find(|v| v.id == id))
            .or_else(|| guard.vaults.first()),
    }.ok_or("Abra uma pasta primeiro.")?;
    f(&vault.provider)
}

#[tauri::command]
async fn open_workspace(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<Option<WorkspaceSession>> {
    let picked = app.dialog().file().blocking_pick_folder();
    let Some(picked) = picked else { return Ok(None) };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    attach_vault(&app, &mut guard, &path)?;
    persist_workspaces(&app, &guard);
    Ok(Some(snapshot_session(&guard, None)))
}
#[tauri::command]
fn remove_workspace(app: tauri::AppHandle, state: State<AppState>, workspace: String) -> Result<WorkspaceSession> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    guard.vaults.retain(|v| v.id != workspace);
    if guard.active_workspace.as_deref() == Some(workspace.as_str()) {
        guard.active_workspace = guard.vaults.first().map(|v| v.id.clone());
    }
    persist_workspaces(&app, &guard);
    Ok(snapshot_session(&guard, None))
}
#[tauri::command]
fn restore_workspace(app: tauri::AppHandle, state: State<AppState>) -> Result<WorkspaceSession> {
    let saved = load_saved_workspaces(&app);
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    for folder in &saved.folders {
        let _ = attach_vault(&app, &mut guard, Path::new(folder));
    }
    if let Some(active) = saved.active {
        if guard.vaults.iter().any(|v| v.id == active) {
            guard.active_workspace = Some(active);
        }
    }
    let mut initial_file = None;
    if let Some(target) = guard.pending_open.take() {
        let roots: Vec<PathBuf> = guard.vaults.iter().map(|v| v.provider.root.clone()).collect();
        let (root, file) = resolve_launch_target(&target, &roots)?;
        let ws_id = attach_vault(&app, &mut guard, &root)?;
        if let Some(rel) = file {
            initial_file = Some(InitialFile { workspace_path: ws_id, path: rel });
        }
        persist_workspaces(&app, &guard);
    }
    Ok(snapshot_session(&guard, initial_file))
}
#[tauri::command]
fn consume_external_open(app: tauri::AppHandle, state: State<AppState>) -> Result<Option<WorkspaceSession>> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let Some(target) = guard.pending_open.take() else { return Ok(None) };
    let roots: Vec<PathBuf> = guard.vaults.iter().map(|v| v.provider.root.clone()).collect();
    let (root, file) = resolve_launch_target(&target, &roots)?;
    let ws_id = attach_vault(&app, &mut guard, &root)?;
    persist_workspaces(&app, &guard);
    let initial_file = file.map(|rel| InitialFile { workspace_path: ws_id, path: rel });
    Ok(Some(snapshot_session(&guard, initial_file)))
}
#[tauri::command]
async fn list_files(state: State<'_, AppState>, workspace: Option<String>) -> Result<Vec<Entry>> {
    let provider = LocalFilesystemProvider { root: with_workspace(&state, workspace.as_deref(), |p| Ok(p.root.clone()))? };
    tauri::async_runtime::spawn_blocking(move || provider.list()).await.map_err(|e| e.to_string())?
}
#[tauri::command]
fn read_file(state: State<AppState>, path: String, workspace: Option<String>) -> Result<Snapshot> {
    with_workspace(&state, workspace.as_deref(), |p| p.read(&path))
}
#[tauri::command]
fn write_file(state: State<AppState>, path: String, content: String, expected_revision: String, workspace: Option<String>) -> Result<Snapshot> {
    with_workspace(&state, workspace.as_deref(), |p| p.write(&path, &content, &expected_revision))
}
#[tauri::command]
fn create_file(state: State<AppState>, path: String, content: String, workspace: Option<String>) -> Result<()> {
    with_workspace(&state, workspace.as_deref(), |p| p.create(&path, &content))
}
#[tauri::command]
fn create_directory(state: State<AppState>, path: String, workspace: Option<String>) -> Result<()> {
    with_workspace(&state, workspace.as_deref(), |p| p.mkdir(&path))
}
#[tauri::command]
fn rename_file(state: State<AppState>, path: String, destination: String, workspace: Option<String>) -> Result<()> {
    with_workspace(&state, workspace.as_deref(), |p| p.rename(&path, &destination))
}
#[tauri::command]
fn delete_file(state: State<AppState>, path: String, workspace: Option<String>) -> Result<()> {
    with_workspace(&state, workspace.as_deref(), |p| p.delete(&path))
}
// Scanning vaults blocks, so run it off the IPC thread and keep the UI responsive.
#[tauri::command]
async fn search_content(state: State<'_, AppState>, query: String) -> Result<Vec<ContentMatch>> {
    let targets: Vec<(String, String, PathBuf)> = {
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        if guard.vaults.is_empty() { return Err("Abra uma pasta primeiro.".into()); }
        guard.vaults.iter().map(|v| (v.id.clone(), v.name.clone(), v.provider.root.clone())).collect()
    };
    tauri::async_runtime::spawn_blocking(move || {
        let mut all = Vec::new();
        for (ws_path, ws_name, root) in targets {
            let remaining = MAX_MATCHES.saturating_sub(all.len());
            if remaining == 0 { break; }
            let provider = LocalFilesystemProvider { root };
            let hits = provider.search(&query, remaining)?;
            for hit in hits {
                all.push(ContentMatch {
                    workspace_path: ws_path.clone(),
                    workspace_name: ws_name.clone(),
                    path: hit.path,
                    name: hit.name,
                    line: hit.line,
                    text: hit.text,
                });
            }
        }
        Ok(all)
    }).await.map_err(|e| e.to_string())?
}
#[tauri::command]
fn read_asset(state: State<AppState>, path: String, workspace: Option<String>) -> Result<String> {
    with_workspace(&state, workspace.as_deref(), |p| {
        let target = p.resolve(&path, true)?;
        let ext = target.extension().unwrap_or_default().to_string_lossy().to_lowercase();
        let mime = match ext.as_str() { "png" => "image/png", "jpg" | "jpeg" => "image/jpeg", "gif" => "image/gif", "webp" => "image/webp", "avif" => "image/avif", _ => return Err("Formato de imagem não suportado. Use PNG, JPEG, GIF, WebP ou AVIF.".into()) };
        if fs::metadata(&target).map_err(|e| e.to_string())?.len() > 20 * 1024 * 1024 { return Err("Imagem excede 20 MB.".into()); }
        let bytes = fs::read(target).map_err(|e| e.to_string())?;
        Ok(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
    })
}
#[tauri::command]
fn open_external(app: tauri::AppHandle, url: String) -> Result<()> {
    let lower = url.to_lowercase();
    if !lower.starts_with("https://") && !lower.starts_with("http://") && !lower.starts_with("mailto:") { return Err("Link não permitido.".into()); }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}
#[tauri::command]
fn open_attachment(app: tauri::AppHandle, state: State<AppState>, path: String, workspace: Option<String>) -> Result<()> {
    with_workspace(&state, workspace.as_deref(), |p| {
        let target = p.resolve(&path, true)?;
        let ext = target.extension().unwrap_or_default().to_string_lossy().to_lowercase();
        if !target.is_file() || !["pdf", "txt", "csv", "docx", "xlsx", "pptx", "odt", "ods", "odp", "png", "jpg", "jpeg", "gif", "webp", "avif"].contains(&ext.as_str()) {
            return Err("Tipo de anexo não suportado. Use PDF, texto, imagens ou documentos Office/OpenDocument.".into());
        }
        app.opener().open_path(target.to_string_lossy().into_owned(), None::<&str>).map_err(|e| e.to_string())
    })
}
pub fn run() {
    let initial_target = extract_launch_path(std::env::args());
    let state = AppState(Mutex::new(InnerState { vaults: Vec::new(), active_workspace: None, pending_open: initial_target }));
    tauri::Builder::default()
        .manage(state)
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
            if let Some(target) = extract_launch_path(argv) {
                if let Ok(mut guard) = app.state::<AppState>().0.lock() {
                    guard.pending_open = Some(target);
                }
                let _ = app.emit("external-open-requested", ());
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![open_workspace, remove_workspace, restore_workspace, consume_external_open, list_files, read_file, write_file, create_file, create_directory, rename_file, delete_file, read_asset, search_content, open_external, open_attachment])
        .run(tauri::generate_context!()).expect("Falha ao iniciar MarkVault");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn extracts_first_non_flag_launch_path() {
        assert_eq!(extract_launch_path(["markvault.exe"]), None);
        assert_eq!(extract_launch_path(["markvault.exe", "--flag", "C:\\Notas\\doc.md"]), Some(PathBuf::from("C:\\Notas\\doc.md")));
        assert_eq!(extract_launch_path(["markvault.exe", "C:\\Notas"]), Some(PathBuf::from("C:\\Notas")));
    }
    #[test] fn resolves_folder_and_markdown_targets() {
        let dir = tempfile::tempdir().unwrap();
        let sub = dir.path().join("Projetos");
        fs::create_dir_all(&sub).unwrap();
        let note = sub.join("ideia.md");
        fs::write(&note, "# Ideia").unwrap();
        let txt = sub.join("outro.txt");
        fs::write(&txt, "texto").unwrap();

        let (root, file) = resolve_launch_target(&sub, &[]).unwrap();
        assert_eq!(root, sub.canonicalize().unwrap());
        assert_eq!(file, None);

        let (root, file) = resolve_launch_target(&note, &[]).unwrap();
        assert_eq!(root, sub.canonicalize().unwrap());
        assert_eq!(file.as_deref(), Some("ideia.md"));

        let (root, file) = resolve_launch_target(&note, &[dir.path().to_path_buf()]).unwrap();
        assert_eq!(root, dir.path().canonicalize().unwrap());
        assert_eq!(file.as_deref(), Some("Projetos/ideia.md"));

        assert!(resolve_launch_target(&txt, &[]).is_err());
    }
}
