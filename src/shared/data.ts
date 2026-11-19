import word from './data/word.json'
import excel from './data/excel.json'
import powerpoint from './data/powerpoint.json'
import photoshop from './data/photoshop.json'
import git from './data/git.json'
import gdb from './data/gdb.json'
import windows from './data/windows.json'
import vscode from './data/vscode.json'
import chrome from './data/chrome.json'
import terminal from './data/terminal.json'
import build from './data/build.json'
import outlook from './data/outlook.json'
import type { Entry } from './types.ts'

/** 内置条目汇总（esbuild 会把这些 JSON 一起打包） */
export const ENTRIES: Entry[] = [
  ...(word as Entry[]),
  ...(excel as Entry[]),
  ...(powerpoint as Entry[]),
  ...(photoshop as Entry[]),
  ...(git as Entry[]),
  ...(gdb as Entry[]),
  ...(windows as Entry[]),
  ...(vscode as Entry[]),
  ...(chrome as Entry[]),
  ...(terminal as Entry[]),
  ...(build as Entry[]),
  ...(outlook as Entry[]),
]
