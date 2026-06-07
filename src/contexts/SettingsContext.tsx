import {
  createContext, useContext, useState, useEffect, useCallback, useRef,
  type ReactNode,
} from 'react'
import type { TypographySettings, SyncMessage } from '../lib/types'
import { loadSettings, persistSettings } from '../lib/settings'

interface SettingsContextValue {
  settings: TypographySettings
  update: (patch: Partial<TypographySettings>) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

const CHANNEL_NAME = 'tp_output_sync'

export function SettingsProvider({
  isOutputMode,
  children,
}: {
  isOutputMode: boolean
  children: ReactNode
}) {
  const [settings, setSettings] = useState<TypographySettings>(loadSettings)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings // always current in async callbacks

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const isInitialMount = useRef(true)

  // Debounced localStorage persistence (main window only)
  useEffect(() => {
    if (isInitialMount.current) { isInitialMount.current = false; return }
    if (isOutputMode) return
    clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(() => persistSettings(settings), 300)
    return () => clearTimeout(persistTimerRef.current)
  }, [settings, isOutputMode])

  // BroadcastChannel: handles settings-full / settings-patch / pong
  useEffect(() => {
    const ch = new BroadcastChannel(CHANNEL_NAME)
    channelRef.current = ch

    ch.onmessage = (e: MessageEvent<SyncMessage>) => {
      const msg = e.data
      if (msg.type === 'pong' && !isOutputMode) {
        // Output window connected — push current settings immediately
        ch.postMessage({
          type: 'settings-full',
          settings: settingsRef.current,
        } as SyncMessage)
      } else if (msg.type === 'settings-full' && isOutputMode) {
        setSettings(msg.settings)
      } else if (msg.type === 'settings-patch') {
        // Both windows apply patches (bidirectional support)
        setSettings(prev => ({ ...prev, ...msg.patch }))
      }
    }

    return () => {
      ch.close()
      channelRef.current = null
    }
  }, [isOutputMode])

  // update() is the single mutation point: updates state + broadcasts patch + no debounce needed
  // (persistence is handled by the debounced effect above)
  const update = useCallback((patch: Partial<TypographySettings>) => {
    setSettings(prev => ({ ...prev, ...patch }))
    channelRef.current?.postMessage({ type: 'settings-patch', patch } as SyncMessage)
  }, [])

  return (
    <SettingsContext.Provider value={{ settings, update }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}
