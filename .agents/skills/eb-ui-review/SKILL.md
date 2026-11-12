---
name: eb-ui-review
description: "Use to critique or improve an existing LeseZauber Pro screen, UX flow, responsive layout, wording, forms, accessibility or design system. Does not authorize redesign, publishing or live browser tests."
---

# LeseZauber Pro · UI and Webdesign Review (DRAFT)

First read [the current project cursor](https://app.notion.com/p/3f93af1e29e38118a9d9d0e18350b67c), existing UI components, design tokens, user goal and CLAUDE.md, README.md, js/core.js, js/main.js, css/tailwind-input.css, docs/. Do not treat historical screenshots or archived docs as the active deployed version.

## Current UI priorities
Eltern-Einrichtung, Bibliothek, Start/Weiterlesen, Vorlesemodus, Reader-Fokus, leere/fehlgeschlagene Bildanalyse, Offline-Status, große Buttons und reduzierte Bewegung. Vorhandenes Tailwind-Build-Verfahren aus CLAUDE.md respektieren; gebaute CSS-Datei nicht handeditieren.

## Small-screen pilot
1. Critique one representative user journey; locate the largest task friction. Keep existing functionality and identity.
2. Clarify page hierarchy, accessible labels, concise instructions, primary CTA and empty/loading/error/recovery states.
3. Adapt at 320/390/768/1440 widths, zoom and keyboard focus. Prefer existing CSS/components and reduced-motion; avoid unnecessary dependency and visual effects.
4. Make one small private change. Preserve rights, noindex/consent, protected content and personal data.
5. Describe exactly what future browser/Playwright/axe/device checks would prove; until run, status **NOT_TESTED**. Source readback is not screenshot proof.
6. Summarize source SHA → output SHA, affected dependent components, P0/P1, independent readback and smallest next step.

Method adapted from [Impeccable](https://github.com/pbakaus/impeccable), [Taste](https://github.com/Leonxlnx/taste-skill); [Hallmark](https://github.com/Nutlope/hallmark) for explicitly **new** page designs only. No foreign hooks/scripts installed.
