import { create } from 'zustand'
import { storage } from '../storage/LocalFilesystemProvider'
import type { DocumentSnapshot, FileEntry, StorageProvider, Workspace } from '../storage/types'
import { recovery } from './recovery'

export interface OpenDocument extends DocumentSnapshot { path: string; saved: string }
type Mode = 'markdown' | 'preview' | 'reading' | 'split'
interface State {
  workspace: Workspace | null; files: FileEntry[]; document: OpenDocument | null
  mode: Mode; error: string | null; notice: string | null; busy: boolean; saving: boolean
  conflict: DocumentSnapshot | 'deleted' | null
  initialize(): Promise<void>; openWorkspace(): Promise<void>; refresh(): Promise<void>
  openDocument(path: string): Promise<boolean>; edit(content: string): void; save(): Promise<boolean>
  setMode(mode: Mode): void; dismissError(): void
  create(path: string, directory: boolean): Promise<boolean>
  rename(path: string, destination: string): Promise<boolean>; remove(path: string): Promise<boolean>
  reload(): Promise<void>; overwrite(): Promise<void>; saveCopy(path: string): Promise<boolean>
}
const message = (e: unknown) => e instanceof Error ? e.message : String(e)
export function makeWorkspaceStore(provider: StorageProvider) {
  let pendingSave: Promise<boolean> | null = null
  let refreshing: Promise<void> | null = null
  let opening = 0
  return create<State>((set, get) => {
    const fail = (e: unknown) => set({ error: message(e) })
    const remember = (d: OpenDocument) => {
      const root = get().workspace?.path
      if (!root) return
      try {
        if (d.content === d.saved) recovery.remove(root, d.path)
        else recovery.write(root, d.path, { content: d.content, revision: d.revision })
      } catch { fail('Não foi possível manter o rascunho de recuperação. Salve o documento antes de fechar.') }
    }
    const readDocument = async (path: string) => {
      const root = get().workspace!.path
      let draft: ReturnType<typeof recovery.read> = null
      try { draft = recovery.read(root, path) } catch { fail('O cache de recuperação está indisponível.') }
      let disk: DocumentSnapshot
      try { disk = await provider.readFile(path) }
      catch (e) {
        if (!draft) throw e
        set({ document: { path, content: draft.content, saved: '', revision: draft.revision }, conflict: 'deleted', notice: 'Rascunho recuperado de um arquivo indisponível. Salve uma cópia para preservá-lo.' })
        return
      }
      const restored = draft && draft.content !== disk.content
      set({ document: { ...disk, path, saved: disk.content, content: draft && restored ? draft.content : disk.content,
          revision: draft && restored ? draft.revision : disk.revision },
        conflict: draft && restored && draft.revision !== disk.revision ? disk : null,
        notice: restored ? 'Rascunho recuperado.' : null })
      try { localStorage.setItem(`markvault:active:${root}`, path) } catch { /* Optional UI preference. */ }
    }
    const load = async (workspace: Workspace) => {
      opening++
      set({ workspace, document: null, files: [], conflict: null })
      set({ files: await provider.listFiles() })
      let active: string | null = null
      try { active = localStorage.getItem(`markvault:active:${workspace.path}`) } catch { /* Optional UI preference. */ }
      if (active) { try { await readDocument(active) } catch (e) { fail(e) } }
    }
    const mutate = async (action: () => Promise<void>) => {
      if (get().busy) return false
      set({ busy: true, error: null })
      try { if (!(await get().save())) return false; await action(); await get().refresh(); return true }
      catch (e) { fail(e); return false }
      finally { set({ busy: false }) }
    }
    return {
      workspace: null, files: [], document: null, mode: 'split', error: null, notice: null,
      busy: true, saving: false, conflict: null,
      async initialize() {
        try { const workspace = await provider.restoreWorkspace(); if (workspace) await load(workspace) } catch (e) { fail(e) } finally { set({ busy: false }) }
      },
      async openWorkspace() {
        if (get().busy) return
        set({ busy: true, error: null })
        try { if (!(await get().save())) return; const workspace = await provider.openWorkspace(); if (workspace) await load(workspace) }
        catch (e) { fail(e) } finally { set({ busy: false }) }
      },
      refresh() {
        if (refreshing) return refreshing
        refreshing = (async () => {
          const root = get().workspace?.path
          if (!root) return
          try {
            const files = await provider.listFiles()
            if (get().workspace?.path !== root) return
            set({ files })
            // Wait for our own atomic write before interpreting a watcher event.
            if (pendingSave) await pendingSave
            const d = get().document
            if (!d) return
            let disk: DocumentSnapshot
            try { disk = await provider.readFile(d.path) }
            catch (e) {
              const exists = (entries: FileEntry[]): boolean => entries.some(f => f.path === d.path || exists(f.children))
              if (get().document?.path === d.path && get().workspace?.path === root) {
                if (!exists(files)) set({ conflict: 'deleted' }); else fail(e)
              }
              return
            }
            const current = get().document
            if (!current || current.path !== d.path || get().workspace?.path !== root) return
            if (disk.revision !== current.revision) {
              if (current.content !== current.saved || get().conflict) set({ conflict: disk })
              else set({ document: { ...disk, path: d.path, saved: disk.content }, conflict: null, notice: 'Documento atualizado pelo sistema de arquivos.' })
            }
          } catch (e) { fail(e) }
        })().finally(() => { refreshing = null })
        return refreshing
      },
      async openDocument(path) {
        if (get().busy) return false
        const token = ++opening
        set({ busy: true, error: null })
        try {
          if (!(await get().save())) return false
          await readDocument(path)
          if (token !== opening) return false
          return true
        } catch (e) { fail(e); return false } finally { set({ busy: false }) }
      },
      edit(content) {
        const d = get().document
        if (!d) return
        const next = { ...d, content }; set({ document: next, notice: null }); remember(next)
      },
      save() {
        if (pendingSave) return pendingSave.then(ok => ok ? get().save() : false)
        const d = get().document
        if (get().conflict) return Promise.resolve(false)
        if (!d || d.content === d.saved) return Promise.resolve(true)
        const root = get().workspace?.path
        set({ saving: true })
        pendingSave = (async () => {
          try {
            const disk = await provider.writeFile(d.path, d.content, d.revision)
            const current = get().document
            if (current?.path === d.path && get().workspace?.path === root) {
              const next = { ...current, saved: d.content, revision: disk.revision }
              set({ document: next, error: null }); remember(next)
            }
            return true
          } catch (e) {
            fail(e)
            if (message(e).includes('CONFLICT')) {
              try { set({ conflict: await provider.readFile(d.path) }) } catch { set({ conflict: 'deleted' }) }
            }
            return false
          } finally { pendingSave = null; set({ saving: false }) }
        })()
        // Navigation and window close must wait for edits typed during a write too.
        return pendingSave.then(ok => {
          const current = get().document
          return ok && current && current.content !== current.saved ? get().save() : ok
        })
      },
      setMode: mode => set({ mode }), dismissError: () => set({ error: null }),
      create: (path, directory) => mutate(async () => {
        if (directory) await provider.createDirectory(path); else await provider.createFile(path)
      }),
      rename: (path, destination) => mutate(async () => {
        await provider.renameFile(path, destination)
        const d = get().document
        if (d && (d.path === path || d.path.startsWith(path + '/'))) {
          recovery.remove(get().workspace!.path, d.path)
          set({ document: { ...d, path: destination + d.path.slice(path.length) } })
          try { localStorage.setItem(`markvault:active:${get().workspace!.path}`, destination + d.path.slice(path.length)) } catch { /* Optional preference. */ }
        }
      }),
      remove: path => mutate(async () => {
        await provider.deleteFile(path)
        const d = get().document
        if (d && (d.path === path || d.path.startsWith(path + '/'))) set({ document: null, conflict: null })
      }),
      async reload() {
        const d = get().document
        if (!d || get().busy) return
        set({ busy: true })
        try {
          const disk = await provider.readFile(d.path)
          recovery.remove(get().workspace!.path, d.path)
          set({ document: { ...disk, path: d.path, saved: disk.content }, conflict: null, error: null })
        } catch (e) { fail(e) } finally { set({ busy: false }) }
      },
      async overwrite() {
        const conflict = get().conflict
        const d = get().document
        if (!d || !conflict || conflict === 'deleted' || get().busy) return
        set({ document: { ...d, revision: conflict.revision }, conflict: null, busy: true })
        try { await get().save() } finally { set({ busy: false }) }
      },
      async saveCopy(path) {
        const d = get().document
        if (!d || get().busy) return false
        set({ busy: true })
        try {
          await provider.createFile(path, d.content)
          recovery.remove(get().workspace!.path, d.path)
          const disk = await provider.readFile(path)
          set({ document: { ...disk, path, saved: disk.content }, conflict: null, error: null })
          try { localStorage.setItem(`markvault:active:${get().workspace!.path}`, path) } catch { /* Optional preference. */ }
          await get().refresh(); return true
        } catch (e) { fail(e); return false } finally { set({ busy: false }) }
      },
    }
  })
}
export const useWorkspace = makeWorkspaceStore(storage)
