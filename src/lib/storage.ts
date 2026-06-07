import type { Script, Folder, Playlist, ScriptVersion } from './types'

const SCRIPTS_KEY   = 'tp_scripts'
const ACTIVE_KEY    = 'tp_active'
const SCROLL_POS_KEY = 'tp_scroll_positions'
const FOLDERS_KEY   = 'tp_folders'
const PLAYLISTS_KEY = 'tp_playlists'
const VERSIONS_KEY  = 'tp_versions'

// ── Scripts ───────────────────────────────────────────────

export function loadScripts(): Script[] {
  try {
    const raw = localStorage.getItem(SCRIPTS_KEY)
    if (!raw) return []
    // Spread existing fields first; add defaults for fields added in later versions
    return (JSON.parse(raw) as Script[]).map(s => ({
      ...s,
      notes:    s.notes    ?? '',
      folderId: s.folderId ?? null,
    }))
  } catch {
    return []
  }
}

export function persistScripts(scripts: Script[]): void {
  try { localStorage.setItem(SCRIPTS_KEY, JSON.stringify(scripts)) } catch {}
}

export function loadActiveId(): string | null {
  return localStorage.getItem(ACTIVE_KEY)
}

export function persistActiveId(id: string): void {
  try { localStorage.setItem(ACTIVE_KEY, id) } catch {}
}

export function loadScrollPositions(): Record<string, number> {
  try {
    const raw = localStorage.getItem(SCROLL_POS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

// ratio <= 0 removes the entry (treat as "no saved position")
export function saveScrollPosition(scriptId: string, ratio: number): void {
  try {
    const positions = loadScrollPositions()
    if (ratio <= 0) delete positions[scriptId]
    else positions[scriptId] = Math.min(1, ratio)
    localStorage.setItem(SCROLL_POS_KEY, JSON.stringify(positions))
  } catch {}
}

export function makeScript(title = 'Untitled Script', content = ''): Script {
  const now = Date.now()
  return {
    id: `s_${now}_${Math.random().toString(36).slice(2, 6)}`,
    title, content,
    notes: '',
    folderId: null,
    createdAt: now, updatedAt: now,
  }
}

// ── Folders ───────────────────────────────────────────────

export function loadFolders(): Folder[] {
  try {
    const raw = localStorage.getItem(FOLDERS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function persistFolders(folders: Folder[]): void {
  try { localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders)) } catch {}
}

export function makeFolder(name: string): Folder {
  return {
    id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || 'Untitled Folder',
    createdAt: Date.now(),
  }
}

// ── Playlists ─────────────────────────────────────────────

export function loadPlaylists(): Playlist[] {
  try {
    const raw = localStorage.getItem(PLAYLISTS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function persistPlaylists(playlists: Playlist[]): void {
  try { localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists)) } catch {}
}

export function makePlaylist(name: string): Playlist {
  const now = Date.now()
  return {
    id: `pl_${now}_${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || 'Untitled Playlist',
    scriptIds: [],
    createdAt: now, updatedAt: now,
  }
}

// ── Script Versions ───────────────────────────────────────

export function loadVersions(): ScriptVersion[] {
  try {
    const raw = localStorage.getItem(VERSIONS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function persistVersions(versions: ScriptVersion[]): void {
  try { localStorage.setItem(VERSIONS_KEY, JSON.stringify(versions)) } catch {}
}

export function makeVersion(scriptId: string, content: string, label: string): ScriptVersion {
  return {
    id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    scriptId, content, label,
    savedAt: Date.now(),
  }
}
