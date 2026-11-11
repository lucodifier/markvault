// Drafts are a crash-recovery cache; Markdown files remain the source of truth.
export interface Draft { content: string; revision: string }
export const draftKey = (root: string, path: string) => `markvault:draft:${JSON.stringify([root, path])}`
export const recovery = {
  read(root: string, path: string): Draft | null {
    const raw = localStorage.getItem(draftKey(root, path))
    if (!raw) return null
    try { const d = JSON.parse(raw); return typeof d.content === 'string' && typeof d.revision === 'string' ? d : null } catch { return null }
  },
  write(root: string, path: string, draft: Draft) { localStorage.setItem(draftKey(root, path), JSON.stringify(draft)) },
  remove(root: string, path: string) { localStorage.removeItem(draftKey(root, path)) },
}
