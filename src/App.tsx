import { useState, useEffect, useRef, useCallback } from 'react'
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
  const [script, setScript] = useState(SAMPLE)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(60)
  const [fontSize, setFontSize] = useState(32)
  const [textColor, setTextColor] = useState('#ffffff')
  const [bgColor, setBgColor] = useState('#0a0a0f')
  const [mirror, setMirror] = useState(false)
  const [direction, setDirection] = useState<Direction>('auto')

  const previewRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const lastTimeRef = useRef<number | null>(null)

  const togglePlay = useCallback(() => setIsPlaying(p => !p), [])

  // Space key toggles play/pause (skipped when focus is inside an input/textarea)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (e.code === 'Space' && tag !== 'TEXTAREA' && tag !== 'INPUT' && tag !== 'SELECT') {
        e.preventDefault()
        togglePlay()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay])

  // Smooth scroll loop via requestAnimationFrame
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

  const handleReset = () => {
    setIsPlaying(false)
    if (previewRef.current) previewRef.current.scrollTop = 0
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="brand-dot" />
          <span className="brand-name">TelePrompter</span>
        </div>

        <div className="controls">
          <button
            className={`btn-play${isPlaying ? ' playing' : ''}`}
            onClick={togglePlay}
            title="Play / Pause  [Space]"
          >
            {isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>

          <button className="btn-secondary" onClick={handleReset} title="Return to top">
            ⏮ Reset
          </button>

          <div className="ctrl">
            <label>Speed</label>
            <input
              type="range" min={10} max={300} value={speed}
              onChange={e => setSpeed(+e.target.value)}
              className="slider"
            />
            <span className="val">{speed}</span>
          </div>

          <div className="ctrl">
            <label>Size</label>
            <input
              type="range" min={16} max={96} value={fontSize}
              onChange={e => setFontSize(+e.target.value)}
              className="slider"
            />
            <span className="val">{fontSize}px</span>
          </div>

          <div className="ctrl">
            <label>Text</label>
            <input
              type="color" value={textColor}
              onChange={e => setTextColor(e.target.value)}
              className="cpicker"
              title="Text color"
            />
          </div>

          <div className="ctrl">
            <label>BG</label>
            <input
              type="color" value={bgColor}
              onChange={e => setBgColor(e.target.value)}
              className="cpicker"
              title="Background color"
            />
          </div>

          <button
            className={`btn-toggle${mirror ? ' active' : ''}`}
            onClick={() => setMirror(m => !m)}
            title="Mirror mode"
          >
            ⇔ Mirror
          </button>

          <div className="ctrl">
            <label>Dir</label>
            <select
              value={direction}
              onChange={e => setDirection(e.target.value as Direction)}
              className="sel"
            >
              <option value="auto">Auto</option>
              <option value="ltr">LTR</option>
              <option value="rtl">RTL</option>
            </select>
          </div>

          <span className="hint">Space = play / pause</span>
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
        </section>

        <div className="divider" />

        <section className="panel preview-panel">
          <div className="panel-label">Teleprompter Preview</div>
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
        </section>
      </main>
    </div>
  )
}
