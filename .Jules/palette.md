# Palette's Journal - UX & Accessibility Learnings

## 2025-05-18 - Icon-Only Button ARIA Accessibility in Management Sidebars
**Learning:** Sidebars like ScriptLibrary rely heavily on compact icon-only buttons (`✎`, `⧉`, `⤐`, `✕`). Without explicit `aria-label` attributes, screen readers cannot properly convey the targeted item or operation (e.g., announcing "Rename Welcome Script" vs just reading unicode symbols).
**Action:** Always pair `title` tooltips on icon-only buttons with contextual `aria-label` attributes incorporating item names when available.
