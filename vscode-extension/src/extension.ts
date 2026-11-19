import * as vscode from 'vscode'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Searcher } from '../../src/shared/search'
import { ENTRIES } from '../../src/shared/data'
import { normalizeEntry } from '../../src/shared/store'
import type { Entry, ShortcutEntry } from '../../src/shared/types'

interface EntryItem extends vscode.QuickPickItem {
  entry?: Entry
  isAdd?: boolean
  isManage?: boolean
}

const EDIT_BUTTON: vscode.QuickInputButton = {
  iconPath: new vscode.ThemeIcon('edit'),
  tooltip: 'Edit',
}
const DELETE_BUTTON: vscode.QuickInputButton = {
  iconPath: new vscode.ThemeIcon('trash'),
  tooltip: 'Delete',
}

let extContext: vscode.ExtensionContext
let searcher: Searcher
let customEntries: Entry[] = []

const ADD_ITEM: EntryItem = {
  label: '$(add) 新增自定义命令…',
  description: 'Command / Shortcut',
  alwaysShow: true,
  isAdd: true,
}

const MANAGE_ITEM: EntryItem = {
  label: '$(gear) 管理自定义条目…',
  description: '编辑 / 删除',
  alwaysShow: true,
  isManage: true,
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  extContext = context
  customEntries = await loadCustom()
  rebuild()

  context.subscriptions.push(
    vscode.commands.registerCommand('shortcutLauncher.search', () => search()),
    vscode.commands.registerCommand('shortcutLauncher.addEntry', () => addEntry()),
    vscode.commands.registerCommand('shortcutLauncher.editEntry', () => editEntry()),
    vscode.commands.registerCommand('shortcutLauncher.manageEntries', () => manageEntries()),
    vscode.commands.registerCommand('shortcutLauncher.importEntries', () => importEntries()),
    vscode.commands.registerCommand('shortcutLauncher.importFolder', () => openImportPanel()),
    vscode.commands.registerCommand('shortcutLauncher.openEntriesFile', () => openEntriesFile()),
    vscode.commands.registerCommand('shortcutLauncher.deleteEntry', () => deleteEntry()),
  )

  // 状态栏入口
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90)
  status.text = '$(keyboard) Shortcuts'
  status.tooltip = 'Shortcut Launcher：搜索快捷键 / 命令（Ctrl+Alt+Shift+K）'
  status.command = 'shortcutLauncher.search'
  status.show()
  context.subscriptions.push(status)
}

export function deactivate(): void {}

function rebuild(): void {
  searcher = new Searcher([...ENTRIES, ...customEntries])
}

// ---------- 自定义条目存储 ----------

async function entriesFile(): Promise<vscode.Uri> {
  const dir = extContext.globalStorageUri
  await vscode.workspace.fs.createDirectory(dir)
  return vscode.Uri.joinPath(dir, 'custom-entries.json')
}

async function loadCustom(): Promise<Entry[]> {
  try {
    const raw = await vscode.workspace.fs.readFile(await entriesFile())
    const data = JSON.parse(Buffer.from(raw).toString('utf8'))
    return normalizeList(data)
  } catch {
    return []
  }
}

/** 把任意 JSON（数组或 { entries: [] }）规范化为条目列表 */
function normalizeList(data: any): Entry[] {
  const arr: any[] = Array.isArray(data) ? data : Array.isArray(data?.entries) ? data.entries : []
  return arr.map((x) => normalizeEntry(x)).filter((e): e is Entry => !!e)
}

async function saveCustom(entries: Entry[]): Promise<void> {
  const text = JSON.stringify(entries, null, 2)
  await vscode.workspace.fs.writeFile(await entriesFile(), Buffer.from(text, 'utf8'))
}

// ---------- 搜索 ----------

async function search(): Promise<void> {
  const qp = vscode.window.createQuickPick<EntryItem>()
  qp.placeholder = '搜索快捷键 / 命令，支持中文，如 "加粗"、"git rebase"'
  qp.title = 'Shortcut Launcher'
  qp.matchOnDescription = false
  qp.matchOnDetail = false

  const render = (query: string): void => {
    const results = searcher.search(query, 40)
    qp.items = [...results.map((r) => toItem(r.entry)), ADD_ITEM, MANAGE_ITEM]
    if (qp.items.length > 0) qp.activeItems = [qp.items[0]]
    qp.title = query
      ? `Shortcut Launcher — ${results.length} 条结果`
      : `Shortcut Launcher — ${ENTRIES.length + customEntries.length} 条（含 ${customEntries.length} 条自定义）`
  }

  render('')
  qp.onDidChangeValue(render)
  qp.onDidAccept(() => {
    const item = qp.selectedItems[0]
    qp.hide()
    if (!item) return
    if (item.isAdd) {
      void addEntry()
      return
    }
    if (item.isManage) {
      void manageEntries()
      return
    }
    if (item.entry) void handleEntry(item.entry)
  })
  qp.onDidTriggerItemButton(async (e) => {
    if (!e.item.entry) return
    qp.hide()
    if (e.button === EDIT_BUTTON) await editEntry(e.item.entry)
    else if (e.button === DELETE_BUTTON) await deleteEntry(e.item.entry)
  })
  qp.onDidHide(() => qp.dispose())
  qp.show()
}

function toItem(e: Entry): EntryItem {
  const detail = e.type === 'shortcut' ? (e.keys.win ?? '') : e.command
  const info = [e.zh, e.usage].filter(Boolean).join(' · ')
  return {
    label: e.title,
    description: detail,
    detail: info || (e.description ?? ''),
    entry: e,
    // 自定义条目提供编辑 / 删除按钮；内置条目只读
    buttons: e.builtin === false ? [EDIT_BUTTON, DELETE_BUTTON] : undefined,
    alwaysShow: true,
  }
}

async function handleEntry(e: Entry): Promise<void> {
  if (e.type === 'command') {
    await vscode.env.clipboard.writeText(e.command)
    const action = await vscode.window.showInformationMessage(`已复制：${e.command}`, '插入终端')
    if (action === '插入终端') {
      const terminal = vscode.window.activeTerminal ?? vscode.window.createTerminal('Shortcut Launcher')
      terminal.show()
      terminal.sendText(e.command)
    }
    return
  }
  showKeycaps(e)
}

// ---------- 自定义命令 ----------

async function addEntry(): Promise<void> {
  const typePick = await vscode.window.showQuickPick(
    [
      { label: 'Command', description: '命令：回车复制到剪贴板' },
      { label: 'Shortcut', description: '快捷键：回车显示键帽' },
    ],
    { placeHolder: '类型' },
  )
  if (!typePick) return

  const title = await vscode.window.showInputBox({
    title: '标题',
    prompt: '例如 Show registers',
    ignoreFocusOut: true,
  })
  if (!title) return

  let command = ''
  let keys = ''
  if (typePick.label === 'Command') {
    command =
      (await vscode.window.showInputBox({
        title: '命令',
        prompt: '例如 info registers',
        ignoreFocusOut: true,
      })) ?? ''
    if (!command) return
  } else {
    keys =
      (await vscode.window.showInputBox({
        title: '按键',
        prompt: '例如 Ctrl+Alt+P',
        ignoreFocusOut: true,
      })) ?? ''
    if (!keys) return
  }

  const description =
    (await vscode.window.showInputBox({
      title: '中文说明（可选）',
      prompt: '例如 查看寄存器',
      ignoreFocusOut: true,
    })) ?? ''
  const tags =
    (await vscode.window.showInputBox({
      title: '标签（可选，逗号分隔）',
      prompt: '例如 debug, register',
      ignoreFocusOut: true,
    })) ?? ''

  const raw: any = {
    app: 'custom',
    type: typePick.label === 'Command' ? 'command' : 'shortcut',
    title,
    description,
    tags,
    platform: 'win',
  }
  if (raw.type === 'command') raw.command = command
  else raw.keys = { win: keys }

  const entry = normalizeEntry(raw)
  if (!entry) {
    void vscode.window.showErrorMessage('条目无效：标题和命令/按键不能为空')
    return
  }

  customEntries.push(entry)
  await saveCustom(customEntries)
  rebuild()

  const action = await vscode.window.showInformationMessage(`已添加：${entry.title}`, '立即搜索')
  if (action === '立即搜索') void search()
}

async function editEntry(target?: Entry): Promise<void> {
  if (!target) {
    if (customEntries.length === 0) {
      void vscode.window.showInformationMessage('还没有自定义条目')
      return
    }
    const pick = await vscode.window.showQuickPick(
      customEntries.map((e) => ({
        label: e.title,
        description: e.type === 'command' ? e.command : (e.keys.win ?? ''),
        entry: e,
      })),
      { placeHolder: '选择要编辑的自定义条目' },
    )
    if (!pick) return
    target = pick.entry
  }
  const current = target

  if (current.builtin) {
    void vscode.window.showInformationMessage('内置条目不可编辑')
    return
  }

  const title = await vscode.window.showInputBox({
    title: '标题',
    value: current.title,
    ignoreFocusOut: true,
  })
  if (title === undefined || !title.trim()) return

  let command = ''
  let keys = ''
  if (current.type === 'command') {
    command =
      (await vscode.window.showInputBox({
        title: '命令',
        value: current.command,
        ignoreFocusOut: true,
      })) ?? ''
    if (!command.trim()) return
  } else {
    keys =
      (await vscode.window.showInputBox({
        title: '按键',
        value: current.keys.win ?? '',
        ignoreFocusOut: true,
      })) ?? ''
    if (!keys.trim()) return
  }

  const description =
    (await vscode.window.showInputBox({
      title: '中文说明（可选）',
      value: current.description ?? '',
      ignoreFocusOut: true,
    })) ?? ''
  const tags =
    (await vscode.window.showInputBox({
      title: '标签（可选，逗号分隔）',
      value: (current.tags ?? []).join(', '),
      ignoreFocusOut: true,
    })) ?? ''

  const raw: any = {
    id: current.id,
    app: current.app,
    type: current.type,
    title: title.trim(),
    description,
    tags,
    platform: 'win',
  }
  if (current.type === 'command') raw.command = command.trim()
  else raw.keys = { win: keys.trim() }

  const updated = normalizeEntry(raw)
  if (!updated) {
    void vscode.window.showErrorMessage('条目无效')
    return
  }

  customEntries = customEntries.map((e) => (e.id === updated.id ? updated : e))
  await saveCustom(customEntries)
  rebuild()
  void vscode.window.showInformationMessage(`已更新：${updated.title}`)
}

async function deleteEntry(target?: Entry): Promise<void> {
  if (!target) {
    if (customEntries.length === 0) {
      void vscode.window.showInformationMessage('还没有自定义条目')
      return
    }
    const pick = await vscode.window.showQuickPick(
      customEntries.map((e) => ({
        label: e.title,
        description: e.type === 'command' ? e.command : (e.keys.win ?? ''),
        entry: e,
      })),
      { placeHolder: '选择要删除的自定义条目' },
    )
    if (!pick) return
    target = pick.entry
  }
  const current = target

  if (current.builtin) return

  const confirm = await vscode.window.showWarningMessage(
    `删除自定义条目「${current.title}」？`,
    { modal: true },
    '删除',
  )
  if (confirm !== '删除') return

  customEntries = customEntries.filter((e) => e.id !== current.id)
  await saveCustom(customEntries)
  rebuild()
  void vscode.window.showInformationMessage(`已删除：${current.title}`)
}

async function manageEntries(): Promise<void> {
  if (customEntries.length === 0) {
    void vscode.window.showInformationMessage('还没有自定义条目')
    return
  }

  const qp = vscode.window.createQuickPick<EntryItem>()
  qp.title = `自定义条目（${customEntries.length}）`
  qp.placeholder = '回车编辑；右侧按钮可编辑 / 删除'
  qp.items = customEntries.map((e) => ({ ...toItem(e), buttons: [EDIT_BUTTON, DELETE_BUTTON] }))
  qp.onDidAccept(() => {
    const item = qp.selectedItems[0]
    qp.hide()
    if (item?.entry) void editEntry(item.entry)
  })
  qp.onDidTriggerItemButton(async (e) => {
    qp.hide()
    if (!e.item.entry) return
    if (e.button === EDIT_BUTTON) await editEntry(e.item.entry)
    else if (e.button === DELETE_BUTTON) await deleteEntry(e.item.entry)
  })
  qp.onDidHide(() => qp.dispose())
  qp.show()
}

async function importEntries(): Promise<void> {
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { JSON: ['json'] },
    openLabel: '导入',
  })
  if (!uris || uris.length === 0) return

  try {
    const raw = await vscode.workspace.fs.readFile(uris[0])
    const data = JSON.parse(Buffer.from(raw).toString('utf8'))
    const added = normalizeList(data)
    const map = new Map(customEntries.map((e) => [e.id, e]))
    for (const e of added) map.set(e.id, e)
    customEntries = [...map.values()]
    await saveCustom(customEntries)
    rebuild()
    void vscode.window.showInformationMessage(`已导入 ${added.length} 条自定义条目`)
  } catch (err) {
    void vscode.window.showErrorMessage(`导入失败：${String(err)}`)
  }
}

async function openEntriesFile(): Promise<void> {
  const uri = await entriesFile()
  const doc = await vscode.workspace.openTextDocument(uri)
  await vscode.window.showTextDocument(doc)
}

// ---------- 键帽面板 ----------

function showKeycaps(e: ShortcutEntry): void {
  const panel = vscode.window.createWebviewPanel(
    'shortcutLauncher.keycaps',
    `快捷键：${e.title}`,
    vscode.ViewColumn.Beside,
    { enableScripts: false, retainContextWhenHidden: false },
  )
  panel.webview.html = keycapHtml(e)
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

function keycapHtml(e: ShortcutEntry): string {
  const combo = e.keys.win ?? ''
  const keys = combo
    .split('+')
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => `<span class="key">${escapeHtml(k)}</span>`)
    .join('')

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<style>
  body { margin: 0; padding: 26px; background: #1e1e1e; color: #f8fafc; font-family: "Segoe UI", "Microsoft YaHei", sans-serif; }
  .app { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #93c5fd; margin-bottom: 12px; }
  .keys { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
  .key { padding: 8px 14px; border-radius: 9px; background: linear-gradient(#ffffff, #e2e8f0); color: #0f172a; font-weight: 700; font-size: 16px; box-shadow: 0 3px 0 #94a3b8; }
  h1 { font-size: 18px; margin: 0 0 6px; }
  .zh { font-size: 14px; color: #e2e8f0; margin-bottom: 6px; }
  .desc { font-size: 12px; color: #94a3b8; }
</style>
</head>
<body>
  <div class="app">${escapeHtml(e.app)}</div>
  <div class="keys">${keys || '<span class="key">?</span>'}</div>
  <h1>${escapeHtml(e.title)}</h1>
  <div class="zh">${escapeHtml(e.zh ?? '')}</div>
  <div class="desc">${escapeHtml(e.description ?? '')}</div>
</body>
</html>`
}

// ---------- 从文件夹导入 ----------

let importPanel: vscode.WebviewPanel | undefined
let lastScanEntries: Entry[] = []

interface ScanFile {
  path: string
  count: number
  error?: string
}

type ScanResult =
  | { ok: true; entries: Entry[]; files: ScanFile[] }
  | { ok: false; error: string }

function openImportPanel(): void {
  if (importPanel) {
    importPanel.reveal()
    return
  }

  importPanel = vscode.window.createWebviewPanel(
    'shortcutLauncher.importFolder',
    '从文件夹导入命令',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  )
  importPanel.webview.html = importHtml()
  importPanel.onDidDispose(() => {
    importPanel = undefined
  })

  importPanel.webview.onDidReceiveMessage(async (msg: any) => {
    if (msg.type === 'pickFolder') {
      const uris = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: '选择文件夹',
      })
      if (uris && uris[0]) {
        importPanel?.webview.postMessage({ type: 'folder', path: uris[0].fsPath })
      }
      return
    }

    if (msg.type === 'scan') {
      const result = await scanFolder(String(msg.path ?? ''))
      if (!result.ok) {
        importPanel?.webview.postMessage({ type: 'scanError', error: result.error })
        return
      }
      lastScanEntries = result.entries
      let imported = 0
      if (msg.autoImport && result.entries.length > 0) {
        imported = await mergeCustom(result.entries)
      }
      importPanel?.webview.postMessage({
        type: 'scanResult',
        files: result.files,
        entries: result.entries.slice(0, 300).map(summarize),
        count: result.entries.length,
        imported,
      })
      return
    }

    if (msg.type === 'import') {
      const imported = await mergeCustom(lastScanEntries)
      importPanel?.webview.postMessage({ type: 'imported', count: imported })
    }
  })
}

async function mergeCustom(entries: Entry[]): Promise<number> {
  const map = new Map(customEntries.map((e) => [e.id, e]))
  let added = 0
  for (const e of entries) {
    if (!map.has(e.id)) added++
    map.set(e.id, e)
  }
  customEntries = [...map.values()]
  await saveCustom(customEntries)
  rebuild()
  return added
}

function summarize(e: Entry): any {
  return {
    type: e.type,
    title: e.title,
    detail: e.type === 'command' ? e.command : (e.keys.win ?? ''),
    description: e.description ?? '',
  }
}

function safeIdPart(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'file'
}

async function scanFolder(root: string): Promise<ScanResult> {
  if (!root) return { ok: false, error: '请输入文件夹路径' }
  try {
    const st = await fs.stat(root)
    if (!st.isDirectory()) return { ok: false, error: '路径不是文件夹' }
  } catch {
    return { ok: false, error: '路径不存在或无法访问' }
  }

  const files: ScanFile[] = []
  const entries: Entry[] = []
  const seen = new Set<string>()
  let fileCount = 0
  const MAX_FILES = 500

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 6 || fileCount >= MAX_FILES) return
    const items = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const it of items) {
      if (fileCount >= MAX_FILES) return
      const full = path.join(dir, it.name)
      if (it.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'out', '.vscode'].includes(it.name)) continue
        await walk(full, depth + 1)
      } else if (it.isFile() && it.name.toLowerCase().endsWith('.json')) {
        fileCount++
        const rel = path.relative(root, full) || it.name
        try {
          const raw = await fs.readFile(full, 'utf8')
          const data = JSON.parse(raw)
          const arr: any[] = Array.isArray(data) ? data : Array.isArray(data?.entries) ? data.entries : []
          let count = 0
          arr.forEach((item, idx) => {
            const withId =
              item && typeof item === 'object' && !item.id
                ? { ...item, id: `custom.${safeIdPart(rel)}.${idx}` }
                : item
            const e = normalizeEntry(withId)
            if (!e || seen.has(e.id)) return
            seen.add(e.id)
            entries.push(e)
            count++
          })
          files.push({ path: rel, count })
        } catch (err) {
          files.push({ path: rel, count: 0, error: String(err) })
        }
      }
    }
  }

  await walk(root, 0)
  return { ok: true, entries, files }
}

function importHtml(): string {
  const n = Math.random().toString(36).slice(2) + Date.now().toString(36)
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${n}';">
<style>
  body { margin: 0; padding: 22px 26px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
  h1 { font-size: 18px; margin: 0 0 6px; }
  .hint { font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 16px; }
  .row { display: flex; gap: 8px; margin-bottom: 10px; }
  input[type=text] { flex: 1; padding: 6px 8px; font-family: var(--vscode-font-family); font-size: 13px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-radius: 4px; outline: none; }
  button { padding: 6px 12px; font-size: 12px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: none; border-radius: 4px; cursor: pointer; }
  button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
  button:disabled { opacity: .5; cursor: default; }
  label.check { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 10px; }
  .status { font-size: 12px; min-height: 18px; margin-bottom: 8px; }
  .status.err { color: var(--vscode-errorForeground); }
  .files { max-height: 150px; overflow: auto; border: 1px solid var(--vscode-panel-border); border-radius: 4px; margin-bottom: 12px; }
  .file { display: flex; justify-content: space-between; gap: 12px; padding: 4px 8px; font-size: 12px; border-bottom: 1px solid var(--vscode-panel-border); }
  .file:last-child { border-bottom: none; }
  .fname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fcount { color: var(--vscode-descriptionForeground); white-space: nowrap; }
  .fcount.err { color: var(--vscode-errorForeground); }
  .preview { max-height: 320px; overflow: auto; border: 1px solid var(--vscode-panel-border); border-radius: 4px; }
  .item { display: flex; gap: 10px; padding: 4px 8px; font-size: 12px; border-bottom: 1px solid var(--vscode-panel-border); }
  .item:last-child { border-bottom: none; }
  .type { width: 70px; color: var(--vscode-descriptionForeground); }
  .detail { width: 42%; font-family: var(--vscode-editor-font-family); color: var(--vscode-textLink-foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .actions { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
</style>
</head>
<body>
  <h1>从文件夹导入命令</h1>
  <div class="hint">扫描指定文件夹下所有 .json 文件，自动识别其中的命令 / 快捷键。</div>
  <div class="row">
    <input id="path" type="text" placeholder="例如 D:\\shortcuts 或 /home/me/shortcuts" />
    <button id="pick" class="secondary">选择文件夹…</button>
    <button id="scan">扫描</button>
  </div>
  <label class="check"><input id="autoImport" type="checkbox" checked /> 扫描后自动导入</label>
  <div id="status" class="status"></div>
  <div id="files" class="files"></div>
  <div id="preview" class="preview"></div>
  <div class="actions">
    <button id="import" disabled>导入全部</button>
    <span id="count" class="hint"></span>
  </div>
<script nonce="${n}">
  const vscode = acquireVsCodeApi();
  const pathEl = document.getElementById('path');
  const autoEl = document.getElementById('autoImport');
  const statusEl = document.getElementById('status');
  const filesEl = document.getElementById('files');
  const previewEl = document.getElementById('preview');
  const importBtn = document.getElementById('import');
  const countEl = document.getElementById('count');

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function setStatus(msg, isErr) {
    statusEl.textContent = msg || '';
    statusEl.className = 'status' + (isErr ? ' err' : '');
  }

  document.getElementById('pick').addEventListener('click', () => {
    vscode.postMessage({ type: 'pickFolder' });
  });

  document.getElementById('scan').addEventListener('click', () => {
    const p = pathEl.value.trim();
    if (!p) { setStatus('请输入文件夹路径', true); return; }
    setStatus('扫描中…');
    vscode.postMessage({ type: 'scan', path: p, autoImport: autoEl.checked });
  });

  importBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'import' });
  });

  window.addEventListener('message', (event) => {
    const m = event.data || {};
    if (m.type === 'folder') {
      pathEl.value = m.path;
      return;
    }
    if (m.type === 'scanError') {
      setStatus(m.error || '扫描失败', true);
      return;
    }
    if (m.type === 'scanResult') {
      filesEl.innerHTML = (m.files || []).map((f) => '<div class="file"><span class="fname">' + esc(f.path) + '</span><span class="fcount' + (f.error ? ' err' : '') + '">' + (f.error ? '解析失败' : f.count + ' 条') + '</span></div>').join('');
      previewEl.innerHTML = (m.entries || []).map((e) => '<div class="item"><span class="type">' + esc(e.type) + '</span><span class="detail">' + esc(e.detail) + '</span><span class="title">' + esc(e.title) + '</span></div>').join('');
      countEl.textContent = '共 ' + m.count + ' 条';
      importBtn.disabled = !m.count;
      setStatus(m.imported ? '已自动导入 ' + m.imported + ' 条' : '扫描到 ' + m.count + ' 条，可点击导入全部');
      return;
    }
    if (m.type === 'imported') {
      setStatus('已导入 ' + m.count + ' 条');
    }
  });
</script>
</body>
</html>`
}
