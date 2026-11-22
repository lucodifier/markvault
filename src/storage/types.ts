export interface FileEntry { path: string; name: string; directory: boolean; children: FileEntry[] }
export interface Workspace { name: string; path: string }
export interface InitialFile { workspacePath: string; path: string }
export interface WorkspaceSession { workspaces: Workspace[]; activePath?: string; initialFile?: InitialFile }
export interface DocumentSnapshot { content: string; revision: string }
export interface ContentMatch { workspacePath?: string; workspaceName?: string; path: string; name: string; line: number; text: string }
export interface StorageProvider {
  openWorkspace(): Promise<WorkspaceSession | null>
  removeWorkspace?(workspace: string): Promise<WorkspaceSession>
  restoreWorkspace(): Promise<WorkspaceSession | null>
  consumeExternalOpen?(): Promise<WorkspaceSession | null>
  listFiles(workspace?: string): Promise<FileEntry[]>
  searchContent(query: string): Promise<ContentMatch[]>
  readFile(path: string, workspace?: string): Promise<DocumentSnapshot>
  writeFile(path: string, content: string, expectedRevision: string, workspace?: string): Promise<DocumentSnapshot>
  createFile(path: string, content?: string, workspace?: string): Promise<void>
  createDirectory(path: string, workspace?: string): Promise<void>
  renameFile(path: string, destination: string, workspace?: string): Promise<void>
  moveEntry?(path: string, workspace: string, destination: string, destinationWorkspace: string): Promise<void>
  deleteFile(path: string, workspace?: string): Promise<void>
  watchChanges(callback: (workspace?: string) => void): Promise<() => void>
  readAsset(path: string, workspace?: string): Promise<string>
  openExternal(url: string): Promise<void>
  openAttachment(path: string, workspace?: string): Promise<void>
}
export const isMarkdown = (path: string) => /\.md$/i.test(path)
export function resolveRelative(document: string, target: string): string | null {
  if (/^[a-z][a-z\d+.-]*:|^[/\\]/i.test(target)) return null
  const parts = document.split('/').slice(0, -1)
  let decoded: string
  try { decoded = decodeURIComponent(target.split(/[?#]/)[0]) } catch { return null }
  for (const part of decoded.replaceAll('\\', '/').split('/')) {
    if (part === '..') { if (!parts.length) return null; parts.pop() }
    else if (part && part !== '.') parts.push(part)
  }
  return parts.join('/') || null
}
