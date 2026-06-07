import React from 'react'

const CUE_SPLIT  = /(\[CUE\])/i
const CUE_MATCH  = /^\[CUE\]$/i
const PARA_SPLIT = /(\n\n+)/

export function countCues(text: string): number {
  return (text.match(/\[CUE\]/gi) ?? []).length
}

function renderParagraph(text: string): React.ReactNode {
  const parts = text.split(CUE_SPLIT)
  if (parts.length === 1) return text
  return (
    <>
      {parts.map((part, i) =>
        CUE_MATCH.test(part)
          ? <span key={i} className="tp-cue">▸ CUE</span>
          : part
      )}
    </>
  )
}

// Split script on [CUE] markers and paragraph boundaries.
// When activeParaIdx is provided, wraps the matching paragraph in .tp-active-para.
// Falls back to the original fast path when no highlighting is needed.
export function renderScript(text: string, activeParaIdx?: number | null): React.ReactNode {
  if (!text) return null

  // Fast path: no highlighting, no [CUE] markers
  if (activeParaIdx == null && !/\[CUE\]/i.test(text)) return text

  const tokens = text.split(PARA_SPLIT)
  let paraIdx = 0

  return (
    <>
      {tokens.map((token, i) => {
        // Separator tokens (pure newlines) — render as text node to preserve blank lines
        if (/^\n+$/.test(token)) {
          return <React.Fragment key={i}>{token}</React.Fragment>
        }
        const idx = paraIdx++
        const isActive = activeParaIdx != null && idx === activeParaIdx
        return (
          <span key={i} className={isActive ? 'tp-active-para' : undefined}>
            {renderParagraph(token)}
          </span>
        )
      })}
    </>
  )
}
