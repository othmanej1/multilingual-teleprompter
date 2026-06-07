import React from 'react'

const CUE_SPLIT = /(\[CUE\])/i
const CUE_MATCH = /^\[CUE\]$/i

export function countCues(text: string): number {
  return (text.match(/\[CUE\]/gi) ?? []).length
}

// Split script text on [CUE] markers and render them as styled spans.
// Returns the original string unchanged when no cues are present,
// or null for empty input.
export function renderScript(text: string): React.ReactNode {
  if (!text) return null
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
