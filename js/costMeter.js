import { app } from './core.js';

// ============== Rein lokale Kosten-/Verbrauchsanzeige ==============
// Zaehlt mit, wie viele Zeichen im laufenden Kalendermonat TATSAECHLICH an
// einen TTS-Anbieter gegangen sind (Treffer aus dem ttsCache kosten den
// Anbieter nichts und zaehlen deshalb NICHT mit - siehe der Aufruf in
// ttsNeural.js, direkt nach dem Cache-Fehlschlag). Daraus wird ein
// GESCHAETZTER Betrag berechnet, keine Anbieter-Abrechnung.
//
// Bewusst NICHT eingebaut: eine Abrechnungs-API des Anbieters abfragen
// (gibt es bei keinem der Anbieter fuer den Browser), oder den Zaehler als
// Sperre nutzen (das ist ein separater Auftrag: Tarif-Lock).

const STORAGE_KEY = 'lz_cost_meter';

// USD pro 1 Million Zeichen - GESCHAETZT, Stand 2026-09-17. Bitte immer die
// aktuelle Preisliste des Anbieters pruefen (siehe pricingUrl in
// ttsProviders.js), Preise aendern sich haeufig und haengen vom gewaehlten
// Tarif/Volumen ab. Verbindlich ist ausschliesslich die Abrechnung des
// Anbieters selbst.
const TTS_PRICE_PER_MILLION_CHARS = {
    device: 0, // Gerätestimme läuft lokal im Browser - keine Kosten.
    // Gemini-TTS wird in dieser App laut Hinweistext (ttsProviders.js) nur
    // im kostenlosen Tarif genutzt - deshalb hier 0 als Schätzung. Wer
    // manuell auf einen Bezahltarif wechselt, muss selbst nachsehen unter
    // https://ai.google.dev/gemini-api/docs/pricing.
    gemini: 0,
    // Google Cloud Chirp 3 HD: ca. 30 USD/1 Mio. Zeichen laut
    // https://cloud.google.com/text-to-speech/pricing (deckt sich mit dem
    // Hinweistext des Anbieters in ttsProviders.js).
    googlecloud: 30,
    // ca. 100 USD/1 Mio. Zeichen - deckt sich mit der bereits vorhandenen
    // Einschätzung in docs/TODO-GESAMT.md (Vergleich mit Speechify).
    // Quelle: https://elevenlabs.io/pricing, hängt stark vom gebuchten
    // Tarif/Overage ab - bei kleineren Tarifen (z.B. "Creator") eher
    // Richtung 200+ USD/1 Mio. Zeichen.
    elevenlabs: 100,
    // gpt-4o-mini-tts: laut Hinweistext ca. 1,3 US-Cent je Minute Audio
    // (https://openai.com/api/pricing/), grob umgerechnet bei rund 900
    // gesprochenen Zeichen pro Minute Vorlesetempo.
    openai: 14
};

function monthKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function load() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
        console.error('Kosten-Zähler konnte nicht gelesen werden:', e);
        return {};
    }
}

function save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function addEntry(bucket, key, chars) {
    const data = load();
    const month = monthKey();
    if (!data[bucket]) data[bucket] = {};
    if (!data[bucket][month]) data[bucket][month] = {};
    if (!data[bucket][month][key]) data[bucket][month][key] = { chars: 0, requests: 0 };
    data[bucket][month][key].chars += chars;
    data[bucket][month][key].requests += 1;
    save(data);
}

Object.assign(app.costMeter, {
    // Wird NUR bei einer echten Synthese aufgerufen, nicht bei einem
    // ttsCache-Treffer (siehe Aufrufstelle in ttsNeural.js).
    trackTts(providerId, charCount) {
        if (!charCount) return;
        addEntry('tts', providerId, charCount);
    },

    // Gemini-Textaufrufe aus api.js (Seitenanalyse, Buch-Quiz, Bildfragen,
    // Blatt-Kontrolle). Nur zur groben Orientierung - bei Bild-Analysen
    // haengen die tatsaechlichen Kosten stark vom Bild-Anteil ab, nicht nur
    // vom Text, deshalb hier bewusst ohne Preis-Umrechnung, nur Umfang.
    trackGeminiText(charCount) {
        if (!charCount) return;
        addEntry('geminiText', 'gemini', charCount);
    },

    // Zahlen fuer den aktuellen Kalendermonat, aufbereitet fuers Rendern.
    currentMonthStats() {
        const data = load();
        const month = monthKey();
        const ttsMonth = (data.tts || {})[month] || {};

        const providers = Object.keys(ttsMonth).map(id => {
            const entry = ttsMonth[id];
            const pricePerMillion = TTS_PRICE_PER_MILLION_CHARS[id] || 0;
            const provider = app.ttsProviders.get(id);
            return {
                id,
                label: provider ? provider.label.split(' (')[0] : id,
                chars: entry.chars,
                requests: entry.requests,
                estCost: (entry.chars / 1_000_000) * pricePerMillion
            };
        }).sort((a, b) => b.estCost - a.estCost || b.chars - a.chars);

        const totalCost = providers.reduce((sum, p) => sum + p.estCost, 0);
        const geminiText = ((data.geminiText || {})[month] || {}).gemini || { chars: 0, requests: 0 };

        return { month, providers, totalCost, geminiText };
    },

    // Setzt nur den aktuellen Kalendermonat zurueck - vergangene Monate
    // bleiben als Verlauf erhalten, falls spaeter mal eine Historie-Ansicht
    // dazukommt.
    reset() {
        // FIX: Sicherheitsnetz wie bei den anderen gesperrten Aktionen - der
        // Knopf ist für Kinderprofile bereits disabled, ein altes offenes
        // Einstellungen-Fenster könnte das aber umgehen.
        if (app.utils.isSettingsLockedForActiveProfile()) return;
        const data = load();
        const month = monthKey();
        if (data.tts) delete data.tts[month];
        if (data.geminiText) delete data.geminiText[month];
        save(data);
        app.ui.toast('Kosten-Zähler für diesen Monat zurückgesetzt', '🗑️');
        app.render.costMeterCard();
    }
});
