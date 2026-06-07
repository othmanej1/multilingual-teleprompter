import { contextBridge, ipcRenderer } from 'electron'

// The API exposed here is the ONLY surface the renderer can use to
// communicate with the main process. contextIsolation: true ensures
// that the renderer cannot access Node.js or Electron APIs directly.

contextBridge.exposeInMainWorld('electronAPI', {
  /** True when running inside Electron. Always undefined in a browser. */
  isElectron: true as const,

  /**
   * Tell the main process whether the teleprompter is actively presenting.
   * The main process uses this to show a confirmation dialog before closing.
   */
  setPresentingState(isPresenting: boolean): void {
    ipcRenderer.send('set-presenting-state', isPresenting)
  },

  /**
   * Register a callback for native menu actions dispatched by the main
   * process (e.g. New Script, Toggle Library, Focus Mode).
   * Call once on mount; call offMenuAction() on unmount.
   */
  onMenuAction(callback: (action: string) => void): void {
    ipcRenderer.on('menu-action', (_event, action: string) => callback(action))
  },

  /** Remove all menu-action IPC listeners (call on component unmount). */
  offMenuAction(): void {
    ipcRenderer.removeAllListeners('menu-action')
  },
})
