import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Maximize2, Minus, Plus, ScanSearch, X } from 'lucide-react'

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
  const [open, setOpen] = useState(false)
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
  return <>
    <div className="mermaid-diagram clickable" role="button" tabIndex={0} title="Clique para ampliar" aria-label="Ampliar diagrama"
      onClick={() => setOpen(true)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(true) } }}>
      <span className="mermaid-hint"><Maximize2 size={13} />Ampliar</span>
      <div className="mermaid-inline" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
    {open && <DiagramViewer svg={svg} onClose={() => setOpen(false)} />}
  </>
}

function naturalSize(svg: string) {
  const box = /viewBox="([\d.\-eE+]+)[ ,]+([\d.\-eE+]+)[ ,]+([\d.]+)[ ,]+([\d.]+)"/.exec(svg)
  return box ? { width: Number(box[3]) || 800, height: Number(box[4]) || 600 } : { width: 800, height: 600 }
}

/** Full-window viewer: wheel or buttons zoom, drag pans, Esc closes. */
function DiagramViewer({ svg, onClose }: { svg: string; onClose(): void }) {
  const { width, height } = naturalSize(svg)
  const scroller = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const apply = useCallback((next: number, anchorX?: number, anchorY?: number) => {
    const box = scroller.current
    const clamped = Math.min(8, Math.max(0.1, next))
    if (box) {
      const ax = anchorX ?? box.clientWidth / 2
      const ay = anchorY ?? box.clientHeight / 2
      const ratio = clamped / zoomRef.current
      const left = (box.scrollLeft + ax) * ratio - ax
      const top = (box.scrollTop + ay) * ratio - ay
      requestAnimationFrame(() => { box.scrollLeft = left; box.scrollTop = top })
    }
    zoomRef.current = clamped
    setZoom(clamped)
  }, [])
  const fit = useCallback(() => {
    const box = scroller.current
    if (!box) return
    zoomRef.current = 1
    const next = Math.min((box.clientWidth - 48) / width, (box.clientHeight - 48) / height)
    zoomRef.current = Math.min(8, Math.max(0.1, next))
    setZoom(zoomRef.current)
    requestAnimationFrame(() => { box.scrollLeft = 0; box.scrollTop = 0 })
  }, [width, height])
  useEffect(() => { fit() }, [fit])
  useEffect(() => {
    const box = scroller.current
    if (!box) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = box.getBoundingClientRect()
      apply(zoomRef.current * (event.deltaY < 0 ? 1.15 : 1 / 1.15), event.clientX - rect.left, event.clientY - rect.top)
    }
    box.addEventListener('wheel', wheel, { passive: false })
    return () => box.removeEventListener('wheel', wheel)
  }, [apply])
  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = scroller.current!
    drag.current = { x: event.clientX, y: event.clientY, left: box.scrollLeft, top: box.scrollTop }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = drag.current
    if (!start) return
    scroller.current!.scrollLeft = start.left - (event.clientX - start.x)
    scroller.current!.scrollTop = start.top - (event.clientY - start.y)
  }
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose() }}><Dialog.Portal>
    <Dialog.Overlay className="modal-overlay" />
    <Dialog.Content className="diagram-viewer" aria-describedby={undefined}>
      <Dialog.Title className="sr-only">Diagrama ampliado</Dialog.Title>
      <div className="diagram-toolbar">
        <button className="icon-button" title="Diminuir" aria-label="Diminuir zoom" onClick={() => apply(zoomRef.current / 1.25)}><Minus size={16} /></button>
        <span className="diagram-zoom">{Math.round(zoom * 100)}%</span>
        <button className="icon-button" title="Aumentar" aria-label="Aumentar zoom" onClick={() => apply(zoomRef.current * 1.25)}><Plus size={16} /></button>
        <button className="icon-button" title="Ajustar à janela" aria-label="Ajustar à janela" onClick={fit}><ScanSearch size={16} /></button>
        <button className="icon-button" title="Tamanho real (100%)" aria-label="Tamanho real" onClick={() => apply(1)}>1:1</button>
        <span className="diagram-help">Roda do mouse = zoom · arraste para mover · Esc fecha</span>
        <Dialog.Close className="icon-button" aria-label="Fechar"><X size={18} /></Dialog.Close>
      </div>
      <div className="diagram-scroll" ref={scroller} onPointerDown={down} onPointerMove={move} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
        <div className="diagram-stage" style={{ width: width * zoom, height: height * zoom }} dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
}