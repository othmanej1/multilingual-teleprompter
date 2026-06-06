export interface Script {
  id: string
  title: string
  content: string
  createdAt: number // Unix ms
  updatedAt: number // Unix ms
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
  | { type: 'ping' }
  | { type: 'pong' }
