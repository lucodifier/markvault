import { describe, expect, it } from 'vitest'
import { isMarkdown, resolveRelative } from './types'
describe('workspace-relative links', () => {
  it('resolves nested paths, UTF-8 and spaces', () => {
    expect(resolveRelative('Estudos/nota.md', '../imagens/ação%20nova.png')).toBe('imagens/ação nova.png')
    expect(resolveRelative('Estudos/nota.md', './outra.md#titulo')).toBe('Estudos/outra.md')
    expect(isMarkdown('ação.MD')).toBe(true)
    expect(isMarkdown('nota.md.exe')).toBe(false)
  })
  it('rejects absolute paths, malformed URLs and workspace traversal', () => {
    for (const target of ['../../fora.md', '/etc/passwd', 'C:/fora.md', 'file:///x', 'javascript:alert(1)', '//host/x', '\\host\\x', '%E0%A4%A']) {
      expect(resolveRelative('pasta/nota.md', target), target).toBeNull()
    }
  })
})
