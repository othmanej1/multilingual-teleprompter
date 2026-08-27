## 2026-08-27 - Panel Action Buttons Accessibility
**Learning:** Icon-only action buttons inside compact sidebars and dashboard panels (such as rename ✎, duplicate ⧉, delete ✕, play ▶, move ↑/↓) lack accessible names for screen readers and default to implicit submit types when nested in form structures.
**Action:** Always provide explicit `type="button"` and dynamic descriptive `aria-label` attributes (e.g. `aria-label="Rename Intro Script"`) on panel action controls.
