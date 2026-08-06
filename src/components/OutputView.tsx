import { useEffect, useRef, useState, useCallback } from 'react'
import { useSyncChannel } from '../hooks/useSyncChannel'
import { useSettings } from '../contexts/SettingsContext'
import { fontFamilyCss } from '../lib/settings'
import { renderScript } from '../lib/cues'
import type { SyncMessage } from '../lib/types'
import './OutputView.css'

export function OutputView() {
  const { settings } = useSettings()
  const [script, setScript] = useState('')
  const [connected, setConnected] = useState(false)
  const [voiceRatio, setVoiceRatio] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  const sendRef = useRef<(msg: SyncMessage) => void>(() => {})


  const applyRatio = useCallback((ratio: number) => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const el = scrollRef.current
      if (!el) return
      const maxScroll = el.scrollHeight - el.clientHeight
      if (maxScroll > 0) el.scrollTop = ratio * maxScroll
    })
  }, [])

  const send = useSyncChannel(useCallback((msg: SyncMessage) => {
    if (msg.type === 'script') {
      setScript(msg.content)
      setConnected(true)
    } else if (msg.type === 'frame' || msg.type === 'seek') {
      applyRatio(msg.ratio)
    } else if (msg.type === 'voice-pos') {
      setVoiceRatio(msg.ratio)
    } else if (msg.type === 'ping') {
      sendRef.current({ type: 'pong' })
    }
  }, [applyRatio]))

  useEffect(() => {
    sendRef.current = send
  }, [send])

  // Announce presence and request fullscreen on mount
  useEffect(() => {
    send({ type: 'pong' })
    document.documentElement.requestFullscreen?.().catch(() => {})
    return () => cancelAnimationFrame(rafRef.current)
  }, [send])

  return (
    <div className="output-root" style={{ backgroundColor: settings.bgColor }}>
      {!connected && (
        <div className="output-waiting">
          <div className="output-waiting-dot" />
          <span>Waiting for operator…</span>
        </div>
      )}
      <div
        ref={scrollRef}
        className="output-scroll"
        style={{ transform: settings.mirror ? 'scaleX(-1)' : undefined }}
      >
        <div
          className="output-text"
          dir={settings.direction}
          style={{
            color: settings.textColor,
            fontSize: settings.fontSize,
            fontFamily: fontFamilyCss(settings.fontFamily),
            lineHeight: settings.lineHeight,
            letterSpacing: `${settings.letterSpacing}px`,
            textAlign: settings.textAlign,
          }}
        >
          {renderScript(script, voiceRatio !== null
            ? Math.min(
                Math.max(script.split(/\n\n+/).length - 1, 0),
                Math.floor(voiceRatio * script.split(/\n\n+/).length)
              )
            : null
          )}
        </div>
      </div>
    </div>
  )
}
