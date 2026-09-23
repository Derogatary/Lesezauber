import { app } from './core.js';

// ================= Hintergrund-Vorbereitung (opt-in) =================
// Läuft nur, wenn in den Einstellungen aktiviert. Sucht sich alle paar
// Sekunden EINE fehlende Aufgabe und erledigt genau diese eine - nie mehr,
// und nie während gerade etwas anderes mit der KI läuft. So bleibt die
// Kostenlos-Grenze im Blick, auch wenn man das Feature aktiviert.
// Erhöht von 6s auf 9s - Hintergrundarbeit hat keine Eile und soll das
// Minutenlimit nicht zusätzlich zu regulären Analysen strapazieren.
//
// Vier Aufgaben-Arten, in fester Prioritäts-Reihenfolge (Nutzerwunsch:
// "erst Seiten, dann anderer Kram") - siehe findNextMissingTask():
// 0. Grundanalyse einer noch gar nicht ausgelesenen Seite (NEU - vorher
//    liefen frisch fotografierte/importierte, aber noch nie analysierte
//    Seiten der Hintergrund-Vorbereitung nie hinein, siehe Nutzerhinweis
//    "es sind nicht die fehlenden Seiten der Bücher mit drinnen")
// 1. Persona-Variante einer Seite (Grundlage fürs Lesen überhaupt)
// 2. Buch-Quiz (erst wenn Punkt 0+1 für ALLE Bücher erledigt ist)
// 3. Birkenbihl-Übersetzung (niedrigste Priorität, eigener Zusatz-Schalter
//    app.settings.backgroundPregenBirkenbihl, siehe js/state.js)
//
// NEU (Nutzerwunsch: "könnten diese Unterthemen nicht mit einem Prompt oder
// mehreren wenig Prompts erledigt werden?"): Punkt 0 und 1 laufen bei
// Geschichten (bookType 'story') beide über denselben Analyse-Kern
// (app.actions._analyzePageCore() in js/actions/scanner.js), der seit
// v0.35.0-beta ALLE Personas UND die Birkenbihl-Zerlegung in EINEM
// API-Aufruf liefert - eine Seite mit mehreren fehlenden Personas braucht
// dadurch nur noch einen einzigen Hintergrund-Durchlauf statt einem pro
// fehlender Persona. Bei Übungsheften (nur eine relevante Persona) bleibt
// es beim gezielten Einzel-Aufruf.
//
// NEU (Nutzerwunsch): läuft absichtlich auch, wenn der Tab nicht der
// gerade sichtbare ist (siehe runOneBackgroundTask(), früher gab es dort
// eine document.visibilityState-Prüfung) - nur ein komplett geschlossener
// Tab/Browser stoppt es zwangsläufig, das kann eine reine Client-App ohne
// eigenen Server (Push-Benachrichtigungen bräuchten einen) nicht umgehen.
//
// FIX (Nutzerhinweis: "Die Prio ist eine andere Schleife, da es einen
// anderen Anbieter callt."): KI-Stimmen-Aufnahmen (app.settings.
// backgroundPregenAudio) sind NICHT Teil dieser Prioritäts-Kette - sie
// rufen einen anderen Anbieter mit eigenem Kontingent auf (die Sprach-API
// statt Gemini/Mistral) und laufen deshalb in einer komplett eigenen,
// parallelen Schleife ganz unten in dieser Datei (runOneAudioBackgroundTask/
// scheduleNextAudio), unabhängig vom app.state.apiBusy dieser Schleife hier.
const BACKGROUND_PAUSE_MS = 9000;

async function findNextMissingTask() {
    for (const bookId of Object.keys(app.library)) {
        const book = app.library[bookId];
        const bookType = app.utils.resolveBookType(book);
        // NEU (übersetzte Bücher): Analyse/Persona-Nachbau liefe über den
        // deutschen Analyse-Prompt und schriebe deutschen Text in ein
        // fremdsprachiges Buch - übersetzte Bücher deshalb hier auslassen.
        // Nur das Buch-Quiz (jetzt in der Buchsprache) darf nachkommen.
        if (book.language) {
            const done = book.pages.filter(p => !p.excluded).every(p => p.status === 'done');
            if (done && !book.bookQuiz) return { type: 'bookQuiz', bookId };
            continue;
        }

        for (let i = 0; i < book.pages.length; i++) {
            const page = book.pages[i];
            // NEU: ausgeschlossene Seiten (Leerseiten, Impressum etc.) nie
            // automatisch anfassen - dieselbe Regel wie beim manuellen Scan.
            if (page.excluded) continue;

            // NEU (höchste Priorität): eine noch gar nicht ausgelesene oder
            // zuletzt fehlgeschlagene Seite hat noch KEIN Grundmaterial -
            // ohne das ergibt weder eine Persona-Variante noch Buch-Quiz
            // noch Birkenbihl überhaupt Sinn. Nutzt denselben Analyse-Kern
            // wie der manuelle Scan (app.actions._analyzePageCore), der bei
            // Geschichten gleich ALLE Personas + Birkenbihl mitliefert.
            if (page.status === 'pending' || page.status === 'error') {
                return { type: 'scan', bookId, pageIdx: i };
            }
            if (page.status !== 'done') continue;

            if (bookType === 'story') {
                // NEU: EIN fehlender Aufruf für die ganze Seite reicht -
                // app.api.analyzeAllPersonas() erzeugt ohnehin ALLE
                // Personas auf einmal, ein erneuter Aufruf mit irgendeiner
                // Persona-ID füllt also automatisch auch die übrigen.
                const missingAny = app.personas.some(p => !(page.variants && page.variants[p.id]));
                if (missingAny) {
                    return { type: 'persona', bookId, pageIdx: i, personaId: app.settings.persona };
                }
            } else {
                for (const persona of app.personas) {
                    const hasVariant = page.variants && page.variants[persona.id];
                    if (!hasVariant) {
                        return { type: 'persona', bookId, pageIdx: i, personaId: persona.id };
                    }
                }
            }
        }

        // Buch-Quiz erst vorschlagen, wenn wirklich JEDE relevante Seite
        // mindestens eine Version hat (Buch vollständig gescannt).
        // NEU: Übungshefte übersprungen - Verständnisfragen "zur Geschichte"
        // ergeben bei Arbeitsblättern keinen Sinn und würden nur API-Aufrufe
        // verbrennen. FIX: ausgeschlossene Seiten (bleiben absichtlich für
        // immer 'pending') dürfen "allDone" nicht blockieren, siehe
        // app.utils.countMissingBookQuiz() in js/utils.js (identische Logik).
        const relevantPages = book.pages.filter(p => !p.excluded);
        const allDone = relevantPages.length > 0 && relevantPages.every(p => p.status === 'done');
        if (allDone && !book.bookQuiz && bookType !== 'workbook') {
            return { type: 'bookQuiz', bookId };
        }
    }

    // NEU (Birkenbihl-Hintergrundvorbereitung, Nutzerwunsch: "erst Seiten,
    // dann anderer Kram"): niedrigste Priorität - läuft erst, wenn ALLE
    // Bücher weder eine fehlende Persona-Variante noch ein fehlendes
    // Buch-Quiz mehr haben (obige Schleife ist dann ohne Treffer
    // durchgelaufen). Zusätzlich eigens bestätigt
    // (app.settings.backgroundPregenBirkenbihl) - kostet sonst ungefragt
    // mehr Anfragen, als der allgemeine Schalter verspricht. Fundstelle
    // kommt aus derselben Liste wie der Zähler in den Einstellungen (siehe
    // app.utils.findMissingBirkenbihlPages() in js/utils.js).
    if (app.settings.backgroundPregenBirkenbihl) {
        const [first] = app.utils.findMissingBirkenbihlPages();
        if (first) return { type: 'birkenbihl', bookId: first.bookId, pageIdx: first.pageIdx };
    }

    return null;
}

// Erledigt die Grundanalyse ODER eine fehlende Persona-Variante für eine
// bestimmte Seite - beides läuft seit v0.35.0-beta über denselben Analyse-
// Kern app.actions._analyzePageCore() (js/actions/scanner.js), der bei
// Geschichten ALLE Personas + Birkenbihl in einem Aufruf liefert und bei
// Übungsheften gezielt nur die übergebene Persona erzeugt. Arbeitet bewusst
// NICHT über app.state.currentBookId (das würde die gerade sichtbare
// Ansicht der Person durcheinanderbringen, falls sie parallel ein anderes
// Buch offen hat) - alles läuft über direkt übergebene Objekte.
async function analyzePageInBackground(book, pageIdx, personaId) {
    const page = book.pages[pageIdx];
    page.status = 'processing';
    try {
        await app.actions._analyzePageCore(book, pageIdx, personaId);
    } catch (e) {
        page.status = 'error';
        throw e;
    } finally {
        app.dbOps.saveBook(book);
    }
}

// NEU (Birkenbihl-Hintergrundvorbereitung, Nutzerwunsch): Gegenstück zu
// app.actions.generateBirkenbihlDecoding() in js/actions/birkenbihl.js,
// aber ohne Loader/Toast (läuft ja im Hintergrund) und über die GLOBALE
// Standard-Persona statt der gerade im Reader gewählten - dieselbe
// Begründung wie bei generateBookQuizInBackground() unten: der Hintergrund
// kennt keine "gerade geöffnete" Ansicht.
async function generateBirkenbihlForPageInBackground(book, pageIdx) {
    const page = book.pages[pageIdx];
    const variant = app.utils.resolveAnyVariant(page, app.settings.persona);
    if (!variant || !variant.text) return;

    const langId = app.settings.birkenbihlLanguage;
    const { pairs } = await app.api.generateBirkenbihlDecoding(variant.text, langId);
    // Nichts Brauchbares zurückbekommen -> lieber nichts speichern und beim
    // nächsten Zyklus erneut versuchen, als eine leere Übersetzung zu
    // hinterlegen, die dann fälschlich als "erledigt" gilt.
    if (pairs.length === 0) return;

    page.birkenbihl = { lang: langId, pairs, generatedAt: Date.now() };
    app.dbOps.saveBook(book);
}

// NEU (Nutzerwunsch: "auch wieder die background Durchführung der
// fehlenden gesprochenen Teile als eigener Toggle") - Gegenstück zu
// app.actions.prepareBookAudio() (js/actions/prepareAudio.js), aber ohne
// Loader/Toast (läuft ja im Hintergrund), über die GLOBALE Standard-Persona
// statt der gerade im Reader gewählten, und nur EINE Seite statt gleich dem
// ganzen Buch (Priorität und Kosten bleiben so vergleichbar mit den anderen
// Hintergrund-Aufgaben). Speichert NICHTS am Buch - die Aufnahme landet
// direkt im ttsCache (IndexedDB) über denselben Weg wie beim normalen
// Vorlesen, deshalb hier kein app.dbOps.saveBook() nötig.
async function generateAudioForPageInBackground(book, pageIdx) {
    const page = book.pages[pageIdx];
    const personaId = app.settings.persona;
    const variant = app.utils.resolvePageVariant(page, personaId);
    if (!variant || !variant.text) return;

    // Gleiche Weiche wie beim tatsächlichen Vorlesen (app.tts.speak()) bzw.
    // beim manuellen "Buch hörfertig machen" - sonst wird die falsche
    // Fassung vorbereitet und beim Lesen trotzdem neu synthetisiert.
    // NEU (übersetzte Bücher): Sprach-Route + keine Audio-Tags, damit die
    // Aufnahme unter demselben Schlüssel landet, den das Vorlesen abfragt.
    const language = app.utils.bookSpeechLang(book);
    const { plain, tagged } = language ? { plain: variant.text, tagged: null } : app.tts._pickSpeechVariant(variant);
    await app.ttsNeural.renderAudio(tagged || plain, { personaId, language });
}

async function generateBookQuizInBackground(book) {
    const personaId = app.settings.persona;
    const compiledText = book.pages
        .map((p, i) => {
            const variant = app.utils.resolveAnyVariant(p, personaId);
            return variant && variant.text ? `Seite ${i + 1}: ${variant.text}` : null;
        })
        .filter(Boolean)
        .join('\n');

    if (!compiledText) return;

    const questions = await app.api.generateBookQuiz(compiledText, personaId, book.language || null);
    book.bookQuiz = { questions };
    app.dbOps.saveBook(book);
}

async function runOneBackgroundTask() {
    if (!app.settings.backgroundPregenEnabled) return;
    if (app.state.apiBusy) return;
    // FIX (Nutzerwunsch: "es soll auch laufen, wenn der Tab nicht offen
    // ist"): die bisherige document.visibilityState-Prüfung verlangte, dass
    // LeseZauber Pro der GERADE aktiv angeschaute Tab ist - ein Wechsel zu
    // einer anderen App/einem anderen Tab (auch nur kurz) stoppte die
    // Vorbereitung sofort. Jetzt läuft sie weiter, solange der Tab
    // überhaupt noch offen/geladen ist. Ehrliche Grenze, die sich OHNE
    // eigenen Server (Push-Benachrichtigungen bräuchten einen) nicht
    // umgehen lässt: schließt du den Tab/Browser ganz, endet JEDE
    // JavaScript-Ausführung sofort - dagegen hilft kein Code. Browser
    // drosseln außerdem Timer in nicht sichtbaren Tabs (meist auf ca. 1x/
    // Minute) und können einen lange im Hintergrund liegenden Tab nach
    // einer Weile ganz einfrieren, um Akku zu sparen - besonders iPhones
    // (Safari) tun das aggressiv. Für "Tab offen, aber gerade eine andere
    // App/ein anderes Fenster im Vordergrund" funktioniert es damit,
    // für "App komplett geschlossen" grundsätzlich nicht.

    const task = await findNextMissingTask();
    if (!task) return;

    // NEU (v0.44.0-beta, Nachtmodus js/actions/nightPrep.js): was gerade
    // bearbeitet wird und ob der letzte Versuch geklappt hat - nur Anzeige.
    const taskBook = app.library[task.bookId];
    const taskLabel = { scan: 'liest Seite aus', persona: 'Erzähler-Variante', bookQuiz: 'Buch-Quiz', birkenbihl: 'Birkenbihl' }[task.type] || task.type;
    app.state.pregenActivity = {
        ...(app.state.pregenActivity || {}),
        current: `${taskLabel}${typeof task.pageIdx === 'number' ? ` · Seite ${task.pageIdx + 1}` : ''} · „${taskBook?.title || '?'}“`
    };

    app.state.apiBusy = true;
    try {
        if (task.type === 'scan' || task.type === 'persona') {
            // NEU: 'scan' (noch gar nicht ausgelesene Seite) und 'persona'
            // (fehlende Variante einer schon ausgelesenen Seite) laufen
            // beide über denselben Analyse-Kern - bei 'scan' ist personaId
            // noch nicht bekannt, dann zählt die globale Standard-Persona.
            await analyzePageInBackground(app.library[task.bookId], task.pageIdx, task.personaId || app.settings.persona);
            // Nur neu zeichnen, wenn genau dieses Buch/diese Seite gerade
            // sichtbar ist - sonst nicht in eine fremde Ansicht eingreifen.
            if (app.state.currentBookId === task.bookId) {
                if (app.state.currentView === 'book') app.render.book(task.bookId);
                if (app.state.currentView === 'reader' && app.state.currentPageIdx === task.pageIdx) {
                    app.render.reader(task.pageIdx);
                }
            }
        } else if (task.type === 'bookQuiz') {
            await generateBookQuizInBackground(app.library[task.bookId]);
            if (app.state.currentBookId === task.bookId && app.state.currentView === 'reader') {
                app.render.reader(app.state.currentPageIdx);
            }
        } else if (task.type === 'birkenbihl') {
            await generateBirkenbihlForPageInBackground(app.library[task.bookId], task.pageIdx);
            // Nur neu zeichnen, wenn genau diese Seite gerade sichtbar ist -
            // gleiche Vorsicht wie beim Persona-Zweig oben.
            if (app.state.currentBookId === task.bookId && app.state.currentView === 'reader' && app.state.currentPageIdx === task.pageIdx) {
                app.render.birkenbihlTab(app.library[task.bookId].pages[task.pageIdx]);
            }
        }

        // NEU: hält den kleinen "⏳ X im Hintergrund offen"-Hinweis in der
        // Bibliothek aktuell, falls die App gerade dort offen daliegt.
        if (app.state.currentView === 'lib') app.render.library();
        app.state.pregenActivity.lastSuccessAt = Date.now();
    } catch (e) {
        app.state.pregenActivity.lastErrorAt = Date.now();
        app.state.pregenActivity.lastError = e?.message || String(e);
        // Einzelner Fehler im Hintergrund soll nicht störend auffallen -
        // beim nächsten Zyklus wird es automatisch erneut versucht.
        console.warn('Hintergrund-Vorbereitung: ein Versuch fehlgeschlagen, wird später erneut versucht.', e);
    } finally {
        app.state.apiBusy = false;
    }
}

function scheduleNext() {
    setTimeout(async () => {
        await runOneBackgroundTask();
        scheduleNext();
    }, BACKGROUND_PAUSE_MS);
}

scheduleNext();

// ========== Zweite, unabhängige Schleife: KI-Stimmen-Aufnahmen ==========
// FIX (Nutzerhinweis: "Die Prio ist eine andere Schleife, da es einen
// anderen Anbieter callt."): Audio-Vorbereitung lief bisher als niedrigste
// Stufe in DERSELBEN Schleife wie Grundanalyse/Personas/Buch-Quiz/
// Birkenbihl (findNextMissingTask() oben). Das war architektonisch falsch:
// jene vier Aufgaben teilen sich alle dasselbe Gemini/Mistral-
// Tageskontingent und MÜSSEN sich deshalb tatsächlich einen Slot alle 9
// Sekunden teilen. Eine KI-Stimmen-Aufnahme ruft dagegen einen KOMPLETT
// ANDEREN Anbieter auf (Speechify/ElevenLabs/Google Cloud/OpenAI/
// Gemini-TTS, je nach app.settings.ttsProvider) mit eigenem, unabhängigem
// Kontingent - sie hätte in der gemeinsamen Schleife unnötig lange warten
// müssen, bis eine große Bibliothek komplett textlich fertig ist, obwohl
// beim Sprach-Anbieter währenddessen nichts passiert wäre. Läuft deshalb
// als eigene, parallele Schleife mit eigenem Lauf-Schutz (audioTaskRunning
// statt des gemeinsamen app.state.apiBusy, das nur die Text-Anfragen
// serialisiert) - kann also gleichzeitig mit der Text-Schleife oben aktiv
// sein, ohne sich gegenseitig zu blockieren. Landet nur im ttsCache
// (IndexedDB), verändert kein Buch-Feld, deshalb auch kein Neuzeichnen
// einer Ansicht nötig.
let audioTaskRunning = false;

async function runOneAudioBackgroundTask() {
    if (!app.settings.backgroundPregenEnabled) return;
    if (!app.settings.backgroundPregenAudio) return;
    if (audioTaskRunning) return;

    // findMissingAudioPages() prüft selbst, ob überhaupt eine KI-Stimme
    // aktiv ist und der Stimmen-Speicher eingeschaltet ist, und liefert
    // sonst eine leere Liste.
    const [first] = await app.utils.findMissingAudioPages();
    if (!first) return;

    audioTaskRunning = true;
    try {
        await generateAudioForPageInBackground(app.library[first.bookId], first.pageIdx);
        // NEU: hält den kleinen "⏳ X im Hintergrund offen"-Hinweis in der
        // Bibliothek aktuell - dieselbe Begründung wie in
        // runOneBackgroundTask() oben, hier separat, weil beide Schleifen
        // unabhängig voneinander laufen.
        if (app.state.currentView === 'lib') app.render.library();
    } catch (e) {
        console.warn('Hintergrund-Vorbereitung (KI-Stimme): ein Versuch fehlgeschlagen, wird später erneut versucht.', e);
    } finally {
        audioTaskRunning = false;
    }
}

// NEU (Nutzerwunsch: "Passe die Calls an die RPM an"): die Pause zwischen
// zwei Audio-Vorbereitungen richtet sich nach dem GERADE eingestellten
// Sprach-Anbieter (app.ttsProviders.current().bgPregenIntervalMs, siehe
// js/ttsProviders.js) statt fest nach BACKGROUND_PAUSE_MS - Speechify
// erlaubt laut eigenem Dashboard 1 Anfrage/Sekunde, viel schneller als der
// für Gemini/Mistral gedachte 9-Sekunden-Standard. Wird bei jedem Zyklus
// neu ermittelt, damit ein Anbieterwechsel mitten in der Vorbereitung
// sofort die passende Geschwindigkeit übernimmt. Anbieter ohne bestätigten
// Wert fallen auf denselben vorsichtigen Standard wie die Text-Schleife
// zurück.
function audioLoopDelayMs() {
    const provider = app.ttsProviders.current();
    return provider.bgPregenIntervalMs || BACKGROUND_PAUSE_MS;
}

function scheduleNextAudio() {
    setTimeout(async () => {
        await runOneAudioBackgroundTask();
        scheduleNextAudio();
    }, audioLoopDelayMs());
}

scheduleNextAudio();
