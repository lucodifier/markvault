import { useEffect } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { storage } from '../storage/LocalFilesystemProvider'
import { useWorkspace } from '../stores/workspaceStore'

let initialization: Promise<void> | undefined
export function useWorkspaceLifecycle() {
  const content = useWorkspace(s => s.document?.content)
  const path = useWorkspace(s => s.document?.path)
  const conflict = useWorkspace(s => s.conflict)
  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const unsubscribes: (() => void)[] = []
    const add = (unsubscribe: () => void) => { if (disposed) unsubscribe(); else unsubscribes.push(unsubscribe) }
    const refresh = (workspacePath?: string) => {
      clearTimeout(timer)
      timer = setTimeout(() => { if (!disposed) void useWorkspace.getState().refresh(workspacePath) }, 180)
    }
    const refreshAll = () => refresh()
    void (async () => {
      try {
        initialization ??= useWorkspace.getState().initialize()
        const listeners: Promise<void>[] = [
          storage.watchChanges(refresh).then(add),
        ]
        if (isTauri()) {
          listeners.push(
            listen('external-open-requested', () => { void useWorkspace.getState().openExternalTarget() }).then(add),
            listen<string>('workspace-watch-error', e => useWorkspace.setState({ error: `Monitoramento interrompido: ${e.payload}. Use Atualizar para reler a pasta.` })).then(add),
            getCurrentWindow().onCloseRequested(async event => {
              event.preventDefault()
              if (await useWorkspace.getState().save()) await getCurrentWindow().destroy()
              else useWorkspace.setState({ error: 'Resolva o conflito ou o erro de salvamento antes de fechar. Seu rascunho foi mantido.' })
            }).then(add),
          )
        }
        await Promise.all([initialization, ...listeners])
      } catch (e) { useWorkspace.setState({ error: String(e), busy: false }) }
    })()
    window.addEventListener('focus', refreshAll)
    const beforeUnload = (e: BeforeUnloadEvent) => {
      const d = useWorkspace.getState().document
      if (d && d.content !== d.saved) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => { disposed = true; clearTimeout(timer); unsubscribes.forEach(fn => fn()); window.removeEventListener('focus', refreshAll); window.removeEventListener('beforeunload', beforeUnload) }
  }, [])
  useEffect(() => {
    if (conflict) return
    const timer = setTimeout(() => { void useWorkspace.getState().save() }, 700)
    return () => clearTimeout(timer)
  }, [content, path, conflict])
}
