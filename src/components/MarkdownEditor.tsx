import { useEffect, useRef } from 'react'
import { Compartment, EditorState } from '@codemirror/state'
import { Decoration, EditorView, MatchDecorator, ViewPlugin, keymap, lineNumbers, highlightActiveLine, drawSelection, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { storage } from '../storage/LocalFilesystemProvider'
import { useWorkspace } from '../stores/workspaceStore'

const URL_PATTERN = /https?:\/\/[^\s<>()[\]"'`]+/gi
const trimUrl = (url: string) => url.replace(/[.,;:!?*_]+$/, '')
const linkMark = Decoration.mark({ class: 'cm-link-url' })
const linkDecorator = new MatchDecorator({
  regexp: URL_PATTERN,
  decorate: (add, from, _to, match) => add(from, from + trimUrl(match[0]).length, linkMark),
})

const IMAGE_EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
}

function timestampName(ext: string) {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `imagem-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.${ext}`
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem da área de transferência.'))
    reader.readAsDataURL(blob)
  })
}

function extractImageFiles(data: DataTransfer | null): File[] {
  if (!data) return []
  const files: File[] = []
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }
  if (!files.length) {
    for (const file of Array.from(data.files ?? [])) {
      if (file.type.startsWith('image/')) files.push(file)
    }
  }
  return files
}

async function insertImages(view: EditorView, files: File[]) {
  const doc = useWorkspace.getState().document
  if (!doc) return
  const directory = doc.path.split('/').slice(0, -1).join('/')
  const links: string[] = []
  try {
    for (const file of files) {
      const ext = IMAGE_EXT_BY_MIME[file.type.toLowerCase()] || file.name.split('.').pop()?.toLowerCase() || 'png'
      const rawBase = file.name ? file.name.replace(/\.[^.]+$/, '') : ''
      const preferred = rawBase && !/^(image|clipboard|screenshot)$/i.test(rawBase) ? `${rawBase}.${ext}` : timestampName(ext)
      const base64 = await blobToBase64(file)
      const savedName = await storage.saveImage(directory, preferred, base64, doc.workspacePath)
      const alt = savedName.replace(/\.[^.]+$/, '')
      links.push(`![${alt}](${savedName})`)
    }
    if (!links.length) return
    const sel = view.state.selection.main
    const insert = links.join('\n')
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert },
      selection: { anchor: sel.from + insert.length },
    })
    useWorkspace.setState({ notice: links.length === 1 ? `Imagem salva na pasta da nota` : `${links.length} imagens salvas na pasta da nota` })
  } catch (e) {
    useWorkspace.setState({ error: e instanceof Error ? e.message : String(e) })
  }
}

const imagePasteDrop = EditorView.domEventHandlers({
  paste(event, view) {
    const files = extractImageFiles(event.clipboardData)
    if (!files.length) return false
    event.preventDefault()
    void insertImages(view, files)
    return true
  },
  drop(event, view) {
    const files = extractImageFiles(event.dataTransfer)
    if (!files.length) return false
    event.preventDefault()
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
    if (pos !== null) view.dispatch({ selection: { anchor: pos } })
    void insertImages(view, files)
    return true
  },
})
// Underlines URLs; Ctrl/Cmd+click opens them in the default browser.
const links = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) { this.decorations = linkDecorator.createDeco(view) }
  update(update: ViewUpdate) { this.decorations = linkDecorator.updateDeco(update, this.decorations) }
}, {
  decorations: plugin => plugin.decorations,
  eventHandlers: {
    mousedown(event, view) {
      if (!(event.ctrlKey || event.metaKey) || event.button !== 0) return false
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
      if (pos === null) return false
      const line = view.state.doc.lineAt(pos)
      for (const match of line.text.matchAll(URL_PATTERN)) {
        const start = line.from + match.index
        const url = trimUrl(match[0])
        if (pos >= start && pos <= start + url.length) {
          event.preventDefault()
          void storage.openExternal(url).catch(e => useWorkspace.setState({ error: String(e) }))
          return true
        }
      }
      return false
    },
  },
})

export function MarkdownEditor({ value, onChange, disabled = false }: { value: string; onChange(value: string): void; disabled?: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const editor = useRef<EditorView>()
  const editable = useRef(new Compartment())
  const change = useRef(onChange)
  change.current = onChange
  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({ doc: value, extensions: [
        lineNumbers(), highlightActiveLine(), drawSelection(), history(), markdown(), oneDark, links, imagePasteDrop,
        editable.current.of(EditorView.editable.of(!disabled)),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]), EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': 'Conteúdo Markdown', spellcheck: 'false' }),
        EditorView.updateListener.of(update => { if (update.docChanged) change.current(update.state.doc.toString()) }),
        EditorView.theme({ '&': { height: '100%', backgroundColor: '#191c22' }, '.cm-scroller': { overflow: 'auto', fontFamily: 'Cascadia Code, Consolas, monospace', fontSize: '14px', lineHeight: '1.8' }, '.cm-content': { padding: '24px 16px' }, '.cm-gutters': { backgroundColor: '#191c22', border: 'none', color: '#59616e' }, '.cm-activeLine': { backgroundColor: '#ffffff04' }, '.cm-link-url': { textDecoration: 'underline', textUnderlineOffset: '3px', color: '#9fc095' }, '.cm-link-url:hover': { cursor: 'pointer' }, '&.cm-focused': { outline: 'none' } }),
      ] }),
    })
    editor.current = view
    return () => { view.destroy(); editor.current = undefined }
    // Each document mounts a new editor; subsequent disk updates use dispatch below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const view = editor.current
    if (view && value !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
  }, [value])
  useEffect(() => { editor.current?.dispatch({ effects: editable.current.reconfigure(EditorView.editable.of(!disabled)) }) }, [disabled])
  return <div className="editor-host" ref={host} />
}
