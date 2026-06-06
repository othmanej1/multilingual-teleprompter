import type { TypographySettings } from './types'

export interface FontFamilyOption {
  value: string
  label: string
  css: string
}

export const FONT_FAMILY_OPTIONS: FontFamilyOption[] = [
  {
    value: 'system',
    label: 'System',
    css: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", sans-serif',
  },
  {
    value: 'serif',
    label: 'Serif',
    css: 'Georgia, "Times New Roman", serif',
  },
  {
    value: 'mono',
    label: 'Mono',
    css: '"Courier New", Courier, monospace',
  },
  {
    value: 'arabic',
    label: 'Arabic',
    css: '"Noto Sans Arabic", "Arabic Typesetting", "Simplified Arabic", Arial, sans-serif',
  },
]

export function fontFamilyCss(value: string): string {
  return (
    FONT_FAMILY_OPTIONS.find(f => f.value === value)?.css ??
    FONT_FAMILY_OPTIONS[0].css
  )
}

export const DEFAULT_SETTINGS: TypographySettings = {
  fontSize: 32,
  fontFamily: 'system',
  textColor: '#ffffff',
  bgColor: '#0a0a0f',
  lineHeight: 1.65,
  letterSpacing: 0.2,
  textAlign: 'left',
  direction: 'auto',
  mirror: false,
}

const SETTINGS_KEY = 'tp_settings'

export function loadSettings(): TypographySettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<TypographySettings>) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function persistSettings(s: TypographySettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // storage quota exceeded or unavailable
  }
}
