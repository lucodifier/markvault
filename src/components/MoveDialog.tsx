import * as Dialog from '@radix-ui/react-dialog'
import { Folder, FolderOpen } from 'lucide-react'
import type { FileAction } from './FileTree'
import type { FileEntry } from '../storage/types'
import { useWorkspace } from '../stores/workspaceStore'

interface Target { workspacePath: string; path: string; label: string; depth: number; root: boolean }

function folders(entries: FileEntry[], workspacePath: string, depth: number, out: Target[]) {
  for (const entry of entries) if (entry.directory) {
    out.push({ workspacePath, path: entry.path, label: entry.name, depth, root: false })
    folders(entry.children, workspacePath, depth + 1, out)
  }
}

/** Lists every open workspace and folder as a destination for moving an entry. */
export function MoveDialog({ action, onClose }: { action: FileAction; onClose(): void }) {
  const workspaces = useWorkspace(s => s.workspaces)
  const files = useWorkspace(s => s.filesByWorkspace)
  const move = useWorkspace(s => s.move)
  const targets: Target[] = []
  for (const ws of workspaces) {
    targets.push({ workspacePath: ws.path, path: '', label: ws.name, depth: 0, root: true })
    folders(files[ws.path] ?? [], ws.path, 1, targets)
  }
  const valid = (t: Target) => !(t.workspacePath === action.workspacePath && (t.path === action.path || t.path.startsWith(action.path + '/')))
  const name = action.path.split('/').pop()
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose() }}><Dialog.Portal>
    <Dialog.Overlay className="modal-overlay" /><Dialog.Content className="modal">
      <Dialog.Title>Mover para…</Dialog.Title>
      <Dialog.Description>Escolha a pasta de destino para “{name}”. Funciona entre pastas abertas.</Dialog.Description>
      <div className="move-list">{targets.map(t => <button key={`${t.workspacePath}:${t.path}`} disabled={!valid(t)} style={{ paddingLeft: 10 + t.depth * 16 }}
        onClick={async () => { if (await move(action.path, action.workspacePath, t.path, t.workspacePath)) onClose() }}>
        {t.root ? <FolderOpen size={15} /> : <Folder size={15} />}<span>{t.label}</span>
      </button>)}</div>
      <div className="modal-buttons"><button onClick={onClose}>Cancelar</button></div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
}
