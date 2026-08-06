import { describe, it, expect } from 'vitest'
import { countCues, renderScript } from './cues'
import { render } from '@testing-library/react'

describe('cues', () => {
  describe('countCues', () => {
    it('returns 0 for empty string', () => {
      expect(countCues('')).toBe(0)
    })

    it('returns 0 for text without cues', () => {
      expect(countCues('This is some text.')).toBe(0)
    })

    it('counts single cue', () => {
      expect(countCues('This is [CUE] text.')).toBe(1)
    })

    it('counts multiple cues', () => {
      expect(countCues('[CUE] Text with [cue] multiple [CUE] markers.')).toBe(3)
    })

    it('is case insensitive', () => {
      expect(countCues('[cue] [CuE] [CUE]')).toBe(3)
    })
  })

  describe('renderScript', () => {
    it('returns null for empty text', () => {
      expect(renderScript('')).toBeNull()
    })

    it('returns text directly if no cues and no activeParaIdx', () => {
      expect(renderScript('Simple text')).toBe('Simple text')
    })

    it('renders text with cues correctly', () => {
      const { container } = render(renderScript('Text with [CUE] marker') as any)
      const cueSpan = container.querySelector('.tp-cue')
      expect(cueSpan).not.toBeNull()
      expect(cueSpan?.textContent).toBe('▸ CUE')
      expect(container.textContent).toBe('Text with ▸ CUE marker')
    })

    it('renders multiple paragraphs', () => {
      const text = 'Paragraph 1\n\nParagraph 2'
      const { container } = render(renderScript(text) as any)
      expect(container.textContent).toBe('Paragraph 1\n\nParagraph 2')
    })

    it('highlights active paragraph when activeParaIdx is provided', () => {
      const text = 'Para 0\n\nPara 1\n\nPara 2'
      const { container } = render(renderScript(text, 1) as any)

      const activeSpan = container.querySelector('.tp-active-para')
      expect(activeSpan).not.toBeNull()
      expect(activeSpan?.textContent).toBe('Para 1')
    })

    it('does not highlight if activeParaIdx does not match', () => {
      const text = 'Para 0\n\nPara 1\n\nPara 2'
      const { container } = render(renderScript(text, 5) as any)

      const activeSpan = container.querySelector('.tp-active-para')
      expect(activeSpan).toBeNull()
    })
  })
})
