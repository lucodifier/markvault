import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentSnapshot, FileEntry, StorageProvider, Workspace, WorkspaceSession } from '../storage/types'
import { makeWorkspaceStore } from './workspaceStore'
import { recovery } from './recovery'

// Test double only; the application always uses the native filesystem provider.
class TestProvider implements StorageProvider {
  filesByRoot = new Map<string, Map<string, string>>([
    ['/teste', new Map([['nota.md', '# Inicial'], ['pasta/outra.md', 'Outra']])],
  ])
  workspaces: Workspace[] = [{ name: 'Teste', path: '/teste' }]
  activePath: string | undefined = '/teste'
  initialFile: WorkspaceSession['initialFile'] = undefined
  externalTarget: WorkspaceSession | null = null
  failures = { read: false, write: false }
  listeners = new Set<(workspace?: string) => void>()

  private bucket(workspace?: string) {
    const key = workspace ?? this.activePath ?? this.workspaces[0]?.path ?? '/teste'
    let map = this.filesByRoot.get(key)
    if (!map) { map = new Map(); this.filesByRoot.set(key, map) }
    return map
  }
  get data() { return this.bucket('/teste') }

  openWorkspace = async (): Promise<WorkspaceSession> => ({ workspaces: [...this.workspaces], activePath: this.activePath })
  removeWorkspace = async (workspace: string): Promise<WorkspaceSession> => {
    this.workspaces = this.workspaces.filter(w => w.path !== workspace)
    if (this.activePath === workspace) this.activePath = this.workspaces[0]?.path
    return { workspaces: [...this.workspaces], activePath: this.activePath }
  }
  restoreWorkspace = async (): Promise<WorkspaceSession> => ({ workspaces: [...this.workspaces], activePath: this.activePath, initialFile: this.initialFile })
  consumeExternalOpen = async () => { const target = this.externalTarget; this.externalTarget = null; return target }
  listFiles = async (workspace?: string): Promise<FileEntry[]> => [...this.bucket(workspace).keys()].map(path => ({ name: path, path, directory: false, children: [] }))
  searchContent = async () => []
  readFile = async (path: string, workspace?: string): Promise<DocumentSnapshot> => {
    if (this.failures.read) throw new Error('Leitura negada')
    const map = this.bucket(workspace)
    if (!map.has(path)) throw new Error('Arquivo ausente')
    const content = map.get(path)!
    return { content, revision: content }
  }
  writeFile = vi.fn(async (path: string, content: string, expected: string, workspace?: string) => {
    if (this.failures.write) throw new Error('Escrita negada')
    const map = this.bucket(workspace)
    if (map.get(path) !== expected) throw new Error('CONFLICT')
    map.set(path, content)
    return { content, revision: content }
  })
  createFile = async (path: string, content = '', workspace?: string) => { const map = this.bucket(workspace); if (map.has(path)) throw new Error('Já existe'); map.set(path, content) }
  createDirectory = async () => {}
  renameFile = async (path: string, target: string, workspace?: string) => { const map = this.bucket(workspace); map.set(target, map.get(path)!); map.delete(path) }
  deleteFile = async (path: string, workspace?: string) => { this.bucket(workspace).delete(path) }
  watchChanges = async (cb: (workspace?: string) => void) => { this.listeners.add(cb); return () => { this.listeners.delete(cb) } }
  readAsset = async () => 'data:image/png;base64,'
  openExternal = async () => {}
  openAttachment = async () => {}
  external(path: string, content: string, workspace = '/teste') { this.bucket(workspace).set(path, content); this.listeners.forEach(cb => cb(workspace)) }
}
beforeEach(() => {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => { data.delete(key) } })
})
async function setup() {
  const provider = new TestProvider()
  const store = makeWorkspaceStore(provider)
  await store.getState().initialize()
  await store.getState().openDocument('nota.md')
  return { provider, store, state: () => store.getState() }
}
describe('workspace lifecycle', () => {
  it('opens a workspace and edits, saves, renames and deletes a document', async () => {
    const { provider, state } = await setup()
    expect(state().workspace?.name).toBe('Teste')
    expect(state().files).toHaveLength(2)
    state().edit('Olá 🌱'); expect(await state().save()).toBe(true)
    expect(provider.data.get('nota.md')).toBe('Olá 🌱')
    expect(await state().rename('nota.md', 'renomeado.md')).toBe(true)
    expect(state().document?.path).toBe('renomeado.md')
    expect(await state().remove('renomeado.md')).toBe(true)
    expect(state().document).toBeNull()
    expect(await state().create('nova.md', false)).toBe(true)
    expect(provider.data.has('nova.md')).toBe(true)
  })
  it('refreshes clean documents on watcher notifications and unsubscribes', async () => {
    const { provider, state } = await setup()
    let refresh: Promise<void> | undefined
    const stop = await provider.watchChanges(ws => { refresh = state().refresh(ws) })
    provider.external('nota.md', 'Externo'); await refresh
    expect(state().document?.content).toBe('Externo')
    expect(state().conflict).toBeNull(); stop(); expect(provider.listeners.size).toBe(0)
  })
  it('preserves dirty text and offers both conflict resolutions', async () => {
    const { provider, state } = await setup()
    state().edit('Meu texto'); provider.external('nota.md', 'Externo')
    await state().refresh()
    expect(state().document?.content).toBe('Meu texto')
    expect(state().conflict).toEqual({ content: 'Externo', revision: 'Externo' })
    expect(await state().save()).toBe(false)
    await state().overwrite(); expect(provider.data.get('nota.md')).toBe('Meu texto')
    state().edit('Outra edição'); provider.external('nota.md', 'Nova versão externa')
    await state().refresh(); await state().reload()
    expect(state().document?.content).toBe('Nova versão externa')
    expect(state().conflict).toBeNull()
  })
  it('blocks navigation after a write error and preserves a recoverable draft', async () => {
    const { provider, state } = await setup()
    state().edit('Não perder'); provider.failures.write = true
    expect(await state().openDocument('pasta/outra.md')).toBe(false)
    expect(state().document?.path).toBe('nota.md')
    expect(state().error).toContain('Escrita negada')
    expect(recovery.read('/teste', 'nota.md')?.content).toBe('Não perder')
    provider.failures.write = false; expect(await state().save()).toBe(true)
    provider.failures.read = true; expect(await state().openDocument('pasta/outra.md')).toBe(false)
    expect(state().error).toContain('Leitura negada')
  })
  it('detects edits between refresh and save without replacing external content', async () => {
    const { provider, state } = await setup()
    state().edit('Local'); provider.external('nota.md', 'Externo')
    expect(await state().save()).toBe(false)
    expect(provider.data.get('nota.md')).toBe('Externo')
    expect(state().conflict).toBeTruthy()
  })
  it('recovers a deleted active document after restart and saves a copy', async () => {
    const { provider, state } = await setup()
    state().edit('Rascunho'); provider.data.delete('nota.md')
    const restarted = makeWorkspaceStore(provider)
    await restarted.getState().initialize()
    expect(restarted.getState().document?.content).toBe('Rascunho')
    expect(restarted.getState().conflict).toBe('deleted')
    expect(await restarted.getState().saveCopy('recuperado.md')).toBe(true)
    expect(provider.data.get('recuperado.md')).toBe('Rascunho')
  })
  it('recovers a draft against an externally changed file without autosaving it', async () => {
    const { provider, state } = await setup()
    state().edit('Rascunho'); provider.external('nota.md', 'Externo')
    const restarted = makeWorkspaceStore(provider)
    await restarted.getState().initialize()
    expect(restarted.getState().document?.content).toBe('Rascunho')
    expect(await restarted.getState().save()).toBe(false)
    expect(provider.data.get('nota.md')).toBe('Externo')
    restarted.getState().edit('Rascunho revisado')
    const restartedAgain = makeWorkspaceStore(provider)
    await restartedAgain.getState().initialize()
    expect(restartedAgain.getState().conflict).toBeTruthy()
    expect(await restartedAgain.getState().save()).toBe(false)
    expect(provider.data.get('nota.md')).toBe('Externo')
  })
  it('serializes overlapping saves and retains changes made during an in-flight write', async () => {
    const { provider, state } = await setup()
    let finish!: () => void
    const original = provider.writeFile.getMockImplementation()!
    provider.writeFile.mockImplementationOnce(async (...args) => { await new Promise<void>(resolve => { finish = resolve }); return original(...args) })
    state().edit('Primeiro'); const first = state().save()
    state().edit('Segundo'); const second = state().save()
    finish(); expect(await first).toBe(true); expect(await second).toBe(true)
    expect(provider.data.get('nota.md')).toBe('Segundo')
    expect(state().document?.content).toBe('Segundo')
    expect(state().saving).toBe(false)
  })
  it('opens an initial markdown file directly on cold start and handles warm external opens safely', async () => {
    const provider = new TestProvider()
    provider.initialFile = { workspacePath: '/teste', path: 'pasta/outra.md' }
    const store = makeWorkspaceStore(provider)
    await store.getState().initialize()
    expect(store.getState().document?.path).toBe('pasta/outra.md')
    expect(store.getState().document?.content).toBe('Outra')

    store.getState().edit('Editado antes de abrir outro')
    provider.externalTarget = { workspaces: [...provider.workspaces], activePath: '/teste', initialFile: { workspacePath: '/teste', path: 'nota.md' } }
    await store.getState().openExternalTarget()
    expect(provider.data.get('pasta/outra.md')).toBe('Editado antes de abrir outro')
    expect(store.getState().document?.path).toBe('nota.md')

    store.getState().edit('Nao perder')
    provider.failures.write = true
    provider.externalTarget = { workspaces: [...provider.workspaces], activePath: '/teste', initialFile: { workspacePath: '/teste', path: 'pasta/outra.md' } }
    await store.getState().openExternalTarget()
    expect(store.getState().document?.path).toBe('nota.md')
    expect(provider.externalTarget).not.toBeNull()
  })
  it('manages multiple open folders, removes references without deleting files, and persists folder expansion state', async () => {
    const provider = new TestProvider()
    provider.workspaces = [{ name: 'Teste', path: '/teste' }, { name: 'Docs', path: '/docs' }]
    provider.filesByRoot.set('/docs', new Map([['guia.md', '# Guia']]))
    const store = makeWorkspaceStore(provider)
    await store.getState().initialize()
    expect(store.getState().workspaces).toHaveLength(2)
    expect(await store.getState().openDocument('guia.md', '/docs')).toBe(true)
    expect(store.getState().document?.workspacePath).toBe('/docs')

    // Persist expanded/collapsed state across store restarts.
    store.getState().toggleExpanded('/teste::subpasta', true)
    expect(store.getState().expanded['/teste::subpasta']).toBe(false)
    const restarted = makeWorkspaceStore(provider)
    expect(restarted.getState().expanded['/teste::subpasta']).toBe(false)

    // Removing a folder reference does NOT delete files on disk.
    expect(await store.getState().removeWorkspace('/docs')).toBe(true)
    expect(store.getState().workspaces.map(w => w.path)).toEqual(['/teste'])
    expect(provider.filesByRoot.get('/docs')?.get('guia.md')).toBe('# Guia')
    expect(store.getState().document).toBeNull()
  })
  it('opens a standalone markdown file when no workspaces are opened', async () => {
    const provider = new TestProvider()
    provider.workspaces = []
    provider.activePath = undefined
    provider.filesByRoot.set('/standalone/dir', new Map([['avulso.md', '# Avulso']]))
    provider.initialFile = { workspacePath: '/standalone/dir', path: 'avulso.md' }

    const store = makeWorkspaceStore(provider)
    await store.getState().initialize()

    expect(store.getState().workspaces).toHaveLength(0)
    expect(store.getState().document?.path).toBe('avulso.md')
    expect(store.getState().document?.workspacePath).toBe('/standalone/dir')
    expect(store.getState().document?.content).toBe('# Avulso')

    // Editing and saving standalone file persists changes safely
    store.getState().edit('# Avulso editado')
    expect(await store.getState().save()).toBe(true)
    expect(provider.filesByRoot.get('/standalone/dir')?.get('avulso.md')).toBe('# Avulso editado')
  })
})
