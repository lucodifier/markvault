import { useEffect, useState } from 'react'

let loader: Promise<typeof import('mermaid').default> | undefined
let counter = 0
// Loaded on demand so notes without diagrams do not pay for the library at startup.
function loadMermaid() {
  loader ??= import('mermaid').then(module => {
    module.default.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'dark', fontFamily: 'Inter, "Segoe UI", sans-serif' })
    return module.default
  })
  return loader
}

export function MermaidDiagram({ source }: { source: string }) {
  const [svg, setSvg] = useState<string>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    let alive = true
    setSvg(undefined); setError(undefined)
    const timer = setTimeout(() => {
      loadMermaid()
        .then(async mermaid => {
          const id = `mermaid-${++counter}`
          try { return await mermaid.render(id, source) }
          finally { document.getElementById(`d${id}`)?.remove() }
        })
        .then(result => { if (alive) setSvg(result.svg) })
        .catch(e => { if (alive) setError(e instanceof Error ? e.message : String(e)) })
    }, 250)
    return () => { alive = false; clearTimeout(timer) }
  }, [source])
  if (error) return <div className="mermaid-error" role="alert"><strong>Diagrama Mermaid inválido</strong><pre>{error}</pre></div>
  if (!svg) return <div className="mermaid-diagram muted">Renderizando diagrama…</div>
  return <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />
}
