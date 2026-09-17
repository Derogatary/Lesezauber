import { app } from '../core.js';

// ============ Zeitplan ("Regie") für den Video-Export ============
// Teil 1 von Weg B, zweites Standbein neben js/render/cinema.js: dort wird
// gezeichnet, hier wird festgelegt WAS WANN im Bild ist.
//
// Der Zeitplan bekommt von Anfang an einen SEITENBEREICH - eine einzelne
// Seite ist der Bereich [i, i] und braucht keinen zweiten Codeweg (so
// ausdrücklich entschieden, siehe docs/KONZEPT-Video.md, Nachtrag in
// Abschnitt 4.6).
//
// Zwei Betriebsarten, gleiche Datenstruktur:
//   1. MIT echtem Ton: segmentsByPage enthält die Ergebnisse von
//      app.ttsNeural.renderPageSegments() - Länge und Wort-Zeitpunkte sind
//      dann exakt bzw. so gut wie der Anbieter sie liefert.
//   2. OHNE Ton (Vorschau, Teil 1): Länge aus der Textlänge geschätzt.
//      Kostet kein Kontingent und keine Sekunde Wartezeit - genau das, was
//      man beim Bauen/Prüfen des Renderers braucht.
// Der Encoder (Teil 2) wird immer Betriebsart 1 nutzen.

// Sprechtempo-Schätzung für Betriebsart 2 (Zeichen pro Sekunde bei
// Geschwindigkeit 1.0). Deutscher Vorlesetext liegt erfahrungsgemäß bei
// 13-15 Zeichen/Sekunde; der Wert geht NUR in die Vorschau ein, nie in
// eine exportierte Datei.
const ESTIMATED_CHARS_PER_SEC = 14;
// Kürzeste Standzeit einer Szene - ein Zwei-Wort-Satz soll nicht
// aufblitzen.
const MIN_SCENE_SEC = 1.6;
// Pause zwischen zwei Sprach-Segmenten. MUSS zum gleichnamigen Wert in
// js/actions/audiobookExport.js passen: dort wird der Ton mit genau dieser
// Pause zusammengefügt, und der Video-Export wird denselben Weg nehmen.
// Läuft der Wert auseinander, wandert die Wort-Hervorhebung im Film mit
// jedem Segment weiter vom Ton weg.
const SEGMENT_PAUSE_SEC = 0.6;
const TITLE_CARD_SEC = 4.5;
const END_CARD_SEC = 3.5;

Object.assign(app.cinema, {
    // Baut den kompletten Zeitplan für einen Seitenbereich.
    buildTimeline(bookId, {
        fromIdx = 0,
        toIdx = null,
        personaId = null,
        includeDescription = false,
        includeQuiz = false,
        formatId = null,
        segmentsByPage = null,
        withCards = null
    } = {}) {
        const book = app.library[bookId];
        if (!book) throw new Error('Buch nicht gefunden.');

        const lastIdx = toIdx === null ? book.pages.length - 1 : toIdx;
        const from = Math.max(0, Math.min(fromIdx, book.pages.length - 1));
        const to = Math.max(from, Math.min(lastIdx, book.pages.length - 1));
        const usedPersona = personaId || app.state.readingPersonaId || app.settings.persona;
        // Titel-/Abspannkarte nur beim Buch-Film. Eine einzelne Seite zum
        // Weiterschicken soll sofort losgehen (siehe Nachtrag in
        // docs/KONZEPT-Video.md: der Einzelseiten-Export ist die Variante
        // zum Weitergeben, nicht der Film).
        const cards = withCards === null ? (to > from) : withCards;

        const scenes = [];
        const skipped = [];
        let cursor = 0;
        let exact = true;
        let pageCount = 0;

        if (cards) {
            const author = [book.author, book.publisher].filter(Boolean).join(' · ');
            scenes.push({
                kind: 'title',
                title: book.title || 'Ohne Titel',
                subtitle: [book.series, author].filter(Boolean).join(' · ') || 'LeseZauber',
                imgUrl: this._coverUrl(book),
                words: [],
                kenBurns: 0,
                startSec: 0,
                durationSec: TITLE_CARD_SEC,
                endSec: TITLE_CARD_SEC
            });
            cursor = TITLE_CARD_SEC;
        }

        for (let pageIdx = from; pageIdx <= to; pageIdx++) {
            const page = book.pages[pageIdx];
            // Ausgeschlossene Seiten (Leerseiten, Impressum) überall gleich
            // behandeln wie beim automatischen Vorlesen, siehe js/tts.js.
            if (!page || page.excluded) continue;

            const variant = app.utils.resolveAnyVariant(page, usedPersona);
            if (!variant) { skipped.push(pageIdx); continue; }

            const parts = [{ kind: 'text', text: variant.text }];
            if (includeDescription && variant.desc) parts.push({ kind: 'desc', text: variant.desc });
            if (includeQuiz && variant.quizQ) {
                parts.push({ kind: 'quizQ', text: variant.quizQ });
                if (variant.quizA) parts.push({ kind: 'quizA', text: variant.quizA });
            }

            const rendered = segmentsByPage ? segmentsByPage[pageIdx] : null;
            let pageHadScene = false;

            parts.forEach(part => {
                // Gleiche Aufbereitung wie app.ttsNeural.renderAudio(): erst
                // Trennstriche/Abkürzungen glätten, dann Emojis raus. Nur so
                // passen die Zeichenpositionen der Wörter zu dem, was die
                // Stimme tatsächlich spricht.
                const clean = app.utils.stripEmojiForSpeech(app.utils.prepareTextForSpeech(part.text || ''));
                if (!clean) return;

                const segment = rendered ? this._findSegment(rendered, part.kind) : null;
                let durationSec;
                let words;

                if (segment && segment.durationSec > 0 && segment.words && segment.words.length) {
                    durationSec = segment.durationSec;
                    words = segment.words;
                    if (!segment.exact) exact = false;
                } else {
                    durationSec = this.estimateDurationSec(clean);
                    words = this._estimateWords(clean, durationSec);
                    exact = false;
                }

                // Die Pause nach dem Segment gehört zur Szene: so bleibt der
                // Zeitplan lückenlos (kein schwarzer Frame zwischen zwei
                // Szenen) und das letzte Wort bleibt in der Pause markiert.
                const total = durationSec + SEGMENT_PAUSE_SEC;
                scenes.push({
                    kind: 'page',
                    segmentKind: part.kind,
                    pageIdx,
                    imgUrl: page.imgUrl,
                    text: clean,
                    words,
                    kenBurns: pageIdx % 4,
                    startSec: cursor,
                    durationSec: total,
                    endSec: cursor + total
                });
                cursor += total;
                pageHadScene = true;
            });

            if (pageHadScene) pageCount++;
        }

        if (cards && scenes.length > 1) {
            scenes.push({
                kind: 'end',
                title: 'Ende',
                subtitle: 'Vorgelesen mit LeseZauber',
                imgUrl: null,
                words: [],
                kenBurns: 0,
                startSec: cursor,
                durationSec: END_CARD_SEC,
                endSec: cursor + END_CARD_SEC
            });
            cursor += END_CARD_SEC;
        }

        return {
            bookId,
            bookTitle: book.title || 'Ohne Titel',
            formatId: formatId || this.defaultFormatId(),
            fromIdx: from,
            toIdx: to,
            personaId: usedPersona,
            // exact=false heißt: die Zeiten sind geschätzt. Die Vorschau
            // schreibt das sichtbar hin - sonst hält man eine Schätzung
            // später für einen Fehler im Renderer.
            exact: exact && scenes.some(s => s.kind === 'page'),
            scenes,
            pageCount,
            skipped,
            totalDurationSec: cursor
        };
    },

    // Schätzt die Sprechdauer eines Textes (nur Vorschau, siehe oben).
    estimateDurationSec(cleanText) {
        const rate = app.settings.speechRate || 0.9;
        const perSec = ESTIMATED_CHARS_PER_SEC * rate;
        return Math.max(MIN_SCENE_SEC, (cleanText || '').length / perSec);
    },

    // Wort-Zeitpunkte für die Schätzung. Nutzt bewusst dieselbe Berechnung
    // wie die Hervorhebung im Reader (app.ttsNeural._wordStartTimes ohne
    // Alignment) - laut CLAUDE.md darf diese Rechnung nicht dupliziert
    // werden, sonst laufen Reader und Film auseinander.
    _estimateWords(cleanText, durationSec) {
        const offsets = app.utils.speechWordOffsets(cleanText);
        const starts = app.ttsNeural._wordStartTimes(offsets.map(o => o.start), durationSec, null, cleanText);
        return offsets.map((entry, i) => ({
            word: entry.word,
            start: starts[i],
            end: i + 1 < starts.length ? starts[i + 1] : durationSec
        }));
    },

    // Passendes Sprach-Segment aus einem renderPageSegments()-Ergebnis.
    // Nach "kind" gesucht statt nach Position, damit ein abgeschaltetes
    // Segment (z.B. keine Bildbeschreibung) nichts verschiebt.
    _findSegment(rendered, kind) {
        if (!rendered || !Array.isArray(rendered.segments)) return null;
        return rendered.segments.find(seg => seg.kind === kind) || null;
    },

    // Cover in voller Lesegröße - app.utils.resolveCoverUrl() liefert
    // absichtlich das 300px-Thumbnail für die Bibliotheks-Grids, das wäre
    // auf einer 1080px-Titelkarte sichtbar unscharf.
    _coverUrl(book) {
        if (book.coverPageId) {
            const found = book.pages.find(p => p.id === book.coverPageId);
            if (found) return found.imgUrl;
        }
        return book.pages[0] ? book.pages[0].imgUrl : null;
    },

    // Formatwechsel: Maße, Zeilenumbruch und Hintergrund hängen am Format
    // und sind an den Szenen zwischengespeichert - die Puffer müssen also
    // weg, sonst zeichnet der Renderer mit den alten Maßen weiter.
    // (Die Puffer sind nach Format-ID benannt, das hier ist die
    // Speicher-Hygiene dazu.)
    setTimelineFormat(timeline, formatId) {
        if (!timeline) return;
        timeline.formatId = this.format(formatId).id;
        timeline.scenes.forEach(scene => {
            scene._layout = null;
            scene._layoutFormat = null;
            scene._backdrop = null;
            scene._backdropFormat = null;
        });
    }
});
