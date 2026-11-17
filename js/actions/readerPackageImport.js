import { app } from '../core.js';
import { loadReaderPackage } from '../readerPackage/packageLoader.js';
import { planReaderImport } from '../readerPackage/readerImportPlan.js';
import { buildLibraryBook, readerLibraryIndex, PREVIEW_NOTICE } from '../readerPackage/bookBuilder.js';

// NEU: "Aus dem Autorenstudio importieren (private Vorschau)".
// ZIP waehlen -> komplett im Speicher pruefen (js/readerPackage/*) -> Zusammenfassung -> Bestaetigung -> ein
// atomarer IndexedDB-Schreibvorgang (app.dbOps.commitReaderPackageBook). KEIN Netzwerk, kein Live-Sync, keine KI-Anfrage.
// Bis zur Bestaetigung wird nichts gespeichert. Siehe docs/READER-PAKET-IMPORT.md.

const ERRORS = {
    ZIP_TOO_LARGE: 'Das Paket ist zu groß (Grenze: 200 MB gepackt, 250 MB entpackt).',
    ZIP_TOO_MANY_ENTRIES: 'Das Paket enthält zu viele Dateien.',
    ZIP_ENTRY_TOO_LARGE: 'Eine Datei im Paket ist zu groß.',
    ZIP_RATIO: 'Das Paket wirkt wie eine Komprimierungsbombe und wurde abgelehnt.',
    ZIP_ENCRYPTED: 'Verschlüsselte Pakete werden nicht unterstützt.',
    ZIP64_UNSUPPORTED: 'ZIP64-Pakete werden nicht unterstützt.',
    ZIP_METHOD_UNSUPPORTED: 'Dieses ZIP verwendet ein nicht unterstütztes Komprimierungsverfahren.',
    DEFLATE_UNSUPPORTED: 'Dieser Browser kann das Paket nicht entpacken (DecompressionStream fehlt). Bitte einen aktuellen Browser nutzen.',
    UNSAFE_ZIP_NAME: 'Das Paket enthält einen unzulässigen Dateinamen.',
    UNEXPECTED_ENTRY: 'Das Paket enthält Dateien, die nicht zu einem Reader-Paket gehören.',
    DUPLICATE_ZIP_NAME: 'Das Paket enthält doppelte Dateinamen.',
    CRC_MISMATCH: 'Eine Datei im Paket ist beschädigt (Prüfsumme).',
    DIGEST_MISMATCH: 'Eine Datei im Paket stimmt nicht mit ihrer Prüfsumme überein.',
    TEXT_DIGEST_MISMATCH: 'Ein Text im Paket stimmt nicht mit seiner Prüfsumme überein.',
    IMAGE_INVALID: 'Ein Bild im Paket ist ungültig oder zu groß.',
    AUDIENCE_NOT_ALLOWED: 'Dieses Paket ist nicht als private Vorschau gekennzeichnet.',
    INVALID_ENVELOPE: 'Das ist kein gültiges Reader-Paket des Autorenstudios.',
    PACKAGE_ID_CONFLICT: 'Ein Paket mit gleicher Kennung, aber anderem Inhalt ist schon installiert. Nichts wurde geändert.',
    QUOTA: 'Gerätespeicher voll – nichts wurde importiert.',
};
function errorMessage(err) {
    return ERRORS[err?.code] || 'Das Paket konnte nicht gelesen werden und wurde nicht importiert.';
}

function fmtMB(bytes) { return (bytes / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB'; }

// Text-freie Platzhalterseite (nur Kapiteltitel), 600x800, WebP als Data-URL wie alle Seitenbilder der App.
function placeholderImage(title) {
    const canvas = document.createElement('canvas');
    canvas.width = 600; canvas.height = 800;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#eef2ff'; ctx.fillRect(0, 0, 600, 800);
    ctx.fillStyle = '#4338ca'; ctx.textAlign = 'center'; ctx.font = 'bold 40px system-ui, sans-serif';
    const words = String(title || '').split(/\s+/); let line = ''; let y = 340;
    for (const word of words) {
        if (ctx.measureText(line + ' ' + word).width > 500 && line) { ctx.fillText(line, 300, y); y += 52; line = word; }
        else line = line ? line + ' ' + word : word;
    }
    ctx.fillText(line, 300, y);
    ctx.font = '24px system-ui, sans-serif'; ctx.fillStyle = '#6366f1';
    ctx.fillText('Vorschau aus dem Autorenstudio', 300, 740);
    const small = document.createElement('canvas');
    small.width = 150; small.height = 200;
    small.getContext('2d').drawImage(canvas, 0, 0, 150, 200);
    return { full: canvas.toDataURL('image/webp', 0.7), thumb: small.toDataURL('image/webp', 0.7) };
}

// Bild dekodieren (Magic Bytes/Abmessungen sind schon in packageLoader geprueft) und wie jedes importierte Bild
// in die zwei WebP-Groessen der App umrechnen. Das Original (inkl. EXIF) wird NICHT gespeichert.
async function decodeVariants(bytes, mime) {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
    try { return app.utils.createImageVariants(bitmap, bitmap.width, bitmap.height); }
    finally { bitmap.close?.(); }
}

Object.assign(app.actions, {
    triggerReaderPackageImport() {
        document.getElementById('readerPackageInput')?.click();
    },

    async importReaderPackage(e) {
        const file = e.target.files[0];
        if (!file) return;
        app.ui.showLoader('Prüfe Paket…', 'Es wird nichts gespeichert, bevor du bestätigst');
        try {
            const pkg = await loadReaderPackage(file);
            const plan = await planReaderImport(pkg.manifest, pkg.files, readerLibraryIndex(app.library));
            app.ui.hideLoader();
            const s = pkg.summary;

            if (plan.action === 'ALREADY_INSTALLED') {
                app.ui.toast('Dieser Stand ist schon installiert – nichts wurde geändert.', 'ℹ️');
                if (app.library[plan.existingLocalId]) { app.state.currentBookId = plan.existingLocalId; app.nav.go('book'); }
                return;
            }
            const lines = [
                `„${s.title}“ aus dem Autorenstudio importieren?`, '',
                `Kapitel: ${s.chapters} · Bilder: ${s.images} (${fmtMB(s.imageBytes)}) · Absätze: ${s.segments}`,
                `Stand ${s.snapshotNo} · Freigabe ${s.decisionId}`,
                `Verwendungszweck: ${s.audience} (private Vorschau)`, '',
                plan.action === 'ADD_EDITION'
                    ? 'Neuerer Stand eines schon vorhandenen Buches: die ältere Ausgabe bleibt unverändert erhalten.'
                    : 'Das Buch wird neu in die Bibliothek aufgenommen.',
                PREVIEW_NOTICE + '.',
                'Es gibt keine Verbindung zum Studio; es werden keine Daten gesendet.',
            ];
            if (!window.confirm(lines.join('\n'))) { app.ui.toast('Import abgebrochen – nichts gespeichert.', '↩️'); return; }

            app.ui.showLoader('Importiere…', 'Bilder werden vorbereitet');
            // Bilder VOR der Transaktion dekodieren (IndexedDB-Transaktionen vertragen kein await auf fremde Promises).
            const images = new Map();
            for (const asset of pkg.manifest.assets) {
                images.set(asset.id, await decodeVariants(pkg.files.get(asset.path), asset.mime));
            }
            const personaIds = app.personas.map(p => p.id);
            const book = buildLibraryBook(pkg, { personaIds, images, placeholder: placeholderImage, profileId: app.utils.resolveCreationProfileId() });
            await app.dbOps.commitReaderPackageBook(book);
            app.ui.hideLoader();
            app.ui.toast(plan.action === 'ADD_EDITION' ? 'Neuer Stand importiert (alter bleibt erhalten).' : 'Vorschau importiert.', '📥');
            app.state.currentBookId = book.id;
            app.nav.go('book');
        } catch (err) {
            console.error('Reader-Paket-Import fehlgeschlagen:', err?.code || err);
            app.ui.hideLoader();
            if (err?.code === 'ALREADY_INSTALLED') app.ui.toast('Dieser Stand ist schon installiert – nichts wurde geändert.', 'ℹ️');
            else app.ui.toast(errorMessage(err), '❌');
        } finally {
            e.target.value = '';
        }
    },

    // Kleiner Helfer fuer Anzeige (Bibliothek, Buchansicht, Reader).
    isReaderPreviewBook(book) {
        return !!(book && book.readerPackage && book.readerPackage.audience === 'PRIVATE_READER_PREVIEW');
    },
});
