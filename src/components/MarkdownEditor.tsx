import { useEffect, useRef } from 'react'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'

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
        lineNumbers(), highlightActiveLine(), drawSelection(), history(), markdown(), oneDark,
        editable.current.of(EditorView.editable.of(!disabled)),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]), EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': 'Conteúdo Markdown', spellcheck: 'false' }),
        EditorView.updateListener.of(update => { if (update.docChanged) change.current(update.state.doc.toString()) }),
        EditorView.theme({ '&': { height: '100%', backgroundColor: '#191c22' }, '.cm-scroller': { overflow: 'auto', fontFamily: 'Cascadia Code, Consolas, monospace', fontSize: '14px', lineHeight: '1.8' }, '.cm-content': { padding: '24px 16px' }, '.cm-gutters': { backgroundColor: '#191c22', border: 'none', color: '#59616e' }, '.cm-activeLine': { backgroundColor: '#ffffff04' }, '&.cm-focused': { outline: 'none' } }),
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
