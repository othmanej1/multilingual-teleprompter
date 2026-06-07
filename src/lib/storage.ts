import type { Script } from './types'

const SCRIPTS_KEY = 'tp_scripts'
const ACTIVE_KEY = 'tp_active'

export function loadScripts(): Script[] {
  try {
    const raw = localStorage.getItem(SCRIPTS_KEY)
    if (!raw) return []
    // Spread default first so existing fields win; adds notes:'' for pre-notes scripts
    return (JSON.parse(raw) as Script[]).map(s => ({ notes: '', ...s }))
  } catch {
    return []
  }
}

export function persistScripts(scripts: Script[]): void {
  try {
    localStorage.setItem(SCRIPTS_KEY, JSON.stringify(scripts))
  } catch {
    // Storage quota exceeded or unavailable — silent fail
  }
}

export function loadActiveId(): string | null {
  return localStorage.getItem(ACTIVE_KEY)
}

export function persistActiveId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id)
  } catch {
    // silent fail
  }
}

export function makeScript(title = 'Untitled Script', content = ''): Script {
  const now = Date.now()
  return {
    id: `s_${now}_${Math.random().toString(36).slice(2, 6)}`,
    title,
    content,
    notes: '',
    createdAt: now,
    updatedAt: now,
  }
}
