import { useState, type DragEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ChevronRight, FileText, Folder, FolderOpen, Image as ImageIcon, MoreHorizontal, X } from 'lucide-react'
import { storage } from '../storage/LocalFilesystemProvider'
import { isImageFile, type FileEntry, type Workspace } from '../storage/types'
import { useWorkspace } from '../stores/workspaceStore'

export type FileAction = { kind: 'file' | 'directory' | 'rename' | 'delete' | 'copy' | 'move'; workspacePath: string; path: string; directory?: boolean }
interface Props { entries: FileEntry[]; root: string; active?: string; disabled: boolean; onOpen(path: string, workspacePath: string): void; onAction(action: FileAction): void; onMove(path: string, root: string, destinationDir: string, destinationRoot: string): void }

// Entry being dragged; HTML5 drag data is unreadable during dragover, so it lives here.
let dragged: { path: string; root: string } | null = null

/** Absolute Windows path of a workspace-relative entry. */
function absolutePath(root: string, path?: string) {
  // Windows extended-length paths (`\\?\C:\...`) are noise when pasted elsewhere.
  const plain = root.replace(/^\\\\\?\\UNC\\/i, '\\\\').replace(/^\\\\\?\\/, '').replace(/[\\/]+$/, '')
  return path ? `${plain}\\${path.split('/').join('\\')}` : plain
}

/** Markdown link to an entry, resolved from the workspace root. */
function markdownLink(name: string, path: string) {
  // Parentheses must be percent-encoded too, or `(1)` closes the link target early.
  const segment = (part: string) => encodeURIComponent(part).replace(/\(/g, '%28').replace(/\)/g, '%29')
  const encoded = path.split('/').map(segment).join('/')
  return isImageFile(name) ? `![${name.replace(/\.[^.]+$/, '')}](${encoded})` : `[${name.replace(/\.md$/i, '')}](${encoded})`
}

async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return }
  } catch { /* Fall through to the selection-based path. */ }
  const helper = document.createElement('textarea')
  helper.value = text
  helper.setAttribute('readonly', '')
  helper.style.position = 'fixed'
  helper.style.opacity = '0'
  document.body.appendChild(helper)
  helper.select()
  const copied = document.execCommand('copy')
  helper.remove()
  if (!copied) throw new Error('A área de transferência não está disponível.')
}

export function ProjectSection({
  workspace, entries, activePath, disabled, onOpen, onAction, onMove, onRefresh, onRemoveWorkspace,
}: {
  workspace: Workspace
  entries: FileEntry[]
  activePath?: string
  disabled: boolean
  onOpen(path: string, workspacePath: string): void
  onAction(action: FileAction): void
  onMove(path: string, root: string, destinationDir: string, destinationRoot: string): void
  onRefresh(workspacePath: string): void
  onRemoveWorkspace(workspacePath: string): void
}) {
  const expanded = useWorkspace(s => s.expanded[workspace.path] ?? true)
  const toggleExpanded = useWorkspace(s => s.toggleExpanded)
  const [menu, setMenu] = useState(false)
  const drop = useDropTarget(workspace.path, '', onMove)
  const copyRoot = async () => {
    setMenu(false)
    const text = absolutePath(workspace.path)
    try {
      await copyText(text)
      useWorkspace.setState({ notice: `Copiado: ${text}` })
    } catch {
      useWorkspace.setState({ error: 'Não foi possível copiar para a área de transferência.' })
    }
  }
  return <section className="project-section">
    <div className={`tree-row project-row ${drop.over ? 'drop-over' : ''}`} {...drop.handlers} onContextMenu={event => { event.preventDefault(); setMenu(true) }}>
      <button className="tree-item project-item" title={workspace.path} disabled={disabled} aria-expanded={expanded} onClick={() => toggleExpanded(workspace.path, true)}>
        <ChevronRight size={13} className={expanded ? 'rotated' : ''} />
        {expanded ? <FolderOpen size={15} /> : <Folder size={15} />}
        <span>{workspace.name}</span>
      </button>
      <button className="icon-button more" title={`Ações de ${workspace.name}`} aria-label={`Ações de ${workspace.name}`} aria-expanded={menu} onClick={() => setMenu(!menu)} disabled={disabled}><MoreHorizontal size={16} /></button>
    </div>
    {menu && <div className="file-actions" role="menu">
      <button role="menuitem" onClick={() => { setMenu(false); onAction({ kind: 'file', workspacePath: workspace.path, path: '' }) }}>Novo documento</button>
      <button role="menuitem" onClick={() => { setMenu(false); onAction({ kind: 'directory', workspacePath: workspace.path, path: '' }) }}>Nova pasta</button>
      <button role="menuitem" onClick={() => { setMenu(false); void storage.openInExplorer('', workspace.path).catch(e => useWorkspace.setState({ error: String(e) })) }}>Abrir pasta no Explorer</button>
      <button role="menuitem" onClick={() => void copyRoot()}>Copiar caminho</button>
      <button role="menuitem" onClick={() => { setMenu(false); onRefresh(workspace.path) }}>Atualizar pasta</button>
      <button role="menuitem" className="danger-text" title="Remove apenas da lista do MarkVault sem apagar arquivos do disco" onClick={() => { setMenu(false); onRemoveWorkspace(workspace.path) }}>Remover da lista</button>
    </div>}
    <div className="project-tree" style={expanded ? undefined : { display: 'none' }}>
      {entries.length
        ? <FileTree entries={entries} root={workspace.path} active={activePath} disabled={disabled} onOpen={onOpen} onAction={onAction} onMove={onMove} />
        : <p className="project-empty">Pasta vazia.</p>}
    </div>
  </section>
}

export function FileTree(props: Props) {
  return <ul className="file-tree" aria-label="Arquivos do workspace">{props.entries.map(entry => <TreeItem key={entry.path} entry={entry} {...props} />)}</ul>
}
function TreeItem({ entry, ...props }: Props & { entry: FileEntry }) {
  const expandKey = `${props.root}::${entry.path}`
  const expanded = useWorkspace(s => s.expanded[expandKey] ?? true)
  const toggleExpanded = useWorkspace(s => s.toggleExpanded)
  const [menu, setMenu] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const isImage = !entry.directory && isImageFile(entry.name)
  const drop = useDropTarget(props.root, entry.directory ? entry.path : entry.path.split('/').slice(0, -1).join('/'), props.onMove)
  const copy = async (text: string) => {
    setMenu(false)
    try {
      await copyText(text)
      useWorkspace.setState({ notice: `Copiado: ${text}` })
    } catch {
      useWorkspace.setState({ error: 'Não foi possível copiar para a área de transferência.' })
    }
  }
  const previewImage = () => {
    void storage.readAsset(entry.path, props.root)
      .then(url => setPreviewUrl(url))
      .catch(e => useWorkspace.setState({ error: String(e) }))
  }
  return <li>
    <div className={`tree-row ${entry.path === props.active ? 'selected' : ''} ${drop.over ? 'drop-over' : ''}`} {...drop.handlers} draggable={!props.disabled} onDragStart={event => { dragged = { path: entry.path, root: props.root }; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', entry.path) }} onDragEnd={() => { dragged = null }} onContextMenu={event => { event.preventDefault(); setMenu(true) }}>
      <button className="tree-item" title={entry.path} disabled={props.disabled} aria-expanded={entry.directory ? expanded : undefined} onClick={() => entry.directory ? toggleExpanded(expandKey, true) : isImage ? previewImage() : props.onOpen(entry.path, props.root)}>
        {entry.directory ? <><ChevronRight size={13} className={expanded ? 'rotated' : ''} />{expanded ? <FolderOpen size={15} /> : <Folder size={15} />}</> : <><span className="tree-indent" />{isImage ? <ImageIcon size={15} /> : <FileText size={15} />}</>}
        <span>{entry.name}</span>
      </button>
      <button className="icon-button more" title={`Ações de ${entry.name}`} aria-label={`Ações de ${entry.name}`} aria-expanded={menu} onClick={() => setMenu(!menu)} disabled={props.disabled}><MoreHorizontal size={16} /></button>
    </div>
    {menu && <div className="file-actions" role="menu">
      <button role="menuitem" onClick={() => { setMenu(false); void storage.openInExplorer(entry.path, props.root).catch(e => useWorkspace.setState({ error: String(e) })) }}>{entry.directory ? 'Abrir pasta no Explorer' : 'Mostrar no Explorer'}</button>
      <button role="menuitem" onClick={() => void copy(absolutePath(props.root, entry.path))}>Copiar caminho</button>
      <button role="menuitem" onClick={() => void copy(entry.path)}>Copiar caminho relativo</button>
      {!entry.directory && <button role="menuitem" onClick={() => void copy(markdownLink(entry.name, entry.path))}>Copiar link Markdown</button>}
      {entry.directory && <><button role="menuitem" onClick={() => { setMenu(false); props.onAction({ kind: 'file', workspacePath: props.root, path: entry.path }) }}>Novo documento</button><button role="menuitem" onClick={() => { setMenu(false); props.onAction({ kind: 'directory', workspacePath: props.root, path: entry.path }) }}>Nova pasta</button></>}
      <button role="menuitem" onClick={() => { setMenu(false); props.onAction({ kind: 'move', workspacePath: props.root, path: entry.path, directory: entry.directory }) }}>Mover para…</button>
      <button role="menuitem" onClick={() => { setMenu(false); props.onAction({ kind: 'rename', workspacePath: props.root, path: entry.path, directory: entry.directory }) }}>Renomear</button>
      <button role="menuitem" className="danger-text" onClick={() => { setMenu(false); props.onAction({ kind: 'delete', workspacePath: props.root, path: entry.path, directory: entry.directory }) }}>Excluir…</button>
    </div>}
    {previewUrl && <Dialog.Root open onOpenChange={open => { if (!open) setPreviewUrl(null) }}><Dialog.Portal>
      <Dialog.Overlay className="modal-overlay" />
      <Dialog.Content className="diagram-viewer" aria-describedby={undefined}>
        <Dialog.Title className="sr-only">{entry.name}</Dialog.Title>
        <div className="diagram-toolbar">
          <span className="diagram-zoom">{entry.path}</span>
          <span className="diagram-help">Esc fecha</span>
          <Dialog.Close className="icon-button" aria-label="Fechar"><X size={18} /></Dialog.Close>
        </div>
        <div className="diagram-scroll" onClick={() => setPreviewUrl(null)}>
          <img src={previewUrl} alt={entry.name} className="image-viewer-img" onClick={e => e.stopPropagation()} />
        </div>
      </Dialog.Content>
    </Dialog.Portal></Dialog.Root>}
    {/* Keep children mounted and persisted so each folder's open/closed state survives collapsing the parent or restarting. */}
    {entry.directory && <div style={expanded ? undefined : { display: 'none' }}><FileTree {...props} entries={entry.children} /></div>}
  </li>
}

/** Drop handlers that move the dragged entry into a directory of the given workspace. */
function useDropTarget(root: string, directory: string, onMove: Props['onMove']) {
  const [over, setOver] = useState(false)
  const valid = () => !!dragged && !(dragged.root === root && (dragged.path === directory || directory.startsWith(dragged.path + '/')))
  return {
    over,
    handlers: {
      onDragOver(event: DragEvent) { if (!valid()) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOver(true) },
      onDragLeave() { setOver(false) },
      onDrop(event: DragEvent) {
        setOver(false)
        if (!dragged || !valid()) return
        event.preventDefault(); event.stopPropagation()
        const item = dragged; dragged = null
        onMove(item.path, item.root, directory, root)
      },
    },
  }
}