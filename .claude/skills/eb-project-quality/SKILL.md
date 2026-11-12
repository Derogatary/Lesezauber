---
name: eb-project-quality
description: "Use for EditionBoysen LeseZauber code changes, security reviews, UI/webdesign improvements or source/QA handoffs. Read the local matching project SKILL.md instructions before proceeding."
---

# LeseZauber – Claude-Code-Einstieg zu den drei Projekt-Skills

Dies ist ein **lokaler Verweis**, kein globales Regelwerk. Die bestehenden `CLAUDE.md`, `AGENTS.md`, Notion-Projektregeln und Autorentscheidungen gelten weiterhin vorrangig.

Wähle zuerst das Ziel der Aufgabe und **lies die vollständige jeweilige Datei** im selben Checkout:

- Security, Auth, private Daten, Import, Backup, Anbieter- und Agentenrechte → `.agents/skills/eb-security-review/SKILL.md`
- Bestehende UI/UX, Webdesign, Barrierefreiheit, Mobilansicht, Formularfluss → `.agents/skills/eb-ui-review/SKILL.md`
- Coding, Reuse-vor-Neubau, kleiner Diff, Scope und fokussierte QA → `.agents/skills/eb-small-safe-change/SKILL.md`

Für kombinierte Arbeit: erst Security-Grenzen, dann die kleine UI-/Codeänderung. Führe keine externen Skill-Hooks oder Release-Automationen aus. Eine Skill-Datei in einem **unveröffentlichten Feature-Branch** ist keine bestätigte Installation in `main` oder in der Live-App.

Gib Input→Output, Quellreadback, echten QA-Status, P0/P1 und NEXT an. Falls die verlinkte Datei im Checkout fehlt: abbrechen statt sie zu erfinden.
