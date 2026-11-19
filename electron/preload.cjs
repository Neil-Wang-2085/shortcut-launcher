/**
 * preload 脚本：通过 contextBridge 向渲染进程暴露受控 API。
 * 渲染进程不直接访问 Node/Electron，只能调用这里列出的方法。
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // ---------- 动作 ----------
  /** 把文本写入系统剪贴板 */
  copy: (text) => ipcRenderer.send('copy-text', text),
  /** 隐藏 launcher 窗口 */
  hideLauncher: () => ipcRenderer.send('hide-launcher'),
  /** 弹出快捷键浮层 */
  showShortcut: (entry) => ipcRenderer.send('show-shortcut', entry),
  /** 打开自定义条目设置窗口 */
  openSettings: () => ipcRenderer.send('open-settings'),

  // ---------- 事件订阅 ----------
  /** 浮层渲染：主进程推送一条快捷键数据 */
  onRenderPopup: (cb) => ipcRenderer.on('render-popup', (_e, entry) => cb(entry)),
  /** launcher 获得焦点：重新加载数据并聚焦搜索框 */
  onFocusInput: (cb) => ipcRenderer.on('focus-input', () => cb()),
  /** 条目发生变化：刷新列表 */
  onEntriesChanged: (cb) => ipcRenderer.on('entries-changed', () => cb()),

  // ---------- 数据读写（invoke/handle） ----------
  /** 获取合并后的全部条目（内置 + 用户） */
  getEntries: () => ipcRenderer.invoke('get-entries'),
  /** 保存/更新一条自定义条目 */
  saveEntry: (entry) => ipcRenderer.invoke('save-entry', entry),
  /** 删除一条自定义条目 */
  deleteEntry: (id) => ipcRenderer.invoke('delete-entry', id),
  /** 从文本导入（format: 'json' | 'csv'） */
  importText: (text, format) => ipcRenderer.invoke('import-text', { text, format }),
  /** 从文件导入 */
  importFile: () => ipcRenderer.invoke('import-file'),
  /** 导出用户条目到文件 */
  exportFile: () => ipcRenderer.invoke('export-file'),

  // ---------- 使用记录（frecency） ----------
  /** 读取使用记录 */
  getUsage: () => ipcRenderer.invoke('get-usage'),
  /** 记录一次使用（用于排序加权） */
  recordUsage: (id) => ipcRenderer.invoke('record-usage', id),

  // ---------- 配置 ----------
  /** 读取配置（热键 / 开机自启 / 浮层时长） */
  getConfig: () => ipcRenderer.invoke('get-config'),
  /** 保存配置并立即生效 */
  saveConfig: (patch) => ipcRenderer.invoke('save-config', patch),
})
