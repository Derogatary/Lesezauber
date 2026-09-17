import { app } from '../core.js';
import './imageFormats.js';
import './placeholder.js';

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
function buildPrompt({ formatId, sketch, style, characters = [] }) {
    const fmt = app.studio.formats.get(formatId);
    if (!fmt) return '';

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
            ? `Halte im Bereich "${fmt.textZone}" eine ruhige, kontrastarme Fläche frei, auf der später Text liegt.`
            : '',
        'Kindgerecht, freundlich, keine Gewalt, keine Angstmotive, keine realen Personen, keine Markenzeichen.'
    ];
    return parts.filter(Boolean).join(' ');
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
    }

    // 3) HIER kommen später die KI-Quellen dazu ('gemini', 'pollinations').
    //    Sie müssen nur dieselbe Form { full, thumb, meta } zurückgeben und
    //    meta.source entsprechend setzen - sonst ändert sich nichts.
    //    Bewertung der Optionen: docs/KONZEPT-Bildquellen.md
};

app.studio = app.studio || {};
app.studio.imageSource = {
    buildPrompt,

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
            if (result) result.meta.prompt = buildPrompt(spec);
            return result;
        } catch (e) {
            console.error(`Bildquelle "${sourceId}" fehlgeschlagen:`, e);
            app.ui?.toast?.(`Bild konnte nicht erstellt werden: ${e.message}`, '⚠️');
            return null;
        }
    }
};
