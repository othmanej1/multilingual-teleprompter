export interface Script {
  id: string
  title: string
  content: string
  notes: string    // operator-only; never sent to the output window
  folderId: string | null  // null = uncategorized
  createdAt: number // Unix ms
  updatedAt: number // Unix ms
}

export interface Folder {
  id: string
  name: string
  createdAt: number
}

export interface Playlist {
  id: string
  name: string
  scriptIds: string[]
  createdAt: number
  updatedAt: number
}

export interface ScriptVersion {
  id: string
  scriptId: string
  content: string
  savedAt: number
  label: string  // '' = auto-snapshot; user string = manual label
}

export type SaveStatus = 'idle' | 'saving' | 'saved'

export interface TypographySettings {
  fontSize: number
  fontFamily: string
  textColor: string
  bgColor: string
  lineHeight: number
  letterSpacing: number
  textAlign: 'left' | 'center' | 'right'
  direction: 'auto' | 'ltr' | 'rtl'
  mirror: boolean
}

export type SyncMessage =
  | { type: 'script'; content: string }
  | { type: 'settings-full'; settings: TypographySettings }
  | { type: 'settings-patch'; patch: Partial<TypographySettings> }
  | { type: 'frame'; ratio: number }
  | { type: 'seek'; ratio: number }
  | { type: 'voice-pos'; ratio: number | null }
  | { type: 'ping' }
  | { type: 'pong' }
