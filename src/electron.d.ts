// Type declaration for the bridge exposed by electron/preload.ts.
// window.electronAPI is undefined when running in a browser.

interface ElectronAPI {
  readonly isElectron: true
  setPresentingState(isPresenting: boolean): void
  onMenuAction(callback: (action: string) => void): void
  offMenuAction(): void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
