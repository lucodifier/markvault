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
    const add = (unsubscribe: () => void) => disposed ? unsubscribe() : unsubscribes.push(unsubscribe)
    const refresh = () => {
      clearTimeout(timer)
      timer = setTimeout(() => { if (!disposed) void useWorkspace.getState().refresh() }, 180)
    }
    void (async () => {
      try {
        add(await storage.watchChanges(refresh))
        if (disposed) return
        initialization ??= useWorkspace.getState().initialize()
        await initialization
        if (isTauri() && !disposed) {
          add(await listen<string>('workspace-watch-error', e => useWorkspace.setState({ error: `Monitoramento interrompido: ${e.payload}. Use Atualizar para reler a pasta.` })))
          add(await getCurrentWindow().onCloseRequested(async event => {
            event.preventDefault()
            if (await useWorkspace.getState().save()) await getCurrentWindow().destroy()
            else useWorkspace.setState({ error: 'Resolva o conflito ou o erro de salvamento antes de fechar. Seu rascunho foi mantido.' })
          }))
        }
      } catch (e) { useWorkspace.setState({ error: String(e), busy: false }) }
    })()
    window.addEventListener('focus', refresh)
    const beforeUnload = (e: BeforeUnloadEvent) => {
      const d = useWorkspace.getState().document
      if (d && d.content !== d.saved) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => { disposed = true; clearTimeout(timer); unsubscribes.forEach(fn => fn()); window.removeEventListener('focus', refresh); window.removeEventListener('beforeunload', beforeUnload) }
  }, [])
  useEffect(() => {
    if (conflict) return
    const timer = setTimeout(() => { void useWorkspace.getState().save() }, 700)
    return () => clearTimeout(timer)
  }, [content, path, conflict])
}
