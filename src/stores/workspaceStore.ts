import { create } from 'zustand'
import { storage } from '../storage/LocalFilesystemProvider'
import type { DocumentSnapshot, FileEntry, StorageProvider, Workspace, WorkspaceSession } from '../storage/types'
import { recovery } from './recovery'

export interface OpenDocument extends DocumentSnapshot { workspacePath: string; path: string; saved: string }
type Mode = 'markdown' | 'preview' | 'reading' | 'split'
interface State {
  workspaces: Workspace[]
  filesByWorkspace: Record<string, FileEntry[]>
  expanded: Record<string, boolean>
  workspace: Workspace | null
  files: FileEntry[]
  document: OpenDocument | null
  mode: Mode; error: string | null; notice: string | null; busy: boolean; saving: boolean
  conflict: DocumentSnapshot | 'deleted' | null
  initialize(): Promise<void>
  openWorkspace(): Promise<void>
  removeWorkspace(workspacePath: string): Promise<boolean>
  openExternalTarget(): Promise<void>
  refresh(workspacePath?: string): Promise<void>
  openDocument(path: string, workspacePath?: string): Promise<boolean>
  edit(content: string): void
  save(): Promise<boolean>
  setMode(mode: Mode): void
  toggleExpanded(key: string, defaultOpen?: boolean): void
  dismissError(): void
  create(path: string, directory: boolean, workspacePath?: string): Promise<boolean>
  rename(path: string, destination: string, workspacePath?: string): Promise<boolean>
  move(path: string, workspacePath: string, destinationDir: string, destinationWorkspace: string): Promise<boolean>
  remove(path: string, workspacePath?: string): Promise<boolean>
  reload(): Promise<void>
  overwrite(): Promise<void>
  saveCopy(path: string): Promise<boolean>
}
const EXPANDED_KEY = 'markvault:expanded'
const LAST_ACTIVE_KEY = 'markvault:last-active'
const message = (e: unknown) => e instanceof Error ? e.message : String(e)

function readExpanded(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, boolean> : {}
  } catch { return {} }
}
function writeExpanded(expanded: Record<string, boolean>) {
  try { localStorage.setItem(EXPANDED_KEY, JSON.stringify(expanded)) } catch { /* Optional UI preference. */ }
}
function readLastActive(): { workspacePath: string; path: string } | null {
  try {
    const raw = localStorage.getItem(LAST_ACTIVE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { workspacePath?: unknown; path?: unknown }
    if (typeof parsed.workspacePath === 'string' && typeof parsed.path === 'string') {
      return { workspacePath: parsed.workspacePath, path: parsed.path }
    }
  } catch { /* Optional UI preference. */ }
  return null
}
function writeLastActive(workspacePath: string, path: string) {
  try {
    localStorage.setItem(LAST_ACTIVE_KEY, JSON.stringify({ workspacePath, path }))
    localStorage.setItem(`markvault:active:${workspacePath}`, path)
  } catch { /* Optional UI preference. */ }
}

export function makeWorkspaceStore(provider: StorageProvider) {
  let pendingSave: Promise<boolean> | null = null
  let refreshing: Promise<void> | null = null
  let opening = 0
  return create<State>((set, get) => {
    const fail = (e: unknown) => set({ error: message(e) })
    const resolveWorkspace = (workspacePath?: string): Workspace | null => {
      const target = workspacePath ?? get().document?.workspacePath ?? get().workspace?.path
      if (!target) return get().workspaces[0] ?? null
      return get().workspaces.find(w => w.path === target) ?? get().workspace
    }
    const remember = (d: OpenDocument) => {
      try {
        if (d.content === d.saved) recovery.remove(d.workspacePath, d.path)
        else recovery.write(d.workspacePath, d.path, { content: d.content, revision: d.revision })
      } catch { fail('Não foi possível manter o rascunho de recuperação. Salve o documento antes de fechar.') }
    }
    const readDocument = async (workspacePath: string, path: string) => {
      let draft: ReturnType<typeof recovery.read> = null
      try { draft = recovery.read(workspacePath, path) } catch { fail('O cache de recuperação está indisponível.') }
      let disk: DocumentSnapshot
      try { disk = await provider.readFile(path, workspacePath) }
      catch (e) {
        if (!draft) throw e
        const ws = get().workspaces.find(w => w.path === workspacePath) ?? get().workspace
        set({
          workspace: ws,
          files: ws ? (get().filesByWorkspace[ws.path] ?? []) : [],
          document: { workspacePath, path, content: draft.content, saved: '', revision: draft.revision },
          conflict: 'deleted',
          notice: 'Rascunho recuperado de um arquivo indisponível. Salve uma cópia para preservá-lo.',
        })
        return
      }
      const restored = draft && draft.content !== disk.content
      const ws = get().workspaces.find(w => w.path === workspacePath) ?? get().workspace
      set({
        workspace: ws,
        files: ws ? (get().filesByWorkspace[ws.path] ?? []) : [],
        document: {
          ...disk,
          workspacePath,
          path,
          saved: disk.content,
          content: draft && restored ? draft.content : disk.content,
          revision: draft && restored ? draft.revision : disk.revision,
        },
        conflict: draft && restored && draft.revision !== disk.revision ? disk : null,
        notice: restored ? 'Rascunho recuperado.' : null,
      })
      writeLastActive(workspacePath, path)
    }
    const loadWorkspaceFiles = async (workspacePath: string, token: number) => {
      const entries = await provider.listFiles(workspacePath)
      if (token !== opening) return
      set(state => {
        const filesByWorkspace = { ...state.filesByWorkspace, [workspacePath]: entries }
        return {
          filesByWorkspace,
          files: state.workspace?.path === workspacePath ? entries : state.files,
        }
      })
    }
    const applySession = async (session: WorkspaceSession, openDocIfNeeded: boolean) => {
      const token = ++opening
      const workspaces = session.workspaces
      const activeWs = workspaces.find(w => w.path === session.activePath) ?? workspaces[0] ?? null
      const prevMap = get().filesByWorkspace
      const nextMap: Record<string, FileEntry[]> = {}
      for (const ws of workspaces) nextMap[ws.path] = prevMap[ws.path] ?? []
      set({
        workspaces,
        filesByWorkspace: nextMap,
        workspace: activeWs,
        files: activeWs ? nextMap[activeWs.path] : [],
      })
      let targetDoc: { workspacePath: string; path: string } | null = session.initialFile ?? null
      if (!targetDoc && openDocIfNeeded) {
        const last = readLastActive()
        if (last && workspaces.some(w => w.path === last.workspacePath)) {
          targetDoc = last
        } else if (activeWs) {
          try {
            const legacy = localStorage.getItem(`markvault:active:${activeWs.path}`)
            if (legacy) targetDoc = { workspacePath: activeWs.path, path: legacy }
          } catch { /* Optional UI preference. */ }
        }
      }
      const listTasks = workspaces.map(ws => loadWorkspaceFiles(ws.path, token).catch(fail))
      const docTask = targetDoc ? readDocument(targetDoc.workspacePath, targetDoc.path).catch(fail) : Promise.resolve()
      await Promise.all([...listTasks, docTask])
    }
    const mutate = async (workspacePath: string | undefined, action: (root: string) => Promise<void>) => {
      if (get().busy) return false
      const ws = resolveWorkspace(workspacePath)
      if (!ws) return false
      set({ busy: true, error: null })
      try {
        if (!(await get().save())) return false
        await action(ws.path)
        await get().refresh(ws.path)
        return true
      } catch (e) { fail(e); return false }
      finally { set({ busy: false }) }
    }
    return {
      workspaces: [],
      filesByWorkspace: {},
      expanded: readExpanded(),
      workspace: null,
      files: [],
      document: null,
      mode: 'split',
      error: null,
      notice: null,
      busy: true,
      saving: false,
      conflict: null,
      async initialize() {
        try {
          const session = await provider.restoreWorkspace()
          if (session && session.workspaces.length) await applySession(session, true)
        } catch (e) { fail(e) } finally { set({ busy: false }) }
      },
      async openWorkspace() {
        if (get().busy) return
        set({ busy: true, error: null })
        try {
          const session = await provider.openWorkspace()
          if (session) await applySession(session, false)
        } catch (e) { fail(e) } finally { set({ busy: false }) }
      },
      async removeWorkspace(workspacePath) {
        if (!provider.removeWorkspace || get().busy) return false
        set({ busy: true, error: null })
        try {
          const currentDoc = get().document
          if (currentDoc?.workspacePath === workspacePath) {
            if (!(await get().save())) return false
          }
          const session = await provider.removeWorkspace(workspacePath)
          const nextMap = { ...get().filesByWorkspace }
          delete nextMap[workspacePath]
          const keepDoc = currentDoc && currentDoc.workspacePath !== workspacePath ? currentDoc : null
          const activeWs = keepDoc
            ? (session.workspaces.find(w => w.path === keepDoc.workspacePath) ?? null)
            : (session.workspaces.find(w => w.path === session.activePath) ?? session.workspaces[0] ?? null)
          set({
            workspaces: session.workspaces,
            filesByWorkspace: nextMap,
            workspace: activeWs,
            files: activeWs ? (nextMap[activeWs.path] ?? []) : [],
            document: keepDoc,
            conflict: keepDoc ? get().conflict : null,
            notice: 'Pasta removida da lista (arquivos no disco preservados).',
          })
          return true
        } catch (e) { fail(e); return false } finally { set({ busy: false }) }
      },
      async openExternalTarget() {
        if (!provider.consumeExternalOpen || get().busy) return
        set({ busy: true, error: null })
        try {
          if (!(await get().save())) return
          const session = await provider.consumeExternalOpen()
          if (!session) return
          const currentPaths = new Set(get().workspaces.map(w => w.path))
          const sameSet = session.workspaces.length === currentPaths.size && session.workspaces.every(w => currentPaths.has(w.path))
          if (sameSet && session.initialFile) {
            await readDocument(session.initialFile.workspacePath, session.initialFile.path)
          } else {
            await applySession(session, false)
          }
        } catch (e) { fail(e) } finally { set({ busy: false }) }
      },
      refresh(workspacePath?: string) {
        if (refreshing) return refreshing
        refreshing = (async () => {
          const targets = workspacePath
            ? get().workspaces.filter(w => w.path === workspacePath)
            : get().workspaces
          if (!targets.length) return
          try {
            const results = await Promise.all(targets.map(async ws => [ws.path, await provider.listFiles(ws.path)] as const))
            set(state => {
              const filesByWorkspace = { ...state.filesByWorkspace }
              for (const [path, entries] of results) {
                if (state.workspaces.some(w => w.path === path)) filesByWorkspace[path] = entries
              }
              return {
                filesByWorkspace,
                files: state.workspace ? (filesByWorkspace[state.workspace.path] ?? state.files) : [],
              }
            })
            // Wait for our own atomic write before interpreting a watcher event.
            if (pendingSave) await pendingSave
            const d = get().document
            if (!d) return
            if (workspacePath && d.workspacePath !== workspacePath) return
            let disk: DocumentSnapshot
            try { disk = await provider.readFile(d.path, d.workspacePath) }
            catch (e) {
              const exists = (entries: FileEntry[]): boolean => entries.some(f => f.path === d.path || exists(f.children))
              const wsFiles = get().filesByWorkspace[d.workspacePath] ?? []
              if (get().document?.path === d.path && get().document?.workspacePath === d.workspacePath) {
                if (!exists(wsFiles)) set({ conflict: 'deleted' }); else fail(e)
              }
              return
            }
            const current = get().document
            if (!current || current.path !== d.path || current.workspacePath !== d.workspacePath) return
            if (disk.revision !== current.revision) {
              if (current.content !== current.saved || get().conflict) set({ conflict: disk })
              else set({ document: { ...disk, workspacePath: d.workspacePath, path: d.path, saved: disk.content }, conflict: null, notice: 'Documento atualizado pelo sistema de arquivos.' })
            }
          } catch (e) { fail(e) }
        })().finally(() => { refreshing = null })
        return refreshing
      },
      async openDocument(path, workspacePath) {
        if (get().busy) return false
        const ws = resolveWorkspace(workspacePath)
        if (!ws) return false
        const token = ++opening
        set({ busy: true, error: null })
        try {
          if (!(await get().save())) return false
          await readDocument(ws.path, path)
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
        set({ saving: true })
        pendingSave = (async () => {
          try {
            const disk = await provider.writeFile(d.path, d.content, d.revision, d.workspacePath)
            const current = get().document
            if (current?.path === d.path && current.workspacePath === d.workspacePath) {
              const next = { ...current, saved: d.content, revision: disk.revision }
              set({ document: next, error: null }); remember(next)
            }
            return true
          } catch (e) {
            fail(e)
            if (message(e).includes('CONFLICT')) {
              try { set({ conflict: await provider.readFile(d.path, d.workspacePath) }) } catch { set({ conflict: 'deleted' }) }
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
      setMode: mode => set({ mode }),
      toggleExpanded(key, defaultOpen = true) {
        set(state => {
          const current = state.expanded[key] ?? defaultOpen
          const next = { ...state.expanded, [key]: !current }
          writeExpanded(next)
          return { expanded: next }
        })
      },
      dismissError: () => set({ error: null }),
      create: (path, directory, workspacePath) => mutate(workspacePath, async root => {
        if (directory) await provider.createDirectory(path, root); else await provider.createFile(path, '', root)
      }),
      rename: (path, destination, workspacePath) => mutate(workspacePath, async root => {
        await provider.renameFile(path, destination, root)
        const d = get().document
        if (d && d.workspacePath === root && (d.path === path || d.path.startsWith(path + '/'))) {
          recovery.remove(root, d.path)
          const nextPath = destination + d.path.slice(path.length)
          set({ document: { ...d, path: nextPath } })
          writeLastActive(root, nextPath)
        }
      }),
      async move(path, workspacePath, destinationDir, destinationWorkspace) {
        if (get().busy || !provider.moveEntry) return false
        const name = path.split('/').pop()!
        const destination = [destinationDir, name].filter(Boolean).join('/')
        if (workspacePath === destinationWorkspace && (destination === path || destinationDir === path || destinationDir.startsWith(path + '/'))) {
          if (destination !== path) set({ error: 'Não é possível mover uma pasta para dentro dela mesma.' })
          return false
        }
        set({ busy: true, error: null })
        try {
          if (!(await get().save())) return false
          await provider.moveEntry(path, workspacePath, destination, destinationWorkspace)
          const d = get().document
          if (d && d.workspacePath === workspacePath && (d.path === path || d.path.startsWith(path + '/'))) {
            recovery.remove(workspacePath, d.path)
            const nextPath = destination + d.path.slice(path.length)
            set({ document: { ...d, workspacePath: destinationWorkspace, path: nextPath } })
            writeLastActive(destinationWorkspace, nextPath)
          }
          await get().refresh(workspacePath)
          if (destinationWorkspace !== workspacePath) await get().refresh(destinationWorkspace)
          set({ notice: `Movido: ${name}` })
          return true
        } catch (e) { fail(e); return false } finally { set({ busy: false }) }
      },
      remove: (path, workspacePath) => mutate(workspacePath, async root => {
        await provider.deleteFile(path, root)
        const d = get().document
        if (d && d.workspacePath === root && (d.path === path || d.path.startsWith(path + '/'))) set({ document: null, conflict: null })
      }),
      async reload() {
        const d = get().document
        if (!d || get().busy) return
        set({ busy: true })
        try {
          const disk = await provider.readFile(d.path, d.workspacePath)
          recovery.remove(d.workspacePath, d.path)
          set({ document: { ...disk, workspacePath: d.workspacePath, path: d.path, saved: disk.content }, conflict: null, error: null })
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
          await provider.createFile(path, d.content, d.workspacePath)
          recovery.remove(d.workspacePath, d.path)
          const disk = await provider.readFile(path, d.workspacePath)
          set({ document: { ...disk, workspacePath: d.workspacePath, path, saved: disk.content }, conflict: null, error: null })
          writeLastActive(d.workspacePath, path)
          await get().refresh(d.workspacePath); return true
        } catch (e) { fail(e); return false } finally { set({ busy: false }) }
      },
    }
  })
}
export const useWorkspace = makeWorkspaceStore(storage)
