import {
  app,
  BrowserWindow,
  Menu,
  MenuItem,
  dialog,
  ipcMain,
  shell,
  screen,
} from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'

// ── Environment ───────────────────────────────────────────
// !app.isPackaged is true when running via `electron .` in dev
const isDev = !app.isPackaged

// In dev, the Vite server must be running on this port
const DEV_SERVER_URL = 'http://localhost:5173'

// ── Window state persistence ──────────────────────────────
interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized: boolean
}

// userData directory is guaranteed to exist when Electron starts
const STATE_FILE = join(app.getPath('userData'), 'window-state.json')

function loadWindowState(): WindowState {
  try {
    const raw = readFileSync(STATE_FILE, 'utf-8')
    return JSON.parse(raw) as WindowState
  } catch {
    return { width: 1280, height: 800, isMaximized: false }
  }
}

function saveWindowState(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  try {
    const bounds = win.getNormalBounds() // returns unmaximised bounds even when maximised
    const state: WindowState = {
      ...bounds,
      isMaximized: win.isMaximized(),
    }
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
  } catch {
    // Ignore write errors (e.g. read-only filesystem)
  }
}

// ── Presenting state — for close-while-presenting guard ───
let isPresenting = false

ipcMain.on('set-presenting-state', (_event, value: boolean) => {
  isPresenting = value
})

// ── App info IPC ──────────────────────────────────────────
ipcMain.handle('app:getVersion', () => app.getVersion())
ipcMain.handle('app:getUserDataPath', () => app.getPath('userData'))
ipcMain.on('app:openUserData', () => {
  shell.openPath(app.getPath('userData')).catch(() => {})
})

// ── Menu action → renderer bridge ─────────────────────────
// The native menu sends named actions to the renderer via IPC.
// The preload exposes ipcRenderer.on('menu-action') via contextBridge.
let mainWindow: BrowserWindow | null = null

function sendMenuAction(action: string): void {
  mainWindow?.webContents.send('menu-action', action)
}

// ── Native application menu ───────────────────────────────
function buildMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    // ── macOS app menu ──
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),

    // ── File ──
    {
      label: 'File',
      submenu: [
        {
          label: 'New Script',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendMenuAction('new-script'),
        },
        {
          label: 'Toggle Script Library',
          accelerator: 'CmdOrCtrl+L',
          click: () => sendMenuAction('toggle-library'),
        },
        { type: 'separator' },
        ...(isMac
          ? [{ role: 'close' as const }]
          : [{ role: 'quit' as const }]),
      ],
    },

    // ── Edit ──
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const },
      ],
    },

    // ── View / Teleprompter ──
    {
      label: 'Teleprompter',
      submenu: [
        {
          // Space is already handled in the renderer; this gives a menu entry
          // without an accelerator so the two don't conflict.
          label: 'Play / Pause',
          click: () => sendMenuAction('play-pause'),
        },
        {
          label: 'Reset to Top',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => sendMenuAction('reset'),
        },
        { type: 'separator' as const },
        {
          label: 'Open Output Window',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => sendMenuAction('open-output'),
        },
        { type: 'separator' as const },
        {
          label: 'Toggle Focus Mode',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => sendMenuAction('focus-mode'),
        },
        {
          label: 'Toggle Appearance Panel',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => sendMenuAction('toggle-appearance'),
        },
        { type: 'separator' as const },
        {
          // F11 is already handled in the renderer on Windows/Linux;
          // this gives macOS the standard Ctrl+Cmd+F fullscreen shortcut.
          label: 'Toggle Fullscreen',
          accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11',
          click: () => {
            if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen())
          },
        },
        ...(isDev
          ? [
              { type: 'separator' as const },
              { role: 'reload' as const },
              { role: 'forceReload' as const },
              { role: 'toggleDevTools' as const },
            ]
          : []),
      ],
    },

    // ── Window ──
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
            ]
          : [{ role: 'close' as const }]),
      ],
    },

    // ── Help ──
    {
      label: 'Help',
      submenu: [
        {
          label: 'Keyboard Shortcuts',
          accelerator: 'CmdOrCtrl+/',
          click: () => sendMenuAction('show-shortcuts'),
        },
        { type: 'separator' as const },
        {
          label: 'Open App Data Folder',
          click: () => shell.openPath(app.getPath('userData')).catch(() => {}),
        },
        { type: 'separator' as const },
        {
          label: `About TelePrompter`,
          click: () => sendMenuAction('show-about'),
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── Output window — intercept window.open() ───────────────
// The React app calls window.open('...?output=1', ...).
// We intercept it here to create a proper native BrowserWindow
// that can be moved to a second monitor and go fullscreen natively.
function registerOutputWindowHandler(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('output=1')) {
      // Elect to allow the open but override the window options
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1280,
          height: 720,
          minWidth: 800,
          minHeight: 450,
          title: 'TelePrompter — Output',
          backgroundColor: '#000000',
          // Do NOT set fullscreen here — let the OutputView request it
          webPreferences: {
            preload: join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
          },
        },
      }
    }

    // Any other external URL → open in system browser, deny in app
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

// ── Main window factory ───────────────────────────────────
function createMainWindow(): BrowserWindow {
  const state = loadWindowState()

  // Validate that the saved position is still within a connected display.
  // If the monitor it was on is gone, let Electron centre the window.
  const allDisplays = screen.getAllDisplays()
  const savedPosVisible =
    state.x !== undefined &&
    state.y !== undefined &&
    allDisplays.some(({ workArea: { x, y, width, height } }) => {
      return (
        state.x! >= x &&
        state.y! >= y &&
        state.x! < x + width &&
        state.y! < y + height
      )
    })

  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: savedPosVisible ? state.x : undefined,
    y: savedPosVisible ? state.y : undefined,
    minWidth: 900,
    minHeight: 600,
    title: 'TelePrompter',
    // Match the app's base background colour — prevents white flash on load
    backgroundColor: '#0A0E1A',
    // Hide until 'ready-to-show' so the user never sees a blank window
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,   // Security: renderer cannot access Node APIs
      nodeIntegration: false,   // Security: Node.js not available in renderer
      sandbox: false,           // Required for preload to use contextBridge
    },
  })

  // ── Show after paint — eliminates white flash ──
  win.once('ready-to-show', () => {
    if (state.isMaximized) win.maximize()
    win.show()
    win.focus()
  })

  // ── Intercept output window.open() calls ──
  registerOutputWindowHandler(win)

  // ── Persist size/position on every move/resize ──
  win.on('resize', () => {
    if (!win.isMaximized()) saveWindowState(win)
  })
  win.on('move', () => {
    if (!win.isMaximized()) saveWindowState(win)
  })
  // Save maximised state flag when the window is maximised/restored
  win.on('maximize', () => saveWindowState(win))
  win.on('unmaximize', () => saveWindowState(win))

  // ── Close guard: warn if teleprompter is running ──
  win.on('close', e => {
    // Always persist state before any close attempt
    saveWindowState(win)

    if (isPresenting) {
      e.preventDefault()
      dialog
        .showMessageBox(win, {
          type: 'question',
          buttons: ['Stop & Close', 'Keep Presenting'],
          defaultId: 1,
          cancelId: 1,
          title: 'TelePrompter is running',
          message: 'The teleprompter is currently playing.',
          detail: 'Closing now will stop the presentation. Continue?',
        })
        .then(({ response }) => {
          if (response === 0) {
            isPresenting = false
            win.destroy() // destroy bypasses the close event handler
          }
        })
    }
  })

  // ── Load content ──
  if (isDev) {
    win.loadURL(DEV_SERVER_URL)
    // Open DevTools in a detached window so they don't squeeze the app
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    // dist/ is one level up from dist-electron/ where this file lives
    win.loadFile(join(__dirname, '../dist/index.html'))
  }

  return win
}

// ── App lifecycle ─────────────────────────────────────────
app.whenReady().then(() => {
  buildMenu()
  mainWindow = createMainWindow()

  // macOS: re-create the window when the dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
    }
  })
})

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
