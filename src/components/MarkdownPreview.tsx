import { Children, isValidElement, useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { MermaidDiagram } from './MermaidDiagram'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { storage } from '../storage/LocalFilesystemProvider'
import { isMarkdown, resolveRelative } from '../storage/types'
import { useWorkspace } from '../stores/workspaceStore'

function LocalImage({ source, alt, document, workspacePath }: { source?: string; alt?: string; document: string; workspacePath: string }) {
  const [url, setUrl] = useState<string>()
  const [error, setError] = useState<string>()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let alive = true
    setUrl(undefined); setError(undefined)
    const path = source && resolveRelative(document, source)
    if (source?.startsWith('https://')) setUrl(source)
    else if (path) storage.readAsset(path, workspacePath).then(value => { if (alive) setUrl(value) }).catch(e => { if (alive) setError(String(e)) })
    else setError('Caminho de imagem não permitido')
    return () => { alive = false }
  }, [source, document, workspacePath])
  if (error) return <span className="image-error" title={error}>Imagem indisponível: {alt || source}</span>
  if (!url) return <span className="muted">Carregando imagem…</span>
  return <>
    <img src={url} alt={alt || ''} loading="lazy" className="clickable-image" title="Clique para ampliar" onClick={() => setOpen(true)} />
    {open && <Dialog.Root open onOpenChange={v => { if (!v) setOpen(false) }}><Dialog.Portal>
      <Dialog.Overlay className="modal-overlay" />
      <Dialog.Content className="diagram-viewer" aria-describedby={undefined}>
        <Dialog.Title className="sr-only">{alt || 'Imagem ampliada'}</Dialog.Title>
        <div className="diagram-toolbar">
          <span className="diagram-zoom">{alt || source}</span>
          <span className="diagram-help">Esc fecha</span>
          <Dialog.Close className="icon-button" aria-label="Fechar"><X size={18} /></Dialog.Close>
        </div>
        <div className="diagram-scroll" onClick={() => setOpen(false)}>
          <img src={url} alt={alt || ''} className="image-viewer-img" onClick={e => e.stopPropagation()} />
        </div>
      </Dialog.Content>
    </Dialog.Portal></Dialog.Root>}
  </>
}

export function MarkdownPreview({ content, path, workspacePath }: { content: string; path: string; workspacePath: string }) {
  const open = useWorkspace(s => s.openDocument)
  return <article className="prose"><ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={{
    pre: ({ children }) => {
      const child = Children.toArray(children)[0]
      const isMermaid = isValidElement<{ className?: string }>(child) && /language-mermaid/.test(child.props.className ?? '')
      return isMermaid ? <>{children}</> : <pre>{children}</pre>
    },
    code: ({ className, children }) => /language-mermaid/.test(className ?? '')
      ? <MermaidDiagram source={String(children).replace(/\n$/, '')} />
      : <code className={className}>{children}</code>,
    img: ({ src, alt }) => <LocalImage source={src} alt={alt} document={path} workspacePath={workspacePath} />,
    a: ({ href, children }) => <a href={href} onClick={event => {
      if (!href) { event.preventDefault(); return }
      if (href.startsWith('#')) return
      event.preventDefault()
      const relative = resolveRelative(path, href)
      if (relative && isMarkdown(relative)) void open(relative, workspacePath)
      else if (relative) void storage.openAttachment(relative, workspacePath).catch(e => useWorkspace.setState({ error: String(e) }))
      else if (/^https?:\/\/|^mailto:/i.test(href)) void storage.openExternal(href).catch(e => useWorkspace.setState({ error: String(e) }))
      else useWorkspace.setState({ error: 'O link deve apontar para um arquivo do workspace ou um endereço web permitido.' })
    }}>{children}</a>,
  }}>{content}</ReactMarkdown></article>
}
