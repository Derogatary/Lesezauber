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

// NEU (KDP-Hochauflösend-Umschalter, siehe js/studio/studioCore.js
// printTargetWidth()): wie drawScaled() oben, aber OHNE die
// "Math.min(1, ...)"-Bremse - skaliert bewusst auch HOCH, wenn die
// Bildquelle kleiner als targetWidth ist. Das fügt KEINE echten neuen
// Bilddetails hinzu (reines Strecken/Interpolieren durch den Browser), aber
// die Bilddatei erreicht dadurch trotzdem die für 300dpi nötige Pixelzahl,
// statt bei niedriger Auflösung zu bleiben. Bewusst eine EIGENE Funktion
// statt drawScaled() zu ändern: die bleibt für alle anderen ~20 Aufrufstellen
// (normaler Reader, Bibliothek, Video-Export usw.) unverändert - dort ist
// Hochskalieren nie gewollt.
function drawScaledForPrint(source, naturalWidth, naturalHeight, targetWidth, quality) {
    const scale = targetWidth / naturalWidth;
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

    // NEU (KDP-Hochauflösend-Umschalter): Gegenstück zu createImageVariants()
    // oben, NUR für SchreibZauber-Druckbilder gedacht (siehe
    // js/studio/imageSource.js/studioComicPanels.js). "full" wird auf exakt
    // targetWidth gebracht statt auf maximal 1600px gedeckelt - das behält
    // entweder mehr von der ohnehin schon vorhandenen Bildauflösung (statt
    // sie wie sonst überall wegzuschneiden), oder skaliert per Interpolation
    // hoch, falls die Bildquelle selbst kleiner als targetWidth ist (siehe
    // drawScaledForPrint() oben für die ehrliche Einschränkung dabei).
    createHiResPrintVariant(source, naturalWidth, naturalHeight, targetWidth) {
        return {
            full: drawScaledForPrint(source, naturalWidth, naturalHeight, targetWidth, IMAGE_QUALITY),
            thumb: drawScaled(source, naturalWidth, naturalHeight, THUMB_MAX_WIDTH, IMAGE_QUALITY)
        };
    },

    // NEU: ermittelt den Text-Satz einer Seite für eine bestimmte Persona.
    // Alte Seiten (vor dieser Funktion gescannt) haben nur flache Felder
    // ohne "variants" - die dienen dann als universeller Rückfall für
    // jede Persona, die noch keine eigene Version hat.
    resolvePageVariant(page, personaId) {
        // NEU (v0.41.0-beta, Meldeknopf): gemeldete KI-Felder (page.aiHidden,
        // js/actions/aiReports.js) werden HIER zentral geleert - damit sind sie
        // überall weg (Reader, Vorlesen, Druck, Hörbuch, Video), ohne dass jede
        // dieser Stellen den Meldestatus kennen muss. Seiten ohne Meldung
        // bekommen unverändert das gespeicherte Objekt.
        const hide = (v) => (app.utils.stripHiddenAiFields ? app.utils.stripHiddenAiFields(page, personaId, v) : v);
        if (page.variants && page.variants[personaId]) return hide(page.variants[personaId]);
        if (page.text) {
            return hide({
                text: page.text,
                erstleserText: page.erstleserText,
                desc: page.desc,
                quizQ: page.quizQ,
                quizA: page.quizA
            });
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
            // NEU (v0.41.0-beta): auch hier gemeldete Felder ausblenden.
            if (anyKey) return app.utils.stripHiddenAiFields ? app.utils.stripHiddenAiFields(page, anyKey, page.variants[anyKey]) : page.variants[anyKey];
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

    // NEU: Herkunft eines Buches sicher lesen ('scan' | 'authored').
    // Wofür: Der Video-Export ist laut docs/KONZEPT-Video.md Abschnitt 7
    // nur bei SELBST GESCHRIEBENEN Büchern unproblematisch - ein
    // exportiertes und weitergegebenes Video eines abfotografierten fremden
    // Kinderbuchs wäre eine Vervielfältigung. Alles ohne ausdrückliches
    // 'authored' gilt deshalb bewusst als 'scan': Bücher aus der Zeit vor
    // diesem Feld kennen es nicht, und im Zweifel ist "kein Export" die
    // richtige Antwort. Der Kino-Modus und die Film-VORSCHAU bleiben davon
    // unberührt - das ist Vorlesen im eigenen Wohnzimmer.
    resolveBookOrigin(book) {
        return (book && book.origin === 'authored') ? 'authored' : 'scan';
    },

    // NEU (übersetzte Bücher, v0.39.0-beta): book.language ist die Sprach-ID
    // einer Übersetzung (gleiche Liste wie Birkenbihl, app.birkenbihlLanguages
    // in js/config.js) - fehlt bei allen normalen (deutschen) Büchern.
    // Liefert den Sprachcode fürs Vorlesen (z.B. "en-GB") oder null = Deutsch.
    // IMMER hierüber lesen: an diesem einen Wert hängt, ob js/tts.js,
    // js/ttsNeural.js und die Hintergrund-Vorbereitung deutsch oder
    // fremdsprachig arbeiten.
    // NEU (v0.39.0-beta): Kurzname einer Persona für Knöpfe/Sprechblasen -
    // "Standard (Neutral & Freundlich)" -> "Standard".
    personaShortName(persona) {
        return (persona?.label || '').replace(/\s*\(.*\)\s*$/, '');
    },

    bookSpeechLang(book) {
        if (!book || !book.language) return null;
        const info = app.birkenbihlLanguages.find(l => l.id === book.language);
        return info ? info.speechLang : null;
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
            // FIX (Nutzerwunsch: "Rätselfragen sollen sich auf den Text
            // beziehen, nicht aufs Bild") - der Rückfall-Text griff bisher
            // nur, wenn die KI keine eigene Frage geliefert hat, folgte
            // aber trotzdem noch dem alten "Bild vs. Text"-Unterschied.
            quizQ: result.quizQuestion || 'Worum ging es auf dieser Seite?',
            quizA: result.quizAnswer || 'Schau genau hin!',
            // NEU (Audio-Tags): nur fürs Vorlesen gedacht, NIE für die
            // Anzeige - siehe app.tts._pickSpeechVariant(). Ist bei
            // bekanntem PDF-Text (s.o.) kein eigener speechText sinnvoll,
            // weil dort auch "text" schon feststeht statt von der KI erzeugt
            // zu werden - dann bleibt es beim normalen Text.
            speechText: page.pdfSourceText ? null : (result.speechText || null),
            // NEU (v0.39.0-beta, "Personas kommen nicht zur Geltung"): der
            // eigene Zwischenruf der Persona - im Reader als Sprechblase unter
            // dem Text, beim automatischen Vorlesen nach dem Text.
            personaComment: typeof result.personaComment === 'string' && result.personaComment.trim() ? result.personaComment.trim() : null,
            // NEU (Nutzerwunsch: "schwierige Wörter sollten nach dem
            // Textteil leicht erklärt werden") - persona-unabhängig (kommt
            // bei Geschichten aus dem "core"-Block, siehe js/api.js), daher
            // hier immer aus "result" lesbar, egal ob Einzel- oder Mehrere-
            // Personas-Pfad. app.tts liest das beim automatischen Vorlesen.
            difficultWords: Array.isArray(result.difficultWords)
                ? result.difficultWords.filter(w => w && w.word && w.explanation)
                : []
        };
    },

    // NEU: Kontroll-Ergebnis einer Seite für das aktuelle Kind-Profil.
    // Wie überall gilt: nie page.check direkt lesen - Seiten aus der Zeit
    // vor dieser Funktion haben das Feld gar nicht.
    resolvePageCheck(page, profileId) {
        const id = profileId || this.resolveCreationProfileId();
        return (page && page.check && page.check[id]) || null;
    },

    // NEU (Nutzerhinweis: "es sind nicht die fehlenden Seiten der Bücher mit
    // drinnen") - zählt Seiten, die noch GAR KEINE Grundanalyse haben (frisch
    // fotografiert/importiert oder zuletzt fehlgeschlagen). Vorher liefen
    // solche Seiten der Hintergrund-Vorbereitung nie hinein (sie prüfte nur
    // bereits fertige Seiten auf fehlende Personas) - jetzt höchste Priorität
    // in js/backgroundPregen.js findNextMissingTask(), da ohne Grundanalyse
    // überhaupt kein Text existiert, aus dem sich Varianten/Quiz/Birkenbihl
    // ableiten liessen.
    countMissingScans() {
        let missing = 0;
        Object.values(app.library).forEach(book => {
            book.pages.forEach(page => {
                if (page.excluded) return;
                if (page.status === 'pending' || page.status === 'error') missing++;
            });
        });
        return missing;
    },

    // NEU: zählt, wie viele Persona-Varianten in der gesamten Bibliothek
    // noch fehlen - für die Fortschrittsanzeige der Hintergrund-Vorbereitung.
    countMissingVariants() {
        let missing = 0;
        Object.values(app.library).forEach(book => {
            book.pages.forEach(page => {
                if (page.excluded) return; // FIX: ausgeschlossene Seiten nie mitzählen (werden nie analysiert)
                if (page.status !== 'done') return;
                // NEU (übersetzte Bücher): dort werden fehlende Personas nicht
                // nachgebaut (siehe findNextMissingTask() in backgroundPregen.js).
                if (book.language) return;
                app.personas.forEach(persona => {
                    if (!(page.variants && page.variants[persona.id])) missing++;
                });
            });
        });
        return missing;
    },

    // NEU (Hintergrund-Vorbereitung, Übersicht in den Einstellungen): dieselbe
    // Bedingung wie in js/backgroundPregen.js findNextMissingTask() für den
    // Buch-Quiz-Schritt - EIN Ort, damit Zähler und tatsächliche
    // Hintergrundarbeit nie auseinanderlaufen.
    countMissingBookQuiz() {
        let missing = 0;
        Object.values(app.library).forEach(book => {
            if (app.utils.resolveBookType(book) === 'workbook') return;
            // FIX: ausgeschlossene Seiten (bleiben absichtlich für immer
            // 'pending', werden nie analysiert) durften "allDone" nie
            // verhindern - sonst bekam ein Buch mit auch nur einer
            // ausgeschlossenen Seite (z.B. Impressum) NIE ein Buch-Quiz.
            const relevantPages = book.pages.filter(p => !p.excluded);
            const allDone = relevantPages.length > 0 && relevantPages.every(p => p.status === 'done');
            if (allDone && !book.bookQuiz) missing++;
        });
        return missing;
    },

    // NEU (Birkenbihl-Hintergrundvorbereitung, Nutzerwunsch): Fundstellen-
    // Liste statt nur einer Zahl - dieselbe Liste bedient sowohl den Zähler
    // in den Einstellungen (Länge) als auch js/backgroundPregen.js (nimmt
    // sich den ersten Eintrag), damit beide garantiert dieselbe Definition
    // von "fehlt" benutzen. Nur Geschichten (Übungshefte haben keinen
    // Birkenbihl-Tab, siehe applyBookTypeLabels() in render/reader.js) und
    // nur bereits ausgelesene Seiten mit vorhandenem Text. Zählt eine Seite
    // auch dann als "fehlt", wenn sie zwar schon eine Zerlegung hat, aber
    // für eine inzwischen gewechselte Zielsprache - sonst würde die
    // Hintergrund-Vorbereitung eine veraltete Übersetzung nie nachziehen.
    findMissingBirkenbihlPages() {
        const found = [];
        Object.values(app.library).forEach(book => {
            if (app.utils.resolveBookType(book) === 'workbook') return;
            // NEU (übersetzte Bücher): ein bereits übersetztes Buch braucht
            // keine Birkenbihl-Zerlegung aus dem Deutschen.
            if (book.language) return;
            book.pages.forEach((page, pageIdx) => {
                if (page.excluded) return; // FIX: ausgeschlossene Seiten nie mitzählen (werden nie analysiert)
                if (page.status !== 'done') return;
                const variant = app.utils.resolveAnyVariant(page, app.settings.persona);
                if (!variant || !variant.text) return;
                if (!page.birkenbihl || page.birkenbihl.lang !== app.settings.birkenbihlLanguage) {
                    found.push({ bookId: book.id, pageIdx });
                }
            });
        });
        return found;
    },

    countMissingBirkenbihl() {
        return app.utils.findMissingBirkenbihlPages().length;
    },

    // NEU (Nutzerwunsch: "auch wieder die background Durchführung der
    // fehlenden gesprochenen Teile als eigener Toggle") - Gegenstück zu
    // findMissingBirkenbihlPages() oben, aber ASYNC: ob eine KI-Stimmen-
    // Aufnahme schon existiert, steht im ttsCache (IndexedDB), nicht im
    // Buch selbst - lässt sich also nicht synchron aus app.library ablesen.
    // Nutzt denselben Cache-Nur-Weg wie die Ton-Vorschau beim Video-Export
    // (app.ttsNeural.renderAudio(..., {cacheOnly:true})) - ein Cache-
    // Fehltreffer liefert null zurück, OHNE einen bezahlten Synthese-Aufruf
    // auszulösen. Ohne aktive KI-Stimme (Gerätestimme liefert keine Datei)
    // oder abgeschaltetem Stimmen-Speicher gibt es nichts zu prüfen.
    async findMissingAudioPages() {
        if (!app.ttsNeural.isActive() || app.settings.ttsCacheEnabled === false) return [];

        const found = [];
        const personaId = app.settings.persona;
        for (const book of Object.values(app.library)) {
            // NEU (übersetzte Bücher): nur, wenn die eingestellte KI-Stimme
            // die Buchsprache kann - sonst gäbe es hier eine Dauerschleife
            // aus Fehlversuchen.
            const language = app.utils.bookSpeechLang(book);
            if (language && !app.ttsProviders.supportsForeignLanguage(app.ttsProviders.current(), language)) continue;
            for (let pageIdx = 0; pageIdx < book.pages.length; pageIdx++) {
                const page = book.pages[pageIdx];
                if (page.excluded) continue;
                if (page.status !== 'done') continue;
                const variant = app.utils.resolvePageVariant(page, personaId);
                if (!variant || !variant.text) continue;

                const { plain, tagged } = language ? { plain: variant.text, tagged: null } : app.tts._pickSpeechVariant(variant);
                const cached = await app.ttsNeural.renderAudio(tagged || plain, { personaId, cacheOnly: true, language });
                if (!cached) found.push({ bookId: book.id, pageIdx });
            }
        }
        return found;
    },

    async countMissingAudio() {
        return (await app.utils.findMissingAudioPages()).length;
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

    // NEU: gängige Abkürzungen, die die Stimme sonst buchstabiert oder falsch
    // betont vorliest - Liste bewusst kurz gehalten (nur was in Kinderbuch-
    // /Heft-Texten tatsächlich vorkommt), Erweiterung bei Bedarf hier.
    // Reihenfolge wichtig: "z.b." vor "b." o.ä. gibt es hier nicht, aber
    // längere Abkürzungen stehen trotzdem vor kürzeren, falls sich das mal
    // überschneidet.
    // FIX: hier stand ursprünglich überall ein \b hinter dem abschließenden
    // Punkt. Eine Wortgrenze setzt aber einen Wechsel zwischen Wort- und
    // Nicht-Wort-Zeichen voraus - nach "." folgt fast immer ein Leerzeichen,
    // also zwei Nicht-Wort-Zeichen, und die Regel hat NIE gegriffen. Der
    // Lookahead (?=\s|$) prüft stattdessen genau das, was gemeint war:
    // hinter der Abkürzung kommt Leerraum oder das Textende. Ohne diesen
    // Abschluss würde "ca." auch mitten in "Cache" ersetzt.
    _SPEECH_ABBREVIATIONS: [
        [/\bz\.\s*b\.(?=\s|$)/gi, 'zum Beispiel'],
        [/\bu\.\s*a\.(?=\s|$)/gi, 'unter anderem'],
        [/\bd\.\s*h\.(?=\s|$)/gi, 'das heißt'],
        [/\busw\.(?=\s|$)/gi, 'und so weiter'],
        [/\bca\.(?=\s|$)/gi, 'circa'],
        [/\bnr\.(?=\s|$)/gi, 'Nummer'],
        [/\bbzw\.(?=\s|$)/gi, 'beziehungsweise'],
        [/\betc\.(?=\s|$)/gi, 'et cetera']
    ],

    // NEU: glättet den (für die Anzeige exakten, gedruckten) Text für die
    // Sprachausgabe - siehe docs/ROADMAP.md "Vorlese-Aufbereitung". Läuft
    // VOR stripEmojiForSpeech()/buildSpeechHighlightHtml(), damit deren
    // Wort-Zerlegung (für die Hervorhebung) schon auf dem geglätteten Text
    // arbeitet und nicht selbst noch Zeilenumbrüche als "Wörter" zählt.
    // Verändert NUR den an die Sprachausgabe gehenden Text, NIE die im
    // Reader angezeigten/gespeicherten Seitentexte.
    prepareTextForSpeech(text) {
        if (!text) return text;
        let result = text
            // Trennstrich am Zeilenende + Zeilenumbruch zusammenziehen, aber
            // NUR wenn danach ein Kleinbuchstabe folgt ("Kinder-\nwagen" ->
            // "Kinderwagen") - eine echte Bindestrich-Verbindung wie
            // "Ost-West" hat keinen Zeilenumbruch und bleibt unangetastet,
            // ein Bindestrich vor einem neuen, großgeschriebenen Wort
            // ("Satzende-\nNächster Satz") wird bewusst NICHT zusammengezogen.
            .replace(/(\p{L})-\s*\r?\n\s*(\p{Ll})/gu, '$1$2')
            // übrige harte Zeilenumbrüche mitten im Satz sind fürs Ohr nur
            // eine Pause, keine neue Zeile - werden zu einem Leerzeichen.
            .replace(/\r?\n/g, ' ');

        this._SPEECH_ABBREVIATIONS.forEach(([re, replacement]) => {
            result = result.replace(re, replacement);
        });

        // mehrfache Leerzeichen (auch durch die Ersetzungen oben entstanden)
        // und Leerzeilen zu je einem einzigen Leerzeichen normalisieren.
        return result.replace(/\s+/g, ' ').trim();
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

    // NEU: zerlegt einen langen (bereits geglätteten, einzeiligen) Text in
    // Stücke von jeweils höchstens maxChars Zeichen, IMMER an einem
    // Satzende getrennt (siehe docs/ROADMAP.md "Lange Texte stückeln") -
    // eine KI-Stimme mitten im Satz abzuschneiden würde hörbar komisch
    // klingen. "start" ist die Zeichenposition jedes Stücks im
    // ORIGINAL-Text, damit sich die schon gebauten Hervorhebungs-Spans
    // (siehe buildSpeechHighlightHtml) trotz der Zerlegung noch dem
    // richtigen Stück zuordnen lassen. Aneinandergehängt ergeben die
    // Stücke wieder exakt den Original-Text (keine Lücken/Überlappungen).
    splitTextIntoChunks(text, maxChars = 800) {
        if (!text) return [];
        if (text.length <= maxChars) return [{ text, start: 0 }];

        // Satzenden: . ! ? (ggf. gefolgt von Anführungszeichen/Klammer)
        // gefolgt von Leerraum - der Text ist an dieser Stelle schon
        // einzeilig (siehe prepareTextForSpeech).
        const SENTENCE_END = /[.!?]+["')\]]?\s+/g;
        const boundaries = [0];
        let match;
        while ((match = SENTENCE_END.exec(text)) !== null) {
            boundaries.push(match.index + match[0].length);
        }
        if (boundaries[boundaries.length - 1] !== text.length) boundaries.push(text.length);

        const chunks = [];
        let chunkStart = 0;
        let lastBoundary = 0;

        for (let i = 1; i < boundaries.length; i++) {
            const boundary = boundaries[i];

            // Das nächste Satzende würde das Stück über maxChars hinaus
            // sprengen - dann lieber beim VORHERIGEN Satzende abschneiden.
            if (boundary - chunkStart > maxChars && lastBoundary > chunkStart) {
                chunks.push({ text: text.slice(chunkStart, lastBoundary), start: chunkStart });
                chunkStart = lastBoundary;
            }

            // Ein einzelner Satz, der schon für sich allein länger als
            // maxChars ist (selten, z.B. eine lange Aufzählung ohne Punkt) -
            // hart an der letzten Wortgrenze vor der Grenze trennen, sonst
            // bliebe dieses eine "Stück" beliebig lang.
            if (boundary - chunkStart > maxChars) {
                let cut = chunkStart + maxChars;
                const lastSpace = text.lastIndexOf(' ', cut);
                if (lastSpace > chunkStart) cut = lastSpace + 1;
                chunks.push({ text: text.slice(chunkStart, cut), start: chunkStart });
                chunkStart = cut;
            }

            lastBoundary = boundary;
        }

        if (chunkStart < text.length) {
            chunks.push({ text: text.slice(chunkStart), start: chunkStart });
        }
        return chunks;
    },

    // NEU: für den Mitmachmodus mit KI-Stimme (siehe app.ttsNeural.speakMitmach).
    // Anders als beim Gerätestimme-Weg (app.tts.speakMitmach) entsteht hier
    // NUR EINE zusammenhängende Aufnahme für den ganzen Text (Emoji-Stellen
    // werden dafür durch eine Pausen-Anweisung ersetzt, siehe dort) - die
    // Wort-Spans zählen ihre Zeichenposition deshalb bewusst GLOBAL über den
    // ganzen gesprochenen Text durch (nicht wie dort je Häppchen bei 0 neu),
    // weil das zu einer einzigen durchgehenden Zeitachse passen muss.
    // "plain" ist der Text ohne Emojis (mit ihren Umgebungs-Leerzeichen) -
    // exakt das, was tatsächlich vorgelesen wird und wozu die
    // Zeichenpositionen passen.
    buildMitmachSpeechText(parts) {
        let idx = 0;
        let html = '';
        let plain = '';
        parts.forEach((part, i) => {
            if (part.type === 'emoji') {
                html += `<span class="mitmach-emoji" data-emoji-idx="${i}">${part.value}</span>`;
                return;
            }
            part.value.split(/(\s+)/).forEach(token => {
                const start = idx;
                idx += token.length;
                plain += token;
                if (token === '' || /^\s+$/.test(token)) { html += token; return; }
                html += `<span class="speech-word" data-start="${start}">${this.sanitize(token)}</span>`;
            });
        });
        return { html, plain };
    },

    // NEU: deutsches Ordnungswort für die Inhaltsverzeichnis-Ansage
    // ("das erste Kapitel ist...", "das zweite..."). Reicht für die in
    // Kinderbüchern üblichen Kapitelzahlen, danach numerischer Fallback.
    germanOrdinal(n) {
        const words = ['nullte', 'erste', 'zweite', 'dritte', 'vierte', 'fünfte', 'sechste', 'siebte', 'achte', 'neunte', 'zehnte', 'elfte', 'zwölfte', 'dreizehnte', 'vierzehnte', 'fünfzehnte', 'sechzehnte', 'siebzehnte', 'achtzehnte', 'neunzehnte', 'zwanzigste'];
        return words[n] || `${n}.`;
    },

    // FIX (v0.40.0-beta, Release-Prüfung): bisher über textContent/innerHTML -
    // das escaped nur < > &, aber KEINE Anführungszeichen. sanitize() wird
    // aber auch in Attributen benutzt (value="...", <option value="...">) -
    // ein " in KI- oder Nutzertext konnte dort aus dem Attribut ausbrechen.
    // Jetzt reines String-Escaping aller fünf HTML-Sonderzeichen: im Text
    // sieht das Ergebnis identisch aus, in Attributen ist es sicher, und es
    // läuft ohne Browser (Tests).
    sanitize(str) {
        if (str === null || str === undefined || str === '') return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
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
    },

    // NEU (Ausbaustufe 5, Panels): welches Bild einer Seite beim Lesen
    // tatsächlich gezeigt wird - normalerweise page.imgUrl (bei einem Comic
    // MIT eingebrannten Sprechblasen, siehe js/studio/studioExport.js),
    // außer der Reader-Umschalter (app.state.comicBubblesOff, siehe
    // js/actions/reader.js toggleComicBubblesInReader()) steht auf "aus" UND
    // die Seite hat eine "saubere" Zweitfassung (comicCleanImgUrl). EIN Ort,
    // damit Haupt-/Vollbild-Ansicht und "Frag den Zauberer" garantiert
    // dasselbe Bild sehen wie das Kind gerade auf dem Schirm hat.
    resolveDisplayImageUrl(page) {
        if (app.state.comicBubblesOff && page.comicCleanImgUrl) return page.comicCleanImgUrl;
        return page.imgUrl;
    }
});
