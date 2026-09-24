import { app } from '../../core.js';

// Baut aus dem Buch-Wiki (falls vorhanden) ein einfaches Namens-Glossar
// für den Übersetzungs-Prompt - eine Zeile pro Eintrag, Name + Kontext.
function buildGlossary(book) {
    const entities = book.wiki?.entities;
    if (!Array.isArray(entities) || entities.length === 0) return '';
    return entities
        .filter(e => e && e.name)
        .map(e => `- ${e.name}${e.description ? `: ${e.description}` : ''}`)
        .join('\n');
}

function safeFilenamePart(str, fallback) {
    return (str || fallback).toLowerCase().replace(/[^a-z0-9äöüß]+/gi, '-').replace(/^-+|-+$/g, '') || fallback;
}

function downloadTextFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function currentLang() {
    return (document.getElementById('atlasTranslateTargetLang')?.value || 'Deutsch').trim();
}

const TRANSLATE_TABS = ['translate', 'qa', 'export'];

// NEU (v0.47.0-beta): EINE Seite übersetzen (inkl. Translation Memory) -
// gemeinsam genutzt von translateBook() unten und vom Nachtmodus
// (js/atlas/atlasNight.js), damit beide exakt gleich übersetzen.
// Gibt 'memory' (Treffer, kein API-Aufruf) oder 'api' zurück, wirft bei Fehlern.
async function translateOnePage(book, idx, lang, glossary) {
    book.translationMemory = book.translationMemory || {};
    const tm = (book.translationMemory[lang] = book.translationMemory[lang] || []);
    const page = book.pages[idx];
    const tmMatch = tm.find(e => e.text === page.text);

    if (tmMatch) {
        // 100%-Match gefunden - kein API-Call nötig
        if (!page.translations) page.translations = {};
        page.translations[lang] = { text: tmMatch.translation, generatedAt: Date.now(), fromMemory: true };
        app.atlas.dbOps.saveBook(book);
        return 'memory';
    }

    const translatedText = await app.atlas.api.translatePage(page.text, lang, glossary);
    if (!page.translations) page.translations = {};
    page.translations[lang] = { text: translatedText, generatedAt: Date.now() };

    // Nur "sinnvoll lange" Texte ins Memory aufnehmen - eine einzelne kurze
    // Zeile ("Kapitel 3") würde sonst schnell zu falschen Treffern bei
    // eigentlich unterschiedlichen, zufällig kurzen Seiten führen.
    if (page.text.length >= 40 && !tm.some(e => e.text === page.text)) {
        tm.push({ text: page.text, translation: translatedText });
    }
    app.atlas.dbOps.saveBook(book);
    return 'api';
}

// Seiten mit Text, denen die Übersetzung in "lang" noch fehlt
function missingTranslationIndices(book, lang) {
    const out = [];
    book.pages.forEach((p, i) => {
        if (p.text && !(p.translations && p.translations[lang])) out.push(i);
    });
    return out;
}

Object.assign(app.atlas.utils, {
    // NEU (v0.47.0-beta, Nachtmodus): Anzahl noch fehlender Seiten
    countMissingTranslation(book, lang) {
        return missingTranslationIndices(book, lang).length;
    }
});

// -------------------- EPUB-Export der Übersetzung --------------------
// Dieselbe Bibliothek wie beim ePub-Import - seit v0.47.0-beta aus
// js/vendor/ über app.atlas.utils.loadJSZip() statt vom CDN.

function escapeXml(str) {
    return (str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Grobe Zuordnung gängiger Sprachnamen zu ISO-639-1-Codes fürs EPUB-
// Metadatenfeld dc:language. Nicht erkannte Sprachen bekommen "und"
// (ISO-Code für "undetermined") statt einen falschen Code zu raten.
function guessLangCode(langName) {
    const map = {
        deutsch: 'de', german: 'de', englisch: 'en', english: 'en',
        französisch: 'fr', french: 'fr', spanisch: 'es', spanish: 'es',
        italienisch: 'it', italian: 'it', niederländisch: 'nl', dutch: 'nl',
        polnisch: 'pl', polish: 'pl', schwedisch: 'sv', swedish: 'sv',
        russisch: 'ru', russian: 'ru', portugiesisch: 'pt', portuguese: 'pt'
    };
    return map[langName.trim().toLowerCase()] || 'und';
}

function randomId() {
    if (window.crypto?.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

Object.assign(app.atlas.actions, {
    // NEU (v0.47.0-beta, Nachtmodus): übersetzt die NÄCHSTE fehlende Seite
    // in "lang" - ohne Lade-Fenster, ein Schritt pro Aufruf (das Tempo gibt
    // js/atlas/atlasNight.js vor). Gibt 'memory' | 'api' | null (nichts offen).
    async _translateNextPageForNight(book, lang) {
        const [idx] = missingTranslationIndices(book, lang);
        if (idx === undefined) return null;
        app.state.apiBusy = true;
        try {
            const result = await translateOnePage(book, idx, lang, buildGlossary(book));
            if (app.state.currentView === 'atlasTranslate' && app.atlas.state.currentBookId === book.id) {
                app.atlas.render.bookTranslate();
            }
            return result;
        } finally {
            app.state.apiBusy = false;
        }
    },

    // Wechselt zwischen den drei Tabs der Übersetzungs-Ansicht (Übersetzen/
    // Prüfen/Export). Merkt sich die Auswahl in app.atlas.state, damit sie nach
    // einem Re-Render (z.B. nach Abschluss eines Übersetzungs-Laufs) nicht
    // wieder auf "Übersetzen" zurückspringt - render/bookTranslate.js ruft
    // diese Funktion bei jedem Rendern erneut auf, um die Klassen zu
    // synchronisieren.
    switchTranslateTab(tab) {
        if (!TRANSLATE_TABS.includes(tab)) tab = 'translate';
        app.atlas.state.translateActiveTab = tab;

        TRANSLATE_TABS.forEach(t => {
            const panel = document.getElementById(`atlasTranslatePanel-${t}`);
            const tabBtn = document.getElementById(`atlasTranslateTab-${t}`);
            const isActive = t === tab;

            panel?.classList.toggle('hidden', !isActive);
            if (tabBtn) {
                tabBtn.setAttribute('aria-selected', String(isActive));
                tabBtn.classList.toggle('bg-white', isActive);
                tabBtn.classList.toggle('shadow-sm', isActive);
                tabBtn.classList.toggle('text-slate-900', isActive);
                tabBtn.classList.toggle('text-slate-500', !isActive);
            }
        });
    },

    // übersetzt alle (oder bei forceRegenerate ALLE erneut) Seiten des
    // Buchs in die im Eingabefeld gewählte Zielsprache. Läuft sequenziell
    // mit an die Key-Anzahl angepasster Pause (app.atlas.api.getPacingDelayMs)
    // und lässt sich über den "Vorgang abbrechen"-Button im Loader stoppen.
    async translateBook(forceRegenerate = false) {
        const book = app.atlas.library[app.atlas.state.currentBookId];
        if (!book) return;

        const lang = currentLang();
        if (!lang) {
            app.atlas.ui.toast('Bitte Zielsprache angeben.', 'ℹ️');
            return;
        }

        const pending = [];
        book.pages.forEach((p, i) => {
            if (!p.text) return; // Seite ohne Text kann nicht übersetzt werden
            const already = p.translations && p.translations[lang];
            if (forceRegenerate || !already) pending.push(i);
        });

        if (pending.length === 0) {
            app.atlas.ui.toast('Bereits alle Seiten in dieser Sprache übersetzt.', 'ℹ️');
            return;
        }

        if (!app.atlas.settings.apiKeys || app.atlas.settings.apiKeys.length === 0) {
            app.atlas.ui.toast('Kein API-Key hinterlegt - unter ⚙️ Einstellungen eintragen.', '🔑', null, 6000);
            return;
        }

        const glossary = buildGlossary(book);
        const pacingMs = app.atlas.api.getPacingDelayMs();

        // Translation Memory: exakte 100%-Matches (wortwörtlich identischer
        // Seitentext, z.B. wiederkehrendes Impressum, Kapitel-Trenner,
        // "Ende"-Seiten) werden wiederverwendet statt erneut übersetzt zu
        // werden - spart Zeit/Kontingent UND garantiert perfekte
        // Konsistenz für diese Wiederholungen. Pro Buch+Sprache gespeichert,
        // siehe translateOnePage() oben.

        app.state.cancelAnalysis = false;
        app.state.apiBusy = true;
        app.atlas.ui.showLoader(`Übersetze nach ${lang}...`, `Seite ${pending[0] + 1} (1 von ${pending.length}) · ${app.atlas.utils.formatEta(pending.length, pacingMs)}`);

        let count = 1;
        let tmHits = 0;
        for (const idx of pending) {
            if (app.state.cancelAnalysis) {
                app.atlas.ui.toast('Übersetzung abgebrochen', '⏹️');
                break;
            }

            const sub = document.getElementById('processSub');
            const remaining = pending.length - count + 1;
            if (sub) sub.innerText = `Seite ${idx + 1} (${count} von ${pending.length}) · ${app.atlas.utils.formatEta(remaining, pacingMs)}`;

            try {
                if (await translateOnePage(book, idx, lang, glossary) === 'memory') {
                    // kein API-Call, keine Pacing-Pause - sofort weiter
                    tmHits++;
                    count++;
                    continue;
                }
            } catch (e) {
                console.error(`Übersetzung Seite ${idx + 1} fehlgeschlagen:`, e);
                app.atlas.ui.toastApiError(e, `Seite ${idx + 1}: Übersetzung fehlgeschlagen.`);
                // Einzelne fehlgeschlagene Seite überspringen statt den
                // kompletten Lauf abzubrechen - Rest wird weiterübersetzt.
            }

            if (count < pending.length && !app.state.cancelAnalysis) {
                if (sub) sub.innerText = `Warte auf API...`;
                await new Promise(r => setTimeout(r, pacingMs));
            }
            count++;
        }

        if (tmHits > 0) {
            app.atlas.dbOps.saveBook(book);
        }

        app.state.apiBusy = false;
        app.atlas.ui.hideLoader();
        app.atlas.render.bookTranslate();
        if (tmHits > 0) {
            app.atlas.ui.toast(`Übersetzung fertig - ${tmHits} Seite${tmHits === 1 ? '' : 'n'} aus dem Translation Memory übernommen (kein Call nötig)`, '💾');
        }
        app.atlas.ui.notifyIfHidden('Übersetzung fertig', `${book.title} - Übersetzung nach ${lang} abgeschlossen.`);
    },

    // ------------- Übersetzung von Hand nachbessern -------------
    // Ersatz-Kontrollinstanz für den fehlenden professionellen "Editing"-
    // Schritt: die KI übersetzt (Schritt 1), Korrekturlesen (Schritt 2)
    // muss hier der Mensch selbst übernehmen. Ein manuell bearbeiteter
    // Text wird markiert (editedManually), damit z.B. ein späterer
    // Namens-Check das nicht als "von der KI falsch gemacht" werten würde.
    startEditTranslation(idx) {
        const textEl = document.getElementById(`atlasTranslateText-${idx}`);
        const editArea = document.getElementById(`atlasTranslateEditArea-${idx}`);
        if (!textEl || !editArea) return;

        const book = app.atlas.library[app.atlas.state.currentBookId];
        const lang = currentLang();
        const translation = book?.pages[idx]?.translations?.[lang];

        editArea.value = translation?.text || '';
        textEl.classList.add('hidden');
        editArea.classList.remove('hidden');
        document.getElementById(`atlasTranslateEditActions-${idx}`)?.classList.remove('hidden');
        document.getElementById(`atlasTranslateEditBtn-${idx}`)?.classList.add('hidden');
        editArea.focus();
    },

    cancelEditTranslation(idx) {
        document.getElementById(`atlasTranslateEditArea-${idx}`)?.classList.add('hidden');
        document.getElementById(`atlasTranslateEditActions-${idx}`)?.classList.add('hidden');
        document.getElementById(`atlasTranslateText-${idx}`)?.classList.remove('hidden');
        document.getElementById(`atlasTranslateEditBtn-${idx}`)?.classList.remove('hidden');
    },

    saveTranslationEdit(idx) {
        const book = app.atlas.library[app.atlas.state.currentBookId];
        const lang = currentLang();
        const page = book?.pages[idx];
        if (!page?.translations?.[lang]) return;

        const newText = document.getElementById(`atlasTranslateEditArea-${idx}`).value;
        page.translations[lang].text = newText;
        page.translations[lang].editedManually = true;

        // Falls dieser Seitentext im Translation Memory als 100%-Match
        // hinterlegt ist, die Korrektur dort mit übernehmen - sonst würde
        // eine künftige/andere Seite mit demselben Originaltext weiterhin
        // die alte, unkorrigierte Übersetzung bekommen.
        const tmEntry = book.translationMemory?.[lang]?.find(e => e.text === page.text);
        if (tmEntry) tmEntry.translation = newText;

        app.atlas.dbOps.saveBook(book);

        this.cancelEditTranslation(idx);
        app.atlas.render.bookTranslate();
        app.atlas.ui.toast('Übersetzung gespeichert', '✅');
    },

    // ------------- Namens-Konsistenz-Check (Ersatz für Termbase-QA) -------------
    // Professionelle Tools erzwingen Terminologie oder prüfen sie danach
    // automatisiert gegen. Wir geben der KI das Wiki bisher nur als
    // Empfehlung mit ("Namens-Glossar") - ohne Kontrolle, ob sie sich
    // wirklich daran gehalten hat. Das hier ist diese Kontrolle: EIN
    // kleiner Zusatz-Call übersetzt die Wiki-Namen einmalig in die
    // Zielsprache (gecacht), danach rein client-seitig (kein weiterer
    // API-Call): taucht der erwartete Name auf den Seiten auf, auf denen
    // die Entität laut Wiki vorkommt?
    // WICHTIG - Grenzen dieser Prüfung: reiner Text-Enthält-Check, keine
    // Grammatik-/Deklinations-Erkennung (ein dekliniertes "Frodos" statt
    // "Frodo" kann fälschlich als fehlend auftauchen) und kein Beweis für
    // korrekte BEDEUTUNG, nur für die Anwesenheit des erwarteten Namens.
    async runTranslationQaCheck() {
        const book = app.atlas.library[app.atlas.state.currentBookId];
        if (!book) return;

        const lang = currentLang();
        const entities = book.wiki?.entities;
        if (!Array.isArray(entities) || entities.length === 0) {
            app.atlas.ui.toast('Kein Wiki vorhanden - der Namens-Check braucht die Wiki-Entitätenliste als Grundlage.', 'ℹ️');
            return;
        }

        const anyTranslated = book.pages.some(p => p.translations && p.translations[lang]);
        if (!anyTranslated) {
            app.atlas.ui.toast('Noch keine Seite in dieser Sprache übersetzt.', 'ℹ️');
            return;
        }

        if (!app.atlas.settings.apiKeys || app.atlas.settings.apiKeys.length === 0) {
            app.atlas.ui.toast('Kein API-Key hinterlegt - unter ⚙️ Einstellungen eintragen.', '🔑', null, 6000);
            return;
        }

        app.atlas.ui.showLoader('Prüfe Namenskonsistenz...', 'Übersetze Glossar-Begriffe');
        try {
            book.wiki.translatedNames = book.wiki.translatedNames || {};
            let nameMap = book.wiki.translatedNames[lang];

            // Gecacht pro Buch+Sprache - ein erneuter Check ruft die KI
            // nicht nochmal für dieselben Namen auf.
            if (!nameMap) {
                const names = entities.map(e => e.name);
                const translated = await app.atlas.api.translateGlossaryTerms(names, lang);
                nameMap = {};
                entities.forEach((e, i) => { nameMap[e.name] = translated[i] || e.name; });
                book.wiki.translatedNames[lang] = nameMap;
            }

            const issues = [];
            entities.forEach(e => {
                const expected = (nameMap[e.name] || e.name).trim();
                if (!expected) return;
                const expectedLower = expected.toLowerCase();

                (e.pages || []).forEach(pageNum => {
                    const idx = pageNum - 1;
                    const translation = book.pages[idx]?.translations?.[lang];
                    if (!translation || translation.editedManually) return; // von Hand geprüft - nicht gegenchecken
                    if (!translation.text.toLowerCase().includes(expectedLower)) {
                        issues.push({ entityName: e.name, expectedName: expected, pageIdx: idx });
                    }
                });
            });

            book.qaReport = { lang, generatedAt: Date.now(), issues };
            app.atlas.dbOps.saveBook(book);
            app.atlas.render.bookTranslate();

            app.atlas.ui.toast(
                issues.length === 0
                    ? 'Namens-Check: keine Auffälligkeiten gefunden.'
                    : `Namens-Check: ${issues.length} mögliche Inkonsistenz(en) gefunden.`,
                issues.length === 0 ? '✅' : '⚠️'
            );
        } catch (e) {
            console.error('Namens-Check fehlgeschlagen:', e);
            app.atlas.ui.toastApiError(e, 'Namens-Check fehlgeschlagen.');
        } finally {
            app.atlas.ui.hideLoader();
        }
    },

    // ------------- Export -------------
    // lädt Original + Übersetzung Seite für Seite als eine Markdown-Datei
    // herunter - mit expliziter Zuordnung, welche übersetzte Seite zu
    // welcher Originalseite gehört (zum Gegenlesen/Review gedacht).
    downloadTranslation() {
        const book = app.atlas.library[app.atlas.state.currentBookId];
        if (!book) return;

        const lang = currentLang();
        const hasAny = book.pages.some(p => p.translations && p.translations[lang]);
        if (!hasAny) {
            app.atlas.ui.toast('Noch keine Seite in dieser Sprache übersetzt.', 'ℹ️');
            return;
        }

        let md = `# ${book.title} — Übersetzung (${lang})\n\n`;
        book.pages.forEach((p, i) => {
            const translation = p.translations && p.translations[lang];
            md += `## Seite ${i + 1}\n\n`;
            md += `**Original:**\n\n${p.text || '(kein Text)'}\n\n`;
            md += translation
                ? `**Übersetzung (${lang}):**\n\n${translation.text}\n\n`
                : `**Übersetzung (${lang}):** _(noch nicht übersetzt)_\n\n`;
            md += `---\n\n`;
        });

        downloadTextFile(md, `buchatlas-${safeFilenamePart(book.title, 'buch')}-${safeFilenamePart(lang, 'uebersetzung')}.md`, 'text/markdown');
        app.atlas.ui.toast('Übersetzung heruntergeladen', '📥');
    },

    // NEU: reine Lese-/Publish-Fassung - nur der übersetzte Text, ohne
    // Original, ohne Seitenmarkierungen/Markdown-Syntax. Für den Fall, dass
    // man die Übersetzung tatsächlich weitergeben/lesen will statt sie zu
    // gegenlesen.
    downloadTranslationOnly() {
        const book = app.atlas.library[app.atlas.state.currentBookId];
        if (!book) return;

        const lang = currentLang();
        const parts = book.pages
            .map(p => p.translations?.[lang]?.text)
            .filter(Boolean);

        if (parts.length === 0) {
            app.atlas.ui.toast('Noch keine Seite in dieser Sprache übersetzt.', 'ℹ️');
            return;
        }
        if (parts.length < book.pages.length) {
            app.atlas.ui.toast(`Achtung: nur ${parts.length} von ${book.pages.length} Seiten übersetzt - Export enthält nur diese.`, 'ℹ️');
        }

        const text = parts.join('\n\n');
        downloadTextFile(text, `buchatlas-${safeFilenamePart(book.title, 'buch')}-${safeFilenamePart(lang, 'uebersetzung')}-nur-text.txt`, 'text/plain');
        app.atlas.ui.toast('Übersetzung (nur Text) heruntergeladen', '📥');
    },

    // NEU: baut aus der Übersetzung eine echte, minimale EPUB-Datei (zum
    // Lesen in jeder E-Reader-App/jedem E-Book-Reader) statt nur Text/
    // Markdown. Nutzt dieselbe JSZip-Bibliothek wie der ePub-Import, hier
    // aber zum PACKEN statt Entpacken.
    async downloadTranslationEpub() {
        const book = app.atlas.library[app.atlas.state.currentBookId];
        if (!book) return;

        const lang = currentLang();
        const translatedPages = book.pages
            .map((p, i) => ({ idx: i, text: p.translations?.[lang]?.text }))
            .filter(p => p.text);

        if (translatedPages.length === 0) {
            app.atlas.ui.toast('Noch keine Seite in dieser Sprache übersetzt.', 'ℹ️');
            return;
        }

        app.atlas.ui.showLoader('Baue EPUB...', 'Einen Moment bitte');
        try {
            const JSZip = await app.atlas.utils.loadJSZip();

            const zip = new JSZip();
            zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
            zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

            const manifestItems = translatedPages.map((p, n) =>
                `    <item id="chap${n + 1}" href="chap${n + 1}.xhtml" media-type="application/xhtml+xml"/>`).join('\n');
            const spineItems = translatedPages.map((p, n) => `    <itemref idref="chap${n + 1}"/>`).join('\n');
            const navItems = translatedPages.map((p, n) =>
                `        <li><a href="chap${n + 1}.xhtml">Seite ${p.idx + 1}</a></li>`).join('\n');

            const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:${randomId()}</dc:identifier>
    <dc:title>${escapeXml(book.title)} (${escapeXml(lang)})</dc:title>
    <dc:language>${guessLangCode(lang)}</dc:language>
    <dc:creator>${escapeXml(book.author || 'Unbekannt')}</dc:creator>
    <meta property="dcterms:modified">${new Date().toISOString().split('.')[0]}Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${manifestItems}
  </manifest>
  <spine>
${spineItems}
  </spine>
</package>`;

            const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Inhalt</title></head>
<body>
    <nav epub:type="toc" id="toc">
        <h1>Inhalt</h1>
        <ol>
${navItems}
        </ol>
    </nav>
</body>
</html>`;

            zip.file('OEBPS/content.opf', opf);
            zip.file('OEBPS/nav.xhtml', navXhtml);

            translatedPages.forEach((p, n) => {
                const paragraphs = p.text.split(/\n\s*\n/)
                    .map(para => `<p>${escapeXml(para).replace(/\n/g, '<br/>')}</p>`)
                    .join('\n');
                const chapterXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Seite ${p.idx + 1}</title></head>
<body>
${paragraphs}
</body>
</html>`;
                zip.file(`OEBPS/chap${n + 1}.xhtml`, chapterXhtml);
            });

            const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `buchatlas-${safeFilenamePart(book.title, 'buch')}-${safeFilenamePart(lang, 'uebersetzung')}.epub`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            if (translatedPages.length < book.pages.length) {
                app.atlas.ui.toast(`EPUB heruntergeladen (nur ${translatedPages.length} von ${book.pages.length} übersetzte Seiten enthalten)`, '📥');
            } else {
                app.atlas.ui.toast('EPUB heruntergeladen', '📥');
            }
        } catch (err) {
            console.error('EPUB-Export fehlgeschlagen:', err);
            app.atlas.ui.toast('EPUB konnte nicht erstellt werden.', '❌');
        } finally {
            app.atlas.ui.hideLoader();
        }
    },

    // ------------- Rückübersetzungs-Stichprobe -------------
    // Professionelle QA übersetzt oft NICHT das ganze Buch zurück (kostet
    // nochmal so viel wie die Übersetzung selbst), sondern macht
    // stichprobenartige Rückübersetzungen zum Gegenlesen. Genau das hier:
    // bis zu 3 Seiten, über das Buch verteilt (Anfang/Mitte/Ende) statt
    // nur die ersten - repräsentativer für die Gesamtqualität. Ergebnis
    // wird NICHT automatisch bewertet (das könnte höchstens eine weitere,
    // genauso fehleranfällige KI-Einschätzung sein) - stattdessen zum
    // manuellen Vergleich nebeneinander angezeigt.
    async runBackTranslationCheck() {
        const book = app.atlas.library[app.atlas.state.currentBookId];
        if (!book) return;

        const lang = currentLang();
        const translatedIndices = book.pages
            .map((p, i) => (p.translations?.[lang] ? i : null))
            .filter(i => i !== null);

        if (translatedIndices.length === 0) {
            app.atlas.ui.toast('Noch keine Seite in dieser Sprache übersetzt.', 'ℹ️');
            return;
        }

        if (!app.atlas.settings.apiKeys || app.atlas.settings.apiKeys.length === 0) {
            app.atlas.ui.toast('Kein API-Key hinterlegt - unter ⚙️ Einstellungen eintragen.', '🔑', null, 6000);
            return;
        }

        const sampleCount = Math.min(3, translatedIndices.length);
        const sampleIndices = [];
        for (let k = 0; k < sampleCount; k++) {
            const pos = sampleCount === 1 ? 0 : Math.round((k / (sampleCount - 1)) * (translatedIndices.length - 1));
            const idx = translatedIndices[pos];
            if (!sampleIndices.includes(idx)) sampleIndices.push(idx);
        }

        app.state.cancelAnalysis = false;
        app.atlas.ui.showLoader('Rückübersetzungs-Stichprobe...', `Seite 1 von ${sampleIndices.length}`);

        const pacingMs = app.atlas.api.getPacingDelayMs();
        const results = [];
        for (let n = 0; n < sampleIndices.length; n++) {
            if (app.state.cancelAnalysis) break;
            const idx = sampleIndices[n];
            app.atlas.ui.setProgress(`Seite ${idx + 1} (${n + 1} von ${sampleIndices.length})`);

            try {
                const page = book.pages[idx];
                const originalSample = page.text.slice(0, 300);
                const backTranslation = await app.atlas.api.backTranslateSample(page.translations[lang].text, originalSample);
                results.push({ pageIdx: idx, backTranslation });
            } catch (e) {
                console.error(`Rückübersetzung Seite ${idx + 1} fehlgeschlagen:`, e);
                app.atlas.ui.toastApiError(e, `Seite ${idx + 1}: Rückübersetzung fehlgeschlagen.`);
            }

            if (n < sampleIndices.length - 1 && !app.state.cancelAnalysis) {
                app.atlas.ui.setProgress('Warte auf API...');
                await new Promise(r => setTimeout(r, pacingMs));
            }
        }

        app.atlas.ui.hideLoader();

        if (results.length === 0) {
            app.atlas.ui.toast('Rückübersetzung fehlgeschlagen.', '❌');
            return;
        }

        book.backTranslationCheck = { lang, generatedAt: Date.now(), results };
        app.atlas.dbOps.saveBook(book);
        app.atlas.render.bookTranslate();
        app.atlas.ui.toast(`Rückübersetzungs-Stichprobe fertig (${results.length} Seite${results.length === 1 ? '' : 'n'}) - bitte unten manuell vergleichen.`, 'ℹ️');
    }
});
