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
        lineNumbers(), highlightActiveLine(), drawSelection(), history(), markdown(), oneDark, links,
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
