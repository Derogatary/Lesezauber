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

    const parts = [
        `Illustration für ein Kinderbuch. Bildinhalt: ${sketch || 'noch offen'}.`,
        style ? `Stil: ${style}.` : '',
        characters.length
            ? `Figuren (Aussehen exakt wie beschrieben beibehalten): ${characters.map(c => `${c.name} – ${c.sheetText}`).join(' | ')}.`
            : '',
        `Seitenverhältnis ${fmt.aspect}.`,
        // Harte Regeln - stehen bewusst in JEDEM Prompt, nicht optional:
        'KEIN Text, KEINE Buchstaben, KEINE Zahlen und KEINE Sprechblasen im Bild.',
        fmt.textZone !== 'keine'
            ? `Halte im Bereich "${zoneLabel}" eine ruhige, kontrastarme Fläche frei, auf der später Text liegt.`
            : '',
        'Kindgerecht, freundlich, keine Gewalt, keine Angstmotive, keine realen Personen, keine Markenzeichen.',
        // NEU (Stufe 2): die Veröffentlichungs-Leitplanken (Entscheidung 6)
        // MÜSSEN laut docs/KONZEPT-SchreibZauber.md 1:1 in JEDEN neuen
        // Prompt einfließen, auch in den Bild-Prompt - deshalb hier
        // unverändert angehängt, nicht neu formuliert (siehe
        // app.studio.prompts.guardrailsBlock() in studioPrompts.js).
        app.studio.prompts.guardrailsBlock()
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

// Lädt eine bereits im Speicher liegende data:-URL als <img>-Element -
// gebraucht, um das von Gemini gelieferte Bild wie jedes andere über
// app.utils.createImageVariants() in die zwei WebP-Größen zu bringen.
// Bewusst eine eigene, kleine Funktion statt app.utils.loadImageElement():
// die dort erwartet eine hochgeladene File(), hier liegt die Daten-URL
// schon fertig im Speicher.
function loadImageFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Von Gemini geliefertes Bild konnte nicht gelesen werden.'));
        img.src = dataUrl;
    });
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
        const variants = app.utils.createImageVariants(img, img.naturalWidth, img.naturalHeight);
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
        const img = await loadImageFromDataUrl(dataUrl);
        const variants = app.utils.createImageVariants(img, img.naturalWidth, img.naturalHeight);

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
    }

    // 4) HIER könnte später 'pollinations' als weitere KI-Quelle dazukommen.
    //    Muss nur dieselbe Form { full, thumb, meta } zurückgeben und
    //    meta.source entsprechend setzen - sonst ändert sich nichts.
    //    Bewertung der Optionen: docs/KONZEPT-Bildquellen.md
};

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
