export interface FileEntry { path: string; name: string; directory: boolean; children: FileEntry[] }
export interface Workspace { name: string; path: string }
export interface DocumentSnapshot { content: string; revision: string }
export interface ContentMatch { path: string; name: string; line: number; text: string }
export interface StorageProvider {
  openWorkspace(): Promise<Workspace | null>
  restoreWorkspace(): Promise<Workspace | null>
  listFiles(): Promise<FileEntry[]>
  searchContent(query: string): Promise<ContentMatch[]>
  readFile(path: string): Promise<DocumentSnapshot>
  writeFile(path: string, content: string, expectedRevision: string): Promise<DocumentSnapshot>
  createFile(path: string, content?: string): Promise<void>
  createDirectory(path: string): Promise<void>
  renameFile(path: string, destination: string): Promise<void>
  deleteFile(path: string): Promise<void>
  watchChanges(callback: () => void): Promise<() => void>
  readAsset(path: string): Promise<string>
  openExternal(url: string): Promise<void>
  openAttachment(path: string): Promise<void>
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
