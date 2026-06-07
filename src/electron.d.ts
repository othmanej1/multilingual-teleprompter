// Type declaration for the bridge exposed by electron/preload.ts.
// window.electronAPI is undefined when running in a browser.

interface ElectronSpeechBridge {
  check(lang: string): Promise<{ available: boolean; modelPath: string; missingFiles?: string[] }>
  getModelsBasePath(): Promise<string>
  start(lang: string): Promise<{ ok: boolean; error?: string }>
  stop(): Promise<void>
  sendAudio(samples: Float32Array): void
  onResult(callback: (data: { text: string; isFinal: boolean; segment: number }) => void): void
  offResult(): void
  onError(callback: (data: { message: string }) => void): void
  offError(): void
}

interface ElectronAPI {
  readonly isElectron: true
  setPresentingState(isPresenting: boolean): void
  onMenuAction(callback: (action: string) => void): void
  offMenuAction(): void
  getVersion(): Promise<string>
  getUserDataPath(): Promise<string>
  openUserDataFolder(): void
  speech: ElectronSpeechBridge
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
