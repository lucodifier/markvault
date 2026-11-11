import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { ContentMatch, DocumentSnapshot, FileEntry, StorageProvider, Workspace } from './types'
export class LocalFilesystemProvider implements StorageProvider {
  private call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    if (!isTauri()) return Promise.reject(new Error('Abra o aplicativo desktop com npm run app para acessar suas pastas.'))
    return invoke<T>(command, args)
  }
  openWorkspace = () => this.call<Workspace | null>('open_workspace')
  restoreWorkspace = () => isTauri() ? this.call<Workspace | null>('restore_workspace') : Promise.resolve(null)
  listFiles = () => this.call<FileEntry[]>('list_files')
  searchContent = (query: string) => this.call<ContentMatch[]>('search_content', { query })
  readFile = (path: string) => this.call<DocumentSnapshot>('read_file', { path })
  writeFile = (path: string, content: string, expectedRevision: string) => this.call<DocumentSnapshot>('write_file', { path, content, expectedRevision })
  createFile = (path: string, content = '') => this.call<void>('create_file', { path, content })
  createDirectory = (path: string) => this.call<void>('create_directory', { path })
  renameFile = (path: string, destination: string) => this.call<void>('rename_file', { path, destination })
  deleteFile = (path: string) => this.call<void>('delete_file', { path })
  readAsset = (path: string) => this.call<string>('read_asset', { path })
  openExternal = (url: string) => this.call<void>('open_external', { url })
  openAttachment = (path: string) => this.call<void>('open_attachment', { path })
  async watchChanges(callback: () => void) {
    if (!isTauri()) return () => {}
    return listen('workspace-changed', callback)
  }
}
export const storage = new LocalFilesystemProvider()
