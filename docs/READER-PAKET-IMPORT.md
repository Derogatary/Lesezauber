# Reader-Paket-Import (private Vorschau aus dem Autorenstudio)

Knopf "Aus dem Autorenstudio importieren (private Vorschau)" in der Bibliothek. Code: `js/readerPackage/*`, `js/actions/readerPackageImport.js`.
Ablauf: ZIP waehlen -> Pruefung im Speicher (sicherer ZIP-Leser, CRC32, sha256 laut export.json, Manifest-Hash, Schema readerPackageV1, Magic Bytes) -> Zusammenfassung + Bestaetigung -> EINE IndexedDB-Transaktion nur auf `books` (add, nie put).
Kein Netzwerk, kein Live-Sync, KEIN Schema-Upgrade (DB_VERSION bleibt 5). Bilder werden als WebP-Data-URLs in den Seiten abgelegt (Original/EXIF wird nicht gespeichert); dadurch bleibt der Buch-JSON-Export/Backup intakt.
Limits: 200 MB gepackt, 250 MB entpackt, 2000 Eintraege, 100:1 Verhaeltnis (ab 64 KB), Bild 20 MB, JSON 8 MB, Manifest 16 MB, Bild max 16384 px/50 MP. Nur Store+Deflate, kein ZIP64, keine Verschluesselung.
`readerPackageV1.js`/`readerImportPlan.js` sind Kopien aus dem Studio: nur zusammen mit der Studio-Seite aendern.
Backup-Hinweis: vor dem ersten Import ein Voll-Backup anlegen (Einstellungen); ein Import aendert keine bestehenden Datensaetze.
