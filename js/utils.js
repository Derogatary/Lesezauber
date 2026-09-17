import { app } from './core.js';

const READING_MAX_WIDTH = 1600; // Für den Reader (große Ansicht)
const THUMB_MAX_WIDTH = 300;    // Für Bibliotheks-/Buch-Übersicht
const IMAGE_QUALITY = 0.8;

// Zeichnet eine Bildquelle (Video-Frame oder <img>-Element) verkleinert auf
// einen Canvas und gibt sie als WebP-Data-URL zurück. WebP ist ein
// modernes Bildformat, das bei gleicher sichtbarer Qualität ca. 25-30%
// kleiner ist als JPEG. Browser, die WebP nicht unterstützen, fallen laut
// Web-Standard automatisch auf PNG zurück - kein zusätzlicher Code nötig.
function drawScaled(source, naturalWidth, naturalHeight, maxWidth, quality) {
    const scale = Math.min(1, maxWidth / naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(naturalWidth * scale) || 1;
    canvas.height = Math.round(naturalHeight * scale) || 1;
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/webp', quality);
}

Object.assign(app.utils, {
    // Lädt eine hochgeladene Datei als <img>-Element - liefert Breite/Höhe
    // und ist als Quelle für drawScaled() nutzbar.
    loadImageElement(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('Bild konnte nicht gelesen werden.'));
                img.src = reader.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },

    // NEU: erzeugt aus einer Bildquelle ZWEI WebP-Varianten in einem
    // Rutsch - "full" (Lesegröße, max. 1600px) für den Reader und "thumb"
    // (max. 300px) für die Übersichts-Grids. Beides zusammen ist trotzdem
    // kleiner als vorher eine einzelne JPEG-Version in voller Größe.
    createImageVariants(source, naturalWidth, naturalHeight) {
        return {
            full: drawScaled(source, naturalWidth, naturalHeight, READING_MAX_WIDTH, IMAGE_QUALITY),
            thumb: drawScaled(source, naturalWidth, naturalHeight, THUMB_MAX_WIDTH, IMAGE_QUALITY)
        };
    },

    // NEU: ermittelt den Text-Satz einer Seite für eine bestimmte Persona.
    // Alte Seiten (vor dieser Funktion gescannt) haben nur flache Felder
    // ohne "variants" - die dienen dann als universeller Rückfall für
    // jede Persona, die noch keine eigene Version hat.
    resolvePageVariant(page, personaId) {
        if (page.variants && page.variants[personaId]) return page.variants[personaId];
        if (page.text) {
            return {
                text: page.text,
                erstleserText: page.erstleserText,
                desc: page.desc,
                quizQ: page.quizQ,
                quizA: page.quizA
            };
        }
        return null;
    },

    // NEU: liefert ein echtes Profil für ein NEU erstelltes Buch. Ist
    // gerade der "Alle Profile"-Filter aktiv, würde das Buch sonst dem
    // ungültigen Wert "__all__" zugeordnet und wäre danach in keinem
    // echten Profil mehr sichtbar - fällt dann auf das erste echte Profil
    // zurück.
    resolveCreationProfileId() {
        if (app.state.currentProfileId && app.state.currentProfileId !== '__all__') {
            return app.state.currentProfileId;
        }
        return app.profiles[0]?.id || 'default';
    },

    // NEU: findet EINE vorhandene Textversion einer Seite - bevorzugt die
    // angegebene Persona, fällt aber auf jede andere bereits vorhandene
    // zurück. Sinnvoll für Fälle wie den Druck, wo der Original-Text
    // ohnehin persona-unabhängig sein sollte, aber vielleicht nur für eine
    // ANDERE Persona schon erzeugt wurde.
    resolveAnyVariant(page, preferredPersonaId) {
        const preferred = this.resolvePageVariant(page, preferredPersonaId);
        if (preferred) return preferred;
        if (page.variants) {
            const anyKey = Object.keys(page.variants)[0];
            if (anyKey) return page.variants[anyKey];
        }
        return null;
    },

    // NEU: Buchart eines Buches sicher lesen. Bücher aus der Zeit vor dem
    // Heft-Modus haben gar kein bookType-Feld - die sind selbstverständlich
    // Geschichten, sonst würden sie plötzlich als Übungsheft angezeigt.
    resolveBookType(book) {
        const type = book && book.bookType;
        return app.bookTypes.some(t => t.id === type) ? type : 'story';
    },

    // NEU: baut aus einer KI-Antwort den Varianten-Datensatz einer Seite.
    // Liegt bewusst hier und nicht im Scanner: die Hintergrund-Vorbereitung
    // (backgroundPregen.js) braucht exakt dieselbe Umrechnung, und zwei
    // Kopien davon würden beim nächsten Feld garantiert auseinanderlaufen.
    buildPageVariant(result, page, bookType) {
        if (bookType === 'workbook') {
            // Übungsheft: gedruckte Aufgabenstellung, kindgerechte Erklärung,
            // Hilfeschritte, Lösung. text/erstleserText/desc bleiben absichtlich
            // die gleichen Feldnamen wie bei Geschichten - so funktionieren
            // Vorlesen, Druck und Anzeige ohne Sonderfälle weiter.
            return {
                text: page.pdfSourceText || result.taskText || 'Keine Aufgabe erkannt.',
                erstleserText: result.taskExplained || result.taskText || 'Keine Aufgabe erkannt.',
                desc: result.pageDescription || null,
                // Übungshefte bekommen KEINE Rätselfrage - die Seite stellt
                // ja selbst schon eine Aufgabe. Bleibt leer, damit der
                // Auto-Vorlese-Modus sie überspringt.
                quizQ: null,
                quizA: null,
                taskType: result.taskType || 'sonstiges',
                materials: result.materials || null,
                helpSteps: Array.isArray(result.helpSteps) ? result.helpSteps.filter(Boolean) : [],
                solution: result.solution || null
            };
        }

        return {
            // Ist der Text aus einer PDF-Textebene bekannt, wird GENAU
            // dieser statt der KI-Erkennung verwendet - garantiert
            // korrekt, keine OCR-Fehler möglich.
            text: page.pdfSourceText || result.originalText || 'Kein Text.',
            erstleserText: result.simplifiedText || page.pdfSourceText || result.originalText || 'Kein Text.',
            // Bei reinen Textseiten (hasIllustration=false) keine erzwungene,
            // sinnlose Bildbeschreibung - bleibt leer, die Anzeige/das
            // Vorlesen blendet das dann einfach aus.
            desc: result.hasIllustration === false ? null : (result.imageDescription || null),
            quizQ: result.quizQuestion || (result.hasIllustration === false ? 'Worum ging es auf dieser Seite?' : 'Was siehst du auf dem Bild?'),
            quizA: result.quizAnswer || 'Schau genau hin!',
            // NEU (Audio-Tags): nur fürs Vorlesen gedacht, NIE für die
            // Anzeige - siehe app.tts._pickSpeechVariant(). Ist bei
            // bekanntem PDF-Text (s.o.) kein eigener speechText sinnvoll,
            // weil dort auch "text" schon feststeht statt von der KI erzeugt
            // zu werden - dann bleibt es beim normalen Text.
            speechText: page.pdfSourceText ? null : (result.speechText || null)
        };
    },

    // NEU: Kontroll-Ergebnis einer Seite für das aktuelle Kind-Profil.
    // Wie überall gilt: nie page.check direkt lesen - Seiten aus der Zeit
    // vor dieser Funktion haben das Feld gar nicht.
    resolvePageCheck(page, profileId) {
        const id = profileId || this.resolveCreationProfileId();
        return (page && page.check && page.check[id]) || null;
    },

    // NEU: zählt, wie viele Persona-Varianten in der gesamten Bibliothek
    // noch fehlen - für die Fortschrittsanzeige der Hintergrund-Vorbereitung.
    countMissingVariants() {
        let missing = 0;
        Object.values(app.library).forEach(book => {
            book.pages.forEach(page => {
                if (page.status !== 'done') return;
                app.personas.forEach(persona => {
                    if (!(page.variants && page.variants[persona.id])) missing++;
                });
            });
        });
        return missing;
    },

    // NEU: Lese-Serie (Streak) - pro Profil getrennt, da Familienmitglieder
    // an unterschiedlichen Tagen lesen können.
    _dateStr(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },

    // FIX: nutzt wie resolveCreationProfileId() nie "__all__" als Schlüssel -
    // sonst würde die Serie beim Umschalten auf ein echtes Profil unter
    // einem anderen Speicherplatz "verschwinden" (kein Absturz, nur falsch
    // zugeordnet).
    getStreakInfo() {
        const key = `lz_streak_${this.resolveCreationProfileId()}`;
        try {
            return JSON.parse(localStorage.getItem(key) || 'null') || { lastReadDate: null, currentStreak: 0 };
        } catch (e) {
            return { lastReadDate: null, currentStreak: 0 };
        }
    },

    // Wird bei jedem Öffnen einer Lese-Seite aufgerufen. Zählt nur einmal
    // pro Kalendertag, egal wie viele Seiten an dem Tag gelesen werden.
    recordReadToday() {
        const key = `lz_streak_${this.resolveCreationProfileId()}`;
        const today = new Date();
        const todayStr = this._dateStr(today);

        const data = this.getStreakInfo();
        if (data.lastReadDate === todayStr) return data; // heute schon gezählt

        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = this._dateStr(yesterday);

        data.currentStreak = (data.lastReadDate === yesterdayStr) ? data.currentStreak + 1 : 1;
        data.lastReadDate = todayStr;

        localStorage.setItem(key, JSON.stringify(data));
        return data;
    },

    // NEU: entfernt Emojis vor dem Vorlesen (Browser würden sonst versuchen,
    // sie als Wort auszusprechen) und ersetzt sie durch ein Komma als
    // kleine, natürliche Sprechpause.
    stripEmojiForSpeech(text) {
        if (!text) return text;
        return text
            .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{2B00}-\u{2BFF}]/gu, ', ')
            .replace(/,\s*,/g, ',')
            .replace(/\s+/g, ' ')
            .trim();
    },

    // NEU (Audio-Tags): entfernt Sprech-Anweisungen in eckigen Klammern
    // (z.B. "[flüstert]", "[lacht]") aus speechText. Sicherheitsnetz für
    // Anbieter ohne supportsTags (js/ttsProviders.js) bzw. die
    // Gerätestimme - sonst würde buchstäblich "eckige Klammer lacht"
    // vorgelesen.
    stripSpeechTags(text) {
        if (!text) return text;
        return text.replace(/\[[^[\]]{1,40}\]/g, '').replace(/\s+/g, ' ').trim();
    },

    // NEU: zerlegt einen (bereits emoji-bereinigten) Text in Wörter mit
    // ihrer Zeichenposition. Basis sowohl für die Hervorhebung im Reader
    // als auch für Untertitel/Karaoke-Timing beim geplanten Video-Export -
    // deshalb bewusst ohne DOM, damit beides dieselbe Zerlegung nutzt.
    speechWordOffsets(cleanText) {
        const words = [];
        let idx = 0;
        (cleanText || '').split(/(\s+)/).forEach(token => {
            const start = idx;
            idx += token.length;
            if (token === '' || /^\s+$/.test(token)) return;
            words.push({ word: token, start });
        });
        return words;
    },

    // NEU: baut aus einem Text HTML mit einem <span> pro Wort (inkl.
    // Start-Index), damit beim Vorlesen genau das gerade gesprochene Wort
    // hervorgehoben werden kann (Speedreader-artig). Nutzt den bereits
    // emoji-bereinigten Text, damit die Zeichen-Positionen exakt zu dem
    // passen, was der Browser tatsächlich vorliest.
    buildSpeechHighlightHtml(text) {
        const clean = this.stripEmojiForSpeech(text);
        let idx = 0;
        const html = clean.split(/(\s+)/).map(token => {
            const start = idx;
            idx += token.length;
            if (token === '' || /^\s+$/.test(token)) return token;
            return `<span class="speech-word" data-start="${start}">${this.sanitize(token)}</span>`;
        }).join('');
        return { clean, html };
    },

    // NEU: teilt Text in Text-/Emoji-Häppchen auf - Basis für den
    // Mitmachmodus, der vor jedem emoji-ersetzten Wort eine Sprechpause
    // zum Mitraten einlegt (siehe app.tts.speakMitmach). Gleiche
    // Emoji-Zeichenbereiche wie stripEmojiForSpeech, damit beide Stellen
    // konsistent erkennen, was ein "Emoji-Wort" ist.
    splitBySpeechEmoji(text) {
        if (!text) return [];
        const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{2B00}-\u{2BFF}]/gu;
        const parts = [];
        let lastIndex = 0;
        let match;
        while ((match = EMOJI_RE.exec(text)) !== null) {
            if (match.index > lastIndex) parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
            parts.push({ type: 'emoji', value: match[0] });
            lastIndex = EMOJI_RE.lastIndex;
        }
        if (lastIndex < text.length) parts.push({ type: 'text', value: text.slice(lastIndex) });
        return parts;
    },

    // NEU: deutsches Ordnungswort für die Inhaltsverzeichnis-Ansage
    // ("das erste Kapitel ist...", "das zweite..."). Reicht für die in
    // Kinderbüchern üblichen Kapitelzahlen, danach numerischer Fallback.
    germanOrdinal(n) {
        const words = ['nullte', 'erste', 'zweite', 'dritte', 'vierte', 'fünfte', 'sechste', 'siebte', 'achte', 'neunte', 'zehnte', 'elfte', 'zwölfte', 'dreizehnte', 'vierzehnte', 'fünfzehnte', 'sechzehnte', 'siebzehnte', 'achtzehnte', 'neunzehnte', 'zwanzigste'];
        return words[n] || `${n}.`;
    },

    sanitize(str) {
        if (!str) return '';
        const temp = document.createElement('div');
        temp.textContent = str;
        return temp.innerHTML;
    },

    // Cover-Bild ermitteln: nutzt book.coverPageId falls gesetzt (per
    // Seiten-ID statt Index - bleibt korrekt, auch wenn Seiten gelöscht
    // oder verschoben werden). Bevorzugt die kleine Thumbnail-Variante
    // (schneller in den Grids), fällt bei älteren Büchern ohne thumbUrl
    // auf das volle Bild zurück.
    resolveCoverUrl(book) {
        if (book.coverPageId) {
            const found = book.pages.find(p => p.id === book.coverPageId);
            if (found) return found.thumbUrl || found.imgUrl;
        }
        const first = book.pages[0];
        return first ? (first.thumbUrl || first.imgUrl) : '';
    }
});
