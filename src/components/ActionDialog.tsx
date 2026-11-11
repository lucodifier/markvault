import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { FileAction } from './FileTree'
import { useWorkspace } from '../stores/workspaceStore'

export function ActionDialog({ action, onClose }: { action: FileAction; onClose(): void }) {
  const store = useWorkspace()
  const [name, setName] = useState(action.kind === 'rename' ? action.path.split('/').pop()! : action.kind === 'copy' ? `${action.path.replace(/\.md$/i, '')}-copia.md` : '')
  const [validation, setValidation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const title = { file: 'Novo documento', directory: 'Nova pasta', rename: 'Renomear', delete: 'Excluir item?', copy: 'Salvar uma cópia' }[action.kind]
  const submit = async () => {
    if (submitting) return
    let path = name.trim()
    if (action.kind !== 'delete') {
      if (!path || /[\\:< >"|?*]/.test(path.replaceAll(' ', '')) || path.split('/').some(p => !p || p === '.' || p === '..')) { setValidation('Informe um nome válido, relativo ao workspace.'); return }
      if (action.kind !== 'copy' && path.includes('/')) { setValidation('Use apenas o nome do item, sem barras.'); return }
      if (action.kind === 'file' || action.kind === 'copy' || (action.kind === 'rename' && !action.directory)) {
        if (!/\.md$/i.test(path)) path += '.md'
      }
    }
    setSubmitting(true)
    let ok = false
    if (action.kind === 'delete') ok = await store.remove(action.path)
    else if (action.kind === 'rename') ok = await store.rename(action.path, [...action.path.split('/').slice(0, -1), path].join('/'))
    else if (action.kind === 'copy') ok = await store.saveCopy(path)
    else {
      path = [action.path, path].filter(Boolean).join('/')
      ok = await store.create(path, action.kind === 'directory')
      if (ok && action.kind === 'file') await store.openDocument(path)
    }
    setSubmitting(false)
    if (ok) onClose()
  }
  return <Dialog.Root open onOpenChange={open => { if (!open && !submitting) onClose() }}><Dialog.Portal>
    <Dialog.Overlay className="modal-overlay" /><Dialog.Content className="modal">
      <Dialog.Title>{title}</Dialog.Title>
      <Dialog.Description>{action.kind === 'delete' ? `“${action.path}” será removido permanentemente${action.directory ? ', incluindo todos os arquivos e anexos desta pasta' : ''}. Essa ação não pode ser desfeita.` : action.kind === 'copy' ? 'Preserve seu texto em um novo arquivo, sem substituir o documento externo.' : `Local: ${action.kind === 'rename' ? action.path : action.path || 'raiz do workspace'}`}</Dialog.Description>
      <form onSubmit={event => { event.preventDefault(); void submit() }}>
        {action.kind !== 'delete' && <label>Nome<input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder={action.kind === 'directory' ? 'Estudos' : 'Minha nota.md'} disabled={submitting} /></label>}
        {(validation || store.error) && <p className="danger-text" role="alert">{validation || store.error}</p>}
        <div className="modal-buttons"><button type="button" onClick={onClose} disabled={submitting}>Cancelar</button><button className={action.kind === 'delete' ? 'danger' : 'primary'} disabled={submitting}>{submitting ? 'Aguarde…' : action.kind === 'delete' ? 'Excluir permanentemente' : 'Confirmar'}</button></div>
      </form>
      <Dialog.Close asChild><button className="modal-close icon-button" aria-label="Fechar" disabled={submitting}><X size={18} /></button></Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
}
