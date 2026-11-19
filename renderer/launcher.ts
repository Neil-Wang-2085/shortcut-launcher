import { Searcher } from '../src/shared/search.ts'
import type { Entry } from '../src/shared/types.ts'
import type { UsageMap } from '../src/shared/search.ts'

declare global {
  interface Window {
    api: {
      copy: (text: string) => void
      hideLauncher: () => void
      showShortcut: (entry: Entry) => void
      getEntries: () => Promise<Entry[]>
      getUsage: () => Promise<UsageMap>
      recordUsage: (id: string) => Promise<unknown>
      onFocusInput: (cb: () => void) => void
      onEntriesChanged: (cb: () => void) => void
      openSettings: () => void
    }
  }
}

const qEl = document.getElementById('q') as HTMLInputElement
const listEl = document.getElementById('results') as HTMLElement
const chipsEl = document.getElementById('chips') as HTMLElement
const toastEl = document.getElementById('toast') as HTMLElement
const countEl = document.getElementById('count') as HTMLElement
const settingsEl = document.getElementById('settings') as HTMLElement
const editorEl = document.getElementById('editor') as HTMLElement
const cmdInputEl = document.getElementById('cmdInput') as HTMLInputElement

let searcher: Searcher | null = null
let usage: UsageMap = {}
let filter = 'all'
let results: Entry[] = []
let sel = 0
let editing: Entry | null = null
let debounce: ReturnType<typeof setTimeout> | undefined

const APPS: Array<[string, string]> = [
  ['all', 'All'],
  ['word', 'Word'],
  ['excel', 'Excel'],
  ['powerpoint', 'PPT'],
  ['photoshop', 'PS'],
  ['git', 'Git'],
  ['gdb', 'GDB'],
  ['windows', 'Win'],
  ['vscode', 'VS Code'],
  ['chrome', 'Web'],
  ['terminal', 'Term'],
  ['build', 'Build'],
  ['outlook', 'Mail'],
]

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

function detailOf(e: Entry): string {
  return e.type === 'shortcut' ? (e.keys.win ?? '') : e.command
}

/** 命令中是否含待填参数（<...> 或 HEAD~N） */
function hasPlaceholder(cmd: string): boolean {
  return /<[^<>]+>/.test(cmd) || /HEAD~N\b/.test(cmd)
}

function renderChips(): void {
  chipsEl.innerHTML = ''
  for (const [id, label] of APPS) {
    const b = document.createElement('button')
    b.className = 'chip' + (filter === id ? ' active' : '')
    b.textContent = label
    b.addEventListener('click', () => {
      closeEditor()
      filter = id
      renderChips()
      run()
    })
    chipsEl.appendChild(b)
  }
}

function run(): void {
  if (!searcher) return
  const q = qEl.value.trim()
  const prefix = filter === 'all' ? '' : `app:${filter} `
  results = searcher.search(prefix + q, 12).map((x) => x.entry)
  sel = 0
  renderList()
}

function renderList(): void {
  listEl.innerHTML = ''
  countEl.textContent = results.length ? `${results.length} results` : ''
  if (!results.length) {
    const d = document.createElement('div')
    d.className = 'empty'
    d.textContent = 'No results'
    listEl.appendChild(d)
    return
  }
  results.forEach((e, i) => {
    const row = document.createElement('div')
    row.className = 'row' + (i === sel ? ' sel' : '')
    const zh = e.zh ?? e.description ?? ''
    row.innerHTML =
      `<span class="badge">${escapeHtml(e.app)}</span>` +
      `<span class="type">${e.type === 'shortcut' ? '⌨' : '>_'}</span>` +
      `<span class="main"><span class="t">${escapeHtml(e.title)}</span>` +
      (zh ? `<span class="z">${escapeHtml(zh)}</span>` : '') +
      `<span class="d">${escapeHtml(detailOf(e))}</span></span>`
    row.addEventListener('mouseenter', () => {
      sel = i
      renderList()
    })
    row.addEventListener('click', () => activate(i))
    listEl.appendChild(row)
  })
}

function toast(msg: string): void {
  toastEl.textContent = msg
  toastEl.classList.add('show')
  setTimeout(() => toastEl.classList.remove('show'), 1500)
}

/** 记录一次使用（用于 frecency 排序），并同步本地内存 */
function recordUsage(id: string): void {
  window.api.recordUsage(id)
  const cur = usage[id] || { count: 0, last: 0 }
  usage[id] = { count: cur.count + 1, last: Date.now() }
}

/** 复制命令并关闭 launcher */
function copyCommand(e: Entry, text: string): void {
  window.api.copy(text)
  recordUsage(e.id)
  toast(`Copied: ${text}`)
  setTimeout(() => window.api.hideLauncher(), 350)
}

/** 打开命令编辑条，并选中第一个占位符 */
function openEditor(e: Entry): void {
  editing = e
  editorEl.classList.add('show')
  cmdInputEl.value = e.command
  cmdInputEl.focus()
  const m = cmdInputEl.value.match(/<[^<>]+>/)
  if (m && m.index != null) {
    cmdInputEl.setSelectionRange(m.index, m.index + m[0].length)
  } else {
    const i = cmdInputEl.value.indexOf('HEAD~N')
    if (i >= 0) cmdInputEl.setSelectionRange(i, i + 6)
    else cmdInputEl.select()
  }
}

function closeEditor(): void {
  editing = null
  editorEl.classList.remove('show')
  cmdInputEl.value = ''
}

function activate(i: number): void {
  const e = results[i]
  if (!e) return
  if (e.type === 'command') {
    // 含占位符的命令：先进入编辑态补参数
    if (hasPlaceholder(e.command)) {
      openEditor(e)
      return
    }
    copyCommand(e, e.command)
  } else {
    recordUsage(e.id)
    window.api.showShortcut(e)
    window.api.hideLauncher()
  }
}

function scrollSel(): void {
  const el = listEl.children[sel] as HTMLElement | undefined
  el?.scrollIntoView({ block: 'nearest' })
}

async function reload(): Promise<void> {
  const [entries, u] = await Promise.all([window.api.getEntries(), window.api.getUsage()])
  usage = u || {}
  searcher = new Searcher(entries, usage)
  run()
}

qEl.addEventListener('input', () => {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(run, 50)
})

cmdInputEl.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    ev.preventDefault()
    if (!editing) return
    const text = cmdInputEl.value.trim()
    if (text) copyCommand(editing, text)
    closeEditor()
  } else if (ev.key === 'Escape') {
    ev.preventDefault()
    closeEditor()
  }
})

window.addEventListener('keydown', (e) => {
  if (editing) return // 编辑态下交给输入框处理
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    sel = Math.min(sel + 1, results.length - 1)
    renderList()
    scrollSel()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    sel = Math.max(sel - 1, 0)
    renderList()
    scrollSel()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    activate(sel)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    window.api.hideLauncher()
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
    const cur = results[sel]
    if (cur && cur.type === 'command') {
      e.preventDefault()
      openEditor(cur)
    }
  }
})

window.api.onFocusInput(() => {
  closeEditor()
  reload()
  qEl.focus()
  qEl.select()
})

window.api.onEntriesChanged(() => reload())

settingsEl.addEventListener('click', () => window.api.openSettings())

renderChips()
reload()
qEl.focus()
