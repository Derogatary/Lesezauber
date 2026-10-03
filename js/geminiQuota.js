import { app } from './core.js';

// ================= 📊 Gemini-Kontingent merken (v0.56.0-beta) =================
// NEU (Nutzerwunsch: "ein State-Manager, der sich merkt, dass das
// Tagesguthaben aufgebraucht ist - wann wird es zurückgesetzt? Danach müsste
// man es bei uns auch zurücksetzen"):
//
// Vorher war die Modell-Rotation (js/api.js, js/studio/studioApi.js,
// js/atlas/atlasApi.js) "vergesslich": JEDER Aufruf fing wieder beim besten
// Modell an und lief erst in dessen 429, dann ins nächste ... - bei fünf
// Modellen also bis zu fünf vergebliche Anfragen pro Seite, und im
// Nachtmodus wurde stundenlang gegen ein leeres Kontingent geklopft.
//
// Jetzt wird pro Modell gemerkt, bis wann es gesperrt ist:
// - Tageslimit (Google meldet im 429 eine Quote "...PerDay..."): bis zur
//   nächsten Mitternacht PAZIFIK-Zeit - so setzt Google die Tageskontingente
//   der Gemini-API zurück (laut Google-Doku "Rate limits", Stand Okt. 2026).
//   In Deutschland meist 9:00 Uhr morgens (in den paar Wochen, in denen die
//   USA schon/noch Sommerzeit haben und wir nicht, 8:00 Uhr).
// - Minutenlimit: so lange, wie Google im 429 als "retryDelay" angibt
//   (sonst 60 Sekunden).
// Abgelaufene Sperren verfallen von selbst - das ist das "Zurücksetzen bei
// uns". Zusätzlich gibt es einen Knopf in den Einstellungen (z.B. nach einem
// Tarif-Wechsel), und ein anderer API-Key (anderes Projekt = anderes
// Kontingent) ignoriert die alten Einträge automatisch.
//
// Gespeichert in localStorage (überlebt Neuladen/Neustart der App).

const STORAGE_KEY = 'lz_gemini_quota';
const MINUTE_FALLBACK_MS = 60 * 1000;
const RESET_TZ = 'America/Los_Angeles';

function keyTag() {
    const k = app.settings?.apiKey || '';
    return k ? k.slice(-6) : '';
}

function load() {
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        // anderer Key = anderes Projekt = anderes Kontingent
        if (raw.keyTag !== keyTag()) return { keyTag: keyTag(), models: {}, usage: null };
        return { keyTag: raw.keyTag, models: raw.models || {}, usage: raw.usage || null };
    } catch (e) {
        console.error('Kontingent-Speicher unlesbar - wird zurückgesetzt:', e);
        return { keyTag: keyTag(), models: {}, usage: null };
    }
}

// NEU (v0.56.1-beta, Nutzerfrage "kann man abrufen, welche Rates noch offen
// sind?"): Google bietet dafür KEINE Abfrage an - die Antworten tragen keine
// Kontingent-Angaben, sichtbar ist es nur in AI Studio. Deshalb zählt die App
// selbst mit: erfolgreiche Anfragen je Modell seit dem letzten Zurücksetzen
// (Kalendertag in Pazifik-Zeit). Zählt nur, was DIESES Gerät geschickt hat.
function dayKey(now = Date.now()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: RESET_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
}

function save(state) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.error('Kontingent-Speicher konnte nicht gespeichert werden:', e);
    }
}

// Uhrzeit-Bestandteile in einer Zeitzone (für die Mitternachts-Rechnung)
function partsIn(tz, ms) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23', hour: 'numeric', minute: 'numeric', second: 'numeric'
    }).formatToParts(new Date(ms));
    const get = (t) => Number(parts.find(p => p.type === t)?.value || 0);
    return { h: get('hour'), m: get('minute'), s: get('second') };
}

// Reine Funktion (Unit-Test): nächste Mitternacht in der Zeitzone tz
function nextMidnight(now, tz = RESET_TZ) {
    const { h, m, s } = partsIn(tz, now);
    const sinceMidnight = ((h * 60 + m) * 60 + s) * 1000 + (now % 1000);
    let next = now - sinceMidnight + 24 * 3600 * 1000;
    // Tage mit Zeitumstellung haben 23 bzw. 25 Stunden - nachkorrigieren
    const check = partsIn(tz, next).h;
    if (check === 23) next += 3600 * 1000;
    else if (check === 1) next -= 3600 * 1000;
    return next;
}

// Reine Funktion (Unit-Test): Google-429-Antwort deuten
// -> { kind: 'day' | 'minute', retryMs }
function classify429(body) {
    const details = body?.error?.details || [];
    const violations = details.flatMap(d => d?.violations || []);
    const isDay = violations.some(v => /PerDay/i.test(`${v?.quotaId || ''} ${v?.quotaMetric || ''}`))
        || /per day|PerDay/i.test(body?.error?.message || '');
    const retry = details.find(d => typeof d?.retryDelay === 'string')?.retryDelay;
    const seconds = parseFloat(retry || '');
    return { kind: isDay ? 'day' : 'minute', retryMs: isNaN(seconds) ? null : seconds * 1000 };
}

function formatTime(ms) {
    return new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function formatWhen(ms, now = Date.now()) {
    const sameDay = new Date(ms).toDateString() === new Date(now).toDateString();
    return sameDay ? `${formatTime(ms)} Uhr` : `morgen ${formatTime(ms)} Uhr`;
}

app.geminiQuota = {
    nextMidnight,
    classify429,
    formatWhen,

    // Gesperrt? (abgelaufene Einträge zählen nicht)
    blockOf(model, now = Date.now()) {
        const entry = load().models[model];
        return entry && entry.until > now ? entry : null;
    },

    // Modelle, die gerade probiert werden dürfen (Reihenfolge bleibt)
    usable(models, now = Date.now()) {
        return models.filter(m => !this.blockOf(m, now));
    },

    allBlocked(models = app.api.geminiModels || [], now = Date.now()) {
        return models.length > 0 && this.usable(models, now).length === 0;
    },

    // Frühester Zeitpunkt, ab dem wieder ein Modell frei ist (oder null)
    nextFreeAt(models = app.api.geminiModels || [], now = Date.now()) {
        const untils = models.map(m => this.blockOf(m, now)?.until).filter(Boolean);
        return untils.length === models.length && untils.length ? Math.min(...untils) : null;
    },

    // Alle Modelle wegen TAGESlimit gesperrt? (Minutenlimits erholen sich gleich)
    dailyExhausted(models = app.api.geminiModels || [], now = Date.now()) {
        return models.length > 0 && models.every(m => this.blockOf(m, now)?.kind === 'day');
    },

    // Aufruf bei HTTP 429: liest Googles Begründung, merkt die Sperre und
    // gibt den Fehler "RATE_LIMITED" zurück, den die Rotation erwartet.
    async rateLimited(model, res) {
        let body = null;
        try { body = await res.json(); } catch (e) { /* kein JSON - dann Minutenlimit annehmen */ }
        const { kind, retryMs } = classify429(body);
        const now = Date.now();
        const until = kind === 'day' ? nextMidnight(now) : now + (retryMs ?? MINUTE_FALLBACK_MS);
        const state = load();
        state.models[model] = { kind, until, at: now };
        save(state);
        console.warn(`${model}: ${kind === 'day' ? 'Tageskontingent aufgebraucht' : 'Minutenlimit'} - gesperrt bis ${new Date(until).toLocaleString('de-DE')}`);
        app.render.geminiQuotaStatus?.();
        return new Error('RATE_LIMITED');
    },

    // Fehler, wenn kein Modell mehr frei ist - mit Uhrzeit im Text
    exhaustedError(models = app.api.geminiModels || []) {
        const at = this.nextFreeAt(models);
        const daily = this.dailyExhausted(models);
        const msg = daily
            ? `Gemini-Tageskontingent aller Modelle aufgebraucht (429) - wieder frei ab ${formatWhen(at)}`
            : `Gemini-Limit bei allen Modellen erreicht (429)${at ? ` - wieder frei ab ${formatWhen(at)}` : ''}`;
        const err = new Error(msg);
        err.quotaExhausted = true;
        err.until = at;
        err.daily = daily;
        return err;
    },

    // Für die Anzeige in den Einstellungen
    status(models = app.api.geminiModels || [], now = Date.now()) {
        const used = this.usedToday(now);
        return models.map(m => ({ model: m, block: this.blockOf(m, now), used: used[m] || 0 }));
    },

    // Erfolgreiche Anfrage mitzählen (aufgerufen von allen drei Rotationen)
    noteSuccess(model, now = Date.now()) {
        const state = load();
        const day = dayKey(now);
        if (!state.usage || state.usage.day !== day) state.usage = { day, counts: {} };
        state.usage.counts[model] = (state.usage.counts[model] || 0) + 1;
        save(state);
    },

    // { modell: anzahl } seit dem letzten Zurücksetzen bei Google
    usedToday(now = Date.now()) {
        const usage = load().usage;
        return usage && usage.day === dayKey(now) ? { ...usage.counts } : {};
    },

    clear() {
        // Zähler bleibt - er beschreibt, was heute wirklich verschickt wurde
        save({ keyTag: keyTag(), models: {}, usage: load().usage });
        app.render.geminiQuotaStatus?.();
    }
};

Object.assign(app.actions, {
    // Knopf in den Einstellungen
    resetGeminiQuota() {
        app.geminiQuota.clear();
        app.ui.toast('Gemini-Kontingent-Sperren zurückgesetzt - beim nächsten Aufruf wird wieder das beste Modell probiert.', '🔄');
    }
});
