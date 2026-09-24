import { app } from '../../core.js';

// Ab dieser Zeichenzahl im zusammengesetzten Buchtext wird in mehreren
// Blöcken statt einem einzigen Call gearbeitet. Grund: Gemini antwortet
// mit maximal ~8192 Output-Tokens (siehe api.js) - bei einem langen Roman
// mit vielen Kapiteln/Entitäten reicht das für die JSON-Antwort sonst
// nicht mehr und das Ergebnis wird mitten im Satz abgeschnitten und
// unparsbar. Kleinere Blöcke halten außerdem die Qualität pro Block hoch
// ("lost in the middle" bei sehr langem Kontext).
const WIKI_CHUNK_CHAR_LIMIT = 15000;

// Baut den kompletten Buchtext auf und teilt ihn - falls nötig - in
// mehrere Blöcke auf. Eine einzelne Seite wird NIE mitten im Text
// zerschnitten (bleibt immer komplett in einem Block), auch wenn eine
// außergewöhnlich lange Seite den Block dadurch allein sprengt.
function buildWikiChunks(book) {
    const lines = book.pages
        .map((p, i) => p.text ? `Seite ${i + 1}: ${p.text}` : null)
        .filter(Boolean);

    const chunks = [];
    let current = [];
    let currentLen = 0;
    for (const line of lines) {
        if (current.length > 0 && currentLen + line.length > WIKI_CHUNK_CHAR_LIMIT) {
            chunks.push(current.join('\n'));
            current = [];
            currentLen = 0;
        }
        current.push(line);
        currentLen += line.length + 1;
    }
    if (current.length > 0) chunks.push(current.join('\n'));
    return chunks;
}

// Führt die Teilergebnisse mehrerer Blöcke zu einem Wiki zusammen.
// Kapitel: einfach aneinandergehängt (jeder Block deckt einen eigenen,
// nicht überlappenden Seitenbereich ab, bleiben also automatisch in der
// richtigen Reihenfolge - siehe buildWikiChunks).
// Entitäten: nach Name+Typ zusammengeführt, damit z.B. eine Figur, die in
// Block 1 UND Block 3 vorkommt, nur einmal auftaucht. Die jeweils
// längere/detailliertere Beschreibung gewinnt, die Seitenzahlen werden
// vereinigt - bewusst ohne zusätzlichen KI-Call fürs Zusammenführen, um
// nicht noch mehr API-Zeit/-Kontingent zu verbrauchen. Kompromiss: die
// Beschreibung ist dadurch nicht ganz so "aus einem Guss" wie bei einem
// einzelnen Call über das ganze Buch, aber inhaltlich vollständig.
//
// ZWEITER DURCHGANG (mergeSimilarNames unten): löst NUR den Fall, dass
// verschiedene Blöcke unterschiedlich vollständige Namen für dieselbe
// Figur liefern (z.B. "Frodo" in Block 1, "Frodo Beutlin" in Block 3) -
// exakte Duplikate fängt schon der erste Durchgang oben ab. Das ist eine
// einfache Teilstring-Heuristik, KEINE echte Ähnlichkeitserkennung: sie
// erkennt "Frodo" in "Frodo Beutlin", aber NICHT z.B. "Sam"/"Samweis"
// (unterschiedliche Schreibweise) oder Tippfehler-Varianten. Für mehr
// Genauigkeit bräuchte es einen zusätzlichen KI-Call zum Abgleichen, was
// bewusst vermieden wird (mehr API-Zeit/-Kontingent pro Wiki-Erstellung).
function mergeSimilarNames(entities) {
    // Nach Typ gruppieren - ein "Frodo" (Person) und ein gleichnamiger Ort
    // dürfen nie zusammengeführt werden.
    const byType = new Map();
    entities.forEach(e => {
        if (!byType.has(e.type)) byType.set(e.type, []);
        byType.get(e.type).push(e);
    });

    const result = [];
    for (const group of byType.values()) {
        // Längste Namen zuerst - so wird IMMER die vollständigere Variante
        // ("Frodo Beutlin") zum Ziel des Merges, nie umgekehrt.
        group.sort((a, b) => b.name.length - a.name.length);
        const merged = [];
        for (const entity of group) {
            const nameLower = entity.name.trim().toLowerCase();
            // Nur ab 4 Zeichen als Teilstring werten - sonst würden auch
            // kurze, unrelated Namen ("Al" in "Alexander", "Al" in
            // "Alraune") fälschlich zusammengeführt.
            const match = nameLower.length >= 4
                ? merged.find(m => m.name.trim().toLowerCase().includes(nameLower))
                : null;

            if (!match) {
                merged.push({ ...entity, pages: [...entity.pages] });
            } else {
                if (entity.description.length > match.description.length) {
                    match.description = entity.description;
                }
                match.pages = Array.from(new Set([...match.pages, ...entity.pages])).sort((a, b) => a - b);
            }
        }
        result.push(...merged);
    }
    return result;
}

function mergeWikiResults(partials) {
    const chapters = [];
    const entityMap = new Map();

    for (const partial of partials) {
        chapters.push(...(partial.chapters || []));

        for (const e of (partial.entities || [])) {
            if (!e || !e.name) continue;
            const key = `${e.type || 'sonstiges'}::${e.name.trim().toLowerCase()}`;
            const existing = entityMap.get(key);
            if (!existing) {
                entityMap.set(key, {
                    name: e.name,
                    type: e.type || 'sonstiges',
                    description: e.description || '',
                    pages: Array.isArray(e.pages) ? [...e.pages] : []
                });
            } else {
                if ((e.description || '').length > existing.description.length) {
                    existing.description = e.description;
                }
                if (Array.isArray(e.pages)) {
                    existing.pages = Array.from(new Set([...existing.pages, ...e.pages])).sort((a, b) => a - b);
                }
            }
        }
    }

    chapters.sort((a, b) => (a.startPage || 0) - (b.startPage || 0));
    return { chapters, entities: mergeSimilarNames(Array.from(entityMap.values())) };
}

// NEU (v0.47.0-beta, Nachtmodus): wie viele Wiki-Blöcke fehlen diesem Buch
// noch? 0 = Wiki vollständig. Gleiche Fortsetz-Regel wie generateBookWiki():
// hat sich die Block-Aufteilung geändert, fängt es von vorn an.
Object.assign(app.atlas.utils, {
    countWikiChunksOpen(book) {
        const total = buildWikiChunks(book).length;
        if (total === 0) return 0;
        const wiki = book.wiki;
        if (wiki && wiki.complete !== false) return 0;
        if (wiki && wiki.complete === false && wiki.totalChunks === total) {
            return Math.max(0, total - (wiki.processedChunkIndices || []).length);
        }
        return total;
    }
});

Object.assign(app.atlas.actions, {
    // erstellt (oder zeigt bereits vorhandene) Kapitelübersicht + Wiki-
    // Einträge für das aktuelle Buch - Personen, Orte, Monster, Fähigkeiten,
    // Systeme & Sonstiges, extrahiert aus dem Text aller Seiten. Funktioniert
    // für Kinderbücher genauso wie für Romane/LitRPG. Wird gecacht
    // (book.wiki), damit nicht bei jedem Aufruf erneut die KI bemüht wird.
    // Lange Bücher laufen automatisch in mehreren Blöcken statt einem
    // Mega-Call (siehe buildWikiChunks/WIKI_CHUNK_CHAR_LIMIT oben). Wird
    // der Lauf unterbrochen (Abbruch oder ein dauerhaft fehlschlagender
    // Block), merkt sich book.wiki, welche Blöcke schon fertig sind -
    // ein erneuter Aufruf (forceRegenerate=false) setzt dort fort statt
    // bereits erledigte Blöcke nochmal zu verarbeiten. Nur
    // forceRegenerate=true verwirft den Fortschritt und fängt komplett
    // neu an.
    //
    // NEU (v0.47.0-beta, Nachtmodus): opts für den Lauf ohne Bildschirm-
    // Bedienung (js/atlas/atlasNight.js):
    //   opts.book         - dieses Buch statt des gerade geöffneten
    //   opts.silent       - kein Lade-Fenster, keine Meldungen
    //   opts.shouldCancel - eigene Abbruch-Prüfung (Nachtmodus beendet)
    //   opts.maxChunks    - höchstens so viele Blöcke, dann als unvollständig
    //                       speichern. Der Nachtmodus nimmt 1: so wird nach
    //                       JEDEM Block gespeichert und der Fortschritt sichtbar -
    //                       sonst hielte ihn ein langes Buch (viele Blöcke am
    //                       Stück, erst am Ende gespeichert) fälschlich für
    //                       "festgefahren" (20 min ohne Fortschritt).
    // Gibt { complete } zurück (bzw. undefined, wenn nichts lief).
    async generateBookWiki(forceRegenerate = false, opts = {}) {
        const book = opts.book || app.atlas.library[app.atlas.state.currentBookId];
        if (!book) return;
        const silent = !!opts.silent;
        const isCancelled = () => (opts.shouldCancel ? opts.shouldCancel() : app.state.cancelAnalysis);
        // Neu zeichnen nur, wenn dieses Buch gerade in der Wiki-Ansicht offen ist
        const renderIfVisible = () => {
            if (!silent || (app.state.currentView === 'atlasWiki' && app.atlas.state.currentBookId === book.id)) {
                app.atlas.render.bookWiki();
            }
        };

        const chunks = buildWikiChunks(book);
        if (chunks.length === 0) {
            if (!silent) app.atlas.ui.toast('Noch kein Text im Buch - Wiki kann noch nicht erstellt werden.', 'ℹ️');
            return;
        }

        if (book.wiki && !forceRegenerate && book.wiki.complete !== false) {
            renderIfVisible(); // bereits vollständig vorhanden - nichts zu tun
            return { complete: true };
        }

        if (!app.atlas.settings.apiKeys || app.atlas.settings.apiKeys.length === 0) {
            if (silent) throw new Error('API_KEY_MISSING');
            app.atlas.ui.toast('Kein API-Key hinterlegt - unter ⚙️ Einstellungen eintragen.', '🔑', null, 6000);
            return;
        }

        // Nur fortsetzen, wenn sich die Block-Aufteilung seit dem letzten
        // (unvollständigen) Lauf nicht verändert hat - sonst könnte sich
        // z.B. durch nachträglich bearbeiteten Seitentext die Zuordnung
        // verschoben haben und wir würden falsche Blöcke überspringen.
        const hadIncompleteWiki = book.wiki && book.wiki.complete === false;
        const canResume = !forceRegenerate && hadIncompleteWiki && book.wiki.totalChunks === chunks.length;

        // Falls "Fortsetzen" gedrückt wurde, aber ein Fortsetzen nicht mehr
        // möglich ist (Seiten haben sich geändert) - transparent machen,
        // statt stillschweigend neu zu starten und den Button-Text Lügen
        // zu strafen.
        if (!forceRegenerate && hadIncompleteWiki && !canResume && !silent) {
            app.atlas.ui.toast('Seiten haben sich geändert - starte Wiki-Erstellung neu statt fortzusetzen.', 'ℹ️');
        }

        // Bevor ein komplettes Neu-Erstellen das bisherige Wiki überschreibt
        // (egal ob durch forceRegenerate oder weil ein Fortsetzen nicht
        // mehr möglich ist), EINE Sicherungskopie ablegen - kein volles
        // Versions-Verlauf, nur die zuletzt gültige Version, um den
        // häufigsten Fall abzudecken: "neu erstellt und jetzt ist's
        // schlechter/anders als erwartet".
        const willOverwrite = forceRegenerate || (hadIncompleteWiki && !canResume);
        const hasExistingWiki = book.wiki && ((book.wiki.entities || []).length > 0 || (book.wiki.chapters || []).length > 0);
        if (willOverwrite && hasExistingWiki) {
            book.wikiPrevious = { ...book.wiki, savedAt: Date.now() };
        }

        const alreadyDone = canResume ? new Set(book.wiki.processedChunkIndices || []) : new Set();
        const allRemaining = chunks.map((_, i) => i).filter(i => !alreadyDone.has(i));
        const remainingIndices = opts.maxChunks ? allRemaining.slice(0, opts.maxChunks) : allRemaining;
        const pacingMs = app.atlas.api.getPacingDelayMs();

        if (!silent) app.state.cancelAnalysis = false;
        app.state.apiBusy = true;
        if (!silent) app.atlas.ui.showLoader(
            chunks.length > 1
                ? (canResume ? 'Setze Wiki-Erstellung fort...' : 'Analysiere Buch in Textblöcken...')
                : 'Durchsuche Buch nach Kapiteln, Personen & mehr...',
            chunks.length > 1 ? `Block ${alreadyDone.size + 1} von ${chunks.length} · ${app.atlas.utils.formatEta(remainingIndices.length, pacingMs)}` : 'Einen Moment bitte'
        );

        // Bereits vorhandenes (Teil-)Ergebnis wird als "virtueller Block"
        // mit in den Merge gegeben, damit beim Fortsetzen nichts verloren geht.
        const partials = canResume ? [{ chapters: book.wiki.chapters, entities: book.wiki.entities }] : [];
        const newlyProcessed = [];

        try {
            for (const chunkIdx of remainingIndices) {
                if (isCancelled()) break;

                const doneSoFar = alreadyDone.size + newlyProcessed.length;
                if (!silent) app.atlas.ui.setProgress(`Block ${doneSoFar + 1} von ${chunks.length} · ${app.atlas.utils.formatEta(remainingIndices.length - newlyProcessed.length, pacingMs)}`);

                try {
                    partials.push(await app.atlas.api.generateBookWiki(chunks[chunkIdx]));
                    newlyProcessed.push(chunkIdx);
                } catch (chunkErr) {
                    // EIN dauerhaft fehlschlagender Block darf die anderen
                    // nicht mit sich reißen - wird übersprungen und bleibt
                    // für "Fortsetzen" vorgemerkt statt den ganzen Lauf zu killen.
                    console.error(`Textblock ${chunkIdx + 1} fehlgeschlagen:`, chunkErr);
                }

                const isLast = chunkIdx === remainingIndices[remainingIndices.length - 1];
                if (!isLast && !isCancelled()) {
                    if (!silent) app.atlas.ui.setProgress('Warte auf API...');
                    await new Promise(r => setTimeout(r, pacingMs));
                }
            }

            if (partials.length === 0) {
                if (!silent) app.atlas.ui.toast('Wiki-Erstellung abgebrochen', '⏹️');
                return { complete: false };
            }

            const processedIndices = Array.from(new Set([...alreadyDone, ...newlyProcessed])).sort((a, b) => a - b);
            const complete = processedIndices.length === chunks.length;

            const merged = mergeWikiResults(partials);
            book.wiki = {
                chapters: merged.chapters,
                entities: merged.entities,
                generatedAt: Date.now(),
                complete,
                totalChunks: chunks.length,
                ...(complete ? {} : { processedChunkIndices: processedIndices })
            };
            app.atlas.dbOps.saveBook(book);
            renderIfVisible();

            if (chunks.length > 1 && !silent) {
                app.atlas.ui.toast(
                    complete
                        ? 'Wiki erstellt (in Textblöcken verarbeitet)'
                        : `${processedIndices.length} von ${chunks.length} Blöcken verarbeitet - kann später fortgesetzt werden`,
                    complete ? '✅' : '⏹️'
                );
            }
            if (complete && !silent) {
                app.atlas.ui.notifyIfHidden('Wiki fertig', `${book.title} - Wiki-Erstellung abgeschlossen.`);
            }
            return { complete };
        } catch (e) {
            console.error('Buch-Wiki fehlgeschlagen:', e);
            if (silent) throw e;
            app.atlas.ui.toastApiError(e, 'Wiki konnte nicht erstellt werden.');
        } finally {
            app.state.apiBusy = false;
            if (!silent) app.atlas.ui.hideLoader();
        }
    },

    // ------------- Wiki-Einträge von Hand nachbessern -------------
    // Bisher ließ sich ein Wiki nur komplett neu erstellen, nie einzelne
    // Einträge korrigieren - falsch erkannte/verwechselte Namen mussten
    // hingenommen werden. Jetzt: Name + Beschreibung editierbar, einzelne
    // Einträge löschbar (mit Rückgängig). Kein Merge-Werkzeug für "zwei
    // Einträge zu einem verschmelzen" - dafür: den einen von Hand
    // umbenennen/ergänzen, den anderen löschen.
    startEditWikiEntity(id) {
        const book = app.atlas.library[app.atlas.state.currentBookId];
        const entity = book?.wiki?.entities?.find(e => e.id === id);
        if (!entity) return;

        document.getElementById(`atlasWikiNameDisplay-${id}`)?.classList.add('hidden');
        document.getElementById(`atlasWikiDescDisplay-${id}`)?.classList.add('hidden');

        const nameInput = document.getElementById(`atlasWikiNameEdit-${id}`);
        const descArea = document.getElementById(`atlasWikiDescEdit-${id}`);
        if (nameInput) { nameInput.value = entity.name || ''; nameInput.classList.remove('hidden'); nameInput.focus(); }
        if (descArea) { descArea.value = entity.description || ''; descArea.classList.remove('hidden'); }

        document.getElementById(`atlasWikiEditBtn-${id}`)?.classList.add('hidden');
        document.getElementById(`atlasWikiSaveBtn-${id}`)?.classList.remove('hidden');
        document.getElementById(`atlasWikiCancelBtn-${id}`)?.classList.remove('hidden');
    },

    saveWikiEntityEdit(id) {
        const book = app.atlas.library[app.atlas.state.currentBookId];
        const entity = book?.wiki?.entities?.find(e => e.id === id);
        if (!entity) return;

        const newName = document.getElementById(`atlasWikiNameEdit-${id}`)?.value.trim();
        const newDesc = document.getElementById(`atlasWikiDescEdit-${id}`)?.value.trim();
        if (newName) entity.name = newName;
        entity.description = newDesc || '';
        entity.editedManually = true;

        app.atlas.dbOps.saveBook(book);
        app.atlas.render.bookWiki();
        app.atlas.ui.toast('Wiki-Eintrag gespeichert', '✅');
    },

    deleteWikiEntity(id) {
        const book = app.atlas.library[app.atlas.state.currentBookId];
        if (!book?.wiki?.entities) return;
        const idx = book.wiki.entities.findIndex(e => e.id === id);
        if (idx === -1) return;

        const [removed] = book.wiki.entities.splice(idx, 1);
        app.atlas.dbOps.saveBook(book);
        app.atlas.render.bookWiki();

        app.atlas.ui.toast('Eintrag entfernt', '🗑️', () => {
            const b = app.atlas.library[app.atlas.state.currentBookId];
            if (!b?.wiki?.entities) return;
            b.wiki.entities.push(removed);
            app.atlas.dbOps.saveBook(b);
            app.atlas.render.bookWiki();
        });
    },

    // Ein Level Sicherung, kein voller Versions-Verlauf - siehe Kommentar
    // bei generateBookWiki oben. Tauscht die aktuelle Wiki-Version gegen
    // die davor gesicherte (Swap, keine Löschung) - nochmal klicken
    // stellt dadurch wieder die vorherige Version her, wirkt also wie ein
    // einfaches Undo/Redo-Paar statt eines echten Versions-Stacks.
    restorePreviousWiki() {
        const book = app.atlas.library[app.atlas.state.currentBookId];
        if (!book?.wikiPrevious) return;

        const current = book.wiki;
        book.wiki = book.wikiPrevious;
        book.wikiPrevious = current || null;
        app.atlas.dbOps.saveBook(book);
        app.atlas.render.bookWiki();
        app.atlas.ui.toast('Vorherige Wiki-Version wiederhergestellt', '↩️');
    }
});
