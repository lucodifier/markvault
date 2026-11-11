mod storage;
use base64::Engine;
use notify::{RecursiveMode, Watcher};
use serde::Serialize;
use std::{fs, path::PathBuf, sync::Mutex};
use tauri::{Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use storage::{ContentMatch, Entry, LocalFilesystemProvider, Result, Snapshot};
const MAX_MATCHES: usize = 200;

struct Vault { provider: LocalFilesystemProvider, _watcher: notify::RecommendedWatcher }
#[derive(Default)]
struct AppState(Mutex<Option<Vault>>);
#[derive(Serialize)]
struct Workspace { name: String, path: String }

// `canonicalize` yields extended-length paths (`\\?\C:\...`); users copy this path into
// terminals, Explorer and chat prompts, so expose the plain Windows form instead.
fn display_path(path: &PathBuf) -> String {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") { return format!(r"\\{rest}") }
    text.strip_prefix(r"\\?\").unwrap_or(&text).to_string()
}
fn activate(app: &tauri::AppHandle, state: &AppState, path: PathBuf) -> Result<Workspace> {
    let provider = LocalFilesystemProvider::new(&path)?;
    let root = provider.root.clone();
    let handle = app.clone();
    let mut watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        match event {
            Ok(event) if !matches!(event.kind, notify::EventKind::Access(_)) => { let _ = handle.emit("workspace-changed", ()); }
            Err(error) => { let _ = handle.emit("workspace-watch-error", error.to_string()); }
            _ => {}
        }
    }).map_err(|e| e.to_string())?;
    watcher.watch(&root, RecursiveMode::Recursive).map_err(|e| e.to_string())?;
    let workspace = Workspace { name: root.file_name().unwrap_or(root.as_os_str()).to_string_lossy().into(), path: display_path(&root) };
    *state.0.lock().map_err(|e| e.to_string())? = Some(Vault { provider, _watcher: watcher });
    Ok(workspace)
}
fn with<T>(state: &AppState, f: impl FnOnce(&LocalFilesystemProvider) -> Result<T>) -> Result<T> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    f(&guard.as_ref().ok_or("Abra um workspace primeiro.")?.provider)
}
fn settings(app: &tauri::AppHandle) -> Result<PathBuf> { Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("workspace.json")) }

#[tauri::command]
async fn open_workspace(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<Option<Workspace>> {
    let picked = app.dialog().file().blocking_pick_folder();
    let Some(picked) = picked else { return Ok(None) };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    // Do not switch the active backend if persisting the user's selection fails.
    let validated = LocalFilesystemProvider::new(&path)?;
    let config = settings(&app)?;
    fs::create_dir_all(config.parent().ok_or("Configuração inválida")?).map_err(|e| e.to_string())?;
    let workspace = activate(&app, &state, validated.root.clone())?;
    // Persistence is optional once activation succeeds: report the workspace even if a later
    // settings write fails, keeping frontend and backend on the same authorized root.
    if let Err(error) = fs::write(config, serde_json::to_string(&workspace.path).map_err(|e| e.to_string())?) {
        let _ = app.emit("workspace-watch-error", format!("A pasta foi aberta, mas não será lembrada: {error}"));
    }
    Ok(Some(workspace))
}
#[tauri::command]
fn restore_workspace(app: tauri::AppHandle, state: State<AppState>) -> Result<Option<Workspace>> {
    let config = settings(&app)?;
    if !config.exists() { return Ok(None); }
    let path: String = serde_json::from_str(&fs::read_to_string(config).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    activate(&app, &state, PathBuf::from(path)).map(Some)
}
#[tauri::command]
fn list_files(state: State<AppState>) -> Result<Vec<Entry>> { with(&state, |p| p.list()) }
#[tauri::command]
fn read_file(state: State<AppState>, path: String) -> Result<Snapshot> { with(&state, |p| p.read(&path)) }
#[tauri::command]
fn write_file(state: State<AppState>, path: String, content: String, expected_revision: String) -> Result<Snapshot> { with(&state, |p| p.write(&path, &content, &expected_revision)) }
#[tauri::command]
fn create_file(state: State<AppState>, path: String, content: String) -> Result<()> { with(&state, |p| p.create(&path, &content)) }
#[tauri::command]
fn create_directory(state: State<AppState>, path: String) -> Result<()> { with(&state, |p| p.mkdir(&path)) }
#[tauri::command]
fn rename_file(state: State<AppState>, path: String, destination: String) -> Result<()> { with(&state, |p| p.rename(&path, &destination)) }
#[tauri::command]
fn delete_file(state: State<AppState>, path: String) -> Result<()> { with(&state, |p| p.delete(&path)) }
// Scanning a vault blocks, so run it off the IPC thread and keep the UI responsive.
#[tauri::command]
async fn search_content(state: State<'_, AppState>, query: String) -> Result<Vec<ContentMatch>> {
    let provider = LocalFilesystemProvider { root: with(&state, |p| Ok(p.root.clone()))? };
    tauri::async_runtime::spawn_blocking(move || provider.search(&query, MAX_MATCHES)).await.map_err(|e| e.to_string())?
}
#[tauri::command]
fn read_asset(state: State<AppState>, path: String) -> Result<String> {
    with(&state, |p| {
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
fn open_attachment(app: tauri::AppHandle, state: State<AppState>, path: String) -> Result<()> {
    with(&state, |p| {
        let target = p.resolve(&path, true)?;
        let ext = target.extension().unwrap_or_default().to_string_lossy().to_lowercase();
        if !target.is_file() || !["pdf", "txt", "csv", "docx", "xlsx", "pptx", "odt", "ods", "odp", "png", "jpg", "jpeg", "gif", "webp", "avif"].contains(&ext.as_str()) {
            return Err("Tipo de anexo não suportado. Use PDF, texto, imagens ou documentos Office/OpenDocument.".into());
        }
        app.opener().open_path(target.to_string_lossy().into_owned(), None::<&str>).map_err(|e| e.to_string())
    })
}
pub fn run() {
    tauri::Builder::default().manage(AppState::default())
        .plugin(tauri_plugin_dialog::init()).plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![open_workspace, restore_workspace, list_files, read_file, write_file, create_file, create_directory, rename_file, delete_file, read_asset, search_content, open_external, open_attachment])
        .run(tauri::generate_context!()).expect("Falha ao iniciar MarkVault");
}
