import { app } from '../core.js';

// NEU: Der EINZIGE Ort, an dem festgelegt ist, wie groß ein Bild für einen
// bestimmten Zweck sein muss. Warum zentral statt "irgendwo hart eingetippt":
// Platzhalter, KI-Generierung, Upload-Verkleinerung und Druckausgabe müssen
// zwingend dieselben Maße benutzen - sonst springt das Layout in dem Moment,
// in dem ein Platzhalter durch ein echtes Bild ersetzt wird. Genau das soll
// dieser Katalog verhindern.
//
// genW/genH sind ABSICHTLICH Vielfache von 16: mehrere Bildmodelle (u.a. die
// Flux-Familie) lehnen andere Maße ab oder runden still - dann käme ein Bild
// mit minimal anderem Seitenverhältnis zurück.
const FORMATS = {
    cover: {
        label: 'Titelbild',
        aspect: '3:4',
        genW: 1024, genH: 1344,
        // Wo im Bild später Text liegt -> diese Zone muss ruhig/kontrastarm
        // bleiben. Wird 1:1 in den Bild-Prompt übernommen.
        textZone: 'unteres Drittel',
        note: 'Cover wird im Verlag früh gebraucht - hier zuerst erzeugen.'
    },
    spreadLandscape: {
        label: 'Bilderbuch-Doppelseite (quer)',
        aspect: '3:2',
        genW: 1536, genH: 1024,
        textZone: 'unteres Viertel', // Rückfall, falls kein textPos übergeben wird
        // NEU: Gegenstück zu spread.layout.textPos (js/studio/studioLayout.js) -
        // ohne diese Zuordnung fragte JEDE Doppelseite immer dieselbe feste
        // Zone (textZone oben) an, wodurch am Ende auch jede Seite gleich
        // aussah (siehe Bugreport "jede Seite gleich gestaltet"). Mit dieser
        // Zuordnung bekommt der Bild-Prompt genau die Zone, die auch die
        // Textebene später benutzt - Bild und Layout fragen garantiert nach
        // demselben freien Bereich.
        textZones: {
            unten: 'unteres Viertel', oben: 'oberes Viertel',
            links: 'linkes Drittel', rechts: 'rechtes Drittel'
        },
        note: 'Standard fürs Bilderbuch: ein Bild pro Doppelseite.'
    },
    pagePortrait: {
        label: 'Bilderbuch-Einzelseite (hoch)',
        aspect: '3:4',
        genW: 1024, genH: 1344,
        textZone: 'unteres Drittel',
        textZones: {
            unten: 'unteres Drittel', oben: 'oberes Drittel',
            links: 'linkes Drittel', rechts: 'rechtes Drittel'
        },
        note: 'Für Bücher, bei denen jede Seite ein eigenes Bild hat.'
    },
    // NEU (KDP-Trimm-Format 8,5x8,5 Zoll, v0.39.0-beta): das bei KDP-
    // Bilderbüchern gängigste Format - quadratische Einzelseite.
    pageSquare: {
        label: 'Bilderbuch-Einzelseite (quadratisch)',
        aspect: '1:1',
        genW: 1344, genH: 1344,
        textZone: 'unteres Drittel',
        textZones: {
            unten: 'unteres Drittel', oben: 'oberes Drittel',
            links: 'linkes Drittel', rechts: 'rechtes Drittel'
        },
        note: 'Quadratisches Bilderbuch (KDP 8,5×8,5 Zoll).'
    },
    // NEU (KDP-Panorama, v0.39.0-beta): EIN Bild über zwei gegenüberliegende
    // Buchseiten. "fold: true" lässt buildPrompt() (imageSource.js) die
    // Bildmitte freihalten - dort liegt im gedruckten Buch der Falz, ca. 1cm
    // davon verschwindet in der Bindung. Die Textzonen beziehen sich auf das
    // ganze Breitbild; der Text landet im Druck auf der linken Hälfte (bzw.
    // bei "rechts" auf der rechten), siehe app.studio.layout.panoramaTextSide().
    panoramaPortrait: {
        label: 'Panorama über zwei Hochformat-Seiten',
        aspect: '1,41:1 (zwei Hochformat-Seiten nebeneinander)',
        genW: 1824, genH: 1296,
        textZone: 'unteres Viertel der linken Bildhälfte',
        textZones: {
            unten: 'unteres Viertel der linken Bildhälfte', oben: 'oberes Viertel der linken Bildhälfte',
            links: 'linkes Fünftel', rechts: 'rechtes Fünftel'
        },
        fold: true,
        note: 'Wird im Druck in der Mitte geteilt - linke Hälfte links, rechte Hälfte rechts.'
    },
    panoramaSquare: {
        label: 'Panorama über zwei quadratische Seiten',
        aspect: '2:1 (zwei quadratische Seiten nebeneinander)',
        genW: 1792, genH: 896,
        textZone: 'unteres Viertel der linken Bildhälfte',
        textZones: {
            unten: 'unteres Viertel der linken Bildhälfte', oben: 'oberes Viertel der linken Bildhälfte',
            links: 'linkes Fünftel', rechts: 'rechtes Fünftel'
        },
        fold: true,
        note: 'Wird im Druck in der Mitte geteilt - linke Hälfte links, rechte Hälfte rechts.'
    },
    characterSheet: {
        label: 'Figurenblatt',
        aspect: '1:1',
        genW: 1024, genH: 1024,
        textZone: 'keine',
        note: 'Referenzbild einer Figur - wird bei JEDER weiteren Generierung mitgeschickt.'
    },
    comicPage: {
        label: 'Comic-Seite',
        aspect: '3:4',
        // FIX (Ausbaustufe 5): "Freiraum ... für Sprechblasen" hat im
        // Testlauf (docs/KONZEPT-Comic.md, Abschnitt 5) GENAU EINE gemalte
        // Sprechblase erzeugt, obwohl das gar nicht gewollt war -
        // Bildmodelle reagieren auf erwähnte Begriffe, nicht zuverlässig auf
        // Verneinungen ODER Zweckbeschreibungen. Rein visuell beschreiben,
        // den Zweck ("für Sprechblasen") nicht mehr nennen.
        genW: 1024, genH: 1344,
        textZone: 'oberes und unteres Fünftel als unbedeckter Hintergrund ohne Figuren/Objekte/Details',
        note: 'Sprechblasen werden NICHT ins Bild generiert, sondern als Ebene darübergelegt (siehe js/studio/studioBalloons.js).'
    },
    comicPanel: {
        label: 'Comic-Einzelpanel',
        aspect: '4:3',
        genW: 1024, genH: 768,
        // FIX: gleicher Grund wie bei comicPage oben - "Blase" nicht nennen.
        textZone: 'obere Ecke als unbedeckter Hintergrund ohne Figuren/Objekte/Details',
        note: 'Für selbst zusammengesetzte Panel-Raster (noch nicht verdrahtet, siehe docs/KONZEPT-Comic.md Abschnitt 6).'
    },
    worksheetIllu: {
        label: 'Arbeitsheft-Bild / Ausmalbild',
        aspect: '1:1',
        genW: 768, genH: 768,
        textZone: 'keine',
        note: 'Muss in Graustufen funktionieren - klare Konturen, wenig Fläche.'
    },
    worksheetBanner: {
        label: 'Arbeitsheft-Kopfleiste',
        aspect: '4:1',
        genW: 1024, genH: 256,
        textZone: 'rechte Hälfte frei für Kapitelüberschrift',
        note: 'Schmaler Schmuckstreifen am Seitenkopf.'
    }
};

app.studio = app.studio || {};
app.studio.formats = {
    // Alle Formate als Liste - für Auswahl-Dropdowns und die Vorschau-Seite.
    all() {
        return Object.entries(FORMATS).map(([id, f]) => ({ id, ...f }));
    },

    // Einzelnes Format holen. Unbekannte ID ist ein Programmierfehler und
    // wird laut gemeldet statt still auf irgendein Format zurückzufallen -
    // ein falsches Seitenverhältnis fällt sonst erst im fertigen Buch auf.
    get(formatId) {
        const found = FORMATS[formatId];
        if (!found) {
            console.error(`Unbekanntes Bildformat: "${formatId}"`);
            return null;
        }
        return { id: formatId, ...found };
    },

    // Empfohlenes Format für einen Werktyp - damit der Assistent nicht an
    // jeder Stelle selbst raten muss.
    defaultFor(projectType) {
        if (projectType === 'comic') return 'comicPage';
        if (projectType === 'workbook') return 'worksheetIllu';
        return 'spreadLandscape';
    }
};
