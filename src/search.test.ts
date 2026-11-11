import { describe, expect, it } from 'vitest'
import { rankFiles } from './search'
import type { FileEntry } from './storage/types'

const file = (path: string): FileEntry => ({ path, name: path.split('/').pop()!, directory: false, children: [] })
const names = (entries: FileEntry[], query: string) => rankFiles(entries, query).map(entry => entry.name)

describe('document search', () => {
  it('ignores accents on either side of the query', () => {
    expect(names([file('Relatório.md'), file('outro.md')], 'relatorio')).toEqual(['Relatório.md'])
    expect(names([file('relatorio.md')], 'relató')).toEqual(['relatorio.md'])
    expect(names([file('Ação.md')], 'ACAO')).toEqual(['Ação.md'])
  })

  it('keeps an empty query in tree order', () => {
    expect(names([file('b.md'), file('a.md')], '   ')).toEqual(['b.md', 'a.md'])
  })

  it('orders exact, prefix, word prefix, substring and path matches', () => {
    const entries = [file('estudos/cafe/indice.md'), file('meu-cafe.md'), file('cafe-com-leite.md'), file('cafe.md')]
    expect(names(entries, 'cafe')).toEqual(['cafe.md', 'cafe-com-leite.md', 'meu-cafe.md', 'indice.md'])
  })

  it('prefers earlier and shorter matches inside the same tier', () => {
    expect(names([file('nota-final.md'), file('nota.md'), file('minha-nota.md')], 'nota'))
      .toEqual(['nota.md', 'nota-final.md', 'minha-nota.md'])
  })

  it('drops entries with no match in name or path', () => {
    expect(names([file('Kubernetes.md'), file('pasta/kubernetes-basico.md')], 'zzz')).toEqual([])
  })
})
