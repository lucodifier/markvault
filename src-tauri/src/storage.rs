use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{fs, io::Write, path::{Component, Path, PathBuf}};

pub type Result<T> = std::result::Result<T, String>;
const MAX_DOCUMENT: u64 = 16 * 1024 * 1024;
const MAX_IMAGE: u64 = 20 * 1024 * 1024;
const IMAGE_EXTENSIONS: [&str; 6] = ["png", "jpg", "jpeg", "gif", "webp", "avif"];

pub fn is_image_path(path: &str) -> bool {
    let ext = Path::new(path).extension().unwrap_or_default().to_string_lossy().to_lowercase();
    IMAGE_EXTENSIONS.contains(&ext.as_str())
}

fn is_editable_entry(path: &str) -> bool {
    path.to_lowercase().ends_with(".md") || is_image_path(path)
}

#[derive(Clone, Debug, Serialize)]
pub struct Snapshot { pub content: String, pub revision: String }
#[derive(Serialize)]
pub struct Entry { pub path: String, pub name: String, pub directory: bool, pub children: Vec<Entry> }
#[derive(Debug, Serialize)]
pub struct ContentMatch { pub path: String, pub name: String, pub line: usize, pub text: String }

pub struct LocalFilesystemProvider { pub root: PathBuf }

pub fn check_not_link(meta: &fs::Metadata) -> Result<()> {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return Err("Links e junctions não são permitidos.".into());
        }
    }
    if meta.file_type().is_symlink() {
        return Err("Links simbólicos não são permitidos.".into());
    }
    Ok(())
}

fn validate_component_name(name: &str) -> Result<()> {
    if name.ends_with('.') || name.ends_with(' ') || name.chars().any(|c| c.is_control() || "<>\"|?*".contains(c)) {
        return Err("Nome de arquivo inválido.".into());
    }
    let base = name.split('.').next().unwrap_or("").to_uppercase();
    if ["CON", "PRN", "AUX", "NUL"].contains(&base.as_str()) || (base.len() == 4 && (base.starts_with("COM") || base.starts_with("LPT")) && matches!(base.as_bytes()[3], b'1'..=b'9')) {
        return Err("Nome reservado pelo Windows.".into());
    }
    Ok(())
}

impl LocalFilesystemProvider {
    pub fn new(root: &Path) -> Result<Self> {
        let root = root.canonicalize().map_err(|e| e.to_string())?;
        if !root.is_dir() { return Err("Selecione um diretório.".into()); }
        Ok(Self { root })
    }
    // Reject symlinks/junctions at every component, including links pointing inside the vault.
    // Canonical containment also handles platform-specific path aliases.
    pub fn resolve(&self, relative: &str, exists: bool) -> Result<PathBuf> {
        if relative.is_empty() || relative.contains('\\') || relative.contains(':') || relative.contains('\0') {
            return Err("Caminho relativo inválido.".into());
        }
        let path = Path::new(relative);
        if path.components().any(|c| !matches!(c, Component::Normal(_))) {
            return Err("O caminho deve permanecer dentro do workspace.".into());
        }
        let mut target = self.root.clone();
        let count = path.components().count();
        for (i, component) in path.components().enumerate() {
            let name = component.as_os_str().to_string_lossy();
            validate_component_name(&name)?;
            target.push(component);
            match fs::symlink_metadata(&target) {
                Ok(meta) => {
                    check_not_link(&meta)?;
                    let canonical = target.canonicalize().map_err(|e| e.to_string())?;
                    if !canonical.starts_with(&self.root) { return Err("Acesso fora do workspace.".into()); }
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound && !exists && i == count - 1 => {}
                Err(e) => return Err(e.to_string()),
            }
        }
        Ok(target)
    }
    fn markdown(&self, path: &str, exists: bool) -> Result<PathBuf> {
        if !path.to_lowercase().ends_with(".md") { return Err("Somente documentos .md são editáveis.".into()); }
        self.resolve(path, exists)
    }
    pub fn list(&self) -> Result<Vec<Entry>> { self.list_at(&self.root, 0) }
    fn list_at(&self, dir: &Path, depth: usize) -> Result<Vec<Entry>> {
        if depth > 64 { return Err("A árvore excedeu 64 níveis de diretórios.".into()); }
        let mut entries = vec![];
        for item in fs::read_dir(dir).map_err(|e| e.to_string())? {
            let item = item.map_err(|e| e.to_string())?;
            let path = item.path();
            let name = item.file_name().to_string_lossy().to_string();
            // Internal temp files and VCS/dependency folders are not document collections.
            if name.starts_with(".markvault-") || [".git", "node_modules"].contains(&name.as_str()) { continue; }
            if validate_component_name(&name).is_err() { continue; }
            let Ok(meta) = fs::symlink_metadata(&path) else { continue };
            if check_not_link(&meta).is_err() { continue; }
            let directory = meta.is_dir();
            if !directory && !is_editable_entry(&name) { continue; }
            let relative = path.strip_prefix(&self.root).map_err(|e| e.to_string())?.to_string_lossy().replace('\\', "/");
            let children = if directory { self.list_at(&path, depth + 1)? } else { vec![] };
            entries.push(Entry { path: relative, name, directory, children });
        }
        entries.sort_by(|a, b| b.directory.cmp(&a.directory).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
        Ok(entries)
    }
    pub fn read(&self, path: &str) -> Result<Snapshot> {
        let path = self.markdown(path, true)?;
        if fs::metadata(&path).map_err(|e| e.to_string())?.len() > MAX_DOCUMENT { return Err("Documento excede o limite de 16 MB.".into()); }
        let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
        Ok(snapshot(content))
    }
    pub fn write(&self, path: &str, content: &str, expected: &str) -> Result<Snapshot> {
        if content.len() as u64 > MAX_DOCUMENT { return Err("Documento excede o limite de 16 MB.".into()); }
        let target = self.markdown(path, true)?;
        if self.read(path)?.revision != expected { return Err("CONFLICT: o arquivo foi alterado externamente.".into()); }
        let parent = target.parent().ok_or("Diretório inválido")?;
        let mut temp = tempfile::Builder::new().prefix(".markvault-").tempfile_in(parent).map_err(|e| e.to_string())?;
        temp.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
        temp.as_file().set_permissions(fs::metadata(&target).map_err(|e| e.to_string())?.permissions()).map_err(|e| e.to_string())?;
        temp.as_file().sync_all().map_err(|e| e.to_string())?;
        // Recheck immediately before replacement so edits during temp-file creation conflict too.
        if self.read(path)?.revision != expected { return Err("CONFLICT: o arquivo foi alterado durante o salvamento.".into()); }
        temp.persist(&target).map_err(|e| e.to_string())?;
        Ok(snapshot(content.into()))
    }
    pub fn create(&self, path: &str, content: &str) -> Result<()> {
        if content.len() as u64 > MAX_DOCUMENT { return Err("Documento excede o limite de 16 MB.".into()); }
        let target = self.markdown(path, false)?;
        let mut file = fs::OpenOptions::new().write(true).create_new(true).open(target).map_err(|e| e.to_string())?;
        file.write_all(content.as_bytes()).and_then(|_| file.sync_all()).map_err(|e| e.to_string())
    }
    pub fn mkdir(&self, path: &str) -> Result<()> { fs::create_dir(self.resolve(path, false)?).map_err(|e| e.to_string()) }
    pub fn rename(&self, path: &str, destination: &str) -> Result<()> {
        let source = self.resolve(path, true)?;
        let target = self.resolve(destination, false)?;
        if source.is_file() {
            if !is_editable_entry(path) || !is_editable_entry(destination) {
                return Err("Somente documentos .md ou imagens suportadas podem ser renomeados.".into());
            }
        }
        if target.exists() { return Err("Já existe um item com esse nome.".into()); }
        fs::rename(source, target).map_err(|e| e.to_string())
    }
    /// Moves a file or folder into another workspace (or this one). Falls back to copy + delete
    /// when a plain rename is impossible, e.g. across drives.
    pub fn move_to(&self, other: &Self, path: &str, destination: &str) -> Result<()> {
        let source = self.resolve(path, true)?;
        let target = other.resolve(destination, false)?;
        if source.is_file() {
            if !is_editable_entry(path) || !is_editable_entry(destination) {
                return Err("Somente documentos .md ou imagens suportadas podem ser movidos.".into());
            }
        }
        if target.exists() { return Err("Já existe um item com esse nome na pasta de destino.".into()); }
        if target.starts_with(&source) { return Err("Não é possível mover uma pasta para dentro dela mesma.".into()); }
        if fs::rename(&source, &target).is_ok() { return Ok(()); }
        copy_tree(&source, &target)?;
        if source.is_dir() { fs::remove_dir_all(&source) } else { fs::remove_file(&source) }.map_err(|e| e.to_string())
    }
    // Content search reads every document, so it follows the same listing rules (no VCS or
    // dependency folders, no links) and the same per-file limits as `read`.
    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<ContentMatch>> {
        let needle = query.trim().to_lowercase();
        if needle.chars().count() < 2 { return Err("Digite ao menos 2 caracteres para buscar no conteúdo.".into()); }
        let mut files = vec![];
        collect_documents(self.list()?, &mut files);
        let mut matches: Vec<ContentMatch> = vec![];
        for (path, name) in files {
            let Ok(document) = self.read(&path) else { continue };
            for (index, line) in document.content.lines().enumerate() {
                if line.to_lowercase().contains(&needle) {
                    matches.push(ContentMatch { path: path.clone(), name: name.clone(), line: index + 1, text: preview(line, &needle) });
                    if matches.len() >= limit { return Ok(matches) }
                }
            }
        }
        Ok(matches)
    }
    pub fn delete(&self, path: &str) -> Result<()> {
        let target = self.resolve(path, true)?;
        if target.is_dir() {
            fs::remove_dir_all(target).map_err(|e| e.to_string())
        } else {
            if !is_editable_entry(path) { return Err("Somente documentos .md ou imagens suportadas podem ser excluídos.".into()); }
            fs::remove_file(target).map_err(|e| e.to_string())
        }
    }
    /// Saves a pasted image into the same folder as the current document, picking a unique name.
    pub fn save_image(&self, directory: &str, name: &str, bytes: &[u8]) -> Result<String> {
        if bytes.is_empty() { return Err("A imagem está vazia.".into()); }
        if bytes.len() as u64 > MAX_IMAGE { return Err("Imagem excede 20 MB.".into()); }
        let ext = Path::new(name).extension().unwrap_or_default().to_string_lossy().to_lowercase();
        let ext = match ext.as_str() {
            "png" | "jpg" | "jpeg" | "gif" | "webp" | "avif" => ext.as_str(),
            _ => return Err("Formato de imagem não suportado. Use PNG, JPEG, GIF, WebP ou AVIF.".into()),
        };
        let stem: String = Path::new(name).file_stem().unwrap_or_default().to_string_lossy()
            .chars()
            .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
            .collect();
        let stem = stem.trim_matches('-');
        let stem = if stem.is_empty() { "imagem" } else { stem };
        let dir = directory.trim_matches('/');
        for attempt in 0..1000u32 {
            let file_name = if attempt == 0 { format!("{stem}.{ext}") } else { format!("{stem}-{attempt}.{ext}") };
            let rel = if dir.is_empty() { file_name.clone() } else { format!("{dir}/{file_name}") };
            let target = self.resolve(&rel, false)?;
            match fs::OpenOptions::new().write(true).create_new(true).open(&target) {
                Ok(mut file) => {
                    file.write_all(bytes).and_then(|_| file.sync_all()).map_err(|e| e.to_string())?;
                    return Ok(file_name);
                }
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(e) => return Err(e.to_string()),
            }
        }
        Err("Não foi possível gerar um nome único para a imagem.".into())
    }
}
fn collect_documents(entries: Vec<Entry>, files: &mut Vec<(String, String)>) {
    for entry in entries {
        if entry.directory {
            collect_documents(entry.children, files);
        } else if entry.name.to_lowercase().ends_with(".md") {
            files.push((entry.path, entry.name));
        }
    }
}
// Long lines are cut around the match so the preview shows why the line was returned.
fn preview(line: &str, needle: &str) -> String {
    const WIDTH: usize = 180;
    let trimmed = line.trim();
    if trimmed.chars().count() <= WIDTH { return trimmed.to_string() }
    let lowered = trimmed.to_lowercase();
    let at = lowered.find(needle).map(|byte| lowered[..byte].chars().count()).unwrap_or(0);
    let skip = at.saturating_sub(WIDTH / 3);
    let mut text: String = trimmed.chars().skip(skip).take(WIDTH).collect();
    if skip > 0 { text.insert(0, '…') }
    if trimmed.chars().count() > skip + WIDTH { text.push('…') }
    text
}
fn snapshot(content: String) -> Snapshot { let revision = format!("{:x}", Sha256::digest(content.as_bytes())); Snapshot { content, revision } }

#[cfg(test)]
mod tests {
    use super::*;
    fn vault() -> (tempfile::TempDir, LocalFilesystemProvider) { let d = tempfile::tempdir().unwrap(); let p = LocalFilesystemProvider::new(d.path()).unwrap(); (d, p) }
    #[test] fn saves_pasted_images_with_unique_names_in_document_folder() {
        let (d, p) = vault(); p.mkdir("Notas").unwrap();
        let first = p.save_image("Notas", "print.png", &[137, 80, 78, 71]).unwrap();
        let second = p.save_image("Notas", "print.png", &[137, 80, 78, 71]).unwrap();
        assert_eq!(first, "print.png");
        assert_eq!(second, "print-1.png");
        assert!(d.path().join("Notas/print.png").is_file());
        assert!(d.path().join("Notas/print-1.png").is_file());
        let listed: Vec<String> = p.list().unwrap()[0].children.iter().map(|c| c.name.clone()).collect();
        assert_eq!(listed, vec!["print-1.png", "print.png"]);
        p.rename("Notas/print-1.png", "Notas/print-novo.png").unwrap();
        p.delete("Notas/print-novo.png").unwrap();
        assert!(!d.path().join("Notas/print-novo.png").exists());
        assert!(p.save_image("Notas", "bad.exe", &[1]).is_err());
        assert!(p.save_image("../fora", "a.png", &[1]).is_err());
    }
    #[test] fn moves_between_workspaces_and_blocks_cycles() {
        let (_a, from) = vault(); let (_b, to) = vault();
        from.create("nota.md", "oi").unwrap(); from.mkdir("pasta").unwrap(); from.create("pasta/x.md", "x").unwrap(); to.mkdir("destino").unwrap();
        from.move_to(&to, "nota.md", "destino/nota.md").unwrap();
        assert!(from.read("nota.md").is_err()); assert_eq!(to.read("destino/nota.md").unwrap().content, "oi");
        from.move_to(&to, "pasta", "destino/pasta").unwrap();
        assert_eq!(to.read("destino/pasta/x.md").unwrap().content, "x");
        to.create("a.md", "1").unwrap(); to.create("destino/a.md", "2").unwrap();
        assert!(to.move_to(&to, "a.md", "destino/a.md").is_err());
        assert!(to.move_to(&to, "destino", "destino/pasta/destino").is_err());
        assert_eq!(to.read("a.md").unwrap().content, "1");
    }
    #[test] fn lifecycle_utf8() {
        let (_d, p) = vault(); p.mkdir("Estudos").unwrap(); p.create("Estudos/ação.md", "# Olá 🌱").unwrap();
        let old = p.read("Estudos/ação.md").unwrap(); assert_eq!(old.content, "# Olá 🌱");
        let new = p.write("Estudos/ação.md", "novo", &old.revision).unwrap(); assert_ne!(old.revision, new.revision);
        p.rename("Estudos/ação.md", "Estudos/renomeado.md").unwrap(); assert_eq!(p.list().unwrap()[0].children[0].name, "renomeado.md");
        p.delete("Estudos").unwrap(); assert!(p.list().unwrap().is_empty());
    }
    #[test] fn external_edits_conflict() {
        let (d, p) = vault(); p.create("a.md", "inicial").unwrap(); let old = p.read("a.md").unwrap();
        fs::write(d.path().join("a.md"), "externo").unwrap();
        assert!(p.write("a.md", "local", &old.revision).unwrap_err().contains("CONFLICT"));
        assert_eq!(p.read("a.md").unwrap().content, "externo");
    }
    #[test] fn invalid_operations_preserve_files() {
        let (_d, p) = vault();
        for path in ["../out.md", "/out.md", "C:/out.md", "a/../../out.md", "CON.md", "foo.md.", "a\\b.md"] { assert!(p.create(path, "bad").is_err(), "{path}"); }
        p.create("a.md", "keep").unwrap(); assert!(p.create("a.md", "replace").is_err());
        p.create("b.md", "other").unwrap(); assert!(p.rename("a.md", "b.md").is_err());
        assert!(p.read("missing.md").is_err()); assert!(p.write("missing.md", "x", "x").is_err());
        assert!(p.create("no-parent/a.md", "").is_err()); assert!(p.delete("").is_err());
        assert_eq!(p.read("a.md").unwrap().content, "keep");
    }
    #[test] fn listing_reflects_external_changes() {
        let (d, p) = vault(); fs::write(d.path().join("outside.MD"), "hello").unwrap();
        assert_eq!(p.list().unwrap()[0].name, "outside.MD"); fs::remove_file(d.path().join("outside.MD")).unwrap();
        assert!(p.list().unwrap().is_empty());
    }
    #[test] fn content_search_reports_lines_with_case_insensitive_preview() {
        let (_d, p) = vault(); p.mkdir("Estudos").unwrap();
        p.create("Estudos/nota.md", "primeira linha\nSegunda LINHA").unwrap(); p.create("outra.md", "nada aqui").unwrap();
        let hits = p.search("linha", 10).unwrap();
        assert_eq!(hits.len(), 2);
        assert_eq!((hits[0].path.as_str(), hits[0].name.as_str(), hits[0].line), ("Estudos/nota.md", "nota.md", 1));
        assert_eq!(hits[1].line, 2); assert_eq!(hits[1].text, "Segunda LINHA");
        assert!(p.search(" a ", 10).unwrap_err().contains("2 caracteres"));
        assert!(p.search("zzz", 10).unwrap().is_empty());
    }
    #[test] fn content_search_skips_ignored_folders_and_honors_limit() {
        let (d, p) = vault(); fs::create_dir_all(d.path().join("node_modules")).unwrap();
        fs::write(d.path().join("node_modules/dep.md"), "alvo").unwrap(); p.create("a.md", "alvo\nalvo\nalvo").unwrap();
        assert_eq!(p.search("alvo", 2).unwrap().len(), 2); assert_eq!(p.search("alvo", 10).unwrap().len(), 3);
    }
    #[test] fn preview_windows_long_lines_around_the_match() {
        let line = format!("{}alvo{}", "a".repeat(400), "b".repeat(400));
        let text = preview(&line, "alvo");
        assert!(text.starts_with('…') && text.ends_with('…') && text.contains("alvo"));
        assert!(text.chars().count() <= 182);
    }
    #[cfg(unix)]
    #[test] fn rejects_symlinks() {
        let (d, p) = vault(); let outside = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(outside.path(), d.path().join("link")).unwrap();
        assert!(p.create("link/escape.md", "bad").is_err()); assert!(p.list().unwrap().is_empty());
    }
    #[cfg(windows)]
    #[test] fn rejects_junctions() {
        let (d, p) = vault(); let outside = tempfile::tempdir().unwrap();
        let status = std::process::Command::new("cmd").args(["/c", "mklink", "/J"]).arg(d.path().join("link")).arg(outside.path()).status().unwrap();
        assert!(status.success()); assert!(p.create("link/escape.md", "bad").is_err());
        assert!(p.list().unwrap().is_empty()); fs::remove_dir(d.path().join("link")).unwrap();
    }
}


fn copy_tree(source: &Path, target: &Path) -> Result<()> {
    let meta = fs::symlink_metadata(source).map_err(|e| e.to_string())?;
    check_not_link(&meta)?;
    if meta.is_dir() {
        fs::create_dir(target).map_err(|e| e.to_string())?;
        for entry in fs::read_dir(source).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            copy_tree(&entry.path(), &target.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        fs::copy(source, target).map(|_| ()).map_err(|e| e.to_string())
    }
}
