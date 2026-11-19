import * as vscode from 'vscode'
import { Searcher } from '../../src/shared/search'
import { ENTRIES } from '../../src/shared/data'
import { normalizeEntry } from '../../src/shared/store'
import type { Entry, ShortcutEntry } from '../../src/shared/types'

interface EntryItem extends vscode.QuickPickItem {
  entry?: Entry
  isAdd?: boolean
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

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  extContext = context
  customEntries = await loadCustom()
  rebuild()

  context.subscriptions.push(
    vscode.commands.registerCommand('shortcutLauncher.search', () => search()),
    vscode.commands.registerCommand('shortcutLauncher.addEntry', () => addEntry()),
    vscode.commands.registerCommand('shortcutLauncher.importEntries', () => importEntries()),
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
    qp.items = [...results.map((r) => toItem(r.entry)), ADD_ITEM]
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
    if (item.entry) void handleEntry(item.entry)
  })
  qp.onDidHide(() => qp.dispose())
  qp.show()
}

function toItem(e: Entry): EntryItem {
  const detail = e.type === 'shortcut' ? (e.keys.win ?? '') : e.command
  return {
    label: e.title,
    description: detail,
    detail: e.zh ?? e.description ?? '',
    entry: e,
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

async function deleteEntry(): Promise<void> {
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

  customEntries = customEntries.filter((e) => e.id !== pick.entry.id)
  await saveCustom(customEntries)
  rebuild()
  void vscode.window.showInformationMessage(`已删除：${pick.entry.title}`)
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
