import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { storage } from '../storage/LocalFilesystemProvider'
import { isMarkdown, resolveRelative } from '../storage/types'
import { useWorkspace } from '../stores/workspaceStore'

function LocalImage({ source, alt, document }: { source?: string; alt?: string; document: string }) {
  const [url, setUrl] = useState<string>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    let alive = true
    setUrl(undefined); setError(undefined)
    const path = source && resolveRelative(document, source)
    if (source?.startsWith('https://')) setUrl(source)
    else if (path) storage.readAsset(path).then(value => { if (alive) setUrl(value) }).catch(e => { if (alive) setError(String(e)) })
    else setError('Caminho de imagem não permitido')
    return () => { alive = false }
  }, [source, document])
  if (error) return <span className="image-error" title={error}>Imagem indisponível: {alt || source}</span>
  return url ? <img src={url} alt={alt || ''} loading="lazy" /> : <span className="muted">Carregando imagem…</span>
}

export function MarkdownPreview({ content, path }: { content: string; path: string }) {
  const open = useWorkspace(s => s.openDocument)
  return <article className="prose"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    img: ({ src, alt }) => <LocalImage source={src} alt={alt} document={path} />,
    a: ({ href, children }) => <a href={href} onClick={event => {
      if (!href) { event.preventDefault(); return }
      if (href.startsWith('#')) return
      event.preventDefault()
      const relative = resolveRelative(path, href)
      if (relative && isMarkdown(relative)) void open(relative)
      else if (relative) void storage.openAttachment(relative).catch(e => useWorkspace.setState({ error: String(e) }))
      else if (/^https?:\/\/|^mailto:/i.test(href)) void storage.openExternal(href).catch(e => useWorkspace.setState({ error: String(e) }))
      else useWorkspace.setState({ error: 'O link deve apontar para um arquivo do workspace ou um endereço web permitido.' })
    }}>{children}</a>,
  }}>{content}</ReactMarkdown></article>
}
