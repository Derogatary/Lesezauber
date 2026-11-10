# API-Wartung · 10. November 2026

- [Gemini-Abschaltungen](https://aistudio.google.com/docs/deprecations): 3.7 Flash und 3.5 Flash sind Weiterleitungen auf 3.8 bzw. 3.6 und werden nicht mehr einzeln angefragt. 3.1 Flash-Lite bleibt bis zur Abschaltung als letzte Reserve hinter 3.5 Flash-Lite.
- [Gemini TTS](https://aistudio.google.com/docs/speech-generation): Die Preview-Modelle enden am 17. November 2026. Der neue Aufruf trennt Vorlesetext und Stil und setzt `store: false` für den Interaktionszustand. Vorhandene eckige Sprech-Tags werden bei Gemini nicht an das neue Modell geschickt; dessen Inline-Syntax ist anders.
- [Nano Banana 2.1](https://aistudio.google.com/docs/models/gemini-nano-banana-2.1): 1K-Ausgabe mit Bildreferenzen und Seitenverhältnis. Die [Schätzung](https://aistudio.google.com/docs/pricing#gemini-nano-banana-2.1) zeigt die Bildausgabe; Eingaben und ggf. weitere Ausgabe-Tokens werden zusätzlich berechnet.
- [Speechify](https://docs.speechify.ai/build/guides/get-started/regions) und [Simba 3.5](https://docs.speechify.ai/build/api-reference/v1/audio/speech): Neuer Host vor dem Ende der alten Adresse am 19. Januar 2027. Wortmarken und SSML-Tempo bleiben. Die Emotion-Tags werden von Simba 3.5 ignoriert und daher nicht gesendet.
- [ElevenLabs v2](https://elevenlabs.io/docs/api-reference/voices/search): Alle Seiten der Stimmenliste nachladen; keine zusätzliche Berechnung der Gesamtzahl anfordern. Die Audiosynthese mit Wortmarken bleibt auf ihrem separaten Endpoint.

## Vor dem nächsten Release

1. Die API-Verträge sind mit Testantworten geprüft. In der Vorschau mit eigenen, eingeschränkten Schlüsseln jeweils eine kurze Probe für Gemini-Sprache, Gemini-Bild, Speechify und ElevenLabs machen. Dabei insbesondere CORS, Deutsch, Wortmarken und PWA-Aktualisierung prüfen.
2. Mistral und OpenAI TTS sind aus der App entfernt. Profile und ältere Backups mit OpenAI als Vorlesestimme fallen auf die Gerätestimme zurück.
3. Pollinations bleibt deaktiviert. Gespeicherte Pollinations-Bilder bleiben nutzbar.
4. Wenn die Vorschau stabil läuft: Bei wiederholten Analyse- und Übersetzungsanfragen zuerst vorhandene Ergebnisse verwenden; dann gleichzeitig gestartete identische Anfragen anhand von Buchseite, Aufgabentyp und Prompt-Version zusammenführen. Bei langen Batch-Läufen die verbleibende Wartezeit aus `Retry-After` bzw. dem Anbieterfehler übernehmen und erst danach weiterarbeiten.
