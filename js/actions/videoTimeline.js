import { app } from '../core.js';

// ============ Zeitplan ("Regie") für den Video-Export ============
// Zweites Standbein neben js/render/cinema.js: dort wird gezeichnet, hier
// wird festgelegt WAS WANN im Bild ist.
//
// Der Zeitplan bekommt von Anfang an einen SEITENBEREICH - eine einzelne
// Seite ist der Bereich [i, i] und braucht keinen zweiten Codeweg (so
// ausdrücklich entschieden, siehe docs/KONZEPT-Video.md, Nachtrag in
// Abschnitt 4.6).
//
// Zwei Betriebsarten, gleiche Datenstruktur:
//   1. MIT echtem Ton: segmentsByPage enthält die Ergebnisse von
//      app.ttsNeural.renderPageSegments() - Länge und Wort-Zeitpunkte sind
//      dann exakt bzw. so gut wie der Anbieter sie liefert, und jede Szene
//      trägt ihre Tonspur als Blob mit (scene.audio). So arbeitet der
//      Export (js/actions/videoExport.js).
//   2. OHNE Ton (Vorschau): Länge aus der Textlänge geschätzt. Kostet kein
//      Kontingent und keine Sekunde Wartezeit - genau das, was man beim
//      Bauen/Prüfen des Renderers braucht.

// Sprechtempo-Schätzung für Betriebsart 2 (Zeichen pro Sekunde bei
// Geschwindigkeit 1.0). Deutscher Vorlesetext liegt erfahrungsgemäß bei
// 13-15 Zeichen/Sekunde; der Wert geht NUR in die Vorschau und in die
// Größenschätzung ein, nie in eine fertige Videodatei.
const ESTIMATED_CHARS_PER_SEC = 14;
// Kürzeste Standzeit einer Szene - ein Zwei-Wort-Satz soll nicht aufblitzen.
const MIN_SCENE_SEC = 1.6;
// Pausen: kurz zwischen zwei Häppchen derselben Seite (Text →
// Bildbeschreibung), länger beim Seitenwechsel - dort blendet zusätzlich
// das Bild über (siehe app.cinema, Kreuzblende), und ohne Luft davor wirkt
// der Wechsel gehetzt.
const SEGMENT_PAUSE_SEC = 0.6;
const PAGE_PAUSE_SEC = 1.1;
// Nach dem letzten Wort noch kurz stehen bleiben, bevor der Abspann kommt.
const TAIL_PAUSE_SEC = 1.0;
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
        // Titel-/Abspannkarte und Seiten-Rollen nur beim Buch-Film. Eine
        // einzelne Seite zum Weiterschicken soll sofort losgehen (siehe
        // Nachtrag in docs/KONZEPT-Video.md: der Einzelseiten-Export ist die
        // Variante zum Weitergeben, nicht der Film).
        const cards = withCards === null ? (to > from) : withCards;

        const { order, titlePage, skipped } = this._pageOrder(book, from, to, cards);
        const planned = this._planSegments(book, order, {
            personaId: usedPersona, includeDescription, includeQuiz, segmentsByPage, skipped
        });

        const scenes = [];
        let cursor = 0;
        let exact = planned.length > 0;

        if (cards) {
            const author = [book.author, book.publisher].filter(Boolean).join(' · ');
            scenes.push({
                kind: 'title',
                title: book.title || 'Ohne Titel',
                subtitle: [book.series, author].filter(Boolean).join(' · ') || 'LeseZauber',
                // Titelkarte zeigt die per Seiten-Rolle markierte Titelseite,
                // sonst das gewählte Cover (siehe _coverUrl).
                imgUrl: titlePage ? titlePage.imgUrl : this._coverUrl(book),
                words: [],
                kenBurns: 0,
                startSec: 0,
                durationSec: TITLE_CARD_SEC,
                endSec: TITLE_CARD_SEC
            });
            cursor = TITLE_CARD_SEC;
        }

        planned.forEach((part, i) => {
            const next = planned[i + 1];
            // Die Pause NACH einem Häppchen gehört zur Szene: so bleibt der
            // Zeitplan lückenlos (kein schwarzer Frame zwischen zwei Szenen),
            // das letzte Wort bleibt in der Pause markiert - und der Export
            // legt die Tonspur exakt auf scene.startSec, wodurch Bild und Ton
            // unabhängig von der Pausenlänge zusammenpassen.
            let pause = TAIL_PAUSE_SEC;
            if (next) pause = next.pageIdx === part.pageIdx ? SEGMENT_PAUSE_SEC : PAGE_PAUSE_SEC;

            const total = part.durationSec + pause;
            if (!part.exact) exact = false;
            scenes.push({
                kind: 'page',
                segmentKind: part.kind,
                pageIdx: part.pageIdx,
                imgUrl: part.imgUrl,
                text: part.text,
                words: part.words,
                audio: part.audio || null,
                // Zoom-Richtung nach Seitenindex, damit zwei aufeinander
                // folgende Seiten nie gleich schwenken.
                kenBurns: part.pageIdx % 4,
                startSec: cursor,
                durationSec: total,
                endSec: cursor + total
            });
            cursor += total;
        });

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
            includeDescription,
            includeQuiz,
            // exact=false heißt: die Zeiten sind geschätzt. Die Vorschau
            // schreibt das sichtbar hin - sonst hält man eine Schätzung
            // später für einen Fehler im Renderer.
            exact: exact && scenes.some(s => s.kind === 'page'),
            scenes,
            pageCount: new Set(planned.map(p => p.pageIdx)).size,
            skipped,
            totalDurationSec: cursor
        };
    },

    // Reihenfolge der Seiten im Film - die einzige Stelle, die von der
    // Scan-Reihenfolge abweicht. Grund: die App kennt Seiten-Rollen
    // (app.actions.setPageRole), und ein Film gehorcht der Bildsprache aus
    // docs/KONZEPT-Video.md Abschnitt 3: Titelkarte zuerst, Klappentext
    // ("darum geht's") zuletzt, dann Abspann. Wer die Rückseite als erstes
    // Blatt fotografiert hat, bekäme sonst einen Film, der mit dem
    // Klappentext anfängt.
    // Ohne Karten (Einzelseite) wird NICHTS umsortiert.
    _pageOrder(book, from, to, cards) {
        const order = [];
        const skipped = [];
        let titlePage = null;
        let backCoverIdx = null;

        for (let pageIdx = from; pageIdx <= to; pageIdx++) {
            const page = book.pages[pageIdx];
            // Ausgeschlossene Seiten (Leerseiten, Impressum) überall gleich
            // behandeln wie beim automatischen Vorlesen, siehe js/tts.js.
            if (!page || page.excluded) continue;

            if (cards && book.titlePageId && page.id === book.titlePageId) {
                // Die Titelseite wird zur Titelkarte und läuft NICHT zusätzlich
                // als normale Seite - ihr gedruckter Text ist Titel und Autor,
                // also genau das, was die Karte schon zeigt.
                titlePage = page;
                continue;
            }
            if (cards && book.backCoverPageId && page.id === book.backCoverPageId) {
                backCoverIdx = pageIdx;
                continue;
            }
            order.push(pageIdx);
        }

        if (backCoverIdx !== null) order.push(backCoverIdx);
        if (cards && !titlePage && book.titlePageId) {
            // Titelseite liegt außerhalb des Bereichs: für die Karte trotzdem
            // ihr Bild verwenden, aber nichts umsortieren.
            titlePage = book.pages.find(p => p.id === book.titlePageId) || null;
        }
        return { order, titlePage, skipped };
    },

    // Aus den Seiten die einzelnen Sprach-Häppchen mit Länge und
    // Wort-Zeitpunkten machen. Reihenfolge je Seite wie beim Vorlesen:
    // Text → Bildbeschreibung → Rätselfrage → Antwort.
    _planSegments(book, order, { personaId, includeDescription, includeQuiz, segmentsByPage, skipped }) {
        const planned = [];

        order.forEach(pageIdx => {
            const page = book.pages[pageIdx];
            const variant = app.utils.resolveAnyVariant(page, personaId);
            if (!variant) { skipped.push(pageIdx); return; }

            const parts = [{ kind: 'text', text: variant.text }];
            if (includeDescription && variant.desc) parts.push({ kind: 'desc', text: variant.desc });
            if (includeQuiz && variant.quizQ) {
                parts.push({ kind: 'quizQ', text: variant.quizQ });
                if (variant.quizA) parts.push({ kind: 'quizA', text: variant.quizA });
            }

            const rendered = segmentsByPage ? segmentsByPage[pageIdx] : null;
            parts.forEach(part => {
                // Gleiche Aufbereitung wie app.ttsNeural.renderAudio(): erst
                // Trennstriche/Abkürzungen glätten, dann Emojis raus. Nur so
                // passen die Zeichenpositionen der Wörter zu dem, was die
                // Stimme tatsächlich spricht.
                const clean = app.utils.stripEmojiForSpeech(app.utils.prepareTextForSpeech(part.text || ''));
                if (!clean) return;

                const segment = rendered ? this._findSegment(rendered, part.kind) : null;
                if (segment && segment.durationSec > 0 && segment.words && segment.words.length) {
                    planned.push({
                        pageIdx, kind: part.kind, imgUrl: page.imgUrl, text: segment.text || clean,
                        durationSec: segment.durationSec, words: segment.words,
                        // Der Export braucht den Ton; die Vorschau rührt ihn nicht an.
                        audio: { blob: segment.blob, mime: segment.mime },
                        exact: true
                    });
                } else {
                    const durationSec = this.estimateDurationSec(clean);
                    planned.push({
                        pageIdx, kind: part.kind, imgUrl: page.imgUrl, text: clean,
                        durationSec, words: this._estimateWords(clean, durationSec),
                        audio: null, exact: false
                    });
                }
            });
        });

        return planned;
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

    // Bild für die Titelkarte in voller Lesegröße - app.utils.resolveCoverUrl()
    // liefert absichtlich das 300px-Thumbnail für die Bibliotheks-Grids, das
    // wäre auf einer 1080px-Titelkarte sichtbar unscharf. Reihenfolge:
    // markierte Titelseite, sonst gewähltes Cover, sonst erste Seite.
    _coverUrl(book) {
        const byId = (id) => (id ? book.pages.find(p => p.id === id) : null);
        const page = byId(book.titlePageId) || byId(book.coverPageId) || book.pages[0];
        return page ? page.imgUrl : null;
    },

    // Formatwechsel: Maße, Zeilenumbruch und Hintergrund hängen am Format
    // und sind an den Szenen zwischengespeichert - die Puffer müssen also
    // weg, sonst zeichnet der Renderer mit den alten Maßen weiter.
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
