---
name: eb-small-safe-change
description: "Use when implementing or reviewing a small code change in LeseZauber; prefer existing code, link or reuse, maintain project authorizations and minimize regression scope."
---

# LeseZauber · Minimaler Entwicklungsablauf (DRAFT)

1. Lies den tatsächlich aktiven Projektcursor, die Hauptquelle und vorhandene AGENTS-/CLAUDE-Anweisungen. Nenne den exakten Eingabe-Commit, nicht nur den Branchnamen.
2. Entscheide **LINK/REUSE → UPDATE → NEW**. Formuliere Nutzerwert und eine überprüfbare Abnahmeanforderung.
3. Halte die Änderung und direkte Abhängigkeiten klein. Beachte besonders: CLAUDE.md, vorhandener `/releasecheck`, Tailwind-Quell-/Buildtrennung und Kinderbilder.
4. Erzeuge nur einen privaten Kandidaten-Branch oder verwende einen bereits genehmigten Entwicklungsbranch. Keine fremden Installationsskripte/Hooks, kostenpflichtigen Dienste, Live-Zugriffe, Merges, CI-Actions, Deployments oder Rechteänderungen ohne spezifisches GO.
5. Prüfe auf Anfrage die kleinste betroffene Änderung plus abhängige Komponenten; echte globale Gates bleiben bestehen. Wenn Prüfungen gerade ausgesetzt sind, markiere **NOT_RUN** statt PASS.
6. Bei Problemen die Ursache vor dem dritten gleichen Versuch klären. Abschließen mit Input-SHA → Output-SHA, GitHub-Quellreadback, tatsächlich bestandenen/nicht ausgeführten Tests, P0/P1 und NEXT.

Originale lokale Arbeitsanweisung, methodisch angelehnt an [Ponytail](https://github.com/DietrichGebert/ponytail), [Matt Pocock Code Review](https://github.com/mattpocock/skills), [Superpowers](https://github.com/obra/superpowers). Keine Upstream-Binaries kopiert.
