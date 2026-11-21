import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { FileText, Search, X } from 'lucide-react'
import { rankFiles } from '../search'
import { useWorkspace } from '../stores/workspaceStore'
export function SearchDialog({ onClose }: { onClose(): void }) {
  const [query, setQuery] = useState('')
  const workspaces = useWorkspace(s => s.workspaces)
  const filesByWorkspace = useWorkspace(s => s.filesByWorkspace)
  const open = useWorkspace(s => s.openDocument)
  const multiple = workspaces.length > 1
  const results = workspaces.flatMap(ws =>
    rankFiles(filesByWorkspace[ws.path] ?? [], query).map(entry => ({ workspace: ws, entry })),
  ).slice(0, 80)
  return <Dialog.Root open onOpenChange={value => { if (!value) onClose() }}><Dialog.Portal><Dialog.Overlay className="modal-overlay" /><Dialog.Content className="modal search-modal">
    <Dialog.Title>Localizar documento</Dialog.Title><Dialog.Description>Busque pelo nome ou pelo caminho em todas as pastas abertas, sem se preocupar com acentos. Ctrl+P</Dialog.Description>
    <div className="search-input"><Search size={18} /><input aria-label="Localizar documento" autoFocus placeholder="Comece a digitar…" value={query} onChange={e => setQuery(e.target.value)} /></div>
    <div className="search-results">{results.length ? results.map(({ workspace, entry }) => <button key={`${workspace.path}:${entry.path}`} onClick={async () => { if (await open(entry.path, workspace.path)) onClose() }}><FileText size={16} /><span>{entry.name}<small>{multiple ? `${workspace.name} / ${entry.path}` : entry.path}</small></span></button>) : <p className="muted">Nenhum documento encontrado.</p>}</div>
    <Dialog.Close asChild><button className="modal-close icon-button" aria-label="Fechar"><X size={18} /></button></Dialog.Close>
  </Dialog.Content></Dialog.Portal></Dialog.Root>
}
