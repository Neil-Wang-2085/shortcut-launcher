import * as vscode from 'vscode'
import { Searcher } from '../../src/shared/search'
import { ENTRIES } from '../../src/shared/data'
import type { Entry, ShortcutEntry } from '../../src/shared/types'

interface EntryItem extends vscode.QuickPickItem {
  entry: Entry
}

let searcher: Searcher

export function activate(context: vscode.ExtensionContext): void {
  searcher = new Searcher(ENTRIES)

  context.subscriptions.push(
    vscode.commands.registerCommand('shortcutLauncher.search', () => search()),
  )

  // 状态栏入口：点击即搜索
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90)
  status.text = '$(keyboard) Shortcuts'
  status.tooltip = 'Shortcut Launcher：搜索快捷键 / 命令（Ctrl+Alt+Shift+K）'
  status.command = 'shortcutLauncher.search'
  status.show()
  context.subscriptions.push(status)
}

export function deactivate(): void {}

/** 打开命令面板式的模糊搜索 */
async function search(): Promise<void> {
  const qp = vscode.window.createQuickPick<EntryItem>()
  qp.placeholder = '搜索快捷键 / 命令，支持中文，如 "加粗"、"git rebase"'
  qp.title = 'Shortcut Launcher'
  qp.matchOnDescription = false
  qp.matchOnDetail = false

  const render = (query: string): void => {
    const results = searcher.search(query, 40)
    qp.items = results.map((r) => toItem(r.entry))
    if (qp.items.length > 0) qp.activeItems = [qp.items[0]]
    qp.title = query
      ? `Shortcut Launcher — ${results.length} 条结果`
      : `Shortcut Launcher — 内置 ${ENTRIES.length} 条`
  }

  render('')
  qp.onDidChangeValue(render)
  qp.onDidAccept(() => {
    const item = qp.selectedItems[0]
    qp.hide()
    if (item) void handleEntry(item.entry)
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
    // 由我们自己的 Searcher 过滤，禁用 VS Code 的二次过滤
    alwaysShow: true,
  }
}

async function handleEntry(e: Entry): Promise<void> {
  if (e.type === 'command') {
    await vscode.env.clipboard.writeText(e.command)
    const action = await vscode.window.showInformationMessage(
      `已复制：${e.command}`,
      '插入终端',
    )
    if (action === '插入终端') {
      const terminal = vscode.window.activeTerminal ?? vscode.window.createTerminal('Shortcut Launcher')
      terminal.show()
      terminal.sendText(e.command)
    }
    return
  }
  showKeycaps(e)
}

/** 快捷键：打开键帽面板 */
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
