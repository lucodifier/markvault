import type { FileEntry } from './storage/types'

const COMBINING_MARKS = /[\u0300-\u036f]/g
const SEPARATORS = /[^\p{L}\p{N}]+/u

export const normalize = (value: string) => value.toLocaleLowerCase().normalize('NFD').replace(COMBINING_MARKS, '')

export const flattenFiles = (entries: FileEntry[]): FileEntry[] => entries.flatMap(entry => entry.directory ? flattenFiles(entry.children) : [entry])

const position = (name: string, query: string) => {
  const index = name.indexOf(query)
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

function relevance(name: string, path: string, query: string) {
  if (name === query) return 0
  if (name.startsWith(query)) return 1
  if (name.split(SEPARATORS).some(word => word.startsWith(query))) return 2
  if (name.includes(query)) return 3
  if (path.includes(query)) return 4
  return -1
}

// Name matches rank above path-only matches; within a tier, earlier and shorter names win.
export function rankFiles(entries: FileEntry[], rawQuery: string): FileEntry[] {
  const files = flattenFiles(entries)
  const query = normalize(rawQuery.trim())
  if (!query) return files
  return files
    .map(entry => ({ entry, name: normalize(entry.name), path: normalize(entry.path) }))
    .filter(item => item.name.includes(query) || item.path.includes(query))
    .map(item => ({ ...item, score: relevance(item.name, item.path, query) }))
    .sort((a, b) => a.score - b.score
      || position(a.name, query) - position(b.name, query)
      || a.entry.name.length - b.entry.name.length
      || a.entry.name.localeCompare(b.entry.name, 'pt-BR'))
    .map(item => item.entry)
}
