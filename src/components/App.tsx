import { useEffect, useState, type CSSProperties, type PointerEvent } from 'react'
import { BookOpen, Check, ChevronRight, Code2, Columns2, FilePlus2, FileText, FolderOpen, FolderPlus, Library, PanelLeftClose, PanelLeftOpen, RefreshCw, Save, Search, X } from 'lucide-react'
import { useWorkspace } from '../stores/workspaceStore'
import { useWorkspaceLifecycle } from '../hooks/useWorkspaceLifecycle'
import { FileTree, type FileAction } from './FileTree'
import { ActionDialog } from './ActionDialog'
import { SearchDialog } from './SearchDialog'
import { MarkdownEditor } from './MarkdownEditor'
import { MarkdownPreview } from './MarkdownPreview'

export function App() {
  useWorkspaceLifecycle()
  const s = useWorkspace()
  const [action, setAction] = useState<FileAction | null>(null)
  const [search, setSearch] = useState(false)
  const [sidebar, setSidebar] = useState(true)
  const [width, setWidth] = useState(() => { try { return Number(localStorage.getItem('markvault:sidebar')) || 270 } catch { return 270 } })
  const d = s.document
  const reading = s.mode === 'reading' && !!d
  const dirty = !!d && d.content !== d.saved
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key.toLowerCase() === 's') { event.preventDefault(); void useWorkspace.getState().save() }
      if (event.key.toLowerCase() === 'p') { event.preventDefault(); setSearch(true) }
      if (event.key.toLowerCase() === 'n') { event.preventDefault(); if (useWorkspace.getState().workspace) setAction({ kind: 'file', path: '' }) }
      if (event.key === '\\') { event.preventDefault(); setSidebar(v => !v) }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [])
  const resize = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  return <div className={`app ${reading ? 'reading' : ''}`} style={{ '--sidebar-width': `${Math.max(190, Math.min(440, width))}px` } as CSSProperties}>
    {sidebar && !reading && <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Library size={21} /></span><strong>MarkVault</strong><span className="version">LOCAL</span></div>
      <button className="workspace-picker" onClick={() => void s.openWorkspace()} disabled={s.busy} title={s.workspace?.path || 'Selecionar pasta local'}><FolderOpen size={18} /><span><strong>{s.workspace?.name || 'Abrir workspace'}</strong><small>{s.workspace ? 'Trocar pasta local' : 'Escolha sua pasta de notas'}</small></span><ChevronRight size={15} /></button>
      <button className="find-button" onClick={() => setSearch(true)} disabled={!s.workspace}><Search size={16} /><span>Localizar documento</span><kbd>Ctrl P</kbd></button>
      <div className="explorer-heading"><span>EXPLORADOR</span><div><button className="icon-button" aria-label="Novo documento" title="Novo documento (Ctrl+N)" disabled={!s.workspace || s.busy} onClick={() => setAction({ kind: 'file', path: '' })}><FilePlus2 size={16} /></button><button className="icon-button" aria-label="Nova pasta" title="Nova pasta" disabled={!s.workspace || s.busy} onClick={() => setAction({ kind: 'directory', path: '' })}><FolderPlus size={16} /></button><button className="icon-button" aria-label="Atualizar arquivos" title="Atualizar arquivos" disabled={!s.workspace || s.busy} onClick={() => void s.refresh()}><RefreshCw size={14} /></button></div></div>
      <nav className="tree-scroll">{s.files.length ? <FileTree entries={s.files} root={s.workspace?.path || ''} active={d?.path} disabled={s.busy} onOpen={path => void s.openDocument(path)} onAction={setAction} /> : <p className="sidebar-empty">{s.workspace ? 'Sua pasta está pronta. Crie seu primeiro documento.' : 'Seus documentos, nas suas pastas.'}</p>}</nav>
      <div className="sidebar-footer"><span className="status-dot" />Arquivos locais · UTF-8<span title="Sem sincronização ou conta">Privado</span></div>
      <div role="separator" aria-label="Largura da barra lateral" aria-orientation="vertical" aria-valuenow={width} tabIndex={0} className="sidebar-resize" onPointerDown={resize} onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) setWidth(Math.max(190, Math.min(440, e.clientX))) }} onPointerUp={e => { e.currentTarget.releasePointerCapture(e.pointerId); localStorage.setItem('markvault:sidebar', String(width)) }} onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setWidth(v => Math.max(190, Math.min(440, v + (e.key === 'ArrowRight' ? 20 : -20)))) } }} />
    </aside>}
    <main className="main">
      <header className="topbar"><div className="document-title"><button className="icon-button" aria-label={sidebar ? 'Ocultar explorador' : 'Mostrar explorador'} title="Alternar explorador (Ctrl+\)" onClick={() => setSidebar(!sidebar)}>{sidebar && !reading ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}</button><span className="toolbar-divider" /><FileText size={17} /><span>{d?.path.split('/').pop() || 'Seu espaço de conhecimento'}</span>{dirty && <span className="unsaved" title="Alterações não salvas" aria-label="Alterações não salvas" />}</div>
        {d && <div className="mode-switch" aria-label="Modo de visualização">{([
          ['markdown', Code2, 'Markdown'], ['split', Columns2, 'Dividido'], ['preview', FileText, 'Preview'], ['reading', BookOpen, 'Leitura'],
        ] as const).map(([mode, Icon, title]) => <button key={mode} title={title} aria-label={title} aria-pressed={s.mode === mode} className={s.mode === mode ? 'active' : ''} onClick={() => s.setMode(mode)}><Icon size={15} /><span>{title}</span></button>)}</div>}
        {!reading && <button className="icon-button" title="Salvar (Ctrl+S)" aria-label="Salvar documento" disabled={!dirty || s.saving || !!s.conflict} onClick={() => void s.save()}><Save size={17} /></button>}
      </header>
      {s.error && <div className="banner error" role="alert"><span>{s.error}</span><button onClick={s.dismissError} className="icon-button" aria-label="Dispensar erro"><X size={16} /></button></div>}
      {s.conflict && d && <section className="conflict" role="alert"><div><strong>{s.conflict === 'deleted' ? 'O arquivo foi removido ou movido fora do aplicativo.' : 'Este documento também foi alterado fora do MarkVault.'}</strong><p>Seu texto está preservado. Escolha como resolver antes de continuar.</p></div><div className="conflict-buttons">{s.conflict !== 'deleted' && <><button onClick={() => void s.reload()}>Usar versão do disco</button><button onClick={() => void s.overwrite()}>Substituir disco pelo meu texto</button></>}<button className="primary" onClick={() => setAction({ kind: 'copy', path: d.path })}>Salvar cópia do meu texto</button></div>{s.conflict !== 'deleted' && <details><summary>Comparar com a versão do disco</summary><pre>{s.conflict.content}</pre></details>}</section>}
      {d ? <>
        {!reading && <div className="breadcrumbs"><span>{s.workspace?.name}</span>{d.path.split('/').map((part, i) => <span key={i}><ChevronRight size={12} />{part}</span>)}</div>}
        <div className={`document-area mode-${s.mode}`}>
          {(s.mode === 'markdown' || s.mode === 'split') && <section className="source-pane"><div className="pane-label">MARKDOWN<span>.md</span></div><MarkdownEditor key={`${s.workspace?.path}:${d.path}`} value={d.content} onChange={s.edit} disabled={s.busy} /></section>}
          {s.mode !== 'markdown' && <section className="preview-pane">{!reading && <div className="pane-label">PREVIEW<span><BookOpen size={13} />Leitura renderizada</span></div>}<div className="preview-scroll"><MarkdownPreview content={d.content} path={d.path} /></div></section>}
        </div>
        <footer className="statusbar"><span>{s.saving ? 'Salvando…' : s.conflict ? 'Conflito externo' : dirty ? 'Alterações pendentes' : <><Check size={13} />Salvo no disco</>}</span><span>{d.content.trim() ? d.content.trim().split(/\s+/u).length : 0} palavras<span className="status-divider">·</span>{d.content.split('\n').length} linhas<span className="status-divider">·</span>Markdown<span className="status-divider">·</span>UTF-8</span></footer>
      </> : <div className="welcome"><div className="welcome-symbol"><Library size={40} strokeWidth={1.3} /></div><span className="eyebrow">UM LUGAR PARA SUAS IDEIAS</span><h1>Conhecimento que<br />fica com você.</h1><p>Escreva, conecte ideias e encontre clareza.<br />Seus documentos Markdown, na sua própria pasta.</p><button className="primary welcome-button" onClick={() => s.workspace ? setAction({ kind: 'file', path: '' }) : void s.openWorkspace()} disabled={s.busy}>{s.workspace ? <FilePlus2 size={18} /> : <FolderOpen size={18} />}{s.workspace ? 'Criar primeiro documento' : 'Abrir pasta local'}<ChevronRight size={16} /></button><div className="welcome-shortcuts"><span><kbd>Ctrl P</kbd>Encontrar documento</span><span><kbd>Ctrl N</kbd>Nova nota</span><span><kbd>Ctrl S</kbd>Salvar</span></div><small>Sem conta. Sem banco de dados. Apenas seus arquivos.</small></div>}
      {s.notice && <div className="notice" role="status">{s.notice}</div>}
    </main>
    {action && <ActionDialog key={`${action.kind}:${action.path}`} action={action} onClose={() => setAction(null)} />}
    {search && <SearchDialog onClose={() => setSearch(false)} />}
  </div>
}
