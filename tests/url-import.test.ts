import test from 'node:test'
import assert from 'node:assert/strict'
import { parseHtml } from '../src/shared/url-import.ts'

test('table -> shortcut', () => {
  const html = '<table><tr><td>Ctrl + B</td><td>Bold</td></tr><tr><td>Ctrl+I</td><td>Italic</td></tr></table>'
  const out = parseHtml(html, 'https://example.com')
  assert.equal(out.length, 2)
  assert.equal(out[0].type, 'shortcut')
  assert.equal(out[0].keys?.win, 'Ctrl+B')
})

test('code block -> command', () => {
  const html = '<pre><code>git status\ngit commit -m "x"</code></pre>'
  const out = parseHtml(html, 'https://example.com')
  assert.ok(out.some((e) => e.type === 'command' && e.command === 'git status'))
})

test('text line -> shortcut', () => {
  const html = '<p>Ctrl+Shift+P — Command Palette</p>'
  const out = parseHtml(html, 'https://example.com')
  assert.ok(out.some((e) => e.type === 'shortcut' && e.keys?.win === 'Ctrl+Shift+P'))
})

test('dedup', () => {
  const html = '<table><tr><td>Ctrl+B</td><td>Bold</td></tr></table><p>Ctrl+B — Bold</p>'
  const out = parseHtml(html, 'https://example.com')
  assert.equal(out.filter((e) => e.keys?.win === 'Ctrl+B').length, 1)
})
