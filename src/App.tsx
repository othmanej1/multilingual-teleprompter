import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import './App.css'

type Direction = 'auto' | 'ltr' | 'rtl'

const SAMPLE = `Welcome to your professional teleprompter.

Paste your script here — it will appear in this preview panel on the right.

مرحباً بك في برنامج قراءة النصوص المحترف.
يمكنك لصق نصوصك هنا وستظهر بشكل صحيح في نافذة المعاينة.

Tips:
• Press Space to play / pause
• Adjust speed and font size with the sliders
• Enable Mirror mode for use with teleprompter glass
• Set direction to RTL for Arabic-only scripts, or leave on Auto for mixed content

Start scrolling when you're ready.`

export default function App() {
  // ── Phase 1 state ───────────────────────────────────────
  const [script, setScript] = useState(SAMPLE)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(60)
  const [fontSize, setFontSize] = useState(32)
  const [textColor, setTextColor] = useState('#ffffff')
  const [bgColor, setBgColor] = useState('#0a0a0f')
  const [mirror, setMirror] = useState(false)
  const [direction, setDirection] = useState<Direction>('auto')

  // ── Phase 2A state ──────────────────────────────────────
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [guideVisible, setGuideVisible] = useState(true)
  const [guideColor, setGuideColor] = useState('#ffffff')
  const [guideOpacity, setGuideOpacity] = useState(0.25)
  const [countdownOption, setCountdownOption] = useState(0) // 0 = off
  const [countdownActive, setCountdownActive] = useState(false)
  const [countdownValue, setCountdownValue] = useState(0)

  const appRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const lastTimeRef = useRef<number | null>(null)

  // ── Script statistics ───────────────────────────────────
  const stats = useMemo(() => {
    const trimmed = script.trim()
    if (!trimmed) return { words: 0, chars: 0, duration: '0s' }
    const words = trimmed.split(/\s+/).length
    const chars = script.length
    const totalSecs = Math.round((words / 130) * 60)
    const mins = Math.floor(totalSecs / 60)
    const secs = totalSecs % 60
    return { words, chars, duration: mins > 0 ? `${mins}m ${secs}s` : `${secs}s` }
  }, [script])

  // ── Play handler — supports countdown ──────────────────
  const handlePlayPress = useCallback(() => {
    if (countdownActive) {
      setCountdownActive(false)
      setCountdownValue(0)
      return
    }
    if (isPlaying) {
      setIsPlaying(false)
      return
    }
    if (countdownOption > 0) {
      setCountdownActive(true)
      setCountdownValue(countdownOption)
    } else {
      setIsPlaying(true)
    }
  }, [isPlaying, countdownActive, countdownOption])

  // ── Countdown tick ──────────────────────────────────────
  useEffect(() => {
    if (!countdownActive) return
    if (countdownValue === 0) {
      setCountdownActive(false)
      setIsPlaying(true)
      return
    }
    const t = setTimeout(() => setCountdownValue(v => v - 1), 1000)
    return () => clearTimeout(t)
  }, [countdownActive, countdownValue])

  // ── Space key ───────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (e.code === 'Space' && tag !== 'TEXTAREA' && tag !== 'INPUT' && tag !== 'SELECT') {
        e.preventDefault()
        handlePlayPress()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handlePlayPress])

  // ── Scroll animation ────────────────────────────────────
  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(rafRef.current)
      lastTimeRef.current = null
      return
    }
    const animate = (ts: number) => {
      if (lastTimeRef.current === null) lastTimeRef.current = ts
      const delta = ts - lastTimeRef.current
      lastTimeRef.current = ts
      const el = previewRef.current
      if (el) {
        el.scrollTop += (speed * delta) / 1000
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
          setIsPlaying(false)
          return
        }
      }
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => {
      cancelAnimationFrame(rafRef.current)
      lastTimeRef.current = null
    }
  }, [isPlaying, speed])

  // ── Fullscreen ──────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      appRef.current?.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }, [])

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // F11 triggers the Fullscreen API (browser's native F11 may still intercept on some OSes)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault()
        toggleFullscreen()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleFullscreen])

  // ── Jump forward / backward ─────────────────────────────
  const jumpBy = useCallback((secs: number) => {
    const el = previewRef.current
    if (!el) return
    el.scrollTop = Math.max(0, el.scrollTop + speed * secs)
  }, [speed])

  // ── Reset ───────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setIsPlaying(false)
    setCountdownActive(false)
    setCountdownValue(0)
    if (previewRef.current) previewRef.current.scrollTop = 0
  }, [])

  const playLabel = countdownActive ? '✕ Cancel' : isPlaying ? '⏸ Pause' : '▶ Play'
  const playClass = `btn-play${isPlaying || countdownActive ? ' playing' : ''}`

  return (
    <div ref={appRef} className={`app${isFullscreen ? ' fullscreen' : ''}`}>
      <header className="header">

        {/* ── Row 1: Playback + transport + fullscreen ── */}
        <div className="header-row">
          <div className="brand">
            <span className="brand-dot" />
            <span className="brand-name">TelePrompter</span>
          </div>

          <div className="sep" />

          <button className={playClass} onClick={handlePlayPress} title="Play / Pause [Space]">
            {playLabel}
          </button>
          <button className="btn-secondary" onClick={() => jumpBy(-5)} title="Jump back 5 seconds">
            ⏪ −5s
          </button>
          <button className="btn-secondary" onClick={() => jumpBy(5)} title="Jump forward 5 seconds">
            ⏩ +5s
          </button>
          <button className="btn-secondary" onClick={handleReset} title="Reset to top">
            ⏮ Reset
          </button>

          <div className="ctrl">
            <label>Countdown</label>
            <select value={countdownOption}
              onChange={e => setCountdownOption(+e.target.value)} className="sel">
              <option value={0}>Off</option>
              <option value={3}>3s</option>
              <option value={5}>5s</option>
              <option value={10}>10s</option>
            </select>
          </div>

          <div className="sep" />

          <div className="ctrl">
            <label>Speed</label>
            <input type="range" min={10} max={300} value={speed}
              onChange={e => setSpeed(+e.target.value)} className="slider" />
            <span className="val">{speed}</span>
          </div>

          <div className="ctrl">
            <label>Size</label>
            <input type="range" min={16} max={96} value={fontSize}
              onChange={e => setFontSize(+e.target.value)} className="slider" />
            <span className="val">{fontSize}px</span>
          </div>

          <div className="sep" />

          <button
            className={`btn-toggle${isFullscreen ? ' active' : ''}`}
            onClick={toggleFullscreen}
            title="Fullscreen [F11]"
          >
            {isFullscreen ? '⛶ Exit' : '⛶ Full'}
          </button>
        </div>

        {/* ── Row 2: Appearance + reading guide ── */}
        <div className="header-row">
          <div className="ctrl">
            <label>Text</label>
            <input type="color" value={textColor}
              onChange={e => setTextColor(e.target.value)} className="cpicker" />
          </div>

          <div className="ctrl">
            <label>BG</label>
            <input type="color" value={bgColor}
              onChange={e => setBgColor(e.target.value)} className="cpicker" />
          </div>

          <button className={`btn-toggle${mirror ? ' active' : ''}`}
            onClick={() => setMirror(m => !m)} title="Mirror mode">
            ⇔ Mirror
          </button>

          <div className="ctrl">
            <label>Dir</label>
            <select value={direction}
              onChange={e => setDirection(e.target.value as Direction)} className="sel">
              <option value="auto">Auto</option>
              <option value="ltr">LTR</option>
              <option value="rtl">RTL</option>
            </select>
          </div>

          <div className="sep" />

          <button className={`btn-toggle${guideVisible ? ' active' : ''}`}
            onClick={() => setGuideVisible(v => !v)} title="Reading guide line">
            ― Guide
          </button>

          {guideVisible && (
            <>
              <div className="ctrl">
                <label>Line</label>
                <input type="color" value={guideColor}
                  onChange={e => setGuideColor(e.target.value)} className="cpicker" />
              </div>
              <div className="ctrl">
                <label>Opacity</label>
                <input type="range" min={0.05} max={1} step={0.05} value={guideOpacity}
                  onChange={e => setGuideOpacity(+e.target.value)} className="slider" />
                <span className="val">{Math.round(guideOpacity * 100)}%</span>
              </div>
            </>
          )}

          <span className="hint">Space = play/pause · F11 = fullscreen</span>
        </div>
      </header>

      <main className="main">
        <section className="panel editor-panel">
          <div className="panel-label">Script Editor</div>
          <textarea
            className="script-editor"
            value={script}
            onChange={e => setScript(e.target.value)}
            placeholder="Paste your script here…"
            spellCheck={false}
          />
          <div className="stats-bar">
            <span>{stats.words.toLocaleString()} words</span>
            <span>{stats.chars.toLocaleString()} chars</span>
            <span>~{stats.duration} to read</span>
          </div>
        </section>

        <div className="divider" />

        <section className="panel preview-panel">
          <div className="panel-label">Teleprompter Preview</div>
          <div className="teleprompter-wrap">
            <div
              ref={previewRef}
              className="teleprompter"
              style={{
                backgroundColor: bgColor,
                transform: mirror ? 'scaleX(-1)' : undefined,
              }}
            >
              <div
                className="tp-text"
                dir={direction}
                style={{ color: textColor, fontSize }}
              >
                {script || 'Your script will appear here…'}
              </div>
            </div>

            {guideVisible && (
              <div
                className="reading-guide"
                style={{ backgroundColor: guideColor, opacity: guideOpacity }}
              />
            )}

            {countdownActive && countdownValue > 0 && (
              <div className="countdown-overlay">
                <span className="countdown-number" key={countdownValue}>
                  {countdownValue}
                </span>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
