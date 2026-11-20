import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeEntries, normalizeEntry, parseJsonImport, parseCsvImport, toCsv, collectExpressionCommands } from '../src/shared/store.ts'

const seed = [{ id: 'word.bold', app: 'word', type: 'shortcut', title: 'Bold', keys: { win: 'Ctrl+B' }, builtin: true }] as any[]
const user = [{ id: 'custom.x', app: 'custom', type: 'command', title: 'X', command: 'x' }] as any[]

test('merge: user overrides seed by id', () => {
  const m = mergeEntries(seed, [{ ...seed[0], title: 'Bold2' }])
  assert.equal(m.length, 1)
  assert.equal(m[0].title, 'Bold2')
  assert.equal(m[0].builtin, false)
})

test('merge: user adds new entry', () => {
  const m = mergeEntries(seed, user)
  assert.equal(m.length, 2)
})

test('normalize: shortcut requires keys', () => {
  assert.equal(normalizeEntry({ type: 'shortcut', title: 'T' }), null)
  const e = normalizeEntry({ type: 'shortcut', title: 'T', keys: { win: 'Ctrl+B' } })
  assert.ok(e && e.type === 'shortcut')
})

test('normalize: command requires command', () => {
  assert.equal(normalizeEntry({ type: 'command', title: 'C' }), null)
  const e = normalizeEntry({ type: 'command', title: 'C', command: 'ls' })
  assert.ok(e && e.type === 'command')
})

test('json import: array and wrapped object', () => {
  const arr = parseJsonImport(JSON.stringify([{ type: 'command', title: 'C', command: 'ls' }]))
  assert.equal(arr.length, 1)
  const wrapped = parseJsonImport(JSON.stringify({ version: 1, entries: [{ type: 'command', title: 'D', command: 'pwd' }] }))
  assert.equal(wrapped.length, 1)
})

test('csv import: header-based', () => {
  const csv =
    'id,app,type,title,command,keys,description,tags,platform\ncustom.a,custom,command,List,ls,,list files,fs,win'
  const arr = parseCsvImport(csv)
  assert.equal(arr.length, 1)
  assert.equal(arr[0].title, 'List')
  assert.equal(arr[0].type, 'command')
})

test('csv roundtrip for shortcut', () => {
  const e = normalizeEntry({ type: 'shortcut', title: 'Bold', keys: { win: 'Ctrl+B' }, app: 'word' }) as any
  const back = parseCsvImport(toCsv([e]))
  assert.equal(back.length, 1)
  assert.equal(back[0].title, 'Bold')
  assert.equal(back[0].type, 'shortcut')
})

test('expression -> gdb command', () => {
  const e = normalizeEntry({ name: 'regs', expression: 'info registers' })
  assert.ok(e && e.type === 'command')
  assert.equal(e.command, 'info registers')
  assert.equal(e.app, 'gdb')
  assert.equal(e.title, 'regs')
})

test('collect nested expressions', () => {
  const data = {
    commands: [
      { name: 'regs', expression: 'info registers' },
      { name: 'bt', expression: 'bt' },
    ],
  }
  const out = collectExpressionCommands(data, 'gdb.json')
  assert.equal(out.length, 2)
  assert.equal(out[0].command, 'info registers')
  assert.equal(out[0].id, 'custom.gdb-json.expr.0')
})

test('json import includes nested expressions', () => {
  const text = JSON.stringify({ commands: [{ name: 'regs', expression: 'info registers' }] })
  const out = parseJsonImport(text)
  assert.ok(out.some((e) => e.type === 'command' && e.command === 'info registers'))
})
