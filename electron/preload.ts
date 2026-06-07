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

  speech: {
    check(lang: string): Promise<{ available: boolean; modelPath: string; missingFiles?: string[] }> {
      return ipcRenderer.invoke('speech:check', lang)
    },
    getModelsBasePath(): Promise<string> {
      return ipcRenderer.invoke('speech:getModelsBasePath')
    },
    start(lang: string): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke('speech:start', lang)
    },
    stop(): Promise<void> {
      return ipcRenderer.invoke('speech:stop')
    },
    sendAudio(samples: Float32Array): void {
      ipcRenderer.send('speech:audio', samples)
    },
    onResult(callback: (data: { text: string; isFinal: boolean; segment: number }) => void): void {
      ipcRenderer.on('speech:result', (_event, data) => callback(data))
    },
    offResult(): void {
      ipcRenderer.removeAllListeners('speech:result')
    },
    onError(callback: (data: { message: string }) => void): void {
      ipcRenderer.on('speech:error', (_event, data) => callback(data))
    },
    offError(): void {
      ipcRenderer.removeAllListeners('speech:error')
    },
  },
})
