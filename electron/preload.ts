import { contextBridge, ipcRenderer } from 'electron'

// The API exposed here is the ONLY surface the renderer can use to
// communicate with the main process. contextIsolation: true ensures
// that the renderer cannot access Node.js or Electron APIs directly.

contextBridge.exposeInMainWorld('electronAPI', {
  /** True when running inside Electron. Always undefined in a browser. */
  isElectron: true as const,

  setPresentingState(isPresenting: boolean): void {
    ipcRenderer.send('set-presenting-state', isPresenting)
  },

  onMenuAction(callback: (action: string) => void): void {
    ipcRenderer.on('menu-action', (_event, action: string) => callback(action))
  },

  offMenuAction(): void {
    ipcRenderer.removeAllListeners('menu-action')
  },

  /** Returns the app version from the packaged package.json via the main process. */
  getVersion(): Promise<string> {
    return ipcRenderer.invoke('app:getVersion')
  },

  /** Returns the path to the Electron userData directory. */
  getUserDataPath(): Promise<string> {
    return ipcRenderer.invoke('app:getUserDataPath')
  },

  /** Asks the main process to open the userData folder in Explorer. */
  openUserDataFolder(): void {
    ipcRenderer.send('app:openUserData')
  },
})
