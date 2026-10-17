// Local full backup v1: library + editable studio projects + vocabulary + cached AI audio.
// No provider requests, no API keys, no profile export, no microphone recordings.
// ZIP files are validated before the atomic import into an empty browser origin.
import { app } from '../core.js';
import { cleanImportedBook } from './backup.js';
import { writeStoredZip, readStoredZip } from '../backupZip.js';

const MAX_AUDIO_ITEMS = 20000;
const MAX_AUDIO_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_LIBRARY_JSON = 512 * 1024 * 1024;
const MAX_INDEX_JSON = 32 * 1024 * 1024;
const SAFE_ID = /^(?!__proto__$|constructor$|prototype$)[A-Za-z0-9_-]{1,80}$/;
const BAD_ID = new Set(['__proto__', 'prototype', 'constructor']);

function validId(v) { return typeof v === 'string' && SAFE_ID.test(v) && !BAD_ID.has(v); }
function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Large downloads can be handled asynchronously by the browser.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function jsonBlob(value) {
    return new Blob([JSON.stringify(value)], { type: 'application/json' });
}
function encodeAudioMetadata(entry, file) {
    if (!entry || !entry.blob || !(entry.blob instanceof Blob) || !entry.key ||
        typeof entry.key !== 'string' || entry.key.length > 500 || !entry.key.includes('|'))
        throw new Error('Ungültiger Sprachcache-Eintrag');
    if (entry.blob.size > MAX_AUDIO_BYTES) throw new Error('Sprachaufnahme überschreitet Limit');
    const mime = entry.mime || entry.blob.type || 'audio/mpeg';
    if (!/^audio\/[a-zA-Z0-9.+-]{1,40}$/.test(mime)) throw new Error('Ungültiger Audiotyp');
    return {
        file, key: entry.key, mime, bytes: entry.blob.size,
        created: Number.isFinite(entry.created) ? entry.created : Date.now(),
        durationSec: Number.isFinite(entry.durationSec) && entry.durationSec >= 0 ? entry.durationSec : 0,
        alignment: entry.alignment ?? null
    };
}
export function validateBackupData({ library, projects, vocabulary, audioIndex, files }) {
    if (!library || typeof library !== 'object' || Array.isArray(library) ||
        !Array.isArray(projects) || !Array.isArray(vocabulary) || !Array.isArray(audioIndex) ||
        audioIndex.length > MAX_AUDIO_ITEMS) throw new Error('Backup-Inhalt fehlerhaft');
    const books = [];
    for (const [id, raw] of Object.entries(library)) {
        if (!validId(id) || !raw || raw.id !== id) throw new Error('Buch-ID ungültig');
        const pageCount = raw.pages?.length;
        const imageSnapshot = (raw.pages || []).map(p => [p?.imgUrl, p?.thumbUrl, p?.comicCleanImgUrl]);
        const cleaned = cleanImportedBook(raw);
        if (!cleaned || cleaned.pages.length !== pageCount ||
            cleaned.pages.some((p, i) => ['imgUrl', 'thumbUrl', 'comicCleanImgUrl'].some((field, j) =>
                imageSnapshot[i][j] !== p[field]))) throw new Error('Buch enthält ungültige Bilddaten');
        books.push(cleaned);
    }
    const ids = new Set(books.map(b => b.id));
    if (ids.size !== books.length) throw new Error('Doppelte Bücher');
    const projectIds = new Set();
    for (const p of projects) {
        if (!p || !validId(p.id) || projectIds.has(p.id) ||
            typeof p.type !== 'string' || typeof p.title !== 'string')
            throw new Error('Ungültiges SchreibZauber-Projekt');
        projectIds.add(p.id);
    }
    const words = new Set();
    for (const v of vocabulary) {
        if (!v || typeof v.word !== 'string' || !v.word || v.word.length > 200 || words.has(v.word))
            throw new Error('Ungültiger Vokabeleintrag');
        words.add(v.word);
    }
    const audio = [], keys = new Set(), referenced = new Set();
    let bytes = 0;
    for (let i = 0; i < audioIndex.length; i++) {
        const m = audioIndex[i];
        const filename = 'audio/' + String(i + 1).padStart(6, '0') + '.bin';
        if (!m || m.file !== filename || typeof m.key !== 'string' || !m.key.includes('|') ||
            m.key.length > 500 || keys.has(m.key) || !Number.isFinite(m.bytes) || m.bytes < 0 ||
            !/^audio\/[a-zA-Z0-9.+-]{1,40}$/.test(m.mime) ||
            !Number.isFinite(m.created) || !Number.isFinite(m.durationSec) || m.durationSec < 0)
            throw new Error('Sprachcache-Index ungültig');
        const item = files.get(filename);
        if (!item || item.size !== m.bytes) throw new Error('Sprachdatei fehlt oder Länge falsch: ' + filename);
        keys.add(m.key); referenced.add(filename);
        bytes += m.bytes;
        if (bytes > MAX_AUDIO_BYTES) throw new Error('Sprachcache überschreitet 2 GiB');
        audio.push({
            key: m.key, blob: item.slice(0, item.size, m.mime), mime: m.mime,
            bytes: m.bytes, created: m.created, durationSec: m.durationSec,
            alignment: m.alignment ?? null
        });
    }
    const allowed = new Set(['manifest.json', 'library.json', 'studio-projects.json',
        'vocabulary.json', 'audio/index.json', ...referenced]);
    if (files.size !== allowed.size || [...files.keys()].some(name => !allowed.has(name)))
        throw new Error('Unbekannte ZIP-Dateien');
    return { books, projects, vocabulary, audio };
}
async function parseJSONFile(files, name, maxBytes) {
    const blob = files.get(name);
    if (!blob || blob.size > maxBytes) throw new Error('Fehlender/zu großer Backupteil: ' + name);
    return JSON.parse(await blob.text());
}
export async function collectFullBackup() {
    const library = { ...app.library };
    const projects = Object.values(app.studio.projects || {}).filter(p => p && !p._draft);
    const vocabulary = Object.values(app.vocabulary || {});
    const entries = [
        { name: 'library.json', blob: jsonBlob(library) },
        { name: 'studio-projects.json', blob: jsonBlob(projects) },
        { name: 'vocabulary.json', blob: jsonBlob(vocabulary) }
    ];
    if (entries[0].blob.size > MAX_LIBRARY_JSON) throw new Error('Bibliothek zu groß für ZIP-Pilot');
    const keys = await app.dbOps.getTtsBackupKeys();
    if (keys.length > MAX_AUDIO_ITEMS) throw new Error('Zu viele Sprachaufnahmen');
    const index = [];
    let audioBytes = 0;
    for (let i = 0; i < keys.length; i++) {
        const item = await app.dbOps.getTtsAudio(keys[i]);
        if (!item || !(item.blob instanceof Blob)) throw new Error('Audio-Cache konnte nicht vollständig gelesen werden');
        const filename = 'audio/' + String(i + 1).padStart(6, '0') + '.bin';
        const meta = encodeAudioMetadata(item, filename);
        audioBytes += item.blob.size;
        if (audioBytes > MAX_AUDIO_BYTES) throw new Error('Audio-Backup überschreitet 2 GiB');
        index.push(meta);
        entries.push({ name: filename, blob: item.blob });
    }
    entries.push({ name: 'audio/index.json', blob: jsonBlob(index) });
    entries.unshift({ name: 'manifest.json', blob: jsonBlob({
        format: 'lesezauber-full-backup', version: 1, createdAt: new Date().toISOString(),
        books: Object.keys(library).length, projects: projects.length,
        vocabulary: vocabulary.length, audio: index.length, audioBytes,
        integrity: 'ZIP CRC32 per file; verified by importer',
        excludes: ['api-keys', 'profiles', 'voiceRecordings']
    }) });
    return { entries, stats: { books: Object.keys(library).length, audio: index.length, audioBytes } };
}
Object.assign(app.actions, {
    async exportFullBackup() {
        app.ui.showLoader('Komplettes Backup...', 'Bücher und vorhandene KI-Stimmen werden gesichert. Keine API-Anfragen.');
        try {
            const { entries, stats } = await collectFullBackup();
            const zip = await writeStoredZip(entries);
            const name = 'lesezauber-komplett-' + new Date().toISOString().slice(0, 10) + '.zip';
            downloadBlob(zip, name);
            localStorage.setItem('lz_last_export', String(Date.now()));
            app.ui.toast('Backup: ' + stats.books + ' Bücher, ' + stats.audio + ' gespeicherte KI-Audios. ZIP bitte sicher aufbewahren.', '📦');
        } catch (e) {
            console.error('Komplett-Export fehlgeschlagen:', e);
            app.ui.toast('Komplett-Export fehlgeschlagen: ' + e.message, '⚠️');
        } finally { app.ui.hideLoader(); }
    },
    triggerFullBackupImport() {
        document.getElementById('fullBackupImportFile').click();
    },
    async importFullBackup(event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        app.ui.showLoader('Backup überprüfen...', 'ZIP-Prüfsummen prüfen, keine Sprachanfragen.');
        try {
            const files = await readStoredZip(file);
            const manifest = await parseJSONFile(files, 'manifest.json', 100000);
            if (manifest.format !== 'lesezauber-full-backup' || manifest.version !== 1)
                throw new Error('Unbekanntes Backupformat');
            const library = await parseJSONFile(files, 'library.json', MAX_LIBRARY_JSON);
            const projects = await parseJSONFile(files, 'studio-projects.json', MAX_LIBRARY_JSON);
            const vocabulary = await parseJSONFile(files, 'vocabulary.json', MAX_INDEX_JSON);
            const audioIndex = await parseJSONFile(files, 'audio/index.json', MAX_INDEX_JSON);
            const data = validateBackupData({ library, projects, vocabulary, audioIndex, files });
            if (data.books.length !== manifest.books || data.projects.length !== manifest.projects ||
                data.vocabulary.length !== manifest.vocabulary || data.audio.length !== manifest.audio ||
                data.audio.reduce((a, b) => a + b.bytes, 0) !== manifest.audioBytes)
                throw new Error('Backup-Zähler stimmen nicht überein');
            // Intentional: restore only into a fresh destination, never merge/overwrite silently.
            if (!window.confirm('Geprüft: ' + data.books.length + ' Bücher, ' + data.audio.length +
                ' KI-Audios. Nur in eine LEERE LeseZauber-Datenbank importieren. Fortfahren?')) return;
            await app.dbOps.restoreEmptyFullBackup(data);
            app.ui.toast('Komplettes Backup wiederhergestellt. Bitte App neu laden und Vorlesen ohne API testen.', '✅');
        } catch (e) {
            console.error('Komplett-Import fehlgeschlagen:', e);
            app.ui.toast('Komplett-Import abgebrochen: ' + e.message, '⚠️');
        } finally { app.ui.hideLoader(); }
    }
});
