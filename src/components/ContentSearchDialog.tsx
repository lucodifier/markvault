import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { FileText, Loader2, Search, X } from 'lucide-react'
import { storage } from '../storage/LocalFilesystemProvider'
import type { ContentMatch } from '../storage/types'
import { useWorkspace } from '../stores/workspaceStore'

const MIN_TERM = 2
const DEBOUNCE = 250

export function ContentSearchDialog({ onClose }: { onClose(): void }) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<ContentMatch[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const open = useWorkspace(s => s.openDocument)
  const run = useRef(0)
  const term = query.trim()
  useEffect(() => {
    const current = ++run.current
    setError('')
    if (term.length < MIN_TERM) { setMatches([]); setSearching(false); return }
    setSearching(true)
    const timer = setTimeout(() => {
      storage.searchContent(term).then(found => {
        if (run.current !== current) return
        setMatches(found); setSearching(false)
      }).catch(failure => {
        if (run.current !== current) return
        setError(String(failure)); setMatches([]); setSearching(false)
      })
    }, DEBOUNCE)
    return () => clearTimeout(timer)
  }, [term])
  const status = error ? error
    : term.length < MIN_TERM ? `Digite ao menos ${MIN_TERM} caracteres para procurar no texto.`
    : searching ? 'Procurando no texto das notas…'
    : matches.length ? `${matches.length} linha${matches.length === 1 ? '' : 's'} em ${new Set(matches.map(m => m.path)).size} documento${new Set(matches.map(m => m.path)).size === 1 ? '' : 's'}`
    : 'Nenhuma linha encontrada.'
  return <Dialog.Root open onOpenChange={value => { if (!value) onClose() }}><Dialog.Portal><Dialog.Overlay className="modal-overlay" /><Dialog.Content className="modal content-modal">
    <Dialog.Title>Buscar no conteúdo</Dialog.Title><Dialog.Description>Procura no texto de todos os documentos .md do workspace. Ctrl+Shift+F</Dialog.Description>
    <div className="search-input"><Search size={18} /><input aria-label="Buscar no conteúdo" autoFocus placeholder="Termo no texto das notas…" value={query} onChange={e => setQuery(e.target.value)} /></div>
    <p className={`content-status ${error ? 'danger-text' : 'muted'}`} role="status">{searching && <Loader2 size={12} className="spin" />}{status}</p>
    <div className="search-results content-results">{matches.map(match => <button key={`${match.path}:${match.line}`} title={`${match.path}:${match.line}`} onClick={async () => { if (await open(match.path)) onClose() }}>
      <FileText size={16} />
      <span><strong>{match.name}<small>linha {match.line}</small></strong><code>{match.text || '(linha vazia)'}</code><small>{match.path}</small></span>
    </button>)}</div>
    <Dialog.Close asChild><button className="modal-close icon-button" aria-label="Fechar"><X size={18} /></button></Dialog.Close>
  </Dialog.Content></Dialog.Portal></Dialog.Root>
}
