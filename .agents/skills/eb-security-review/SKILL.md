---
name: eb-security-review
description: "Use for a security, privacy, authorization, import, external-provider, backup or release-risk review in LeseZauber Pro. Advisory, source-grounded; do not run live tests or change production."
---

# LeseZauber Pro · Security Review (DRAFT)

Read the current [project cursor](https://app.notion.com/p/3f93af1e29e38118a9d9d0e18350b67c) and the actual commit/branch first; read CLAUDE.md, README.md, js/core.js, js/main.js, css/tailwind-input.css, docs/. Existing AGENTS/CLAUDE instructions and project P0 rules outrank this skill.

## Specific boundaries
Kinderprofile, private Bücher/Bilder, IndexedDB, optionale Gemini-/Mistral-/TTS-Anbieter, API-Kosten/Quoten sowie Rechte an fotografierten Seiten getrennt betrachten. API-Schlüssel im Browser sind eine dokumentierte bestehende Architekturgrenze, nicht ohne Kontext einen neuen Bug behaupten. Niemals persönliche Bilder/Buchseiten an Skill-/QA-Dienste senden.

## Audit steps
1. Identify actor, data, origin/destination, trust boundary and each operation's server-side permission. Use a diagram/table if useful.
2. Compare current code to explicit project requirements; log only grounded risks with exact file and source SHA. Label evidence: HYPOTHESIS / SOURCE / SYNTHETIC / BROWSER / LIVE.
3. Review P0: unauthorized read/write, privacy/rights exposure, data loss or absent recovery, and unapproved external release. Give minimal remediation and tests **to do later** if testing is deferred.
4. No provider requests, real accounts, production hosts, pen tests, migrations, external skill hooks, source uploads, CI or deployment without project-specific GO. Keep affected delta QA and mandatory global gates distinct.
5. Report source→output SHA, readback, PASS/FAIL/NOT_RUN, P0/P1, blocked approvals and NEXT.

Original local guidance inspired by [Cloudflare Security Audit](https://github.com/cloudflare/security-audit-skill) and [OWASP ASVS](https://github.com/OWASP/ASVS); **no copied upstream executable code**.
