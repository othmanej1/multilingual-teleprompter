import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import './App.css'
import { ScriptLibrary } from './components/ScriptLibrary'
import { OperatorDashboard } from './components/OperatorDashboard'
import { VoiceTracker } from './components/VoiceTracker'
import { PlaylistPanel } from './components/PlaylistPanel'
import { VersionPanel } from './components/VersionPanel'
import { useSyncChannel } from './hooks/useSyncChannel'
import { useVoiceTracking } from './hooks/useVoiceTracking'
import { useFolders } from './hooks/useFolders'
import { usePlaylists } from './hooks/usePlaylists'
import { useVersions } from './hooks/useVersions'
import { useSettings } from './contexts/SettingsContext'
import { FONT_FAMILY_OPTIONS, fontFamilyCss } from './lib/settings'
import { renderScript, countCues } from './lib/cues'
import {
  loadScripts, persistScripts, loadActiveId, persistActiveId, makeScript,
  loadScrollPositions, saveScrollPosition,
} from './lib/storage'
import type { Script, Playlist, ScriptVersion, SaveStatus, SyncMessage } from './lib/types'

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

function bootstrapScripts(): Script[] {
  const saved = loadScripts()
  if (saved.length > 0) return saved
  const first = makeScript('Welcome Script', SAMPLE)
  persistScripts([first])
  return [first]
}

function bootstrapActiveId(): string {
  const scripts = loadScripts()
  const saved = loadActiveId()
  return (saved && scripts.some(s => s.id === saved)) ? saved : (scripts[0]?.id ?? '')
}

function fmtDate(ts: number): string {
  const d = new Date(ts)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric'
  return d.toLocaleDateString('en', opts)
}

// Workspace persistence keys
const LS_EDITOR_WIDTH     = 'tp_editor_width'
const LS_EDITOR_COLLAPSED = 'tp_editor_collapsed'
const LS_FOCUS_MODE       = 'tp_focus_mode'
const LS_NOTES_OPEN       = 'tp_notes_open'
const LS_HIGH_CONTRAST    = 'tp_high_contrast'
const LS_VOICE_ANCHOR     = 'tp_voice_anchor'
const LS_VOICE_ZONE       = 'tp_voice_zone'
const LS_VOICE_AUTOCTR    = 'tp_voice_autoctr'

const EDITOR_MIN_W = 280
const EDITOR_MAX_W = 720
const EDITOR_DEFAULT_W = 480

function loadEditorWidth(): number {
  const raw = localStorage.getItem(LS_EDITOR_WIDTH)
  if (!raw) return EDITOR_DEFAULT_W
  const n = parseInt(raw, 10)
  return isNaN(n) ? EDITOR_DEFAULT_W : Math.max(EDITOR_MIN_W, Math.min(EDITOR_MAX_W, n))
}

export default function App() {
  const { settings, update } = useSettings()

  // ── Script management ──────────────────────────────────
  const [scripts, setScripts] = useState<Script[]>(bootstrapScripts)
  const [activeId, setActiveId] = useState<string>(bootstrapActiveId)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [titleEditing, setTitleEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')

  const saveTimerRef  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const isInitialMount = useRef(true)
  const fileInputRef   = useRef<HTMLInputElement>(null)

  // ── Playback ───────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(60)

  // ── Fullscreen / guide / countdown ────────────────────
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [guideVisible, setGuideVisible] = useState(true)
  const [guideColor, setGuideColor] = useState('#ffffff')
  const [guideOpacity, setGuideOpacity] = useState(0.25)
  const [countdownOption, setCountdownOption] = useState(0)
  const [countdownActive, setCountdownActive] = useState(false)
  const [countdownValue, setCountdownValue] = useState(0)

  // ── Settings panel (collapsible row 3) ────────────────
  const [settingsOpen, setSettingsOpen] = useState(false)

  // ── Side panels ────────────────────────────────────────
  const [dashboardOpen, setDashboardOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [userDataPath, setUserDataPath] = useState('')
  const [playlistOpen, setPlaylistOpen] = useState(false)
  const [versionOpen, setVersionOpen] = useState(false)
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null)
  const [playlistIdx, setPlaylistIdx] = useState(0)
  const [voiceAnchorPct, setVoiceAnchorPct] = useState(() => {
    const v = parseInt(localStorage.getItem(LS_VOICE_ANCHOR) ?? '', 10)
    return isNaN(v) ? 45 : Math.max(30, Math.min(70, v))
  })
  const [voiceZonePct, setVoiceZonePct] = useState(() => {
    const v = parseInt(localStorage.getItem(LS_VOICE_ZONE) ?? '', 10)
    return isNaN(v) ? 10 : Math.max(2, Math.min(20, v))
  })
  const [voiceAutoCenter, setVoiceAutoCenter] = useState(() =>
    localStorage.getItem(LS_VOICE_AUTOCTR) !== 'false'
  )
  const [highContrast, setHighContrast] = useState(() =>
    localStorage.getItem(LS_HIGH_CONTRAST) === 'true'
  )
  const [outputConnected, setOutputConnected] = useState(false)
  const [scrollRatio, setScrollRatio] = useState(0)

  // ── Workspace ergonomics — persisted ──────────────────
  const [editorWidth, setEditorWidth] = useState(loadEditorWidth)
  const [editorCollapsed, setEditorCollapsed] = useState(
    () => localStorage.getItem(LS_EDITOR_COLLAPSED) === 'true',
  )
  const [focusMode, setFocusMode] = useState(
    () => localStorage.getItem(LS_FOCUS_MODE) === 'true',
  )
  const [notesOpen, setNotesOpen] = useState(
    () => localStorage.getItem(LS_NOTES_OPEN) === 'true',
  )
  const [isDragging, setIsDragging] = useState(false)

  // ── Refs ───────────────────────────────────────────────
  const outputWindowRef  = useRef<Window | null>(null)
  const scrollRatioRef   = useRef(0)
  const dashboardTickRef = useRef(0)
  const sendSyncRef      = useRef<(msg: SyncMessage) => void>(() => {})

  const voiceTargetRatioRef = useRef<number | null>(null)
  const voiceEnabledRef     = useRef(false)
  const voiceGraceUntilRef  = useRef(0)
  const scriptRef           = useRef('')

  const appRef        = useRef<HTMLDivElement>(null)
  const previewRef    = useRef<HTMLDivElement>(null)
  const textRef       = useRef<HTMLDivElement>(null)
  const rafRef        = useRef<number>(0)
  const contentTopRef = useRef(64)  // padding-top of .teleprompter (px), cached by ResizeObserver
  const textHeightRef = useRef(0)   // .tp-text offsetHeight, updated by ResizeObserver
  const lastTimeRef = useRef<number | null>(null)

  const autoPlayRef         = useRef(false)
  const sessionVersionedRef = useRef<Set<string>>(new Set())
  const activePlaylistIdRef = useRef<string | null>(null)
  const playlistsRef        = useRef<Playlist[]>([])
  const playlistIdxRef      = useRef(0)
  const activeScriptRef     = useRef<Script | undefined>(undefined)
  const voiceAnchorPctRef   = useRef(45)
  const voiceZonePctRef     = useRef(10)
  const voiceAutoCenterRef  = useRef(true)

  // ── Derived ────────────────────────────────────────────
  const activeScript = scripts.find(s => s.id === activeId) ?? scripts[0]
  const script = activeScript?.content ?? ''
  scriptRef.current = script
  activeScriptRef.current = activeScript
  voiceAnchorPctRef.current  = voiceAnchorPct
  voiceZonePctRef.current    = voiceZonePct
  voiceAutoCenterRef.current = voiceAutoCenter

  const stats = useMemo(() => {
    const trimmed = script.trim()
    if (!trimmed) return { words: 0, chars: 0, duration: '0s', totalSecs: 0 }
    const words = trimmed.split(/\s+/).length
    const chars = script.length
    const totalSecs = Math.round((words / 130) * 60)
    const mins = Math.floor(totalSecs / 60)
    const secs = totalSecs % 60
    return { words, chars, duration: mins > 0 ? `${mins}m ${secs}s` : `${secs}s`, totalSecs }
  }, [script])

  const cueCount = useMemo(() => countCues(script), [script])

  // ── Phase 6 hooks ──────────────────────────────────────
  const { folders, createFolder, renameFolder, deleteFolder } = useFolders()
  const {
    playlists, createPlaylist, renamePlaylist, deletePlaylist,
    addScript: addToPlaylist, removeScript: removeFromPlaylist,
    moveScript: moveInPlaylist, removeScriptFromAll,
  } = usePlaylists()
  const { versions, saveVersion, deleteVersion, pruneForScript } = useVersions()

  // Keep refs in sync for RAF closure (avoids stale captures)
  activePlaylistIdRef.current = activePlaylistId
  playlistsRef.current        = playlists
  playlistIdxRef.current      = playlistIdx

  // ── Voice tracking ─────────────────────────────────────
  const voice = useVoiceTracking(script)
  const voiceActive = voice.status === 'listening'
  voiceTargetRatioRef.current = voice.targetRatio
  voiceEnabledRef.current = voiceActive

  // Paragraph index corresponding to the current voice position (for active highlight)
  const voiceActivePara = useMemo(() => {
    if (voice.targetRatio === null || !script.trim()) return null
    const paragraphs = script.split(/\n\n+/)
    return Math.min(paragraphs.length - 1, Math.floor(voice.targetRatio * paragraphs.length))
  }, [voice.targetRatio, script])

  // ── Workspace persistence ──────────────────────────────
  useEffect(() => {
    localStorage.setItem(LS_EDITOR_WIDTH, String(editorWidth))
  }, [editorWidth])

  useEffect(() => {
    localStorage.setItem(LS_EDITOR_COLLAPSED, String(editorCollapsed))
  }, [editorCollapsed])

  useEffect(() => {
    localStorage.setItem(LS_FOCUS_MODE, String(focusMode))
  }, [focusMode])

  useEffect(() => {
    localStorage.setItem(LS_NOTES_OPEN, String(notesOpen))
  }, [notesOpen])

  useEffect(() => { localStorage.setItem(LS_VOICE_ANCHOR, String(voiceAnchorPct)) }, [voiceAnchorPct])
  useEffect(() => { localStorage.setItem(LS_VOICE_ZONE, String(voiceZonePct)) }, [voiceZonePct])
  useEffect(() => { localStorage.setItem(LS_VOICE_AUTOCTR, String(voiceAutoCenter)) }, [voiceAutoCenter])

  // ── Content metrics for accurate voice anchor formula ──
  // Caches .teleprompter padding-top and .tp-text height to avoid reflow in the RAF loop.
  // ResizeObserver fires on font/content/window-size changes that alter text height.
  useEffect(() => {
    const el = previewRef.current
    const textEl = textRef.current
    if (!el || !textEl) return
    contentTopRef.current = parseFloat(getComputedStyle(el).paddingTop) || 64
    textHeightRef.current = textEl.offsetHeight
    const ro = new ResizeObserver(() => {
      textHeightRef.current = textRef.current?.offsetHeight ?? 0
    })
    ro.observe(textEl)
    return () => ro.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── BroadcastChannel ───────────────────────────────────
  const sendSync = useSyncChannel(useCallback((msg: SyncMessage) => {
    if (msg.type === 'pong') {
      setOutputConnected(true)
      sendSyncRef.current({ type: 'script', content: scriptRef.current })
    }
  }, []))

  useEffect(() => { sendSyncRef.current = sendSync }, [sendSync])

  useEffect(() => {
    if (!outputConnected) return
    sendSyncRef.current({ type: 'script', content: script })
  }, [script, outputConnected])

  useEffect(() => {
    if (!outputConnected) return
    const id = setInterval(() => sendSyncRef.current({ type: 'ping' }), 3000)
    return () => clearInterval(id)
  }, [outputConnected])

  // Sync voice position to output window for active paragraph highlight
  useEffect(() => {
    if (!outputConnected) return
    sendSyncRef.current({ type: 'voice-pos', ratio: voiceActive ? voice.targetRatio : null })
  }, [voice.targetRatio, outputConnected, voiceActive])

  // ── Output window ──────────────────────────────────────
  const openOutputWindow = useCallback(() => {
    if (outputWindowRef.current && !outputWindowRef.current.closed) {
      outputWindowRef.current.focus()
      return
    }
    // Strip any existing query/hash so the URL is always clean.
    // window.location.href works for both http:// (dev) and
    // file:// (Electron production) — origin alone is "null" for file://.
    const base = window.location.href.replace(/[?#].*$/, '')
    const win = window.open(
      `${base}?output=1`,
      'tp_output',
      'popup,width=1280,height=720',
    )
    if (win) {
      outputWindowRef.current = win
      setOutputConnected(false)
      const poll = setInterval(() => {
        if (win.closed) {
          clearInterval(poll)
          setOutputConnected(false)
          outputWindowRef.current = null
        }
      }, 1000)
    }
  }, [])

  // ── Auto-save ──────────────────────────────────────────
  useEffect(() => {
    if (isInitialMount.current) { isInitialMount.current = false; return }
    setSaveStatus('saving')
    clearTimeout(saveTimerRef.current)
    clearTimeout(savedTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      persistScripts(scripts)
      persistActiveId(activeId)
      setSaveStatus('saved')
      savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
    }, 800)
    return () => {
      clearTimeout(saveTimerRef.current)
      clearTimeout(savedTimerRef.current)
    }
  }, [scripts, activeId])

  // ── Scroll position memory ────────────────────────────
  // Cleanup runs before each script switch (and on unmount), saving the
  // outgoing ratio. The effect body restores the saved ratio for the new
  // script; RAF defers the DOM write until after React commits new content.
  useEffect(() => {
    const savedRatio = loadScrollPositions()[activeId] ?? 0

    setIsPlaying(false)
    setCountdownActive(false)
    setCountdownValue(0)
    setScrollRatio(savedRatio)
    scrollRatioRef.current = savedRatio

    if (previewRef.current) previewRef.current.scrollTop = 0
    if (savedRatio > 0) {
      requestAnimationFrame(() => {
        const el = previewRef.current
        if (!el) return
        const maxScroll = el.scrollHeight - el.clientHeight
        el.scrollTop = savedRatio * maxScroll
      })
    }

    // Playlist auto-advance: resume playback after brief pause to let new content render
    if (autoPlayRef.current) {
      autoPlayRef.current = false
      setTimeout(() => setIsPlaying(true), 800)
    }

    return () => { saveScrollPosition(activeId, scrollRatioRef.current) }
  }, [activeId])

  // Keep scrollRatioRef current during manual scroll (wheel, trackpad, drag)
  // so saves always capture the real position, not just the playback position.
  useEffect(() => {
    const el = previewRef.current
    if (!el) return
    const onScroll = () => {
      const maxScroll = el.scrollHeight - el.clientHeight
      if (maxScroll > 0) scrollRatioRef.current = el.scrollTop / maxScroll
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, []) // previewRef.current is stable after mount

  // Pinch-to-zoom: two-finger pinch on the preview scales font size.
  // fontSizeRef always holds the current value so touchstart sees it fresh.
  const fontSizeRef = useRef(settings.fontSize)
  fontSizeRef.current = settings.fontSize

  useEffect(() => {
    const el = previewRef.current
    if (!el) return

    let initDist = 0
    let initFontSize = 0

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        initDist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY,
        )
        initFontSize = fontSizeRef.current
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || initDist === 0) return
      e.preventDefault() // block browser pinch-to-zoom on this element
      const dist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY,
      )
      const newSize = Math.round(Math.max(16, Math.min(96, initFontSize * (dist / initDist))))
      update({ fontSize: newSize })
    }

    const onTouchEnd = () => { initDist = 0 }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [update])

  // Save on browser close / refresh
  useEffect(() => {
    const save = () => saveScrollPosition(activeId, scrollRatioRef.current)
    window.addEventListener('beforeunload', save)
    return () => window.removeEventListener('beforeunload', save)
  }, [activeId])

  // Persist high-contrast preference
  useEffect(() => {
    if (highContrast) localStorage.setItem(LS_HIGH_CONTRAST, 'true')
    else localStorage.removeItem(LS_HIGH_CONTRAST)
  }, [highContrast])

  // ── Script CRUD ────────────────────────────────────────
  const patchScript = useCallback((id: string, patch: Partial<Script>) => {
    setScripts(prev => prev.map(s =>
      s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s,
    ))
  }, [])

  const setScript = useCallback((content: string) => {
    // Auto-snapshot once per session at the first edit — captures state before editing begins
    if (!sessionVersionedRef.current.has(activeId) && activeScriptRef.current?.content.trim()) {
      sessionVersionedRef.current.add(activeId)
      saveVersion(activeId, activeScriptRef.current.content, '')
    }
    patchScript(activeId, { content })
  }, [activeId, patchScript, saveVersion])

  const createNewScript = useCallback(() => {
    const s = makeScript('Untitled Script', '')
    setScripts(prev => [s, ...prev])
    setActiveId(s.id)
    setLibraryOpen(true)
  }, [])

  const duplicateScript = useCallback((id: string) => {
    const src = scripts.find(s => s.id === id)
    if (!src) return
    const copy = makeScript(`${src.title} (copy)`, src.content)
    setScripts(prev => {
      const idx = prev.findIndex(x => x.id === id)
      const next = [...prev]
      next.splice(idx + 1, 0, copy)
      return next
    })
    setActiveId(copy.id)
  }, [scripts])

  const renameScript = useCallback((id: string, title: string) => {
    patchScript(id, { title: title.trim() || 'Untitled Script' })
  }, [patchScript])

  const deleteScript = useCallback((id: string) => {
    pruneForScript(id)
    removeScriptFromAll(id)
    const idx = scripts.findIndex(s => s.id === id)
    const remaining = scripts.filter(s => s.id !== id)
    if (remaining.length === 0) {
      const fresh = makeScript('Untitled Script', '')
      setScripts([fresh])
      setActiveId(fresh.id)
      return
    }
    setScripts(remaining)
    if (id === activeId) {
      setActiveId((remaining[Math.max(0, idx - 1)] ?? remaining[0]).id)
    }
  }, [scripts, activeId, pruneForScript, removeScriptFromAll])

  // ── Import / Export ────────────────────────────────────
  const importFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = e => {
      const content = (e.target?.result as string) ?? ''
      const title = file.name.replace(/\.(txt|md)$/i, '')
      const s = makeScript(title, content)
      setScripts(prev => [s, ...prev])
      setActiveId(s.id)
      setLibraryOpen(true)
    }
    reader.readAsText(file, 'utf-8')
  }, [])

  const exportScript = useCallback((format: 'txt' | 'md') => {
    if (!activeScript) return
    const content = format === 'md'
      ? `# ${activeScript.title}\n\n${activeScript.content}`
      : activeScript.content
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeScript.title}.${format}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [activeScript])

  // ── Play / pause ───────────────────────────────────────
  const handlePlayPress = useCallback(() => {
    if (countdownActive) {
      setCountdownActive(false)
      setCountdownValue(0)
      return
    }
    if (isPlaying) { setIsPlaying(false); return }
    if (countdownOption > 0) {
      setCountdownActive(true)
      setCountdownValue(countdownOption)
    } else {
      setIsPlaying(true)
    }
  }, [isPlaying, countdownActive, countdownOption])

  useEffect(() => {
    if (!countdownActive) return
    if (countdownValue === 0) { setCountdownActive(false); setIsPlaying(true); return }
    const t = setTimeout(() => setCountdownValue(v => v - 1), 1000)
    return () => clearTimeout(t)
  }, [countdownActive, countdownValue])

  // ── Space key ──────────────────────────────────────────
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

  // ── RAF scroll animation ───────────────────────────────
  useEffect(() => {
    if (!isPlaying && !voiceActive) {
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
        if (isPlaying) el.scrollTop += (speed * delta) / 1000
        const maxScroll = el.scrollHeight - el.clientHeight
        const vtRatio = voiceTargetRatioRef.current
        if (voiceEnabledRef.current && vtRatio !== null && maxScroll > 0 && ts > voiceGraceUntilRef.current && voiceAutoCenterRef.current) {
          // Compute word pixel position within the scroll container using cached content metrics.
          // contentTopRef = padding-top of .teleprompter (64px); textHeightRef = .tp-text height.
          // This avoids the scrollHeight approximation that over-shoots for vtRatio > 0.6
          // because scrollHeight includes 64px top padding + 60vh bottom padding with no words.
          const anchorFraction = voiceAnchorPctRef.current / 100
          const textH = textHeightRef.current > 0 ? textHeightRef.current : el.scrollHeight
          const wordPixelPos = contentTopRef.current + vtRatio * textH
          const targetScrollTop = Math.max(0, Math.min(maxScroll,
            wordPixelPos - anchorFraction * el.clientHeight
          ))
          // Reading zone: only correct when text has drifted outside the zone
          const zoneHalf = (voiceZonePctRef.current / 100) * el.clientHeight
          const diff = targetScrollTop - el.scrollTop
          const absDiff = Math.abs(diff)
          if (absDiff > zoneHalf) {
            const maxStep = Math.min(absDiff * 0.5, 300) * delta / 1000
            el.scrollTop += Math.sign(diff) * maxStep
          }
        }
        const ratio = maxScroll > 0 ? el.scrollTop / maxScroll : 0
        if (outputConnected) sendSyncRef.current({ type: 'frame', ratio })
        scrollRatioRef.current = ratio
        if (ts - dashboardTickRef.current > 100) {
          setScrollRatio(ratio)
          dashboardTickRef.current = ts
        }
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
          const aplId = activePlaylistIdRef.current
          if (aplId) {
            const pl = playlistsRef.current.find(p => p.id === aplId)
            const idx = playlistIdxRef.current
            if (pl && idx < pl.scriptIds.length - 1) {
              const nextIdx = idx + 1
              setPlaylistIdx(nextIdx)
              setActiveId(pl.scriptIds[nextIdx])
              autoPlayRef.current = true
              setScrollRatio(1)
              return
            }
            setActivePlaylistId(null)
          }
          setIsPlaying(false)
          setScrollRatio(1)
          return
        }
      }
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => { cancelAnimationFrame(rafRef.current); lastTimeRef.current = null }
  }, [isPlaying, speed, outputConnected, voiceActive])

  // ── Fullscreen ─────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) appRef.current?.requestFullscreen()
    else document.exitFullscreen()
  }, [])

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F11') { e.preventDefault(); toggleFullscreen() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleFullscreen])

  // ── Jump / Reset ───────────────────────────────────────
  const jumpBy = useCallback((secs: number) => {
    voiceGraceUntilRef.current = performance.now() + 2000
    const el = previewRef.current
    if (!el) return
    el.scrollTop = Math.max(0, el.scrollTop + speed * secs)
    const maxScroll = el.scrollHeight - el.clientHeight
    const ratio = maxScroll > 0 ? el.scrollTop / maxScroll : 0
    scrollRatioRef.current = ratio
    setScrollRatio(ratio)
    if (outputConnected) sendSyncRef.current({ type: 'seek', ratio })
  }, [speed, outputConnected])

  const handleReset = useCallback(() => {
    voiceGraceUntilRef.current = performance.now() + 2000
    setIsPlaying(false)
    setCountdownActive(false)
    setCountdownValue(0)
    setScrollRatio(0)
    scrollRatioRef.current = 0
    if (previewRef.current) previewRef.current.scrollTop = 0
    if (outputConnected) sendSyncRef.current({ type: 'seek', ratio: 0 })
    saveScrollPosition(activeId, 0)  // clear saved position on explicit reset
  }, [outputConnected, activeId])

  // ── Phase 6 handlers ──────────────────────────────────

  const handleDeleteFolder = useCallback((id: string) => {
    // Move all scripts in that folder to uncategorized before deleting the folder
    setScripts(prev => prev.map(s => s.folderId === id ? { ...s, folderId: null } : s))
    deleteFolder(id)
  }, [deleteFolder])

  const handleMoveToFolder = useCallback((scriptId: string, folderId: string | null) => {
    patchScript(scriptId, { folderId })
  }, [patchScript])

  const handleActivatePlaylist = useCallback((playlistId: string) => {
    const pl = playlists.find(p => p.id === playlistId)
    if (!pl || pl.scriptIds.length === 0) return
    setActivePlaylistId(playlistId)
    setPlaylistIdx(0)
    setActiveId(pl.scriptIds[0])
  }, [playlists])

  const handleDeactivatePlaylist = useCallback(() => {
    setActivePlaylistId(null)
  }, [])

  const handleRestoreVersion = useCallback((v: ScriptVersion) => {
    // Save current content before overwriting
    saveVersion(activeId, script, '(before restore)')
    patchScript(activeId, { content: v.content })
  }, [activeId, script, saveVersion, patchScript])

  // ── Cue navigation ────────────────────────────────────
  const jumpToCue = useCallback((direction: 'prev' | 'next') => {
    const el = previewRef.current
    if (!el) return
    const cueEls = Array.from(el.querySelectorAll<HTMLElement>('.tp-cue'))
    if (cueEls.length === 0) return

    voiceGraceUntilRef.current = performance.now() + 2000
    const elRect = el.getBoundingClientRect()
    // Compute each cue's position within the scrollable container
    const cueScrollTops = cueEls.map(c =>
      c.getBoundingClientRect().top - elRect.top + el.scrollTop
    )
    const maxScroll = el.scrollHeight - el.clientHeight
    if (maxScroll <= 0) return

    let target: number | undefined
    if (direction === 'next') {
      target = cueScrollTops.find(t => t > el.scrollTop + 20)
    } else {
      const prev = cueScrollTops.filter(t => t < el.scrollTop - 20)
      target = prev[prev.length - 1]
    }
    if (target === undefined) return

    const clipped = Math.max(0, Math.min(target, maxScroll))
    const ratio = clipped / maxScroll
    el.scrollTop = clipped
    scrollRatioRef.current = ratio
    setScrollRatio(ratio)
    if (outputConnected) sendSyncRef.current({ type: 'seek', ratio })
  }, [outputConnected])

  // ── Cue keyboard shortcuts ────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return
      if (e.key === '[') { e.preventDefault(); jumpToCue('prev') }
      if (e.key === ']') { e.preventDefault(); jumpToCue('next') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [jumpToCue])

  // ── Shortcuts / About overlay: ? to toggle, Escape to close ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShortcutsOpen(false); setAboutOpen(false); return }
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return
      if (e.key === '?') { e.preventDefault(); setShortcutsOpen(o => !o) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── About dialog: load userData path on first open ────
  useEffect(() => {
    if (!aboutOpen || userDataPath) return
    window.electronAPI?.getUserDataPath().then(p => setUserDataPath(p)).catch(() => {})
  }, [aboutOpen, userDataPath])

  // ── Title inline editing ───────────────────────────────
  const startTitleEdit = () => {
    setDraftTitle(activeScript?.title ?? '')
    setTitleEditing(true)
  }
  const commitTitleEdit = () => {
    renameScript(activeId, draftTitle)
    setTitleEditing(false)
  }

  // ── Resizable divider drag ─────────────────────────────
  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    if (editorCollapsed) return
    e.preventDefault()

    const startX = e.clientX
    const startW = editorWidth

    const onMove = (ev: MouseEvent) => {
      const maxW = Math.min(EDITOR_MAX_W, window.innerWidth * 0.58)
      setEditorWidth(Math.max(EDITOR_MIN_W, Math.min(maxW, startW + ev.clientX - startX)))
    }
    const onUp = () => {
      setIsDragging(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    setIsDragging(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [editorCollapsed, editorWidth])

  // ── Focus Mode ─────────────────────────────────────────
  const handleFocusMode = useCallback(() => {
    setFocusMode(prev => {
      if (!prev) setLibraryOpen(false) // entering focus: hide library
      return !prev
    })
  }, [])

  const isActive = isPlaying || countdownActive

  // ── Electron: notify main process of presenting state ──
  // This enables the close-while-presenting confirmation dialog.
  // No-op in browser (window.electronAPI is undefined).
  useEffect(() => {
    window.electronAPI?.setPresentingState(isActive)
  }, [isActive])

  // ── Electron: native menu → renderer action bridge ─────
  // A ref holds the latest handlers so the IPC listener (registered once
  // on mount) always calls the current callback without stale closures.
  const menuHandlerRef = useRef<(action: string) => void>(() => {})
  // Update ref every render so the IPC listener always calls the latest handlers
  menuHandlerRef.current = (action: string) => {
    switch (action) {
      case 'new-script':         createNewScript(); break
      case 'toggle-library':     setLibraryOpen(o => !o); break
      case 'play-pause':         handlePlayPress(); break
      case 'reset':              handleReset(); break
      case 'focus-mode':         handleFocusMode(); break
      case 'toggle-appearance':  setSettingsOpen(o => !o); break
      case 'open-output':        openOutputWindow(); break
      case 'prev-cue':           jumpToCue('prev'); break
      case 'next-cue':           jumpToCue('next'); break
      case 'show-shortcuts':     setShortcutsOpen(true); break
      case 'show-about':         setAboutOpen(true); break
    }
  }

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return
    api.onMenuAction(action => menuHandlerRef.current(action))
    return () => api.offMenuAction()
  }, []) // Register once; the ref always holds the latest handlers

  // ── Progress readout ───────────────────────────────────
  const pct = Math.round(scrollRatio * 100)
  const remainSecs = Math.max(0, Math.round(stats.totalSecs * (1 - scrollRatio)))
  const remainStr = remainSecs === 0
    ? 'Complete'
    : remainSecs >= 60
      ? `~${Math.floor(remainSecs / 60)}m ${remainSecs % 60}s left`
      : `~${remainSecs}s left`

  const appClass = [
    'app',
    isFullscreen ? 'fullscreen' : '',
    focusMode ? 'focus-mode' : '',
    highContrast ? 'high-contrast' : '',
  ].filter(Boolean).join(' ')

  return (
    <div ref={appRef} className={appClass}>
      <header className="header">

        {/* ── Row 1: App bar ── */}
        <div className="header-row row-appbar">
          <div className="brand">
            <span className="brand-dot" />
            <span className="brand-name">TelePrompter</span>
          </div>

          <div className="appbar-rule" />

          <div className="script-meta">
            {titleEditing ? (
              <input
                className="meta-title-input"
                value={draftTitle}
                autoFocus
                onChange={e => setDraftTitle(e.target.value)}
                onBlur={commitTitleEdit}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitTitleEdit()
                  if (e.key === 'Escape') setTitleEditing(false)
                }}
              />
            ) : (
              <span
                className="meta-title"
                onDoubleClick={startTitleEdit}
                title="Double-click to rename"
              >
                {activeScript?.title ?? 'Untitled'}
              </span>
            )}
            <div className="meta-stats">
              <span>{stats.words.toLocaleString()} words</span>
              <span className="meta-dot">·</span>
              <span>~{stats.duration}</span>
            </div>
            <span className={`meta-save${saveStatus !== 'idle' ? ` ${saveStatus}` : ''}`}>
              {saveStatus === 'saving' && 'saving…'}
              {saveStatus === 'saved' && '✓ Saved'}
            </span>
          </div>

          <div className="appbar-actions">
            <button
              className={`btn-toggle${libraryOpen ? ' active' : ''}`}
              onClick={() => setLibraryOpen(o => !o)}
              title="Script library"
            >
              ☰ Scripts
            </button>
            <button
              className={`btn-toggle${dashboardOpen ? ' active' : ''}`}
              onClick={() => setDashboardOpen(o => !o)}
              title="Operator dashboard"
            >
              ⊞ Dashboard
            </button>
            <button
              className={`btn-toggle${voiceOpen ? ' active' : ''}`}
              onClick={() => setVoiceOpen(o => !o)}
              title="Voice tracking"
            >
              🎙 Voice
            </button>
            <button
              className={`btn-toggle${playlistOpen ? ' active' : ''}`}
              onClick={() => setPlaylistOpen(o => !o)}
              title="Script playlists"
            >
              ≡ Lists
            </button>
            <button
              className={`btn-toggle${versionOpen ? ' active' : ''}`}
              onClick={() => setVersionOpen(o => !o)}
              title="Version history for active script"
            >
              ⧖ Versions
            </button>
          </div>
        </div>

        {/* ── Row 2: Primary controls ── */}
        <div className="header-row row-primary">
          <button
            className={`btn-play-hero${isActive ? ' playing' : ''}`}
            onClick={handlePlayPress}
            title="Play / Pause [Space]"
          >
            <span className="play-icon">{countdownActive ? '✕' : isPlaying ? '⏸' : '▶'}</span>
            <span className="play-label">{countdownActive ? 'Cancel' : isPlaying ? 'Pause' : 'Play'}</span>
          </button>

          <div className="transport-group">
            <button className="btn-transport" onClick={handleReset} title="Reset to top">⏮</button>
            <button className="btn-transport" onClick={() => jumpBy(-5)} title="−5 seconds">−5s</button>
            <button className="btn-transport" onClick={() => jumpBy(5)} title="+5 seconds">+5s</button>
            {cueCount > 0 && <>
              <div className="sep" />
              <button className="btn-transport" onClick={() => jumpToCue('prev')} title="Previous cue  [">◀ Cue</button>
              <button className="btn-transport" onClick={() => jumpToCue('next')} title="Next cue  ]">Cue ▶</button>
            </>}
          </div>

          <div className="sep" />

          <div className="ctrl">
            <label>Speed</label>
            <input type="range" min={10} max={300} value={speed}
              onChange={e => setSpeed(+e.target.value)} className="slider" />
            <span className="val">{speed}</span>
          </div>

          <div className="sep" />

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

          <button
            className={`btn-toggle${isFullscreen ? ' active' : ''}`}
            onClick={toggleFullscreen}
            title="Fullscreen [F11]"
          >
            {isFullscreen ? '⛶ Exit' : '⛶ Full'}
          </button>

          <button
            className={`btn-toggle${focusMode ? ' active' : ''}`}
            onClick={handleFocusMode}
            title={focusMode ? 'Exit Focus Mode — restore workspace' : 'Focus Mode — maximize teleprompter view'}
          >
            {focusMode ? '← Workspace' : '⊙ Focus'}
          </button>

          <button
            className={`btn-appearance-toggle${settingsOpen ? ' open' : ''}`}
            onClick={() => setSettingsOpen(o => !o)}
            title="Appearance settings"
          >
            ⚙ Appearance
            <span className="appearance-chevron">{settingsOpen ? '▲' : '▼'}</span>
          </button>

          <button
            className={`btn-shortcuts-toggle${shortcutsOpen ? ' active' : ''}`}
            onClick={() => setShortcutsOpen(o => !o)}
            title="Keyboard shortcuts [?]"
            aria-label="Keyboard shortcuts"
          >?</button>

          <button
            className={`btn-shortcuts-toggle${aboutOpen ? ' active' : ''}`}
            onClick={() => setAboutOpen(o => !o)}
            title="About TelePrompter"
            aria-label="About"
          >ℹ</button>
        </div>

        {/* ── Row 3: Collapsible appearance settings ── */}
        {settingsOpen && (
          <div className="header-row row-settings">
            <div className="settings-group">
              <span className="settings-group-label">Colors</span>
              <div className="ctrl">
                <label>Text</label>
                <input type="color" value={settings.textColor}
                  onChange={e => update({ textColor: e.target.value })} className="cpicker" />
              </div>
              <div className="ctrl">
                <label>BG</label>
                <input type="color" value={settings.bgColor}
                  onChange={e => update({ bgColor: e.target.value })} className="cpicker" />
              </div>
              <button
                className={`btn-toggle${highContrast ? ' active' : ''}`}
                onClick={() => setHighContrast(v => !v)}
                title="High-contrast mode — maximum visibility for UI controls"
              >◑ HC</button>
            </div>

            <div className="settings-divider" />

            <div className="settings-group">
              <span className="settings-group-label">Layout</span>
              <button
                className={`btn-toggle${settings.mirror ? ' active' : ''}`}
                onClick={() => update({ mirror: !settings.mirror })}
              >
                ⇔ Mirror
              </button>
              <div className="ctrl">
                <label>Dir</label>
                <select value={settings.direction}
                  onChange={e => update({ direction: e.target.value as 'auto' | 'ltr' | 'rtl' })}
                  className="sel">
                  <option value="auto">Auto</option>
                  <option value="ltr">LTR</option>
                  <option value="rtl">RTL</option>
                </select>
              </div>
            </div>

            <div className="settings-divider" />

            <div className="settings-group">
              <span className="settings-group-label">Typography</span>
              <div className="ctrl">
                <label>Font</label>
                <select value={settings.fontFamily}
                  onChange={e => update({ fontFamily: e.target.value })} className="sel">
                  {FONT_FAMILY_OPTIONS.map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div className="ctrl">
                <label>Size</label>
                <input type="range" min={16} max={96} value={settings.fontSize}
                  onChange={e => update({ fontSize: +e.target.value })} className="slider" />
                <span className="val">{settings.fontSize}px</span>
              </div>
              <div className="ctrl">
                <label>Presets</label>
                <div className="size-presets">
                  {([{l:'S',v:24},{l:'M',v:36},{l:'L',v:52},{l:'XL',v:72}] as const).map(p => (
                    <button
                      key={p.l}
                      className={`btn-size-preset${settings.fontSize === p.v ? ' active' : ''}`}
                      onClick={() => update({ fontSize: p.v })}
                      title={`${p.l}: ${p.v}px`}
                    >{p.l}</button>
                  ))}
                </div>
              </div>
              <div className="ctrl">
                <label>LH</label>
                <input type="range" min={1} max={2.5} step={0.05} value={settings.lineHeight}
                  onChange={e => update({ lineHeight: +e.target.value })} className="slider" />
                <span className="val">{settings.lineHeight.toFixed(2)}</span>
              </div>
              <div className="ctrl">
                <label>LS</label>
                <input type="range" min={0} max={5} step={0.1} value={settings.letterSpacing}
                  onChange={e => update({ letterSpacing: +e.target.value })} className="slider" />
                <span className="val">{settings.letterSpacing.toFixed(1)}</span>
              </div>
              <div className="ctrl">
                <label>Align</label>
                <select value={settings.textAlign}
                  onChange={e => update({ textAlign: e.target.value as 'left' | 'center' | 'right' })}
                  className="sel">
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </div>
            </div>

            <div className="settings-divider" />

            <div className="settings-group">
              <span className="settings-group-label">Guide</span>
              <button className={`btn-toggle${guideVisible ? ' active' : ''}`}
                onClick={() => setGuideVisible(v => !v)}>
                {guideVisible ? 'On' : 'Off'}
              </button>
              {guideVisible && (
                <>
                  <div className="ctrl">
                    <label>Color</label>
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
            </div>

            <span className="hint">Space = play/pause · F11 = fullscreen</span>
          </div>
        )}
      </header>

      {/* ── Reading progress strip ── */}
      <div className="progress-strip" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-fill" style={{ width: `${pct}%` }} />
        <div className={`progress-labels${scrollRatio > 0 ? ' visible' : ''}`}>
          <span className="progress-pct">{pct}%</span>
          {stats.totalSecs > 0 && (
            <span className="progress-remaining">{remainStr}</span>
          )}
        </div>
      </div>

      <main className="main">

        {/* ── Script library sidebar ── */}
        {libraryOpen && !focusMode && (
          <ScriptLibrary
            scripts={scripts}
            activeId={activeId}
            folders={folders}
            onSelect={id => setActiveId(id)}
            onCreate={createNewScript}
            onRename={renameScript}
            onDelete={deleteScript}
            onDuplicate={duplicateScript}
            onCreateFolder={createFolder}
            onRenameFolder={renameFolder}
            onDeleteFolder={handleDeleteFolder}
            onMoveToFolder={handleMoveToFolder}
          />
        )}

        {/* ── Editor panel — always rendered when not in focus mode, width animates on collapse ── */}
        {!focusMode && (
          <section
            className={`panel editor-panel${editorCollapsed ? ' collapsed' : ''}`}
            style={{
              width: editorCollapsed ? 48 : editorWidth,
              minWidth: editorCollapsed ? 48 : EDITOR_MIN_W,
              maxWidth: editorCollapsed ? 48 : EDITOR_MAX_W,
            }}
          >
            {/* Collapsed strip — fades in when collapsed */}
            <div
              className="editor-collapsed-inner"
              onClick={() => setEditorCollapsed(false)}
              role="button"
              tabIndex={editorCollapsed ? 0 : -1}
              title="Click to expand script panel"
              onKeyDown={e => e.key === 'Enter' && setEditorCollapsed(false)}
            >
              <span className="collapsed-expand-icon">›</span>
              <span className="collapsed-script-label">Script</span>
              <span className="collapsed-script-name">{activeScript?.title ?? 'Untitled'}</span>
            </div>

            {/* Expanded content — fades out when collapsed */}
            <div className="editor-expanded-inner">
              <div className="editor-toolbar">
                <label className="btn-tool" title="Import .txt or .md file">
                  ↓ Import
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) importFile(f)
                      e.target.value = ''
                    }}
                  />
                </label>
                <button className="btn-tool" onClick={() => exportScript('txt')} title="Export as plain text">
                  ↑ TXT
                </button>
                <button className="btn-tool" onClick={() => exportScript('md')} title="Export as Markdown">
                  ↑ MD
                </button>
                <button
                  className={`btn-tool btn-notes-toggle${notesOpen ? ' active' : ''}`}
                  onClick={() => setNotesOpen(o => !o)}
                  title="Presenter notes — operator only, not sent to output"
                >
                  ✎ Notes
                  {activeScript?.notes && !notesOpen && <span className="notes-indicator" />}
                </button>
                <button
                  className="btn-tool editor-collapse-btn"
                  onClick={() => setEditorCollapsed(true)}
                  title="Collapse panel"
                >
                  ‹
                </button>
              </div>

              <textarea
                className="script-editor"
                value={script}
                onChange={e => setScript(e.target.value)}
                placeholder="Paste your script here…"
                spellCheck={false}
                tabIndex={editorCollapsed ? -1 : 0}
              />

              <div className="stats-bar">
                <span>{stats.words.toLocaleString()} words</span>
                <span>{stats.chars.toLocaleString()} chars</span>
                <span>~{stats.duration} to read</span>
                {activeScript && (
                  <>
                    <span className="stats-dot">·</span>
                    <span>Created {fmtDate(activeScript.createdAt)}</span>
                    <span>Modified {fmtDate(activeScript.updatedAt)}</span>
                  </>
                )}
              </div>

              {notesOpen && (
                <div className="notes-panel">
                  <div className="notes-header">
                    <span className="notes-label">Presenter Notes</span>
                    <span className="notes-badge">operator only · not sent to output</span>
                  </div>
                  <textarea
                    className="notes-editor"
                    value={activeScript?.notes ?? ''}
                    onChange={e => patchScript(activeId, { notes: e.target.value })}
                    placeholder="Notes visible to the operator only — cues, reminders, timing…"
                    spellCheck
                    tabIndex={editorCollapsed ? -1 : 0}
                  />
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Divider — drag to resize, hover to reveal collapse toggle ── */}
        {!focusMode && (
          <div
            className={`divider${isDragging ? ' dragging' : ''}`}
            style={{ cursor: editorCollapsed ? 'default' : 'col-resize' }}
            onMouseDown={editorCollapsed ? undefined : handleDividerMouseDown}
            title={editorCollapsed ? '' : 'Drag to resize'}
          >
            <button
              className="divider-toggle"
              onMouseDown={e => e.stopPropagation()}
              onClick={() => setEditorCollapsed(c => !c)}
              title={editorCollapsed ? 'Expand panel' : 'Collapse panel'}
            >
              {editorCollapsed ? '›' : '‹'}
            </button>
          </div>
        )}

        {/* ── Teleprompter preview ── */}
        <section className="panel preview-panel">
          <div className="teleprompter-wrap">
            <div
              ref={previewRef}
              className="teleprompter"
              style={{
                backgroundColor: settings.bgColor,
                transform: settings.mirror ? 'scaleX(-1)' : undefined,
              }}
            >
              <div
                ref={textRef}
                className="tp-text"
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
                {script ? renderScript(script, voiceActivePara) : 'Your script will appear here…'}
              </div>
            </div>

            {guideVisible && (
              <div
                className="reading-guide"
                style={{ backgroundColor: guideColor, opacity: guideOpacity }}
              />
            )}

            {voiceActive && (
              <>
                <div
                  className="voice-zone-overlay"
                  style={{
                    top: `${voiceAnchorPct - voiceZonePct}%`,
                    height: `${voiceZonePct * 2}%`,
                  }}
                />
                <div
                  className="voice-anchor-line"
                  style={{ top: `${voiceAnchorPct}%` }}
                />
              </>
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

        {/* ── Operator Dashboard ── */}
        {dashboardOpen && (
          <OperatorDashboard
            isPlaying={isPlaying}
            scrollRatio={scrollRatio}
            totalWords={stats.words}
            speed={speed}
            outputConnected={outputConnected}
            cueCount={cueCount}
            onPlayPause={handlePlayPress}
            onJump={jumpBy}
            onSpeedChange={setSpeed}
            onOpenOutput={openOutputWindow}
            onJumpToCue={jumpToCue}
          />
        )}

        {/* ── Voice Tracker ── */}
        {voiceOpen && (
          <VoiceTracker
            status={voice.status}
            transcript={voice.transcript}
            targetRatio={voice.targetRatio}
            scrollRatio={scrollRatio}
            language={voice.language}
            errorMessage={voice.errorMessage}
            anchorPct={voiceAnchorPct}
            zonePct={voiceZonePct}
            autoCenter={voiceAutoCenter}
            onStart={voice.start}
            onStop={voice.stop}
            onLanguageChange={voice.setLanguage}
            onAnchorChange={setVoiceAnchorPct}
            onZoneChange={setVoiceZonePct}
            onAutoCenterChange={setVoiceAutoCenter}
          />
        )}

        {/* ── Playlist Panel ── */}
        {playlistOpen && !focusMode && (
          <PlaylistPanel
            playlists={playlists}
            scripts={scripts}
            activePlaylistId={activePlaylistId}
            playlistIdx={playlistIdx}
            onCreate={createPlaylist}
            onDelete={deletePlaylist}
            onRename={renamePlaylist}
            onAddScript={addToPlaylist}
            onRemoveScript={removeFromPlaylist}
            onMoveScript={moveInPlaylist}
            onActivate={handleActivatePlaylist}
            onDeactivate={handleDeactivatePlaylist}
            onSelectScript={id => setActiveId(id)}
          />
        )}

        {/* ── Version Panel ── */}
        {versionOpen && !focusMode && (
          <VersionPanel
            scriptId={activeId}
            scriptTitle={activeScript?.title ?? 'Untitled'}
            currentContent={script}
            versions={versions}
            onSave={saveVersion}
            onRestore={handleRestoreVersion}
            onDelete={deleteVersion}
          />
        )}
      </main>

      {/* ── About dialog ── */}
      {aboutOpen && (
        <div className="shortcuts-backdrop" onClick={() => setAboutOpen(false)}>
          <div className="about-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="About TelePrompter">
            <div className="shortcuts-header">
              <span className="shortcuts-title">About TelePrompter</span>
              <button className="shortcuts-close" onClick={() => setAboutOpen(false)} aria-label="Close">✕</button>
            </div>

            <div className="about-body">
              <div className="about-logo">T</div>
              <p className="about-appname">TelePrompter</p>
              <p className="about-version">Version {__APP_VERSION__}</p>
              <p className="about-desc">
                Multilingual teleprompter for professional script reading.
                Supports Arabic (RTL), French, English, and more.
              </p>

              {userDataPath && (
                <div className="about-datapath">
                  <span className="about-datapath-label">App data location</span>
                  <code className="about-datapath-val">{userDataPath}</code>
                  <button
                    className="about-open-btn"
                    onClick={() => window.electronAPI?.openUserDataFolder()}
                  >
                    Open in Explorer
                  </button>
                </div>
              )}
            </div>

            <p className="shortcuts-footer">© 2025 – 2026</p>
          </div>
        </div>
      )}

      {/* ── Keyboard shortcuts overlay ── */}
      {shortcutsOpen && (
        <div className="shortcuts-backdrop" onClick={() => setShortcutsOpen(false)}>
          <div className="shortcuts-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
            <div className="shortcuts-header">
              <span className="shortcuts-title">Keyboard Shortcuts</span>
              <button className="shortcuts-close" onClick={() => setShortcutsOpen(false)} aria-label="Close">✕</button>
            </div>

            <div className="shortcuts-body">
              <div className="shortcuts-section">
                <span className="shortcuts-section-label">Playback</span>
                <dl className="shortcuts-list">
                  <dt><kbd>Space</kbd></dt><dd>Play / Pause</dd>
                  <dt><kbd>F11</kbd></dt><dd>Toggle fullscreen</dd>
                </dl>
              </div>
              <div className="shortcuts-section">
                <span className="shortcuts-section-label">Navigation</span>
                <dl className="shortcuts-list">
                  <dt><kbd>[</kbd></dt><dd>Jump to previous <code>[CUE]</code></dd>
                  <dt><kbd>]</kbd></dt><dd>Jump to next <code>[CUE]</code></dd>
                </dl>
              </div>
              <div className="shortcuts-section">
                <span className="shortcuts-section-label">Interface</span>
                <dl className="shortcuts-list">
                  <dt><kbd>?</kbd></dt><dd>Show / hide shortcuts</dd>
                  <dt><kbd>Esc</kbd></dt><dd>Close this overlay</dd>
                </dl>
              </div>
            </div>

            <p className="shortcuts-footer">Press <kbd>?</kbd> or <kbd>Esc</kbd> to close</p>
          </div>
        </div>
      )}
    </div>
  )
}
