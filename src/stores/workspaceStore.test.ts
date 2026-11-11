import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentSnapshot, FileEntry, StorageProvider } from '../storage/types'
import { makeWorkspaceStore } from './workspaceStore'
import { recovery } from './recovery'

// Test double only; the application always uses the native filesystem provider.
class TestProvider implements StorageProvider {
  data = new Map([['nota.md', '# Inicial'], ['pasta/outra.md', 'Outra']])
  failures = { read: false, write: false }
  workspace = { name: 'Teste', path: '/teste' }
  listeners = new Set<() => void>()
  openWorkspace = async () => this.workspace
  restoreWorkspace = async () => this.workspace
  listFiles = async (): Promise<FileEntry[]> => [...this.data.keys()].map(path => ({ name: path, path, directory: false, children: [] }))
  searchContent = async () => []
  readFile = async (path: string): Promise<DocumentSnapshot> => {
    if (this.failures.read) throw new Error('Leitura negada')
    if (!this.data.has(path)) throw new Error('Arquivo ausente')
    const content = this.data.get(path)!
    return { content, revision: content }
  }
  writeFile = vi.fn(async (path: string, content: string, expected: string) => {
    if (this.failures.write) throw new Error('Escrita negada')
    if (this.data.get(path) !== expected) throw new Error('CONFLICT')
    this.data.set(path, content)
    return { content, revision: content }
  })
  createFile = async (path: string, content = '') => { if (this.data.has(path)) throw new Error('Já existe'); this.data.set(path, content) }
  createDirectory = async () => {}
  renameFile = async (path: string, target: string) => { this.data.set(target, this.data.get(path)!); this.data.delete(path) }
  deleteFile = async (path: string) => { this.data.delete(path) }
  watchChanges = async (cb: () => void) => { this.listeners.add(cb); return () => { this.listeners.delete(cb) } }
  readAsset = async () => 'data:image/png;base64,'
  openExternal = async () => {}
  openAttachment = async () => {}
  external(path: string, content: string) { this.data.set(path, content); this.listeners.forEach(cb => cb()) }
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
    const stop = await provider.watchChanges(() => { refresh = state().refresh() })
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
})
