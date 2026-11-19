/**
 * Electron 主进程入口。
 *
 * 负责：
 * - 应用生命周期、单实例锁
 * - 创建三个窗口：launcher（搜索主界面）、popup（透明快捷键浮层）、settings（自定义条目）
 * - 全局热键、系统托盘
 * - 剪贴板写入
 * - 用户自定义条目的读写（%APPDATA%\shortcut-launcher\user-entries.json）
 * - 与渲染进程之间的 IPC（invoke/handle + send/on）
 */

const {
  app,
  BrowserWindow,
  globalShortcut,
  Tray,
  Menu,
  clipboard,
  ipcMain,
  nativeImage,
  screen,
  dialog,
} = require('electron')
const path = require('node:path')
const fs = require('node:fs')

// 项目根目录（electron/ 的上一级）
const ROOT = path.join(__dirname, '..')
// 由 esbuild 打包生成：数据合并/导入解析、内置种子数据
const store = require(path.join(ROOT, 'dist', 'store.cjs'))
const { ENTRIES: SEED } = require(path.join(ROOT, 'dist', 'seed.cjs'))

// 统一开发版与安装版的 userData 目录名（%APPDATA%\shortcut-launcher）
app.setName('shortcut-launcher')
// 冒烟测试时禁用硬件加速，避免无 GPU 环境下截图/渲染异常；正常运行保持默认
if (process.env.SMOKE === '1') app.disableHardwareAcceleration()

// 窗口与托盘引用
let launcherWin = null
let popupWin = null
let settingsWin = null
let tray = null
let popupTimer = null
let activeHotkey = null

/** 用户自定义条目文件路径 */
function userFile() {
  return path.join(app.getPath('userData'), 'user-entries.json')
}

/** 读取用户自定义条目；文件不存在或损坏时返回空数组 */
function loadUser() {
  try {
    const d = JSON.parse(fs.readFileSync(userFile(), 'utf8'))
    return Array.isArray(d && d.entries) ? d.entries : Array.isArray(d) ? d : []
  } catch {
    return []
  }
}

/** 保存用户自定义条目（自动创建目录） */
function saveUser(entries) {
  fs.mkdirSync(path.dirname(userFile()), { recursive: true })
  fs.writeFileSync(userFile(), JSON.stringify({ version: 1, entries }, null, 2), 'utf8')
}

/** 合并内置数据与用户数据（同 id 用户覆盖内置） */
function allEntries() {
  return store.mergeEntries(SEED, loadUser())
}

/** 通知已打开的窗口：条目发生变化，需要重新加载 */
function broadcastEntries() {
  for (const w of [launcherWin, settingsWin]) {
    if (w && !w.isDestroyed()) w.webContents.send('entries-changed')
  }
}

/** 按 id 插入/覆盖一批用户条目，返回处理数量 */
function upsertUser(rawEntries) {
  const user = loadUser()
  const map = new Map(user.map((e) => [e.id, e]))
  let count = 0
  for (const e of rawEntries) {
    map.set(e.id, e)
    count++
  }
  saveUser([...map.values()])
  broadcastEntries()
  return count
}

// ---------- 配置（热键 / 开机自启 / 浮层时长） ----------

/** 配置文件路径 */
function configFile() {
  return path.join(app.getPath('userData'), 'config.json')
}

/** 默认配置 */
const DEFAULT_CONFIG = { hotkey: 'Control+Alt+K', autostart: false, popupMs: 3000 }

/** 读取配置（缺失字段用默认值补齐） */
function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(configFile(), 'utf8')) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

/** 保存配置 */
function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true })
  fs.writeFileSync(configFile(), JSON.stringify(cfg, null, 2), 'utf8')
}

// ---------- 使用记录（frecency 排序） ----------

/** 使用记录文件路径 */
function usageFile() {
  return path.join(app.getPath('userData'), 'usage.json')
}

/** 读取使用记录：{ id: { count, last } } */
function loadUsage() {
  try {
    return JSON.parse(fs.readFileSync(usageFile(), 'utf8')) || {}
  } catch {
    return {}
  }
}

/** 保存使用记录 */
function saveUsage(u) {
  fs.mkdirSync(path.dirname(usageFile()), { recursive: true })
  fs.writeFileSync(usageFile(), JSON.stringify(u), 'utf8')
}

// 热键回退顺序（用户配置失败时依次尝试）
const FALLBACK_HOTKEYS = ['Control+Alt+K', 'Control+Alt+Space', 'Control+Shift+Space']

/** 注册热键：先试用户配置，失败则回退；成功返回 true */
function registerHotkey(accel) {
  if (activeHotkey) {
    globalShortcut.unregister(activeHotkey)
    activeHotkey = null
  }
  if (accel && globalShortcut.register(accel, toggleLauncher)) {
    activeHotkey = accel
    return true
  }
  for (const hk of FALLBACK_HOTKEYS) {
    if (globalShortcut.register(hk, toggleLauncher)) {
      activeHotkey = hk
      return true
    }
  }
  return false
}

/**
 * 创建 launcher 窗口。
 * 使用实底 + roundedCorners（Windows 11 圆角），避免透明窗口在部分机器上黑屏/不可见。
 */
function createLauncher() {
  launcherWin = new BrowserWindow({
    width: 600,
    height: 520,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#ffffff',
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  launcherWin.loadFile(path.join(__dirname, 'launcher.html'))
  // 失去焦点时自动隐藏（冒烟测试下保持显示以便截图）
  launcherWin.on('blur', () => {
    if (process.env.SMOKE === '1') return
    if (launcherWin && !launcherWin.isDestroyed()) launcherWin.hide()
  })
}

/** 创建快捷键透明浮层窗口（不抢焦点、鼠标穿透） */
function createPopup() {
  popupWin = new BrowserWindow({
    width: 480,
    height: 240,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  popupWin.loadFile(path.join(__dirname, 'popup.html'))
  // 鼠标事件穿透到下层窗口
  popupWin.setIgnoreMouseEvents(true, { forward: true })
}

/** 打开/聚焦自定义条目设置窗口 */
function showSettings() {
  if (!settingsWin || settingsWin.isDestroyed()) {
    settingsWin = new BrowserWindow({
      width: 800,
      height: 720,
      show: false,
      title: 'Shortcut Launcher - Custom Entries',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    settingsWin.loadFile(path.join(__dirname, 'settings.html'))
    settingsWin.on('closed', () => {
      settingsWin = null
    })
  }
  settingsWin.show()
  settingsWin.focus()
}

/** 显示并聚焦 launcher：定位到当前显示器居中偏上 */
function showLauncher() {
  if (!launcherWin) createLauncher()
  const { width, height } = launcherWin.getBounds()
  const disp = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const x = Math.round(disp.workArea.x + (disp.workArea.width - width) / 2)
  const y = Math.round(disp.workArea.y + (disp.workArea.height - height) / 3)
  launcherWin.setPosition(x, y)
  launcherWin.show()
  launcherWin.focus()
  // 通知渲染进程聚焦并全选搜索框
  launcherWin.webContents.send('focus-input')
}

/** 全局热键回调：显示/隐藏切换 */
function toggleLauncher() {
  if (launcherWin && launcherWin.isVisible()) launcherWin.hide()
  else showLauncher()
}

/** 显示快捷键浮层：居中偏上，3 秒后自动隐藏 */
function showShortcut(entry) {
  if (!popupWin) createPopup()
  popupWin.webContents.send('render-popup', entry)
  const disp = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { width } = popupWin.getBounds()
  const x = Math.round(disp.workArea.x + (disp.workArea.width - width) / 2)
  const y = Math.round(disp.workArea.y + disp.workArea.height * 0.18)
  popupWin.setPosition(x, y)
  popupWin.showInactive()
  if (popupTimer) clearTimeout(popupTimer)
  popupTimer = setTimeout(() => {
    if (popupWin && !popupWin.isDestroyed()) popupWin.hide()
  }, loadConfig().popupMs)
}

/**
 * 冒烟测试：依次截取 launcher / popup / settings 三个窗口，然后退出。
 * 通过 SMOKE=1 环境变量启用（仅开发/CI 使用）。
 */
function runSmoke() {
  const log = (m) => console.log('[smoke] ' + m)
  const hard = setTimeout(() => {
    log('hard timeout')
    app.exit(0)
  }, 12000)
  log('start')
  showLauncher()
  setTimeout(async () => {
    try {
      const img = await launcherWin.webContents.capturePage()
      fs.writeFileSync(path.join(ROOT, 'smoke-launcher.png'), img.toPNG())
      log('launcher captured')
    } catch (e) {
      log('launcher capture failed ' + e)
    }
    // 验证占位符编辑：输入 git clone 并回车，应出现参数编辑条
    try {
      await launcherWin.webContents.executeJavaScript(
        `(() => { const q = document.getElementById('q'); q.value = 'git clone'; q.dispatchEvent(new Event('input')); return true })()`,
      )
      await new Promise((r) => setTimeout(r, 300))
      launcherWin.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
      launcherWin.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
      await new Promise((r) => setTimeout(r, 350))
      const imgE = await launcherWin.webContents.capturePage()
      fs.writeFileSync(path.join(ROOT, 'smoke-editor.png'), imgE.toPNG())
      log('editor captured')
    } catch (e) {
      log('editor capture failed ' + e)
    }
    // 用一个示例快捷键触发浮层
    const sample = {
      app: 'word',
      type: 'shortcut',
      title: 'Bold',
      keys: { win: 'Ctrl+B' },
      description: 'Toggle bold formatting',
      zh: '加粗 / 取消加粗',
    }
    popupWin.webContents.send('render-popup', sample)
    popupWin.showInactive()
    setTimeout(async () => {
      try {
        const img2 = await popupWin.webContents.capturePage()
        fs.writeFileSync(path.join(ROOT, 'smoke-popup.png'), img2.toPNG())
        log('popup captured')
      } catch (e) {
        log('popup capture failed ' + e)
      }
      showSettings()
      setTimeout(async () => {
        try {
          const img3 = await settingsWin.webContents.capturePage()
          fs.writeFileSync(path.join(ROOT, 'smoke-settings.png'), img3.toPNG())
          log('settings captured')
        } catch (e) {
          log('settings capture failed ' + e)
        }
        clearTimeout(hard)
        app.exit(0)
      }, 800)
    }, 700)
  }, 1200)
}

// 单实例锁：避免重复启动多个托盘进程
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  // 二次启动时聚焦已有 launcher
  app.on('second-instance', () => showLauncher())

  app.whenReady().then(() => {
    createLauncher()
    createPopup()

    // 系统托盘：图标 + 菜单（显示 / 自定义条目 / 退出）
    const icon = nativeImage.createFromPath(path.join(ROOT, 'assets', 'icon.png'))
    tray = new Tray(icon)
    tray.setToolTip('Shortcut Launcher (Ctrl+Alt+K)')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Show Launcher', click: showLauncher },
        { label: 'Custom Entries…', click: showSettings },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() },
      ]),
    )
    tray.on('double-click', showLauncher)

    // 全局热键：读取用户配置；失败时自动回退；全部失败则托盘气泡提示
    const cfg = loadConfig()
    if (registerHotkey(cfg.hotkey)) {
      tray.setToolTip(`Shortcut Launcher (${activeHotkey})`)
    } else {
      console.error('failed to register any global shortcut')
      tray.displayBalloon({
        title: 'Shortcut Launcher',
        content: 'Global hotkey registration failed. Use the tray icon to open.',
      })
    }
    // 开机自启
    app.setLoginItemSettings({ openAtLogin: !!cfg.autostart })

    // ---------- IPC：渲染进程 → 主进程 ----------
    // 命令类结果：写入剪贴板
    ipcMain.on('copy-text', (_e, text) => clipboard.writeText(String(text ?? '')))
    // 隐藏 launcher
    ipcMain.on('hide-launcher', () => {
      if (launcherWin && !launcherWin.isDestroyed()) launcherWin.hide()
    })
    // 快捷键类结果：弹出浮层
    ipcMain.on('show-shortcut', (_e, entry) => showShortcut(entry))
    // 打开设置窗口
    ipcMain.on('open-settings', () => showSettings())

    // 使用记录：读取 / 记录一次使用
    ipcMain.handle('get-usage', () => loadUsage())
    ipcMain.handle('record-usage', (_e, id) => {
      const u = loadUsage()
      const cur = u[id] || { count: 0, last: 0 }
      cur.count += 1
      cur.last = Date.now()
      u[id] = cur
      saveUsage(u)
      return { ok: true }
    })

    // 配置：读取 / 保存（保存后立即应用热键与开机自启）
    ipcMain.handle('get-config', () => loadConfig())
    ipcMain.handle('save-config', (_e, patch) => {
      const cfg = { ...loadConfig(), ...(patch || {}) }
      registerHotkey(cfg.hotkey)
      app.setLoginItemSettings({ openAtLogin: !!cfg.autostart })
      saveConfig(cfg)
      // 只有原样注册成功才算 ok；回退时返回实际生效的热键
      return { ok: cfg.hotkey === activeHotkey, hotkey: activeHotkey, config: cfg }
    })

    // 获取合并后的全部条目
    ipcMain.handle('get-entries', () => allEntries())

    // 保存/更新一条自定义条目
    ipcMain.handle('save-entry', (_e, raw) => {
      const e = store.normalizeEntry(raw)
      if (!e) return { ok: false, error: 'invalid entry (title and keys/command are required)' }
      upsertUser([e])
      return { ok: true, entry: e }
    })

    // 删除一条自定义条目
    ipcMain.handle('delete-entry', (_e, id) => {
      const user = loadUser().filter((x) => x.id !== id)
      saveUser(user)
      broadcastEntries()
      return { ok: true }
    })

    // 从粘贴的 JSON/CSV 文本导入
    ipcMain.handle('import-text', (_e, payload) => {
      try {
        const text = String(payload && payload.text ? payload.text : '')
        const parsed =
          payload && payload.format === 'csv' ? store.parseCsvImport(text) : store.parseJsonImport(text)
        return { ok: true, count: upsertUser(parsed) }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    })

    // 从文件导入（对话框选择 JSON/CSV）
    ipcMain.handle('import-file', async () => {
      const r = await dialog.showOpenDialog(settingsWin || launcherWin, {
        properties: ['openFile'],
        filters: [{ name: 'Entry data', extensions: ['json', 'csv'] }],
      })
      if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true }
      const file = r.filePaths[0]
      try {
        const text = fs.readFileSync(file, 'utf8')
        const parsed = file.toLowerCase().endsWith('.csv')
          ? store.parseCsvImport(text)
          : store.parseJsonImport(text)
        return { ok: true, count: upsertUser(parsed), file }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    })

    // 导出用户条目到 JSON 文件
    ipcMain.handle('export-file', async () => {
      const r = await dialog.showSaveDialog(settingsWin || launcherWin, {
        defaultPath: 'shortcut-launcher-entries.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (r.canceled || !r.filePath) return { ok: false, canceled: true }
      try {
        fs.writeFileSync(
          r.filePath,
          JSON.stringify({ version: 1, entries: loadUser() }, null, 2),
          'utf8',
        )
        return { ok: true, path: r.filePath }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    })

    // 冒烟测试或正常启动：正常启动时主动显示 launcher，避免"双击没反应"
    if (process.env.SMOKE === '1') runSmoke()
    else setTimeout(() => showLauncher(), 300)
  })

  // 关闭所有窗口不退出（常驻托盘）
  app.on('window-all-closed', () => {
    // keep running in tray
  })

  // 退出前注销全局热键
  app.on('will-quit', () => globalShortcut.unregisterAll())
}
