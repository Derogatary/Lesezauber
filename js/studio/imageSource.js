import { app } from '../core.js';
import './imageFormats.js';
import './placeholder.js';
import './studioPrompts.js';

// NEU: Adapter-Schicht zwischen "ich brauche ein Bild" und "woher kommt es".
// Der restliche Code fragt NUR über app.studio.imageSource.request(...) an und
// erfährt nie, ob das Bild ein Platzhalter, ein Handy-Foto oder KI-generiert
// ist. Dadurch ist der spätere Austausch ein Ein-Zeilen-Wechsel und kein Umbau.
//
// Jede Quelle liefert dieselbe Form zurück: { full, thumb, meta }
// meta.source sagt, woher das Bild stammt - daran erkennt die App später,
// welche Bilder noch ersetzt werden müssen.

// Ein einziger Prompt-Bauplan für ALLE Quellen. Auch wenn gerade Platzhalter
// benutzt werden, wird der Prompt schon mitgespeichert - damit später nur noch
// die Quelle gewechselt werden muss und nicht der halbe Prompt neu entsteht.
// (Und: derselbe Text lässt sich kopieren und kostenlos von Hand in einem
// KI-Chat erzeugen - siehe docs/KONZEPT-Bildquellen.md, Weg "Prompt-Export".)
function buildPrompt({ formatId, sketch, style, characters = [], textPos }) {
    const fmt = app.studio.formats.get(formatId);
    if (!fmt) return '';

    // NEU: welche Zone frei bleiben soll, richtet sich jetzt nach dem
    // (pro Doppelseite unterschiedlichen) textPos statt einer für das ganze
    // Format immer gleichen Zone - siehe js/studio/imageFormats.js textZones
    // und die Auswahl in studioCore.js (pickAutoTextPos). Ohne textPos oder
    // bei Formaten ohne textZones (Figurenblatt, Arbeitsheft-Bild) bleibt
    // fmt.textZone der Rückfall.
    const zoneLabel = fmt.textZones?.[textPos] || fmt.textZone;
    // NEU (KDP-Seitenlayout-Varianten): bei "eigener Textstreifen" oder
    // "Vollbild ohne Text" liegt KEIN Text über dem Bild - dann auch keine
    // Fläche freihalten lassen (das Bild darf die ganze Fläche nutzen).
    const noTextOnImage = ['band-oben', 'band-unten', 'ohne'].includes(textPos) && !fmt.fold;

    const parts = [
        `Illustration für ein Kinderbuch. Bildinhalt: ${sketch || 'noch offen'}.`,
        style ? `Stil: ${style}.` : '',
        characters.length
            ? `Figuren (Aussehen exakt wie beschrieben beibehalten): ${characters.map(c => `${c.name} – ${c.sheetText}`).join(' | ')}.`
            : '',
        `Seitenverhältnis ${fmt.aspect}.`,
        // Harte Regeln - stehen bewusst in JEDEM Prompt, nicht optional:
        'KEIN Text, KEINE Buchstaben, KEINE Zahlen und KEINE Sprechblasen im Bild.',
        fmt.textZone !== 'keine' && !noTextOnImage && textPos !== 'ohne'
            ? `Halte im Bereich "${zoneLabel}" eine ruhige, kontrastarme Fläche frei, auf der später Text liegt.`
            : '',
        // NEU (KDP-Panorama): das Breitbild wird in der Mitte gefalzt.
        fmt.fold
            ? 'Das Bild wird in der Mitte senkrecht gefalzt (Buchbindung): im mittleren Zehntel keine Gesichter, Figuren oder wichtigen Details - dort nur ruhiger Hintergrund, der über beide Hälften durchläuft.'
            : '',
        'Kindgerecht, freundlich, keine Gewalt, keine Angstmotive, keine realen Personen, keine Markenzeichen.',
        // FIX (Nutzerwunsch "was landet im Prompt"): hier stand bisher der
        // komplette guardrailsBlock() (Text-Prompt-Leitplanken inkl. Amazon-
        // KDP-Absatz und "Text bleibt reiner Text, kein Bild wird hier
        // erzeugt") 1:1 mit im Bild-Prompt - bei Pollinations (reines
        // Text-zu-Bild-Modell ohne Sprachverständnis) verdünnt/stört so ein
        // langer, bildfremder Text-Absatz eher die eigentliche
        // Bildbeschreibung, statt als Regel verstanden zu werden. Jetzt nur
        // noch der für ein BILD tatsächlich relevante Satz daraus, siehe
        // app.studio.prompts.imageGuardrailsLine() in studioPrompts.js.
        app.studio.prompts.imageGuardrailsLine()
    ];
    return parts.filter(Boolean).join(' ');
}

// NEU (Stufe 2): Modell-Konstante für die ECHTE Bildgenerierung, analog zu
// GEMINI_MODEL in studioApi.js/js/api.js - ein Modellwechsel bleibt eine
// Zeile. Nur wirksam, wenn app.studio.resolveImageSourceId() tatsächlich
// 'gemini' liefert (siehe studioCore.js) - das ist an eine ausdrückliche
// Bestätigung in den Einstellungen gebunden, NICHT Standard (Konzept TEIL G
// Punkt 1: der Bild-Endpunkt braucht eine Zahlungsmethode am Google-Konto).
const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image';

// Wandelt eine data:-URL (WebP-Base64, wie sie createImageVariants()
// erzeugt) in die Form um, die Gemini als inlineData-Referenzbild erwartet.
function dataUrlToInlineData(dataUrl) {
    const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
    if (!match) return null;
    return { mimeType: match[1], data: match[2] };
}

// Lädt eine bereits im Speicher liegende data:- oder blob:-URL als
// <img>-Element - gebraucht, um ein von Gemini ODER Pollinations geliefertes
// Bild wie jedes andere über app.utils.createImageVariants() in die zwei
// WebP-Größen zu bringen. Bewusst eine eigene, kleine Funktion statt
// app.utils.loadImageElement(): die dort erwartet eine hochgeladene File(),
// hier liegt die Bild-URL schon fertig im Speicher.
function loadImageFromUrl(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Geliefertes Bild konnte nicht gelesen werden.'));
        img.src = url;
    });
}

// NEU (Pollinations-Quelle): "gleicher Text -> gleiche Zahl", keine
// Kryptographie nötig - nur damit dieselbe(n) Figur(en) über mehrere Seiten
// hinweg denselben Seed bekommen (etwas konsistenterer Stil, siehe
// providers.pollinations unten).
function hashSeed(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (Math.imul(hash, 31) + str.charCodeAt(i)) >>> 0;
    }
    return hash;
}

const providers = {
    // 1) Platzhalter - immer verfügbar, kostenlos, offline, sofort.
    placeholder(spec) {
        return app.studio.placeholder.create(spec.formatId, {
            title: spec.title,
            note: spec.sketch,
            index: spec.index
        });
    },

    // 2) Eigenes Bild - gemaltes Kinderbild abfotografiert, Scan, Galerie.
    //    Qualitativ die schönste Variante und dauerhaft kostenlos.
    async upload(spec) {
        if (!spec.file) throw new Error('Kein Bild ausgewählt.');
        const fmt = app.studio.formats.get(spec.formatId);
        const img = await app.utils.loadImageElement(spec.file);
        // NEU (KDP-Hochauflösend-Umschalter): mit spec.targetWidth (siehe
        // app.studio.printTargetWidth()) wird die 1600px-Standardgrenze für
        // dieses eine Bild übergangen, siehe createHiResPrintVariant() in
        // utils.js.
        const variants = spec.targetWidth
            ? app.utils.createHiResPrintVariant(img, img.naturalWidth, img.naturalHeight, spec.targetWidth)
            : app.utils.createImageVariants(img, img.naturalWidth, img.naturalHeight);
        return {
            full: variants.full,
            thumb: variants.thumb,
            meta: {
                formatId: spec.formatId,
                width: img.naturalWidth,
                height: img.naturalHeight,
                source: 'upload',
                created: Date.now(),
                // Hinweis fürs Layout: ein Foto hat selten exakt das Zielformat.
                aspectMismatch: fmt ? Math.abs((img.naturalWidth / img.naturalHeight) - (fmt.genW / fmt.genH)) > 0.12 : false
            }
        };
    },

    // 3) Echte KI-Bildgenerierung (Konzept D.4/D.5, docs/KONZEPT-Bildquellen.md
    //    Abschnitt 1.3). NUR erreichbar, wenn der Aufrufer ausdrücklich
    //    'gemini' als Quelle wählt - das tut app.studio.resolveImageSourceId()
    //    (studioCore.js) ausschließlich, wenn die Bestätigung in den
    //    Einstellungen gesetzt ist (app.settings.studioImageGenEnabled).
    //    Diese Funktion selbst prüft das NICHT nochmal - Existenz des Codes
    //    ist kein "scharf schalten", das passiert einzig über die Weiche in
    //    studioCore.js.
    //
    //    spec.rawPrompt: wird von "alle Platzhalter ersetzen"
    //    (studioImages.js) gesetzt, um GENAU den beim Platzhalter bereits
    //    gespeicherten Prompt wiederzuverwenden, statt ihn aus
    //    sketch/style/characters neu zusammenzusetzen (Konzept: "der Prompt
    //    muss nie neu erdacht werden"). Ohne rawPrompt (Einzelgenerierung
    //    pro Doppelseite/Figurenblatt) baut buildPrompt() ihn wie gewohnt.
    //    spec.characterImages: Data-URLs bereits generierter Figurenblätter
    //    (NUR der auf dieser Seite vorkommenden Figuren, Konzept D.5 #1/#4)
    //    - gehen als zusätzliche Referenzbilder mit.
    async gemini(spec) {
        if (!app.settings.apiKey) throw new Error('API_KEY_MISSING');
        const fmt = app.studio.formats.get(spec.formatId);
        if (!fmt) throw new Error('Unbekanntes Bildformat.');

        const promptText = spec.rawPrompt || buildPrompt(spec);
        const parts = [{ text: promptText }];
        (spec.characterImages || []).forEach(dataUrl => {
            const inline = dataUrlToInlineData(dataUrl);
            if (inline) parts.push({ inlineData: inline });
        });

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${app.settings.apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: { responseModalities: ['IMAGE'] }
            })
        });

        if (!res.ok) {
            if (res.status === 400) throw new Error('Anfrage ungültig (400)');
            // NEU: der bekannte Blocker aus TEIL G Punkt 1 - ohne
            // Zahlungsmethode am Google-Konto liefert der Bild-Endpunkt
            // typischerweise 403. Fehlertext benennt das konkret, statt nur
            // "ungültig" zu sagen, sonst sucht der Betreiber den Fehler beim
            // Key statt bei der Abrechnung.
            if (res.status === 403) throw new Error('Bild-API abgelehnt (403) - vermutlich fehlt eine Zahlungsmethode am Google-Konto (siehe docs/KONZEPT-SchreibZauber.md TEIL G)');
            if (res.status === 429) throw new Error('Gemini-Bild-Limit erreicht (429)');
            throw new Error(`Gemini-Bild-Fehler ${res.status}`);
        }

        const data = await res.json();
        const inlinePart = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!inlinePart) throw new Error('Antwort enthielt kein Bild.');

        const dataUrl = `data:${inlinePart.inlineData.mimeType};base64,${inlinePart.inlineData.data}`;
        const img = await loadImageFromUrl(dataUrl);
        // NEU (KDP-Hochauflösend-Umschalter): siehe Kommentar bei
        // providers.upload() oben - Gemini bekommt dabei KEINE andere
        // Anfrage, nur die Weiterverarbeitung des zurückgelieferten Bildes
        // ändert sich (kein zusätzlicher API-Aufruf, keine Mehrkosten).
        const variants = spec.targetWidth
            ? app.utils.createHiResPrintVariant(img, img.naturalWidth, img.naturalHeight, spec.targetWidth)
            : app.utils.createImageVariants(img, img.naturalWidth, img.naturalHeight);

        return {
            full: variants.full,
            thumb: variants.thumb,
            meta: {
                formatId: spec.formatId,
                width: img.naturalWidth,
                height: img.naturalHeight,
                source: 'gemini',
                created: Date.now(),
                // Wie beim Upload: das Bildmodell rundet Maße gern leicht -
                // Layout/Druck sollen das erkennen können.
                aspectMismatch: Math.abs((img.naturalWidth / img.naturalHeight) - (fmt.genW / fmt.genH)) > 0.12
            }
        };
    },

    // 4) Pollinations.ai (Nutzerwunsch: "kostenlos Bilderbücher erstellen") -
    //    KEIN API-Key, KEINE Zahlungsmethode nötig, läuft rein über eine
    //    URL. NUR erreichbar, wenn app.studio.resolveImageSourceId()
    //    (studioCore.js) 'pollinations' liefert - genau wie bei 'gemini'
    //    prüft diese Funktion selbst nichts nach, die Weiche sitzt zentral.
    //
    //    Bewusst EIGENE, schwächere Klasse als 'gemini', kein Ersatz:
    //    - KEINE Referenzbilder möglich (die Pollinations-Bild-API nimmt nur
    //      Text entgegen) - Figuren bleiben über mehrere Seiten hinweg nur
    //      ÄHNLICH (gleicher Prompt-Baustein + gleicher Seed aus
    //      hashSeed(Figurennamen)), nicht exakt gleich wie bei Gemini mit
    //      echten Referenzbildern.
    //    - ohne eigenen Pollinations-Account nur ~1 Anfrage alle 15 Sekunden
    //      erlaubt (Stand 2026) - deshalb POLLINATIONS_THROTTLE_MS unten und
    //      die Pause zwischen Bildern in "alle Platzhalter ersetzen"
    //      (js/studio/studioImages.js).
    //    - `private: 'true'` ist FEST verdrahtet, keine Einstellung: ohne
    //      dieses Flag landen erzeugte Bilder laut Pollinations-Doku im
    //      öffentlichen Feed der Seite - für private Familienfotos/
    //      Kindergeschichten (CLAUDE.md "eine Familie, rein privat")
    //      inakzeptabel.
    async pollinations(spec) {
        const fmt = app.studio.formats.get(spec.formatId);
        if (!fmt) throw new Error('Unbekanntes Bildformat.');

        const promptText = spec.rawPrompt || buildPrompt(spec);
        const seedSource = (spec.characters || []).map(c => c.name).filter(Boolean).join('|') || spec.formatId || 'lesezauber';
        const seed = spec.seed ?? hashSeed(seedSource);
        const params = new URLSearchParams({
            width: String(fmt.genW),
            height: String(fmt.genH),
            seed: String(seed),
            nologo: 'true',
            private: 'true',
            model: POLLINATIONS_MODEL
        });
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(promptText)}?${params}`;

        let res;
        try {
            res = await fetch(url);
        } catch (e) {
            throw new Error('Pollinations nicht erreichbar (Netzwerkfehler).');
        }
        if (res.status === 429) throw new Error('Pollinations-Limit erreicht (429) - bitte kurz warten und erneut versuchen.');
        if (!res.ok) throw new Error(`Pollinations-Fehler ${res.status}`);
        const blob = await res.blob();
        if (!blob.type.startsWith('image/')) throw new Error('Pollinations hat kein Bild zurückgeliefert.');

        const objectUrl = URL.createObjectURL(blob);
        let img;
        try {
            img = await loadImageFromUrl(objectUrl);
        } finally {
            URL.revokeObjectURL(objectUrl);
        }

        const variants = spec.targetWidth
            ? app.utils.createHiResPrintVariant(img, img.naturalWidth, img.naturalHeight, spec.targetWidth)
            : app.utils.createImageVariants(img, img.naturalWidth, img.naturalHeight);

        return {
            full: variants.full,
            thumb: variants.thumb,
            meta: {
                formatId: spec.formatId,
                width: img.naturalWidth,
                height: img.naturalHeight,
                source: 'pollinations',
                created: Date.now(),
                seed,
                aspectMismatch: Math.abs((img.naturalWidth / img.naturalHeight) - (fmt.genW / fmt.genH)) > 0.12
            }
        };
    }
};

// NEU: Modell-Konstante für Pollinations, analog zu GEMINI_IMAGE_MODEL oben.
const POLLINATIONS_MODEL = 'flux';

// NEU: Pause vor dem nächsten Pollinations-Aufruf innerhalb einer Schleife
// (siehe js/studio/studioImages.js "alle Platzhalter ersetzen"/Comic-Panels) -
// EIN Ort für die Wartezeit statt doppelt in beiden Schleifen. Grund und
// Quelle: Kommentar bei providers.pollinations oben.
const POLLINATIONS_THROTTLE_MS = 15000;

// NEU: Kopier-Knopf für den kostenlosen "Prompt-Export"-Weg (siehe
// docs/KONZEPT-Bildquellen.md, Abschnitt 1.1). Solange keine Bild-API
// angebunden ist, ist das der einzige Weg, aus einem Storyboard-Eintrag
// ein echtes KI-Bild zu bekommen: Prompt kopieren, im Google AI Studio
// oder der Gemini-App einfügen, Ergebnis über providers.upload zurück in
// die App holen. Beide Enden dieses Workflows existieren jetzt - hier der
// Kopier-Teil, providers.upload oben der Rückweg.
async function copyPrompt(prompt) {
    if (!prompt) {
        app.ui?.toast?.('Kein Prompt zum Kopieren vorhanden.', '⚠️');
        return false;
    }
    try {
        // Clipboard API braucht einen sicheren Kontext (https/localhost) -
        // auf file:// oder http:// gibt es navigator.clipboard nicht, daher
        // der Rückfall auf execCommand statt eines stillen Fehlers.
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(prompt);
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = prompt;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            const ok = document.execCommand('copy');
            textarea.remove();
            if (!ok) throw new Error('execCommand copy fehlgeschlagen');
        }
        app.ui?.toast?.('Prompt kopiert - jetzt im AI Studio oder der Gemini-App einfügen.', '📋');
        return true;
    } catch (e) {
        console.error('Prompt konnte nicht kopiert werden:', e);
        app.ui?.toast?.('Kopieren nicht möglich - bitte Text von Hand markieren.', '⚠️');
        return false;
    }
}

app.studio = app.studio || {};
app.studio.imageSource = {
    buildPrompt,
    copyPrompt,
    // NEU (Pollinations-Quelle): siehe providers.pollinations oben - EIN Ort
    // für die Wartezeit zwischen zwei Aufrufen, genutzt von studioImages.js.
    pollinationsThrottleMs: POLLINATIONS_THROTTLE_MS,

    // Welche Quellen stehen gerade zur Verfügung?
    available() {
        return Object.keys(providers);
    },

    // spec: { formatId, sketch, style, characters, title, index, file }
    async request(sourceId, spec) {
        const provider = providers[sourceId];
        if (!provider) {
            console.error(`Unbekannte Bildquelle: "${sourceId}"`);
            app.ui?.toast?.('Diese Bildquelle gibt es nicht.', '⚠️');
            return null;
        }
        try {
            const result = await provider(spec);
            // Der Prompt wandert IMMER mit - auch beim Platzhalter. Genau das
            // macht das spätere "alle Platzhalter ersetzen" zu einem Knopfdruck.
            // NEU (Stufe 2): spec.rawPrompt (siehe providers.gemini oben)
            // wird 1:1 übernommen statt neu zusammengesetzt - "alle
            // Platzhalter ersetzen" schickt bewusst GENAU den schon
            // gespeicherten Prompt erneut los, nicht eine Neuberechnung, die
            // bei inzwischen geänderter Stilkarte/Figuren anders ausfiele.
            if (result) result.meta.prompt = spec.rawPrompt || buildPrompt(spec);
            return result;
        } catch (e) {
            console.error(`Bildquelle "${sourceId}" fehlgeschlagen:`, e);
            app.ui?.toast?.(`Bild konnte nicht erstellt werden: ${e.message}`, '⚠️');
            return null;
        }
    }
};
