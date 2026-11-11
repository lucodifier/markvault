import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { FileText, Search, X } from 'lucide-react'
import type { FileEntry } from '../storage/types'
import { useWorkspace } from '../stores/workspaceStore'
const flatten = (entries: FileEntry[]): FileEntry[] => entries.flatMap(e => e.directory ? flatten(e.children) : [e])
export function SearchDialog({ onClose }: { onClose(): void }) {
  const [query, setQuery] = useState('')
  const files = useWorkspace(s => s.files)
  const open = useWorkspace(s => s.openDocument)
  const results = flatten(files).filter(e => e.path.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, 80)
  return <Dialog.Root open onOpenChange={value => { if (!value) onClose() }}><Dialog.Portal><Dialog.Overlay className="modal-overlay" /><Dialog.Content className="modal search-modal">
    <Dialog.Title>Localizar documento</Dialog.Title><Dialog.Description>Busque pelo nome ou pelo caminho. Ctrl+P</Dialog.Description>
    <div className="search-input"><Search size={18} /><input aria-label="Localizar documento" autoFocus placeholder="Comece a digitar…" value={query} onChange={e => setQuery(e.target.value)} /></div>
    <div className="search-results">{results.length ? results.map(e => <button key={e.path} onClick={async () => { if (await open(e.path)) onClose() }}><FileText size={16} /><span>{e.name}<small>{e.path}</small></span></button>) : <p className="muted">Nenhum documento encontrado.</p>}</div>
    <Dialog.Close asChild><button className="modal-close icon-button" aria-label="Fechar"><X size={18} /></button></Dialog.Close>
  </Dialog.Content></Dialog.Portal></Dialog.Root>
}
