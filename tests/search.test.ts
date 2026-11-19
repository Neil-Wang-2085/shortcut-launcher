import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Searcher } from '../src/shared/search.ts'
import type { Entry } from '../src/shared/types.ts'

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = join(here, '..', 'src', 'shared', 'data')
const entries: Entry[] = []
for (const f of readdirSync(dataDir).filter((x) => x.endsWith('.json'))) {
  entries.push(...(JSON.parse(readFileSync(join(dataDir, f), 'utf8')) as Entry[]))
}
const s = new Searcher(entries)
const top = (q: string) => s.search(q, 5)[0]?.entry
const ids = (q: string, n = 5) => s.search(q, n).map((x) => x.entry.id)

test('word bold -> word.bold', () => {
  assert.equal(top('word bold')?.id, 'word.bold')
})

test('word ctrl b -> word.bold', () => {
  assert.equal(top('word ctrl b')?.id, 'word.bold')
})

test('excel date -> excel.insert-date', () => {
  assert.equal(top('excel date')?.id, 'excel.insert-date')
})

test('excel freeze -> excel.freeze-panes', () => {
  assert.equal(top('excel freeze')?.id, 'excel.freeze-panes')
})

test('git rebase -i -> git.rebase-interactive', () => {
  assert.equal(top('git rebase -i')?.id, 'git.rebase-interactive')
})

test('gdb bt -> gdb.backtrace', () => {
  assert.equal(top('gdb bt')?.id, 'gdb.backtrace')
})

test('photoshop liquify -> ps.liquify', () => {
  assert.equal(top('photoshop liquify')?.id, 'ps.liquify')
})

test('filter app:git status', () => {
  assert.equal(top('app:git status')?.id, 'git.status')
})

test('filter type:shortcut only returns shortcuts', () => {
  const r = s.search('type:shortcut ctrl b', 10)
  assert.ok(r.length > 0)
  assert.ok(r.every((x) => x.entry.type === 'shortcut'))
})

test('typo tolerance: git rebse -> includes git.rebase', () => {
  assert.ok(ids('git rebse', 8).includes('git.rebase'))
})

test('all entries loaded', () => {
  assert.ok(entries.length >= 100)
})

test('中文: git 改作者名字', () => {
  const id = top('git 改作者名字')?.id
  assert.ok(
    ['git.amend-author', 'git.config-user-name', 'git.filter-repo-mailmap'].includes(id as string),
    `unexpected top id: ${id}`,
  )
})

test('中文: 冻结窗格 -> excel.freeze-panes', () => {
  assert.equal(top('冻结窗格')?.id, 'excel.freeze-panes')
})

test('中文: 加粗 -> word/excel/ppt bold', () => {
  const id = top('加粗')?.id
  assert.ok(['word.bold', 'excel.bold', 'ppt.bold'].includes(id as string), `unexpected: ${id}`)
})

test('中文: 撤销 -> undo / revert', () => {
  const id = top('撤销')?.id
  assert.ok(
    ['word.undo', 'excel.undo', 'ps.undo', 'git.revert'].includes(id as string),
    `unexpected: ${id}`,
  )
})

test('中文: 重写历史 -> filter-repo', () => {
  assert.ok(ids('重写历史', 8).includes('git.filter-repo-mailmap'))
})

test('中文说明已注入到搜索结果', () => {
  const e = top('加粗')
  assert.ok(e && typeof e.zh === 'string' && e.zh.length > 0, `missing zh: ${JSON.stringify(e)}`)
})

test('常用条目（frecency）会排到前面', () => {
  const plain = new Searcher(entries).search('rebase', 1)[0]?.entry.id
  const boosted = new Searcher(entries, {
    'git.pull-rebase': { count: 200, last: Date.now() },
  }).search('rebase', 1)[0]?.entry.id
  assert.notEqual(plain, 'git.pull-rebase')
  assert.equal(boosted, 'git.pull-rebase')
})

test('新增: win+d -> 显示桌面', () => {
  assert.equal(top('win+d')?.id, 'win.show-desktop')
})

test('新增: 截图 -> win.snip', () => {
  assert.equal(top('截图')?.id, 'win.snip')
})

test('新增: vscode 命令面板', () => {
  assert.equal(top('vscode 命令面板')?.id, 'vscode.command-palette')
})

test('新增: 恢复标签 -> chrome.reopen-tab', () => {
  assert.equal(top('恢复标签')?.id, 'chrome.reopen-tab')
})

test('新增: outlook 回复', () => {
  const id = top('outlook 回复')?.id
  assert.ok(['outlook.reply', 'outlook.reply-all'].includes(id as string), `unexpected: ${id}`)
})

test('新增: cmake 构建', () => {
  assert.ok(ids('cmake 构建', 6).includes('build.cmake-build'))
})

