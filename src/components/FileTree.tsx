import { useState } from 'react'
import { ChevronRight, FileText, Folder, FolderOpen, MoreHorizontal } from 'lucide-react'
import type { FileEntry } from '../storage/types'
import { useWorkspace } from '../stores/workspaceStore'

export type FileAction = { kind: 'file' | 'directory' | 'rename' | 'delete' | 'copy'; path: string; directory?: boolean }
interface Props { entries: FileEntry[]; root: string; active?: string; disabled: boolean; onOpen(path: string): void; onAction(action: FileAction): void }

/** Absolute Windows path of a workspace-relative entry. */
export function absolutePath(root: string, path: string) {
  return `${root.replace(/[\\/]+$/, '')}\\${path.split('/').join('\\')}`
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

export function FileTree(props: Props) {
  return <ul className="file-tree" aria-label="Arquivos do workspace">{props.entries.map(entry => <TreeItem key={entry.path} entry={entry} {...props} />)}</ul>
}
function TreeItem({ entry, ...props }: Props & { entry: FileEntry }) {
  const [expanded, setExpanded] = useState(true)
  const [menu, setMenu] = useState(false)
  const copyPath = async () => {
    setMenu(false)
    const absolute = absolutePath(props.root, entry.path)
    try {
      await copyText(absolute)
      useWorkspace.setState({ notice: `Caminho copiado: ${absolute}` })
    } catch {
      useWorkspace.setState({ error: 'Não foi possível copiar o caminho para a área de transferência.' })
    }
  }
  return <li>
    <div className={`tree-row ${entry.path === props.active ? 'selected' : ''}`} onContextMenu={event => { event.preventDefault(); setMenu(true) }}>
      <button className="tree-item" title={entry.path} disabled={props.disabled} aria-expanded={entry.directory ? expanded : undefined} onClick={() => entry.directory ? setExpanded(!expanded) : props.onOpen(entry.path)}>
        {entry.directory ? <><ChevronRight size={13} className={expanded ? 'rotated' : ''} />{expanded ? <FolderOpen size={15} /> : <Folder size={15} />}</> : <><span className="tree-indent" /><FileText size={15} /></>}
        <span>{entry.name}</span>
      </button>
      <button className="icon-button more" title={`Ações de ${entry.name}`} aria-label={`Ações de ${entry.name}`} aria-expanded={menu} onClick={() => setMenu(!menu)} disabled={props.disabled}><MoreHorizontal size={16} /></button>
    </div>
    {menu && <div className="file-actions" role="menu">
      <button role="menuitem" onClick={() => void copyPath()}>Copiar caminho</button>
      {entry.directory && <><button role="menuitem" onClick={() => { setMenu(false); props.onAction({ kind: 'file', path: entry.path }) }}>Novo documento</button><button role="menuitem" onClick={() => { setMenu(false); props.onAction({ kind: 'directory', path: entry.path }) }}>Nova pasta</button></>}
      <button role="menuitem" onClick={() => { setMenu(false); props.onAction({ kind: 'rename', path: entry.path, directory: entry.directory }) }}>Renomear</button>
      <button role="menuitem" className="danger-text" onClick={() => { setMenu(false); props.onAction({ kind: 'delete', path: entry.path, directory: entry.directory }) }}>Excluir…</button>
    </div>}
    {entry.directory && expanded && <FileTree {...props} entries={entry.children} />}
  </li>
}
