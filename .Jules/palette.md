## 2025-05-18 - Accessibility for Operator Dashboard Controls
**Learning:** Icon-based or symbolic transport controls (`«10`, `⏸`, `▶`, `◀ Prev`) in teleprompter dashboards lack screen reader accessible names unless explicitly labelled with `aria-label` or `aria-labelledby`.
**Action:** Always verify that interactive buttons with unicode/symbolic text or range sliders in dashboard panels have `aria-label` or `aria-labelledby` attributes.
