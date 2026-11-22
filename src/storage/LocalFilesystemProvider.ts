import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { ContentMatch, DocumentSnapshot, FileEntry, StorageProvider, WorkspaceSession } from './types'
export class LocalFilesystemProvider implements StorageProvider {
  private call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    if (!isTauri()) return Promise.reject(new Error('Abra o aplicativo desktop com npm run app para acessar suas pastas.'))
    return invoke<T>(command, args)
  }
  openWorkspace = () => this.call<WorkspaceSession | null>('open_workspace')
  removeWorkspace = (workspace: string) => this.call<WorkspaceSession>('remove_workspace', { workspace })
  restoreWorkspace = () => isTauri() ? this.call<WorkspaceSession | null>('restore_workspace') : Promise.resolve(null)
  consumeExternalOpen = () => isTauri() ? this.call<WorkspaceSession | null>('consume_external_open') : Promise.resolve(null)
  listFiles = (workspace?: string) => this.call<FileEntry[]>('list_files', { workspace })
  searchContent = (query: string) => this.call<ContentMatch[]>('search_content', { query })
  readFile = (path: string, workspace?: string) => this.call<DocumentSnapshot>('read_file', { path, workspace })
  writeFile = (path: string, content: string, expectedRevision: string, workspace?: string) => this.call<DocumentSnapshot>('write_file', { path, content, expectedRevision, workspace })
  createFile = (path: string, content = '', workspace?: string) => this.call<void>('create_file', { path, content, workspace })
  createDirectory = (path: string, workspace?: string) => this.call<void>('create_directory', { path, workspace })
  renameFile = (path: string, destination: string, workspace?: string) => this.call<void>('rename_file', { path, destination, workspace })
  moveEntry = (path: string, workspace: string, destination: string, destinationWorkspace: string) => this.call<void>('move_entry', { path, workspace, destination, destinationWorkspace })
  deleteFile = (path: string, workspace?: string) => this.call<void>('delete_file', { path, workspace })
  readAsset = (path: string, workspace?: string) => this.call<string>('read_asset', { path, workspace })
  saveImage = (directory: string, name: string, dataBase64: string, workspace?: string) => this.call<string>('save_image', { directory, name, dataBase64, workspace })
  openExternal = (url: string) => this.call<void>('open_external', { url })
  openAttachment = (path: string, workspace?: string) => this.call<void>('open_attachment', { path, workspace })
  async watchChanges(callback: (workspace?: string) => void) {
    if (!isTauri()) return () => {}
    return listen<string | undefined>('workspace-changed', event => callback(typeof event.payload === 'string' ? event.payload : undefined))
  }
}
export const storage = new LocalFilesystemProvider()
