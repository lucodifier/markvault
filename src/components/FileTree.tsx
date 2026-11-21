import { useState } from 'react'
import { ChevronRight, FileText, Folder, FolderOpen, MoreHorizontal } from 'lucide-react'
import type { FileEntry, Workspace } from '../storage/types'
import { useWorkspace } from '../stores/workspaceStore'

export type FileAction = { kind: 'file' | 'directory' | 'rename' | 'delete' | 'copy'; workspacePath: string; path: string; directory?: boolean }
interface Props { entries: FileEntry[]; root: string; active?: string; disabled: boolean; onOpen(path: string, workspacePath: string): void; onAction(action: FileAction): void }

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
  return `[${name.replace(/\.md$/i, '')}](${path.split('/').map(segment).join('/')})`
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
  workspace, entries, activePath, disabled, onOpen, onAction, onRefresh, onRemoveWorkspace,
}: {
  workspace: Workspace
  entries: FileEntry[]
  activePath?: string
  disabled: boolean
  onOpen(path: string, workspacePath: string): void
  onAction(action: FileAction): void
  onRefresh(workspacePath: string): void
  onRemoveWorkspace(workspacePath: string): void
}) {
  const expanded = useWorkspace(s => s.expanded[workspace.path] ?? true)
  const toggleExpanded = useWorkspace(s => s.toggleExpanded)
  const [menu, setMenu] = useState(false)
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
    <div className="tree-row project-row" onContextMenu={event => { event.preventDefault(); setMenu(true) }}>
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
      <button role="menuitem" onClick={() => void copyRoot()}>Copiar caminho</button>
      <button role="menuitem" onClick={() => { setMenu(false); onRefresh(workspace.path) }}>Atualizar pasta</button>
      <button role="menuitem" className="danger-text" title="Remove apenas da lista do MarkVault sem apagar arquivos do disco" onClick={() => { setMenu(false); onRemoveWorkspace(workspace.path) }}>Remover da lista</button>
    </div>}
    <div className="project-tree" style={expanded ? undefined : { display: 'none' }}>
      {entries.length
        ? <FileTree entries={entries} root={workspace.path} active={activePath} disabled={disabled} onOpen={onOpen} onAction={onAction} />
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
  const copy = async (text: string) => {
    setMenu(false)
    try {
      await copyText(text)
      useWorkspace.setState({ notice: `Copiado: ${text}` })
    } catch {
      useWorkspace.setState({ error: 'Não foi possível copiar para a área de transferência.' })
    }
  }
  return <li>
    <div className={`tree-row ${entry.path === props.active ? 'selected' : ''}`} onContextMenu={event => { event.preventDefault(); setMenu(true) }}>
      <button className="tree-item" title={entry.path} disabled={props.disabled} aria-expanded={entry.directory ? expanded : undefined} onClick={() => entry.directory ? toggleExpanded(expandKey, true) : props.onOpen(entry.path, props.root)}>
        {entry.directory ? <><ChevronRight size={13} className={expanded ? 'rotated' : ''} />{expanded ? <FolderOpen size={15} /> : <Folder size={15} />}</> : <><span className="tree-indent" /><FileText size={15} /></>}
        <span>{entry.name}</span>
      </button>
      <button className="icon-button more" title={`Ações de ${entry.name}`} aria-label={`Ações de ${entry.name}`} aria-expanded={menu} onClick={() => setMenu(!menu)} disabled={props.disabled}><MoreHorizontal size={16} /></button>
    </div>
    {menu && <div className="file-actions" role="menu">
      <button role="menuitem" onClick={() => void copy(absolutePath(props.root, entry.path))}>Copiar caminho</button>
      <button role="menuitem" onClick={() => void copy(entry.path)}>Copiar caminho relativo</button>
      {!entry.directory && <button role="menuitem" onClick={() => void copy(markdownLink(entry.name, entry.path))}>Copiar link Markdown</button>}
      {entry.directory && <><button role="menuitem" onClick={() => { setMenu(false); props.onAction({ kind: 'file', workspacePath: props.root, path: entry.path }) }}>Novo documento</button><button role="menuitem" onClick={() => { setMenu(false); props.onAction({ kind: 'directory', workspacePath: props.root, path: entry.path }) }}>Nova pasta</button></>}
      <button role="menuitem" onClick={() => { setMenu(false); props.onAction({ kind: 'rename', workspacePath: props.root, path: entry.path, directory: entry.directory }) }}>Renomear</button>
      <button role="menuitem" className="danger-text" onClick={() => { setMenu(false); props.onAction({ kind: 'delete', workspacePath: props.root, path: entry.path, directory: entry.directory }) }}>Excluir…</button>
    </div>}
    {/* Keep children mounted and persisted so each folder's open/closed state survives collapsing the parent or restarting. */}
    {entry.directory && <div style={expanded ? undefined : { display: 'none' }}><FileTree {...props} entries={entry.children} /></div>}
  </li>
}
