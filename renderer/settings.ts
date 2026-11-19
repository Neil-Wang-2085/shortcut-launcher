import type { Entry } from '../src/shared/types.ts'

declare global {
  interface Window {
    api: {
      getEntries: () => Promise<Entry[]>
      saveEntry: (entry: any) => Promise<{ ok: boolean; entry?: Entry; error?: string }>
      deleteEntry: (id: string) => Promise<{ ok: boolean }>
      importText: (text: string, format: 'json' | 'csv') => Promise<{ ok: boolean; count?: number; error?: string }>
      importFile: () => Promise<{ ok: boolean; count?: number; file?: string; canceled?: boolean; error?: string }>
      exportFile: () => Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }>
      parseUrl: (url: string) => Promise<{ ok: boolean; entries?: any[]; count?: number; error?: string }>
      getConfig: () => Promise<{ hotkey: string; autostart: boolean; popupMs: number }>
      saveConfig: (patch: any) => Promise<{ ok: boolean; hotkey: string; config: any }>
    }
  }
}

const el = (id: string) => document.getElementById(id) as any

const hotkeyEl = el('hotkey') as HTMLInputElement
const autostartEl = el('autostart') as HTMLInputElement
const popupSecEl = el('popupSec') as HTMLInputElement
const savePrefsEl = el('savePrefs') as HTMLButtonElement
const prefStatusEl = el('prefStatus') as HTMLElement

const urlInputEl = el('urlInput') as HTMLInputElement
const urlStatusEl = el('urlStatus') as HTMLElement
const urlPreviewEl = el('urlPreview') as HTMLElement
const urlActionsEl = el('urlActions') as HTMLElement

let entries: Entry[] = []
let selectedId: string | null = null

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

function status(msg: string, isError = false): void {
  const s = el('status')
  s.textContent = msg
  s.className = 'status' + (isError ? ' err' : ' ok')
  setTimeout(() => {
    s.textContent = ''
    s.className = 'status'
  }, 4000)
}

function renderList(): void {
  const list = el('list')
  list.innerHTML = ''
  el('count').textContent = entries.length ? `(${entries.length})` : ''
  if (!entries.length) {
    const d = document.createElement('div')
    d.className = 'muted pad'
    d.textContent = 'No custom entries yet.'
    list.appendChild(d)
    return
  }
  for (const e of entries) {
    const row = document.createElement('div')
    row.className = 'entry-row' + (e.id === selectedId ? ' sel' : '')
    row.innerHTML =
      `<span class="badge">${escapeHtml(e.app)}</span>` +
      `<span class="entry-title">${escapeHtml(e.title)}</span>` +
      `<span class="entry-type">${e.type}</span>`
    row.addEventListener('click', () => select(e))
    list.appendChild(row)
  }
}

function toggleRows(): void {
  const isShortcut = el('type').value === 'shortcut'
  el('keysRow').style.display = isShortcut ? '' : 'none'
  el('cmdRow').style.display = isShortcut ? 'none' : ''
}

function clearForm(): void {
  el('app').value = 'custom'
  el('type').value = 'command'
  el('title').value = ''
  el('keys').value = ''
  el('command').value = ''
  el('description').value = ''
  el('tags').value = ''
  toggleRows()
}

function select(e: Entry): void {
  selectedId = e.id
  el('app').value = e.app
  el('type').value = e.type
  el('title').value = e.title
  el('description').value = e.description ?? ''
  el('tags').value = (e.tags ?? []).join('; ')
  if (e.type === 'shortcut') {
    el('keys').value = e.keys.win ?? ''
    el('command').value = ''
  } else {
    el('command').value = e.command
    el('keys').value = ''
  }
  toggleRows()
  renderList()
}

function newEntry(): void {
  selectedId = null
  clearForm()
  renderList()
  el('title').focus()
}

async function reload(): Promise<void> {
  const all = await window.api.getEntries()
  entries = all.filter((e) => !e.builtin)
  renderList()
}

async function save(): Promise<void> {
  const type = el('type').value as 'shortcut' | 'command'
  const raw: any = {
    id: selectedId ?? undefined,
    app: el('app').value,
    type,
    title: el('title').value.trim(),
    description: el('description').value.trim(),
    tags: el('tags').value,
    platform: 'win',
  }
  if (type === 'shortcut') raw.keys = { win: el('keys').value.trim() }
  else raw.command = el('command').value.trim()

  const res = await window.api.saveEntry(raw)
  if (res.ok && res.entry) {
    selectedId = res.entry.id
    status(`Saved: ${res.entry.title}`)
    await reload()
  } else {
    status(res.error ?? 'Save failed', true)
  }
}

async function del(): Promise<void> {
  if (!selectedId) {
    status('Select an entry first', true)
    return
  }
  await window.api.deleteEntry(selectedId)
  selectedId = null
  clearForm()
  status('Deleted')
  await reload()
}

async function importFile(): Promise<void> {
  const res = await window.api.importFile()
  if (res.canceled) return
  if (res.ok) {
    status(`Imported ${res.count} entries`)
    await reload()
  } else {
    status(res.error ?? 'Import failed', true)
  }
}

async function exportFile(): Promise<void> {
  const res = await window.api.exportFile()
  if (res.canceled) return
  if (res.ok) status(`Exported to ${res.path}`)
  else status(res.error ?? 'Export failed', true)
}

async function importText(format: 'json' | 'csv'): Promise<void> {
  const text = el('bulk').value
  if (!text.trim()) {
    status('Paste JSON or CSV first', true)
    return
  }
  const res = await window.api.importText(text, format)
  if (res.ok) {
    status(`Imported ${res.count} entries`)
    el('bulk').value = ''
    await reload()
  } else {
    status(res.error ?? 'Import failed', true)
  }
}

// ---------- 偏好设置（热键 / 开机自启 / 浮层时长） ----------
function prefStatus(msg: string, isError = false): void {
  prefStatusEl.textContent = msg
  prefStatusEl.className = 'status' + (isError ? ' err' : ' ok')
  setTimeout(() => {
    prefStatusEl.textContent = ''
    prefStatusEl.className = 'status'
  }, 4000)
}

/** 把 KeyboardEvent.key 转成 Electron accelerator 名称 */
function keyName(ev: KeyboardEvent): string {
  const k = ev.key
  if (k === ' ' || k === 'Spacebar') return 'Space'
  if (k === 'Control' || k === 'Alt' || k === 'Shift' || k === 'Meta') return ''
  if (k.length === 1) return k.toUpperCase()
  const map: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Escape: 'Escape',
    Enter: 'Enter',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Insert: 'Insert',
  }
  return map[k] ?? (/^F\d{1,2}$/.test(k) ? k : '')
}

async function loadConfig(): Promise<void> {
  const cfg = await window.api.getConfig()
  hotkeyEl.value = cfg.hotkey
  autostartEl.checked = !!cfg.autostart
  popupSecEl.value = String(Math.max(1, Math.round(cfg.popupMs / 1000)))
}

// ---------- 从网址导入 ----------
let parsed: any[] = []

function urlStatus(msg: string, isError = false): void {
  urlStatusEl.textContent = msg
  urlStatusEl.className = 'status' + (isError ? ' err' : ' ok')
}

function renderUrlPreview(): void {
  urlPreviewEl.innerHTML = ''
  urlActionsEl.style.display = parsed.length ? 'flex' : 'none'
  parsed.forEach((e, i) => {
    const label = document.createElement('label')
    label.className = 'url-item'
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = true
    cb.dataset.i = String(i)
    const key = document.createElement('span')
    key.className = 'url-key'
    key.textContent = e.type === 'shortcut' ? (e.keys?.win ?? '') : e.command
    const desc = document.createElement('span')
    desc.className = 'url-desc'
    desc.textContent = e.title
    label.append(cb, key, desc)
    urlPreviewEl.appendChild(label)
  })
}

async function parseUrlFromInput(): Promise<void> {
  const url = urlInputEl.value.trim()
  if (!url) {
    urlStatus('请输入网址', true)
    return
  }
  urlStatus('解析中…')
  const res = await window.api.parseUrl(url)
  if (!res.ok) {
    parsed = []
    renderUrlPreview()
    urlStatus(res.error ?? '解析失败', true)
    return
  }
  parsed = res.entries ?? []
  renderUrlPreview()
  urlStatus(`解析到 ${parsed.length} 条候选，请勾选后导入`)
}

async function importUrlSelected(): Promise<void> {
  const selected = parsed.filter((_, i) => {
    const cb = urlPreviewEl.querySelector(`input[data-i="${i}"]`) as HTMLInputElement | null
    return !!cb?.checked
  })
  if (selected.length === 0) {
    urlStatus('没有选中条目', true)
    return
  }
  const res = await window.api.importText(JSON.stringify(selected), 'json')
  if (res.ok) {
    urlStatus(`已导入 ${res.count} 条`)
    parsed = []
    renderUrlPreview()
    await reload()
  } else {
    urlStatus(res.error ?? '导入失败', true)
  }
}

function setAllUrlChecks(checked: boolean): void {
  urlPreviewEl.querySelectorAll('input[type="checkbox"]').forEach((el) => {
    ;(el as HTMLInputElement).checked = checked
  })
}

// 点击热键框后直接按组合键即可录制
hotkeyEl.addEventListener('keydown', (ev) => {
  ev.preventDefault()
  const parts: string[] = []
  if (ev.ctrlKey) parts.push('Control')
  if (ev.altKey) parts.push('Alt')
  if (ev.shiftKey) parts.push('Shift')
  if (ev.metaKey) parts.push('Super')
  const k = keyName(ev)
  if (!k) {
    hotkeyEl.value = parts.join('+')
    return
  }
  if (!parts.length) return
  parts.push(k)
  hotkeyEl.value = parts.join('+')
})

savePrefsEl.addEventListener('click', async () => {
  const sec = Math.max(1, Math.min(10, Number(popupSecEl.value) || 3))
  const res = await window.api.saveConfig({
    hotkey: hotkeyEl.value,
    autostart: autostartEl.checked,
    popupMs: sec * 1000,
  })
  if (res.ok) prefStatus(`Saved. Active hotkey: ${res.hotkey}`)
  else prefStatus(`Hotkey unavailable; using fallback: ${res.hotkey}`, true)
})

el('type').addEventListener('change', toggleRows)
el('new').addEventListener('click', newEntry)
el('save').addEventListener('click', save)
el('delete').addEventListener('click', del)
el('importFile').addEventListener('click', importFile)
el('exportFile').addEventListener('click', exportFile)
el('importJson').addEventListener('click', () => importText('json'))
el('importCsv').addEventListener('click', () => importText('csv'))

el('parseUrl').addEventListener('click', parseUrlFromInput)
el('urlSelectAll').addEventListener('click', () => setAllUrlChecks(true))
el('urlSelectNone').addEventListener('click', () => setAllUrlChecks(false))
el('urlImport').addEventListener('click', importUrlSelected)
urlInputEl.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    ev.preventDefault()
    void parseUrlFromInput()
  }
})

toggleRows()
reload()
loadConfig()
