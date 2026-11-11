// Runs the pure path and recovery invariants without third-party dependencies.
// Full application tests live beside the Zustand store and run with Vitest.
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import assert from 'node:assert/strict'
const load = async relative => {
  const source = stripTypeScriptTypes(await readFile(new URL(relative, import.meta.url), 'utf8'))
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}
const { resolveRelative, isMarkdown } = await load('../src/storage/types.ts')
for (const target of ['../../fora.md', '/etc/passwd', 'C:/fora.md', 'file:///x', 'javascript:alert(1)', '//host/x', '\\host\\x', '%E0%A4%A']) assert.equal(resolveRelative('pasta/nota.md', target), null, target)
assert.equal(resolveRelative('Estudos/nota.md', '../imagens/ação%20nova.png'), 'imagens/ação nova.png')
assert.equal(resolveRelative('Estudos/nota.md', './outra.md#titulo'), 'Estudos/outra.md')
assert.equal(isMarkdown('ação.MD'), true)
assert.equal(isMarkdown('ação.md.exe'), false)
const memory = new Map()
globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) }
const { recovery, draftKey } = await load('../src/stores/recovery.ts')
recovery.write('/vault', 'nota.md', { content: 'Olá 🌱', revision: 'base' })
assert.deepEqual(recovery.read('/vault', 'nota.md'), { content: 'Olá 🌱', revision: 'base' })
assert.equal(recovery.read('/other', 'nota.md'), null)
recovery.remove('/vault', 'nota.md'); assert.equal(recovery.read('/vault', 'nota.md'), null)
globalThis.localStorage.setItem(draftKey('/vault', 'nota.md'), '{broken'); assert.equal(recovery.read('/vault', 'nota.md'), null)
console.log('PASS: relative path confinement, UTF-8 links, Markdown detection, draft persistence, workspace isolation, corrupt draft handling.')
