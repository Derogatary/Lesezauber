import { app } from './core.js';

// FIX (Nutzer-Screenshot der Ratenbegrenzungs-Seite in AI Studio, Sept.
// 2026): gemini-3.6-flash lief laut Live-Nutzung mehrfach ins Tageslimit
// (44 von 20 erlaubten Anfragen), ebenso gemini-3.8-flash (22 von 20) -
// JEDES Modell hat sein EIGENES, komplett getrenntes Tageskontingent, und
// bei den "vollen" Flash-Modellen liegt es bei nur ~20 Anfragen/Tag. Das
// Minuten-Token-Kontingent (250K) blieb dabei fast ungenutzt (max. 10K) -
// die Tages-ANFRAGEZAHL ist der eigentliche Engpass, nicht die Textmenge.
//
// NEU (Nutzerwunsch: "rotierende Funktion von absteigender Qualität"):
// deshalb jetzt eine Liste statt eines einzelnen Modells - withGeminiModelRotation()
// unten probiert sie der Reihe nach, sobald eins mit HTTP 429 antwortet.
// Absteigend nach Modellgüte: neuere "volle" Flash-Modelle zuerst,
// gemini-3.1-flash-lite bewusst GANZ am Ende - "Lite" ist die schwächere
// Modellwahl, hat aber mit ~500 Anfragen/Tag das mit Abstand großzügigste
// Kontingent alle Flash-Modelle - als letzte Gemini-Reserve, bevor der
// bestehende Mistral-Fallback greift. Neue Version in der Liste ergänzen
// reicht, keine weitere Code-Änderung nötig.
const GEMINI_MODELS = [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite'
];

// Mistral als optionaler Fallback, falls Gemini mal ausfällt oder das
// Tageslimit erreicht ist. Wird nur genutzt, wenn ein Mistral-Key in den
// Einstellungen hinterlegt ist - sonst verhält sich die App exakt wie vorher.
const MISTRAL_MODEL = 'mistral-small-latest';

// NEU (Modell-Rotation): EIN Ort für "welches Modell aus GEMINI_MODELS
// probieren wir gerade" - alle drei Gemini-Aufrufer unten (Bildanalyse,
// reiner Text, Birkenbihls nachsichtiger Text-Aufruf) reichen ihren
// jeweiligen fetch() als callModel(model) durch. callModel muss bei HTTP
// 429 exakt "RATE_LIMITED" werfen, jeder andere Fehler (falscher Key,
// Netzwerk, Server down) bricht sofort ab - ein anderes Modell hätte
// exakt dasselbe Problem, es weiterzuprobieren wäre nur verschenkte Zeit.
// Erst wenn WIRKLICH jedes Modell 429 meldet, kommt der bestehende
// Mistral-Fallback in runTextPrompt()/runTextPromptLenient()/analyze() zum
// Zug - für den ändert sich nichts, er sieht nur einen einzigen Fehler.
async function withGeminiModelRotation(callModel) {
    for (const model of GEMINI_MODELS) {
        try {
            return await callModel(model);
        } catch (e) {
            if (e.message !== 'RATE_LIMITED') throw e;
            console.warn(`${model}: Ratenbegrenzung erreicht, versuche nächstes Modell`);
        }
    }
    throw new Error('Gemini-Limit bei allen Modellen erreicht (429)');
}

// NEU: nimmt jetzt eine explizite personaId statt immer die globale
// Einstellung zu lesen - so kann man beim Lesen eine andere Persona
// wählen, ohne die Standard-Einstellung für neue Scans zu verändern.
function personaInstruction(personaId) {
    const found = app.personas.find(p => p.id === personaId);
    return found ? found.instruction : 'Du bist freundlich und neutral.';
}

function buildAnalyzePrompt(isCover, personaId, knownText, forceToc) {
    // NEU: Ist der Text der Seite schon bekannt (z.B. aus der Textebene
    // eines PDFs), muss die KI ihn nicht per OCR erraten - das vermeidet
    // Erkennungsfehler beim eigentlichen Lesetext.
    const knownTextBlock = knownText
        ? `\nDer exakte Text dieser Seite ist bereits bekannt (aus der Textebene, NICHT per Bilderkennung raten):\n"${knownText}"\nNutze GENAU diesen Wortlaut UNVERÄNDERT nur für "originalText". Das Feld "simplifiedText" MUSS trotzdem eine eigene, wirklich vereinfachte Version mit Emojis sein - NICHT einfach der bekannte Text unverändert kopiert, genau wie bei jeder anderen Seite auch.\n`
        : '';

    // NEU: der Nutzer kann eine Seite explizit als Inhaltsverzeichnis
    // markieren (siehe app.actions.setPageRole) - dann wird die Erkennung
    // erzwungen statt der Standard-Formulierung, die bei ungewöhnlichem
    // Layout sonst leicht null zurückliefert.
    const tocInstruction = forceToc
        ? `Diese Seite wurde vom Nutzer als Inhaltsverzeichnis markiert - extrahiere UNBEDINGT die Kapitelüberschriften in 'tocEntries' (Array, OHNE Seitenzahlen), auch bei ungewöhnlichem Layout.`
        : `Falls diese Seite ein Inhaltsverzeichnis/eine Kapitelübersicht ist: Array der Kapitelüberschriften in gedruckter Reihenfolge, OHNE Seitenzahlen (z.B. ['Der Anfang', 'Das Abenteuer', 'Die Rückkehr']). Sonst null.`;

    return `Rolle: ${personaInstruction(personaId)}
${knownTextBlock}
Analysiere die Kinderbuch-Seite. Antworte AUSSCHLIESSLICH in validem JSON-Format! Verwende keine Markdown-Blöcke.
Nutze exakt dieses Schema:
{
  "originalText": "Der exakte gedruckte Text (Wenn leer: 'Kein Text.')",
  "simplifiedText": "GENAU der Originaltext mit GLEICHEM Satzbau - ersetze NUR 2-4 einzelne Nomen direkt an ihrer Stelle durch ein passendes Emoji. KEINE Umformulierung, KEINE Vereinfachung des Satzbaus, KEINE neuen/anderen Sätze - nur die Emoji-Ersetzung.",
  "vocabulary": [{"word": "Beispiel-Nomen", "emoji": "🌳"}],
  "hasIllustration": true oder false - true NUR wenn die Seite eine echte Illustration/Zeichnung/Foto zeigt, false bei einer reinen Textseite ohne Bild,
  "imageDescription": "Falls hasIllustration=true: die Illustration in 2 Sätzen passend zur Rolle beschreiben - beginne mit einer Formulierung, die klarmacht, dass hier ein BILD beschrieben wird (z.B. 'Auf dem Bild siehst du...', 'Hier sehen wir...'), NICHT wie ein normaler Erzählsatz ohne diesen Bezug. Falls hasIllustration=false: null",
  "quizQuestion": "Eine leichte Frage - wahlweise zum Textinhalt, zum Bild (falls vorhanden) oder zu Gefühlen. Wechsle zwischen drei Anforderungsstufen ab (angelehnt an die Anforderungsbereiche AFB I-III der Schule, aber kindgerecht übersetzt - keine Schulsprache verwenden): AFB I/Reproduktion - einfach wiedergeben, was im Text/Bild zu sehen war (z.B. 'Was hat der Fuchs gemacht?'); AFB II/Anwendung - erklären oder vergleichen, WARUM etwas passiert ist oder was eine Figur dabei fühlt; AFB III/Transfer - das Kind SELBST einbeziehen, ausgehend vom Thema/Gefühl dieser Seite, altersgerecht statt mit Schulverben wie 'beurteile' (z.B. 'Was würdest du tun?', 'Kennst du das Gefühl auch von dir?'). Passend zur Rolle.",
  "quizAnswer": "Die kurze Antwort darauf.",
  "chapterTitle": "Falls diese Seite sichtbar ein NEUES Kapitel beginnt: die Überschrift GENAU wie gedruckt. Erkennungsmerkmale: sie steht meist ALLEIN am oberen Seitenrand, deutlich GRÖSSER/FETTER als der übrige Text, mit eigenem Abstand zum Fließtext danach - zählt AUCH OHNE das Wort 'Kapitel' oder eine Nummer davor (z.B. nur 'Der geheime Wald' allein oben auf der Seite). Ein normaler erster Satz der Geschichte, auch wenn er kurz/prägnant klingt, zählt NICHT als Überschrift. Sonst null - die meisten Seiten sind KEIN Kapitelanfang.",
  "difficultWords": "Array von 0-4 Wörtern aus dem Originaltext, die ein Kind mit 5 Jahren oder jünger wahrscheinlich noch nicht kennt (Fremdwörter, abstrakte Begriffe, seltene Fachwörter - z.B. 'Bibliothek', 'Verwaltung'), jeweils mit einer kurzen, einfachen Erklärung in EINEM Satz ohne Fachbegriffe: [{\"word\": \"Bibliothek\", \"explanation\": \"Ein großes Haus, in dem man sich Bücher ausleihen kann.\"}]. Leeres Array, wenn der Text keine schwierigen Wörter enthält - die meisten einfachen Kinderbuchsätze brauchen keine Erklärung.",
  "tocEntries": "${tocInstruction}",
  "speechText": "NUR fürs Vorlesen, NICHT für die Anzeige: GENAU der Text aus 'originalText', WORTGLEICH und mit gleicher Satzstellung, aber an ein paar wenigen, wirklich passenden Stellen mit Sprech-Anweisungen mitten im Satz in eckigen Klammern angereichert (z.B. [flüstert], [lacht], [aufgeregt], [seufzt], [gähnt]), passend zur Rolle (${personaInstruction(personaId)}) und zur Stimmung der jeweiligen Stelle. KEIN Wort am eigentlichen Text ändern, hinzufügen oder weglassen - nur Tags EINFÜGEN. Sparsam einsetzen, nicht bei jedem Satz. Gibt der Text keinen erkennbaren Anlass für Emotionen her: identisch zu 'originalText'."
  ${isCover ? ', "title": "Der auf dieser Seite gedruckte Buchtitel, so genau wie erkennbar (auch bei kunstvoller/kursiver Schrift genau hinschauen) - nur null, falls WIRKLICH kein Titel zu sehen ist", "author": "Der gedruckte Autorenname - nur null, falls wirklich keiner zu sehen ist", "publisher": "Der erkennbare Verlagsname (z.B. aus Logo/Impressum auf dieser Seite) - nur null, falls wirklich keiner zu sehen ist", "series": "Der Name der Buchreihe, falls auf dieser Seite als Reihenbezeichnung erkennbar (z.B. Bildermaus) - nur null, falls keine erkennbar ist"' : ''}
}
Das Feld "vocabulary" listet GENAU die Nomen (in Grundform, z.B. "Baum" statt "Bäume"), die du in "simplifiedText" durch ein Emoji ersetzt hast, zusammen mit dem jeweils verwendeten Emoji.`;
}

// NEU (Nutzerwunsch: "so viel wie möglich aus einem Call rausbekommen") -
// bündelt ALLE konfigurierten Personas UND die Birkenbihl-Zerlegung in
// EINEN Scan-Aufruf, statt wie bisher nur die aktuell gewählte Persona zu
// erzeugen (Rest kam bisher erst später on-demand/im Hintergrund einzeln
// nach - je 1 eigener Aufruf). Nur für bookType 'story' - ein Übungsheft
// hat weder mehrere sinnvolle Personas-Varianten noch einen Birkenbihl-Tab
// (siehe js/actions/scanner.js für die Weiche).
//
// Ändert die Kostenrechnung fundamental: die alte, explizit getroffene
// Entscheidung "NICHT alle Personas sofort generieren, 5 Personas sofort =
// 5x Kosten" (siehe CLAUDE.md Datenmodell-Abschnitt) galt, solange die
// ANFRAGEZAHL mit der Personazahl mitwuchs. Bei EINEM gemeinsamen Aufruf
// bleibt es bei 1 Anfrage - nur mit einer entsprechend größeren, aber
// dank des großzügigen Minuten-Token-Kontingents (siehe Modell-Rotation,
// v0.34.0-beta) quasi kostenlosen Antwort.
//
// Persona-UNABHÄNGIGE Fakten (originalText, hasIllustration, Kapitel,
// Cover-Angaben) werden bewusst nur EINMAL im "core"-Block erfragt, nicht
// pro Persona dupliziert - das wäre unnötig teure Textmenge für exakt
// denselben Sachverhalt (in der alten Architektur lief das OCR bei jeder
// weiteren Persona faktisch nochmal mit, obwohl der gedruckte Text sich ja
// nicht ändert). Nur die stilistisch geprägten Felder (vereinfachter Text,
// Sprech-Fassung, Bildbeschreibung, Rätsel) kommen pro Persona.
//
// FORMAT bewusst wie beim SchreibZauber-Master-Prompt (siehe
// js/studio/studioPrompts.js, buildMasterSetupPrompt()/
// parseMasterSetupResponse()): JEDER Abschnitt ein eigener Codeblock mit
// eigenem JSON statt EINES riesigen verschachtelten JSON-Objekts. Grund:
// bei einem einzigen großen JSON reicht EIN vom Modell nicht sauber
// escapetes Anführungszeichen irgendwo (z.B. in wörtlicher Rede bei einer
// Persona) aus, um die GESAMTE Antwort für JSON.parse() unbrauchbar zu
// machen - exakt das Problem, das beim Birkenbihl-Bugfix in v0.32.2-beta
// auftrat. Mit einem Codeblock PRO Abschnitt kostet ein kaputter Abschnitt
// nur SEINEN eigenen Inhalt - alle anderen Personas/der Grundtext bleiben
// nutzbar, siehe parseMultiPersonaResponse() unten.
function buildMultiPersonaAnalyzePrompt(isCover, knownText, forceToc, birkenbihlLangId) {
    const knownTextBlock = knownText
        ? `\nDer exakte Text dieser Seite ist bereits bekannt (aus der Textebene, NICHT per Bilderkennung raten):\n"${knownText}"\nNutze GENAU diesen Wortlaut UNVERÄNDERT nur für "originalText" im "core"-Block. Jedes "simplifiedText" MUSS trotzdem eine eigene, wirklich vereinfachte Version mit Emojis sein - NICHT einfach der bekannte Text unverändert kopiert.\n`
        : '';

    const tocInstruction = forceToc
        ? `Diese Seite wurde vom Nutzer als Inhaltsverzeichnis markiert - extrahiere UNBEDINGT die Kapitelüberschriften in 'tocEntries' (Array, OHNE Seitenzahlen), auch bei ungewöhnlichem Layout.`
        : `Falls diese Seite ein Inhaltsverzeichnis/eine Kapitelübersicht ist: Array der Kapitelüberschriften in gedruckter Reihenfolge, OHNE Seitenzahlen. Sonst null.`;

    const coverFields = isCover
        ? `,\n  "title": "Der auf dieser Seite gedruckte Buchtitel, so genau wie erkennbar (auch bei kunstvoller/kursiver Schrift genau hinschauen) - nur null, falls WIRKLICH kein Titel zu sehen ist", "author": "Der gedruckte Autorenname - nur null, falls wirklich keiner zu sehen ist", "publisher": "Der erkennbare Verlagsname (z.B. aus Logo/Impressum auf dieser Seite) - nur null, falls wirklich keiner zu sehen ist", "series": "Der Name der Buchreihe, falls auf dieser Seite als Reihenbezeichnung erkennbar - nur null, falls keine erkennbar ist"`
        : '';

    const personaBlocks = app.personas.map(p => `
\`\`\`persona:${p.id}
{
  "simplifiedText": "GENAU der Originaltext (aus dem \\"core\\"-Block) mit GLEICHEM Satzbau - ersetze NUR 2-4 einzelne Nomen direkt an ihrer Stelle durch ein passendes Emoji. KEINE Umformulierung, KEINE Vereinfachung des Satzbaus, KEINE neuen/anderen Sätze - nur die Emoji-Ersetzung. Rolle dabei: ${p.instruction}",
  "vocabulary": [{"word": "Beispiel-Nomen", "emoji": "🌳"}],
  "imageDescription": "Falls die Seite laut \\"core\\"-Block eine Illustration zeigt: sie in 2 Sätzen passend zur Rolle (${p.instruction}) beschreiben - beginne mit einer Formulierung, die klarmacht, dass hier ein BILD beschrieben wird (z.B. 'Auf dem Bild siehst du...', 'Hier sehen wir...'), NICHT wie ein normaler Erzählsatz ohne diesen Bezug. Sonst null.",
  "quizQuestion": "Eine leichte Frage - wahlweise zum Textinhalt, zum Bild (falls vorhanden) oder zu Gefühlen. Wechsle zwischen drei Anforderungsstufen ab (angelehnt an die Anforderungsbereiche AFB I-III der Schule, aber kindgerecht übersetzt - keine Schulsprache verwenden): AFB I/Reproduktion - einfach wiedergeben, was im Text/Bild zu sehen war; AFB II/Anwendung - erklären oder vergleichen, WARUM etwas passiert ist oder was eine Figur dabei fühlt; AFB III/Transfer - das Kind SELBST einbeziehen, ausgehend vom Thema/Gefühl dieser Seite, altersgerecht statt mit Schulverben wie 'beurteile' (z.B. 'Was würdest du tun?', 'Kennst du das Gefühl auch von dir?'). Passend zur Rolle (${p.instruction}).",
  "quizAnswer": "Die kurze Antwort darauf.",
  "speechText": "NUR fürs Vorlesen, NICHT für die Anzeige: GENAU der Originaltext, WORTGLEICH und mit gleicher Satzstellung, aber an ein paar wenigen, wirklich passenden Stellen mit Sprech-Anweisungen mitten im Satz in eckigen Klammern angereichert (z.B. [flüstert], [lacht], [aufgeregt], [seufzt], [gähnt]), passend zur Rolle (${p.instruction}). KEIN Wort am eigentlichen Text ändern, hinzufügen oder weglassen - nur Tags EINFÜGEN. Sparsam einsetzen, nicht bei jedem Satz. Gibt der Text keinen erkennbaren Anlass für Emotionen her: identisch zum Originaltext."
}
\`\`\``).join('\n');

    const birkenbihlBlock = (() => {
        const langInfo = app.birkenbihlLanguages.find(l => l.id === birkenbihlLangId) || app.birkenbihlLanguages[0];
        return `

Zusätzlich EIN Block "birkenbihl" nach der Birkenbihl-Methode (Sprachenlernen durch wörtliche Übersetzung, nach Vera F. Birkenbihl - KEINE Grammatikregeln): übersetze den Originaltext aus dem "core"-Block natürlich und kindgerecht ins ${langInfo.promptLabel} und zerlege den ${langInfo.promptLabel}en Satz in kurze Wort-/Sinneinheiten (meist einzelne Wörter, ein Artikel darf mit seinem Nomen zusammenbleiben). Gib zu JEDER Einheit eine WÖRTLICHE deutsche Übersetzung, die exakt die Wortstellung des ${langInfo.promptLabel}en Satzes beibehält - auch wenn das auf Deutsch ungewöhnlich klingt (z.B. Englisch "The dog is running" wörtlich "Der Hund ist rennend", NICHT "Der Hund rennt"). Das ist bei dieser Methode ausdrücklich so gewollt.
\`\`\`birkenbihl
{
  "pairs": [{"target": "Wort/Einheit auf ${langInfo.promptLabel}", "gloss": "wörtliche deutsche Übersetzung dieser Einheit"}]
}
\`\`\``;
    })();

    return `Analysiere die Kinderbuch-Seite für MEHRERE Vorlese-Rollen gleichzeitig. Antworte AUSSCHLIESSLICH mit den unten verlangten Codeblöcken, jeder mit eigenem, validem JSON - keine Markdown-Formatierung außerhalb der Blöcke, kein zusätzlicher Fließtext.
${knownTextBlock}
\`\`\`core
{
  "originalText": "Der exakte gedruckte Text (Wenn leer: 'Kein Text.')",
  "hasIllustration": true oder false - true NUR wenn die Seite eine echte Illustration/Zeichnung/Foto zeigt, false bei einer reinen Textseite ohne Bild,
  "chapterTitle": "Falls diese Seite sichtbar ein NEUES Kapitel beginnt: die Überschrift GENAU wie gedruckt. Erkennungsmerkmale: sie steht meist ALLEIN am oberen Seitenrand, deutlich GRÖSSER/FETTER als der übrige Text, mit eigenem Abstand zum Fließtext danach - zählt AUCH OHNE das Wort 'Kapitel' oder eine Nummer davor (z.B. nur 'Der geheime Wald' allein oben auf der Seite). Ein normaler erster Satz der Geschichte, auch wenn er kurz/prägnant klingt, zählt NICHT als Überschrift. Sonst null - die meisten Seiten sind KEIN Kapitelanfang.",
  "tocEntries": "${tocInstruction}"${coverFields},
  "difficultWords": "Array von 0-4 Wörtern aus dem Originaltext, die ein Kind mit 5 Jahren oder jünger wahrscheinlich noch nicht kennt (Fremdwörter, abstrakte Begriffe, seltene Fachwörter - z.B. 'Bibliothek', 'Verwaltung'), jeweils mit einer kurzen, einfachen Erklärung in EINEM Satz ohne Fachbegriffe: [{\\"word\\": \\"Bibliothek\\", \\"explanation\\": \\"Ein großes Haus, in dem man sich Bücher ausleihen kann.\\"}]. Leeres Array, wenn der Text keine schwierigen Wörter enthält - persona-unabhängig, dasselbe für alle Rollen."
}
\`\`\`

Für JEDE der folgenden Rollen einen eigenen Block mit demselben Schema, angepasst an die jeweilige Rolle - alle beziehen sich auf den "originalText" aus dem "core"-Block oben:
${personaBlocks}
${birkenbihlBlock}`;
}

// NEU: Gegenstück zu buildMultiPersonaAnalyzePrompt() oben - zerlegt die
// Antwort in ihre Codeblöcke und parst JEDEN EINZELN FÜR SICH. Ein von der
// KI nicht sauber escapetes Anführungszeichen in EINER Persona (z.B.
// wörtliche Rede) lässt dadurch nur DIESE eine Persona fehlschlagen, nicht
// die ganze Seite - fehlende Personas holt der bestehende Mechanismus
// (on-demand im Reader bzw. app.backgroundPregen) genauso nach, wie er es
// heute schon für eine noch nie analysierte Persona tut.
function parseMultiPersonaResponse(rawText) {
    const text = String(rawText || '');
    const blocks = {};
    const fenceRe = /```\s*([\w:-]+)\s*\n([\s\S]*?)```/g;
    let m;
    while ((m = fenceRe.exec(text))) {
        blocks[m[1].trim()] = m[2].trim();
    }

    const parseBlock = (key) => {
        if (!blocks[key]) return null;
        try {
            return parseModelJson(blocks[key]);
        } catch (e) {
            console.warn(`Analyse-Block "${key}" konnte nicht gelesen werden, wird übersprungen:`, e.message);
            return null;
        }
    };

    const core = parseBlock('core') || {};
    const personas = {};
    app.personas.forEach(p => {
        const data = parseBlock(`persona:${p.id}`);
        if (data) personas[p.id] = data;
    });
    const birkenbihl = parseBlock('birkenbihl');

    return { core, personas, birkenbihl };
}

// NEU: eigener Prompt für Übungshefte (bookType 'workbook'). Der normale
// Analyse-Prompt oben ist auf eine ERZÄHL-Seite zugeschnitten und ersetzt
// Nomen durch Emojis - bei einer Arbeitsanweisung ("Male alle Dreiecke an")
// wäre genau das schädlich, das Kind soll die Anweisung ja verstehen.
// Deshalb hier ein komplett eigenes Schema: Aufgabe, kindgerechte
// Erklärung, Hilfeschritte, Lösung.
function buildWorkbookPrompt(isCover, personaId, knownText) {
    const knownTextBlock = knownText
        ? `\nDer exakte Text dieser Seite ist bereits bekannt (aus der Textebene, NICHT per Bilderkennung raten):\n"${knownText}"\nNutze GENAU diesen Wortlaut UNVERÄNDERT nur für "taskText". "taskExplained" MUSS trotzdem eine eigene, kindgerechte Erklärung sein.\n`
        : '';

    return `Rolle: ${personaInstruction(personaId)}
${knownTextBlock}
Du hilfst einem Vorschulkind (ca. 4-6 Jahre), das noch NICHT lesen kann, bei einem Übungsblatt/Arbeitsblatt. Ein Erwachsener oder die App liest dem Kind alles vor.
Analysiere das abgebildete Übungsblatt. Antworte AUSSCHLIESSLICH in validem JSON-Format! Verwende keine Markdown-Blöcke.
Nutze exakt dieses Schema:
{
  "taskText": "Die Aufgabenstellung EXAKT so, wie sie auf dem Blatt gedruckt steht (wenn keine gedruckt ist: 'Keine Aufgabe gedruckt.')",
  "taskExplained": "Erkläre dem Kind in 1-2 sehr kurzen, einfachen Sätzen, was es tun soll. Sprich das Kind direkt an ('Male ...', 'Suche ...'). WICHTIG: ersetze KEINE Wörter durch Emojis - das Kind muss die Anweisung verstehen. Höchstens 1-2 Emojis am Satzende.",
  "taskType": "Genau EINER dieser Werte: ausmalen, verbinden, zaehlen, nachspuren, ankreuzen, schreiben, zuordnen, suchen, sonstiges",
  "materials": "Was das Kind dafür braucht, sehr kurz (z.B. 'Buntstifte') - oder null",
  "pageDescription": "Was auf dem Blatt zu sehen ist (Bilder, Formen, Linien, Kästchen) in 1-2 Sätzen, so dass sich ein Kind, das das Blatt vor sich hat, wiederfindet. Falls nichts Bildhaftes zu sehen ist: null",
  "helpSteps": ["3 bis 5 kurze Schritte in Du-Form, EIN einzelner Handgriff pro Schritt, in der Reihenfolge des Bearbeitens"],
  "solution": "Die Lösung bzw. woran man erkennt, dass es richtig ist. Bei freien Aufgaben (z.B. frei ausmalen): 'Hier gibt es kein richtig oder falsch.'",
  "vocabulary": [{"word": "Dreieck", "emoji": "🔺"}]${isCover ? ',\n  "title": "Der auf dieser Seite gedruckte Titel des Hefts - nur null, falls wirklich keiner zu sehen ist", "author": "Der gedruckte Autor/Herausgeber - nur null, falls wirklich keiner zu sehen ist"' : ''}
}
"vocabulary" enthält höchstens 4 Lernwörter (Nomen in Grundform) vom Blatt mit passendem Emoji, für den Vokabeltrainer. Keine gefunden: leeres Array.
SEHR WICHTIG: Erfinde nichts dazu. Was du auf dem Blatt nicht sicher erkennst, darfst du nicht raten - schreibe bei "solution" dann "Das kann ich hier nicht sicher erkennen." Eine falsche Lösung verunsichert das Kind mehr, als gar keine zu haben.`;
}

// NEU: Prompt für die Kontrolle eines BEARBEITETEN Blattes. Die KI kennt
// dabei die Aufgabe und die erwartete Lösung aus der vorherigen Analyse -
// sie muss also nicht erraten, worum es geht, sondern nur noch vergleichen.
// Die Regeln am Ende sind der wichtigste Teil: ein Kind, dem fälschlich
// gesagt wird, es habe sich vertan, verliert die Lust an der Sache. Lieber
// "unklar" als ein falscher Tadel.
function buildCheckPrompt(variant, personaId) {
    const solution = variant.solution || 'Keine Lösung hinterlegt - beurteile nur, ob die Aufgabe erkennbar bearbeitet wurde.';
    const explained = variant.erstleserText || variant.text || '';

    return `Rolle: ${personaInstruction(personaId)}

Ein Kind (ca. 4-6 Jahre, kann noch NICHT lesen) hat ein Übungsblatt bearbeitet und zeigt es dir jetzt als Foto. Du siehst also das BEARBEITETE Blatt mit dem, was das Kind gemalt, verbunden, angekreuzt oder geschrieben hat.

Die Aufgabe lautete: "${variant.text || ''}"
So wurde sie dem Kind erklärt: "${explained}"
Erwartete Lösung: "${solution}"

Schau dir an, was das Kind gemacht hat, und antworte AUSSCHLIESSLICH in validem JSON-Format! Verwende keine Markdown-Blöcke.
Nutze exakt dieses Schema:
{
  "verdict": "Genau EINER dieser Werte: richtig, fast, nochmal, unklar",
  "praise": "Ein kurzer, warmer Satz an das Kind. Benenne IMMER zuerst etwas Gutes - auch dann, wenn noch etwas fehlt.",
  "feedback": "1-2 kurze Sätze in Du-Form: was du auf dem Blatt siehst und was gegebenenfalls noch fehlt. Kindgerecht und freundlich. Das Wort 'falsch' benutzt du NICHT.",
  "hints": ["1 bis 3 kurze Tipps, was das Kind als Nächstes tun kann. Bei verdict 'richtig' ein leeres Array. Verrate nicht einfach die ganze Lösung, gib nur einen Schubs in die richtige Richtung."]
}

Diese Regeln sind wichtiger als alles andere:
- Kannst du auf dem Foto nicht sicher erkennen, was das Kind gemacht hat (unscharf, zu dunkel, abgeschnitten, Blatt nicht erkennbar, gar nichts bearbeitet)? Dann verdict "unklar" und sage im feedback freundlich, dass du das Bild nicht gut erkennen kannst. RATE NICHT.
- Im Zweifel immer "fast" statt "nochmal".
- Bei freien Aufgaben, bei denen es kein richtig oder falsch gibt (z.B. frei ausmalen), ist alles richtig, was bearbeitet wurde: verdict "richtig".
- Sprich das Kind direkt an, nie über das Kind.`;
}

// NEU (Heft-Generator): Aufgabenarten, die ein erzeugtes Blatt OHNE
// Bildmaterial hinbekommt. Ein erzeugtes Blatt ist zunächst nur Text auf
// Papier (gezeichnet wie in renderTextAsImageCanvas(), js/actions/epubImport.js) -
// "Male den Löwen an" wäre damit wertlos, weil der Löwe fehlt. Deshalb sind
// hier bewusst nur die vier Arten gelistet, die mit gedruckten Zeichen
// auskommen. Kommt später KI-Bildgenerierung dazu (docs/KONZEPT-Comic.md),
// wird diese Liste erweitert - die Werte selbst sind dieselben taskType-Werte
// wie beim Auslesen (siehe buildWorkbookPrompt) und brauchen eine Überschrift
// in js/render/workbook.js.
const GENERATOR_TASK_TYPES = [
    {
        id: 'zaehlen',
        hint: 'Mengen zum Zählen aus wiederholten Emojis/Zeichen aufbauen (z.B. eine Zeile "🐑 🐑 🐑 🐑 🐑"), darunter ein Kästchen für die Zahl.'
    },
    {
        id: 'ankreuzen',
        hint: 'Wahlmöglichkeiten je in einer eigenen Zeile, jede beginnt mit einem leeren Kästchen "☐ ". Das Kind kreuzt an.'
    },
    {
        id: 'nachspuren',
        hint: 'Nachspur-/Schwungübung: Linien aus wiederholten Zeichen, die das Kind mit dem Stift nachfährt (z.B. "· · · · · · · ·", "∿∿∿∿∿∿∿∿", "○—○—○—○—○").'
    },
    {
        id: 'schreiben',
        hint: 'Einzelne Buchstaben oder Ziffern vorgeben und daneben Platz zum Selberschreiben lassen (z.B. "N  N  N  ____  ____").'
    }
];

// NEU (Heft-Generator): erzeugt EIN komplettes Übungsheft in EINEM Aufruf
// (nicht ein Aufruf pro Blatt) - ein Heft mit 12 Blättern kostet damit
// einen Aufruf statt zwölf. Die Feldnamen pro Blatt sind mit Absicht exakt
// dieselben wie im Auslese-Schema von buildWorkbookPrompt(): so lässt sich
// ein erzeugtes Blatt später ohne Sonderfall durch
// app.utils.buildPageVariant(blatt, page, 'workbook') schicken.
function buildGeneratorPrompt({ story, learningGoal, count, personaId, ownText }) {
    const typeList = GENERATOR_TASK_TYPES.map(t => `- "${t.id}": ${t.hint}`).join('\n');
    const allowed = GENERATOR_TASK_TYPES.map(t => t.id).join(', ');

    // Bei Bibelinhalten erfindet die KI Namen, Zahlen und Abläufe gerne
    // "plausibel" dazu (siehe docs/KONZEPT-Uebungshefte.md, "Verlässlichkeit").
    // Gibt der Nutzer einen eigenen Text vor, ist der gesetzt; sonst wird die
    // KI ausdrücklich auf das Allgemeinbekannte begrenzt.
    const sourceBlock = ownText
        ? `\nDer Erwachsene hat den Text zur Geschichte selbst vorgegeben. Er ist verbindlich - halte dich inhaltlich GENAU daran und erfinde nichts dazu:\n"""\n${ownText}\n"""\n`
        : `\nEs ist KEIN Quelltext vorgegeben. Nutze deshalb nur das, was an dieser Geschichte allgemein bekannt ist, und erfinde keine Namen, Zahlen, Orte oder Abläufe dazu. Im Zweifel bleibst du allgemein, statt etwas zu behaupten.\n`;

    return `Rolle: ${personaInstruction(personaId)}

Du erstellst ein Übungsheft zur Schulvorbereitung für ein Kind von etwa 4 bis 6 Jahren, das noch NICHT lesen kann. Ein Erwachsener oder die App liest dem Kind alles vor; das Kind bearbeitet die Blätter mit dem Stift auf Papier.

Thema/Geschichte: "${story}"
Lernziel: "${learningGoal}"
Anzahl der Übungsblätter: GENAU ${count}
${sourceBlock}
GANZ WICHTIG - was auf ein Blatt darf:
Die Blätter werden als reiner Text gedruckt. Es gibt KEINE Zeichnungen, KEINE Fotos und KEINE Ausmalbilder. Alles, was das Kind zum Bearbeiten braucht, musst du aus gedruckten Zeichen und Emojis selbst aufbauen. Erlaubt sind daher NUR diese Aufgabenarten:
${typeList}

Regeln für jedes Blatt:
- GENAU EINE Aufgabe pro Blatt, nie mehrere.
- Das Blatt muss ohne jedes zusätzliche Material lösbar sein - ein Stift genügt.
- Verweise nie auf etwas, das gar nicht auf dem Blatt steht ("schau dir das Bild an" ist verboten).
- Die Aufgaben werden über die Blätter hinweg etwas schwerer, das erste ist das leichteste.
- Der Bezug zur Geschichte steckt in den Wörtern und Emojis der Aufgabe, nicht in einem Bild.
- Schreibe kindgerecht und freundlich. Formuliere nie hart oder schulmeisterlich.

Antworte AUSSCHLIESSLICH in validem JSON! Verwende keine Markdown-Blöcke.
Nutze exakt dieses Schema:
{
  "title": "Kurzer, kindgerechter Titel des Hefts (z.B. 'Mit Noah zählen lernen')",
  "sheets": [
    {
      "heading": "Kurze Überschrift des Blatts, höchstens 4 Wörter",
      "taskText": "Die Aufgabenstellung, wie sie auf dem Blatt gedruckt wird - EIN kurzer Satz in Du-Form",
      "taskExplained": "Dieselbe Aufgabe noch einmal in 1-2 sehr einfachen Sätzen fürs Vorlesen. Ersetze KEINE Wörter durch Emojis, das Kind muss die Anweisung verstehen.",
      "taskType": "Genau EINER dieser Werte: ${allowed}",
      "materials": "Was das Kind braucht, sehr kurz (z.B. 'Ein Stift') - oder null",
      "body": ["Die Zeilen, die auf das Blatt gedruckt werden - das eigentliche Übungsfeld. Jede Zeile höchstens 40 Zeichen, 2 bis 10 Zeilen. Eine komplett leere Zeile ist als Abstand erlaubt. KEIN Markdown, keine Tabellen, keine Überschrift und keine Wiederholung der Aufgabenstellung."],
      "pageDescription": "In 1-2 Sätzen, was auf dem Blatt zu sehen ist - so, dass sich ein Kind mit dem Blatt vor sich wiederfindet.",
      "helpSteps": ["3 bis 5 kurze Schritte in Du-Form, EIN einzelner Handgriff pro Schritt, in der Reihenfolge des Bearbeitens"],
      "solution": "Die Lösung bzw. woran man erkennt, dass es richtig ist. Bei freien Übungen (z.B. Schwungübungen): 'Hier gibt es kein richtig oder falsch - Hauptsache, du hast geübt.'"
    }
  ]
}
"sheets" enthält GENAU ${count} Blätter in der Reihenfolge, in der das Kind sie bearbeiten soll.
Die Lösung muss wirklich zu dem passen, was in "body" steht - zähle selbst nach, bevor du sie hinschreibst. Eine falsche Lösung verunsichert das Kind mehr, als gar keine zu haben.`;
}

// Gemeinsame Aufräum-Logik für beide Anbieter: manche Modelle wrappen die
// JSON-Antwort trotz Anweisung in ```json ... ``` Markdown-Blöcke.
function parseModelJson(rawText) {
    const cleaned = (rawText || '{}').replace(/^```(json)?\n?/, '').replace(/\n?```$/, '').trim();
    return JSON.parse(cleaned);
}

async function callGeminiAnalyze(prompt, base64Image) {
    if (!app.settings.apiKey) throw new Error('API_KEY_MISSING');

    const payload = {
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: 'image/webp', data: base64Image } }] }],
        generationConfig: { temperature: 0.2 }
    };

    const textResult = await withGeminiModelRotation(async (model) => {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${app.settings.apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });

        if (!res.ok) {
            if (res.status === 400) throw new Error('Falscher API-Key (400)');
            if (res.status === 403) throw new Error('API-Key ungültig (403)');
            if (res.status === 429) throw new Error('RATE_LIMITED');
            throw new Error(`Gemini-Fehler ${res.status}`);
        }

        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    });

    // NEU: Kosten-/Verbrauchsanzeige - nur der Text-Anteil (Prompt), da die
    // tatsaechlichen Kosten bei Bildanalysen stark vom Bild abhaengen und
    // sich nicht sinnvoll aus Zeichen schaetzen lassen (siehe costMeter.js).
    app.costMeter.trackGeminiText(prompt.length);
    return parseModelJson(textResult);
}

async function callMistralAnalyze(prompt, base64Image) {
    if (!app.settings.mistralApiKey) throw new Error('MISTRAL_KEY_MISSING');

    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${app.settings.mistralApiKey}`
        },
        body: JSON.stringify({
            model: MISTRAL_MODEL,
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    { type: 'image_url', image_url: `data:image/webp;base64,${base64Image}` }
                ]
            }]
        })
    });

    if (!res.ok) throw new Error(`Mistral-Fehler ${res.status}`);

    const data = await res.json();
    const textResult = data.choices?.[0]?.message?.content || '{}';
    return parseModelJson(textResult);
}

// NEU (Mehrere-Personas-Analyse): wie callGeminiAnalyze() oben, aber OHNE
// den abschließenden parseModelJson() - die Antwort enthält jetzt mehrere
// Codeblöcke (siehe buildMultiPersonaAnalyzePrompt()), die JEDER FÜR SICH
// geparst werden müssen (parseMultiPersonaResponse()). Ein Versuch, die
// GANZE Antwort auf einmal zu parsen, würde sowieso scheitern (es ist ja
// kein einzelnes JSON-Objekt) und hier keinen Sinn ergeben.
async function callGeminiAnalyzeRaw(prompt, base64Image) {
    if (!app.settings.apiKey) throw new Error('API_KEY_MISSING');

    const payload = {
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: 'image/webp', data: base64Image } }] }],
        generationConfig: { temperature: 0.3 }
    };

    const text = await withGeminiModelRotation(async (model) => {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${app.settings.apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        if (!res.ok) {
            if (res.status === 400) throw new Error('Falscher API-Key (400)');
            if (res.status === 403) throw new Error('API-Key ungültig (403)');
            if (res.status === 429) throw new Error('RATE_LIMITED');
            throw new Error(`Gemini-Fehler ${res.status}`);
        }
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    });

    app.costMeter.trackGeminiText(prompt.length);
    return text;
}

// NEU (Mehrere-Personas-Analyse): Mistral-Gegenstück zu
// callGeminiAnalyzeRaw() oben - nur als allerletzter Rückfall gebraucht,
// wenn WIRKLICH jedes Gemini-Modell 429 meldet (siehe analyzeAllPersonas()
// unten). Mistral bekommt denselben Block-Prompt und liefert im besten
// Fall dieselbe Struktur zurück - hält sich ein schwächeres Modell nicht
// exakt daran, verliert parseMultiPersonaResponse() eben nur die Blöcke,
// die nicht ordentlich zu finden waren, statt komplett zu scheitern.
async function callMistralAnalyzeRaw(prompt, base64Image) {
    if (!app.settings.mistralApiKey) throw new Error('MISTRAL_KEY_MISSING');

    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${app.settings.mistralApiKey}`
        },
        body: JSON.stringify({
            model: MISTRAL_MODEL,
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    { type: 'image_url', image_url: `data:image/webp;base64,${base64Image}` }
                ]
            }]
        })
    });

    if (!res.ok) throw new Error(`Mistral-Fehler ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
}

// NEU: reiner Text-Aufruf (kein Bild) fürs Buch-Quiz und den Heft-Generator,
// genutzt vom Gemini/Mistral-Fallback-Paar unten.
async function callMistralText(prompt) {
    if (!app.settings.mistralApiKey) throw new Error('MISTRAL_KEY_MISSING');

    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${app.settings.mistralApiKey}`
        },
        body: JSON.stringify({
            model: MISTRAL_MODEL,
            messages: [{ role: 'user', content: prompt }]
        })
    });

    if (!res.ok) throw new Error(`Mistral-Fehler ${res.status}`);

    const data = await res.json();
    const textResult = data.choices?.[0]?.message?.content || '[]';
    return parseModelJson(textResult);
}

// NEU: reiner Text-Aufruf an Gemini. War bisher zweimal ausgeschrieben
// (Buch-Quiz und, beim Hinzufügen des Heft-Generators, beinahe ein drittes
// Mal) - jetzt an einer Stelle, damit Modellwechsel und Verbrauchszählung
// nicht auseinanderlaufen.
async function callGeminiText(prompt, generationConfig = {}) {
    if (!app.settings.apiKey) throw new Error('API_KEY_MISSING');

    const { text, finishReason } = await withGeminiModelRotation(async (model) => {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${app.settings.apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig })
        });
        if (!res.ok) {
            if (res.status === 429) throw new Error('RATE_LIMITED');
            throw new Error(`Gemini-Fehler ${res.status}`);
        }
        const data = await res.json();
        return { text: data.candidates?.[0]?.content?.parts?.[0]?.text || '', finishReason: data.candidates?.[0]?.finishReason };
    });

    app.costMeter.trackGeminiText(prompt.length);

    // Bei sehr langen Antworten (z.B. ein Heft mit 12 Blättern) kann das
    // Modell mitten im JSON abbrechen. Das als eigenen, verständlichen
    // Fehler melden statt als kryptischen JSON-Parse-Fehler.
    if (finishReason === 'MAX_TOKENS') {
        throw new Error('Antwort der KI war zu lang und wurde abgeschnitten');
    }

    return parseModelJson(text || '{}');
}

// NEU (Birkenbihl-Methode, Bugreport "Übersetzung schlägt fehl"): Rückfall
// für den Fall, dass parseModelJson() an einer einzigen kaputten Stelle
// scheitert. Eine Seite mit wörtlicher Rede erzeugt schnell ein Dutzend
// Wort-Paare - reicht bei EINEM davon ein vom Modell nicht sauber
// escapetes Anführungszeichen (z.B. in „Hallo!", rief der Fuchs), macht das
// JSON.parse() für die GESAMTE Antwort unbrauchbar, obwohl der Rest
// technisch in Ordnung wäre. Zieht deshalb alle {"target": "...",
// "gloss": "..."}-Fundstellen einzeln per Regex heraus - eine kaputte
// Stelle kostet dann nur dieses eine Wortpaar statt der ganzen Übersetzung.
function extractPairsLoosely(rawText) {
    const pairs = [];
    const re = /"target"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"gloss"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    const unescape = (s) => s.replace(/\\(.)/g, '$1');
    let m;
    while ((m = re.exec(rawText))) {
        const target = unescape(m[1]).trim();
        if (target) pairs.push({ target, gloss: unescape(m[2]).trim() });
    }
    return pairs;
}

// NEU: wie callGeminiText() oben, aber mit dem nachsichtigen Rückfall aus
// extractPairsLoosely() statt striktem Scheitern bei kaputtem JSON oder
// einer abgeschnittenen (MAX_TOKENS-)Antwort - nur für Birkenbihl gebraucht,
// deshalb eine eigene, kleine Funktion statt callGeminiText() für ALLE
// anderen Aufrufer (Buch-Quiz, Figuren-Vorschläge, ...) mit zu verändern.
async function callGeminiTextLenient(prompt, generationConfig = {}) {
    if (!app.settings.apiKey) throw new Error('API_KEY_MISSING');

    const { text, finishReason } = await withGeminiModelRotation(async (model) => {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${app.settings.apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig })
        });
        if (!res.ok) {
            if (res.status === 429) throw new Error('RATE_LIMITED');
            throw new Error(`Gemini-Fehler ${res.status}`);
        }
        const data = await res.json();
        return { text: data.candidates?.[0]?.content?.parts?.[0]?.text || '', finishReason: data.candidates?.[0]?.finishReason };
    });

    app.costMeter.trackGeminiText(prompt.length);

    // Auch aus einer wegen MAX_TOKENS abgeschnittenen Antwort lässt sich oft
    // noch retten, was bis zum Abbruch bereits vollständige Wortpaare waren
    // - lieber eine unvollständige Übersetzung als gar keine.
    if (finishReason === 'MAX_TOKENS') {
        const pairs = extractPairsLoosely(text);
        if (pairs.length > 0) return { pairs };
        throw new Error('Antwort der KI war zu lang und wurde abgeschnitten');
    }

    try {
        return parseModelJson(text || '{}');
    } catch (parseError) {
        const pairs = extractPairsLoosely(text);
        if (pairs.length > 0) return { pairs };
        throw parseError;
    }
}

async function runTextPromptLenient(prompt, generationConfig, fallbackToastMsg) {
    try {
        return await callGeminiTextLenient(prompt, generationConfig);
    } catch (geminiError) {
        if (!app.settings.mistralApiKey) throw geminiError;

        console.warn('Gemini fehlgeschlagen, versuche Mistral-Fallback:', geminiError.message);
        try {
            const result = await callMistralText(prompt);
            app.ui.toast(fallbackToastMsg, '🔄');
            return result;
        } catch (mistralError) {
            console.error('Auch Mistral-Fallback fehlgeschlagen:', mistralError);
            throw geminiError;
        }
    }
}

// NEU: Text-Aufruf mit demselben Mistral-Fallback wie analyze() - erst
// Gemini, bei jedem Fehler (auch fehlendem Gemini-Key) Mistral, sofern dort
// ein Key hinterlegt ist.
async function runTextPrompt(prompt, generationConfig = {}) {
    try {
        return await callGeminiText(prompt, generationConfig);
    } catch (geminiError) {
        if (!app.settings.mistralApiKey) throw geminiError;

        console.warn('Gemini fehlgeschlagen, versuche Mistral-Fallback:', geminiError.message);
        try {
            const result = await callMistralText(prompt);
            app.ui.toast('Gemini nicht erreichbar - Mistral eingesprungen', '🔄');
            return result;
        } catch (mistralError) {
            console.error('Auch Mistral-Fallback fehlgeschlagen:', mistralError);
            throw geminiError;
        }
    }
}

// NEU (Heft-Generator): Ein Heft mit mehr Blättern macht die JSON-Antwort
// sehr lang - und je länger sie wird, desto eher bricht das Modell mitten
// im JSON ab. 12 Blätter sind laut Konzept ohnehin eine gute Heftgröße.
const GENERATOR_MAX_SHEETS = 12;

// NEU (Heft-Generator): Die KI-Antwort einmal geradeziehen, bevor sie
// irgendwo weiterverarbeitet wird. Drei Dinge machen ein Blatt unbrauchbar,
// da wird es lieber weggelassen als halb gebaut ins Heft gestellt:
// - keine Aufgabenstellung,
// - kein "body", also nichts zum Bearbeiten auf dem Blatt,
// - eine Aufgabenart außerhalb von GENERATOR_TASK_TYPES: hält sich das
//   Modell nicht an die Liste (z.B. "ausmalen"), hat es sich ein Blatt mit
//   Bildmaterial ausgedacht, das der Generator gar nicht zeichnen kann.
// Rest fehlt: auffüllen statt verwerfen.
function normalizeGeneratedSheet(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const text = (value) => (typeof value === 'string' && value.trim()) ? value.trim() : null;
    const taskText = text(raw.taskText);
    if (!taskText) return null;
    if (!GENERATOR_TASK_TYPES.some(t => t.id === raw.taskType)) return null;

    const body = Array.isArray(raw.body)
        ? raw.body.filter(line => typeof line === 'string').map(line => line.trimEnd())
        : [];
    if (!body.some(line => line.trim())) return null;

    return {
        heading: text(raw.heading) || taskText,
        taskText,
        // Fällt die Erklärung aus, wird die Aufgabenstellung vorgelesen -
        // besser als eine leere Vorlese-Variante.
        taskExplained: text(raw.taskExplained) || taskText,
        taskType: raw.taskType,
        materials: text(raw.materials),
        body,
        pageDescription: text(raw.pageDescription),
        helpSteps: Array.isArray(raw.helpSteps)
            ? raw.helpSteps.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim())
            : [],
        // Lieber ehrlich offen lassen als etwas Ausgedachtes behaupten -
        // dieselbe Haltung wie beim Auslesen (siehe buildWorkbookPrompt).
        solution: text(raw.solution) || 'Das kann ich hier nicht sicher sagen - schaut am besten gemeinsam drauf.'
    };
}

Object.assign(app.api, {
    // personaId ist jetzt optional - ohne Angabe wird wie bisher die
    // globale Standard-Persona genutzt (bestehende Aufrufe funktionieren
    // unverändert weiter). forceToc ebenfalls optional - siehe
    // app.actions.setPageRole('tocPageId', ...).
    // NEU: bookType entscheidet zusätzlich, welcher Prompt genutzt wird. Ohne
    // Angabe bleibt es beim bisherigen Geschichten-Prompt - alle alten Aufrufe
    // verhalten sich dadurch unverändert.
    async analyze(base64Image, isCover, personaId = app.settings.persona, knownText = null, forceToc = false, bookType = 'story') {
        const prompt = bookType === 'workbook'
            ? buildWorkbookPrompt(isCover, personaId, knownText)
            : buildAnalyzePrompt(isCover, personaId, knownText, forceToc);

        try {
            return await callGeminiAnalyze(prompt, base64Image);
        } catch (geminiError) {
            if (!app.settings.mistralApiKey) throw geminiError;

            console.warn('Gemini fehlgeschlagen, versuche Mistral-Fallback:', geminiError.message);
            try {
                const result = await callMistralAnalyze(prompt, base64Image);
                app.ui.toast('Gemini nicht erreichbar - Mistral eingesprungen', '🔄');
                return result;
            } catch (mistralError) {
                console.error('Auch Mistral-Fallback fehlgeschlagen:', mistralError);
                throw geminiError;
            }
        }
    },

    // NEU (Nutzerwunsch: "so viel wie möglich aus einem Call rausbekommen") -
    // liefert ALLE konfigurierten Personas UND die Birkenbihl-Zerlegung aus
    // EINEM Aufruf, siehe buildMultiPersonaAnalyzePrompt() für die
    // ausführliche Begründung. Rückgabe: { core, personas: {[personaId]:
    // {...}}, birkenbihl: {pairs} | null } - core/personas/birkenbihl
    // können je nach dem, was beim Parsen gefunden wurde, auch leer/null
    // sein (siehe parseMultiPersonaResponse()), das ruft NIEMALS selbst
    // einen Fehler hervor - app.actions.analyzePage() entscheidet, was bei
    // einem leeren Ergebnis passiert (Rückfall auf den bewährten
    // Einzel-Personas-Weg analyze() oben).
    async analyzeAllPersonas(base64Image, isCover, knownText, forceToc, birkenbihlLangId) {
        const prompt = buildMultiPersonaAnalyzePrompt(isCover, knownText, forceToc, birkenbihlLangId);

        let rawText;
        try {
            rawText = await callGeminiAnalyzeRaw(prompt, base64Image);
        } catch (geminiError) {
            if (!app.settings.mistralApiKey) throw geminiError;

            console.warn('Gemini fehlgeschlagen, versuche Mistral-Fallback:', geminiError.message);
            try {
                rawText = await callMistralAnalyzeRaw(prompt, base64Image);
                app.ui.toast('Gemini nicht erreichbar - Mistral eingesprungen', '🔄');
            } catch (mistralError) {
                console.error('Auch Mistral-Fallback fehlgeschlagen:', mistralError);
                throw geminiError;
            }
        }

        return parseMultiPersonaResponse(rawText);
    },

    async answerQuestion(base64Image, question) {
        const prompt = `Beantworte die Frage eines Kindes basierend auf dem Bild in einem prägnanten Satz: "${question}"`;

        try {
            if (!app.settings.apiKey) throw new Error('API_KEY_MISSING');
            // FIX (Modell-Rotation): dieser Aufruf baute seinen fetch() bisher
            // direkt hier und nicht über callGeminiAnalyze()/callGeminiText()
            // - dadurch fehlte ihm die Rotation über GEMINI_MODELS, obwohl er
            // dasselbe Tageskontingent verbraucht. Jetzt über
            // withGeminiModelRotation() wie die anderen drei Aufrufer oben.
            const text = await withGeminiModelRotation(async (model) => {
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${app.settings.apiKey}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: 'image/webp', data: base64Image } }] }] })
                });
                if (!res.ok) {
                    if (res.status === 429) throw new Error('RATE_LIMITED');
                    throw new Error('API Fehler');
                }
                const data = await res.json();
                return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Das weiß ich leider nicht.';
            });
            app.costMeter.trackGeminiText(prompt.length);
            return text;
        } catch (geminiError) {
            if (!app.settings.mistralApiKey) throw new Error('Verbindungsfehler');
            try {
                const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${app.settings.mistralApiKey}` },
                    body: JSON.stringify({
                        model: MISTRAL_MODEL,
                        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: `data:image/webp;base64,${base64Image}` }] }]
                    })
                });
                if (!res.ok) throw new Error('Mistral Fehler');
                const data = await res.json();
                return data.choices?.[0]?.message?.content || 'Das weiß ich leider nicht.';
            } catch (mistralError) {
                throw new Error('Verbindungsfehler');
            }
        }
    },

    // NEU: Verständnisfragen zum GESAMTEN Buch (reiner Text-Aufruf, kein
    // Bild) - fasst den Text aller Seiten zusammen und lässt die KI daraus
    // ein paar Fragen zur Geschichte als Ganzes erstellen.
    async generateBookQuiz(compiledText, personaId) {
        const prompt = `Rolle: ${personaInstruction(personaId)}
Hier ist der komplette Text eines Kinderbuchs, Seite für Seite:

${compiledText}

Erstelle GENAU 4 Verständnisfragen zum GESAMTEN Buch (nicht zu einzelnen Bildern) - z.B. zur Reihenfolge der Ereignisse, zu Hauptfiguren, oder wie die Geschichte endet. Halte die Fragen einfach genug für ein Kind im Vorlesealter.
Antworte AUSSCHLIESSLICH als valides JSON-Array ohne Markdown-Blöcke, exakt in diesem Format:
[
  {"question": "...", "answer": "..."},
  {"question": "...", "answer": "..."}
]`;

        // FIX: der Key-Check lag früher VOR dem try - ohne Gemini-Key gab es
        // deshalb gar kein Buch-Quiz, obwohl ein Mistral-Key hinterlegt sein
        // konnte. runTextPrompt() behandelt das jetzt wie analyze().
        const questions = await runTextPrompt(prompt, { temperature: 0.3 });
        // Die Aufrufer speichern das Ergebnis direkt als
        // book.bookQuiz.questions und gehen von einem Array aus - eine leere
        // oder verunglückte Antwort darf dort kein Objekt hinterlassen.
        return Array.isArray(questions) ? questions : [];
    },

    // NEU (Birkenbihl-Methode, docs/TODO-GESAMT.md Bereich "Mehrsprachigkeit"):
    // übersetzt den deutschen Seitentext in die Zielsprache UND zerlegt das
    // Ergebnis in kurze Wort-/Sinneinheiten mit je einer WÖRTLICHEN
    // deutschen Übersetzung in der Wortstellung der Zielsprache (nicht
    // idiomatisch) - genau das Prinzip der Methode: die fremde Grammatik
    // "entdecken", statt sie als Regel zu lernen. Reiner Text-Aufruf, nach
    // demselben Muster wie generateBookQuiz() oben.
    async generateBirkenbihlDecoding(text, langId) {
        const langInfo = app.birkenbihlLanguages.find(l => l.id === langId) || app.birkenbihlLanguages[0];
        const prompt = `Du hilfst bei der Birkenbihl-Methode (Sprachenlernen durch wörtliche Übersetzung, nach Vera F. Birkenbihl - KEINE Grammatikregeln, das Gehirn erkennt Muster selbst).

Schritt 1: Übersetze den folgenden deutschen Kinderbuch-Text natürlich und kindgerecht ins ${langInfo.promptLabel}.
Schritt 2: Zerlege den ${langInfo.promptLabel}en Satz in kurze Wort-/Sinneinheiten (meist einzelne Wörter, ein Artikel darf mit seinem Nomen zusammenbleiben). Gib zu JEDER Einheit eine WÖRTLICHE deutsche Übersetzung, die exakt die Wortstellung des ${langInfo.promptLabel}en Satzes beibehält - auch wenn das auf Deutsch ungewöhnlich oder falsch klingt (z.B. Englisch "The dog is running" wörtlich "Der Hund ist rennend", NICHT die flüssige Übersetzung "Der Hund rennt"). Das ist bei dieser Methode ausdrücklich so gewollt.

Deutscher Text:
"""
${text}
"""

Antworte AUSSCHLIESSLICH in validem JSON, ohne Markdown-Blöcke, exakt in diesem Format:
{
  "pairs": [
    {"target": "Wort/Einheit auf ${langInfo.promptLabel}", "gloss": "wörtliche deutsche Übersetzung dieser Einheit"}
  ]
}`;

        // NEU (Bugreport "Übersetzung schlägt fehl"): runTextPromptLenient()
        // statt runTextPrompt() - siehe extractPairsLoosely() oben.
        const result = await runTextPromptLenient(prompt, { temperature: 0.3 }, 'Gemini nicht erreichbar - Mistral eingesprungen (Birkenbihl)');
        const pairs = Array.isArray(result?.pairs)
            ? result.pairs
                .filter(p => p && typeof p.target === 'string' && p.target.trim())
                .map(p => ({ target: p.target.trim(), gloss: typeof p.gloss === 'string' ? p.gloss.trim() : '' }))
            : [];
        return { pairs };
    },

    // NEU (Heft-Generator): erzeugt ein komplettes Übungsheft in EINEM
    // Aufruf - nicht einen pro Blatt. Reiner Text-Aufruf ohne Bild, nach dem
    // Muster von generateBookQuiz() oben.
    //
    //   app.api.generateWorksheets({
    //       story: 'Arche Noah', learningGoal: 'Mengen bis 10',
    //       count: 6, personaId: 'standard', ownText: '...optional...'
    //   })
    //   -> { title, skipped, sheets: [{ heading, taskText, taskExplained,
    //                                    taskType, materials, body,
    //                                    pageDescription, helpSteps,
    //                                    solution }] }
    //
    // Die Feldnamen pro Blatt sind absichtlich dieselben wie im
    // Auslese-Schema für Übungshefte: ein erzeugtes Blatt kann damit direkt
    // durch app.utils.buildPageVariant(sheet, page, 'workbook') laufen und
    // braucht KEINEN zweiten KI-Aufruf zum "Auslesen". "body" ist das, was
    // auf das Blatt gedruckt wird - dafür gibt es beim Auslesen kein
    // Gegenstück, weil dort das Blatt ja schon existiert.
    //
    // Das Konzept nannte die Signatur ursprünglich mit Einzelparametern
    // (story, learningGoal, count, personaId, ownBibleText). Ein Objekt ist
    // hier sicherer: die beiden optionalen Textfelder lassen sich sonst
    // leicht vertauschen.
    async generateWorksheets({ story, learningGoal, count = 6, personaId = app.settings.persona, ownText = null } = {}) {
        const thema = (story || '').trim();
        const ziel = (learningGoal || '').trim();
        if (!thema || !ziel) throw new Error('Thema und Lernziel werden gebraucht');

        const wanted = Math.min(Math.max(parseInt(count, 10) || 1, 1), GENERATOR_MAX_SHEETS);
        const prompt = buildGeneratorPrompt({
            story: thema,
            learningGoal: ziel,
            count: wanted,
            personaId,
            ownText: (ownText || '').trim() || null
        });

        // Etwas mehr Temperatur als beim Buch-Quiz, damit die Blätter eines
        // Hefts sich voneinander unterscheiden - aber deutlich unter 1, weil
        // Aufgabe und Lösung zusammenpassen müssen. maxOutputTokens hoch
        // genug für ein ganzes Heft, sonst bricht die Antwort mittendrin ab.
        const result = await runTextPrompt(prompt, { temperature: 0.5, maxOutputTokens: 8192 });

        const raw = Array.isArray(result?.sheets) ? result.sheets : [];
        const usable = raw.map(normalizeGeneratedSheet).filter(Boolean);
        const sheets = usable.slice(0, wanted);

        if (!sheets.length) {
            console.error('Heft-Generator: unbrauchbare KI-Antwort', result);
            throw new Error('Die KI hat kein brauchbares Heft geliefert');
        }

        // Weniger Blätter als bestellt ist kein Abbruchgrund - ein kürzeres
        // Heft ist besser als gar keins. Damit das aber nicht stumm passiert,
        // kommt die Zahl der aussortierten Blätter mit zurück; der Aufrufer
        // kann sie dem Nutzer zeigen ("2 Blätter waren unbrauchbar").
        // Bewusst gegen "usable" gerechnet, nicht gegen "sheets": liefert das
        // Modell mehr Blätter als bestellt, sind die überzähligen ja nicht
        // unbrauchbar, sondern nur zu viel.
        const skipped = raw.length - usable.length;
        if (skipped) console.warn(`Heft-Generator: ${skipped} unbrauchbare(s) Blatt/Blätter aussortiert`);

        return {
            title: (typeof result?.title === 'string' && result.title.trim())
                ? result.title.trim()
                : `${thema} - ${ziel}`,
            sheets,
            skipped
        };
    },

    // NEU: Kontrolle eines bearbeiteten Übungsblattes. Nutzt dieselben
    // Anbieter-Funktionen wie analyze() (inkl. Mistral-Fallback), nur mit
    // einem anderen Prompt und dem Foto des bearbeiteten Blattes.
    async checkWorkedPage(base64Image, variant, personaId = app.settings.persona) {
        const prompt = buildCheckPrompt(variant, personaId);

        try {
            return await callGeminiAnalyze(prompt, base64Image);
        } catch (geminiError) {
            if (!app.settings.mistralApiKey) throw geminiError;
            console.warn('Gemini-Kontrolle fehlgeschlagen, versuche Mistral-Fallback:', geminiError.message);
            try {
                const result = await callMistralAnalyze(prompt, base64Image);
                app.ui.toast('Gemini nicht erreichbar - Mistral eingesprungen', '🔄');
                return result;
            } catch (mistralError) {
                console.error('Auch Mistral-Fallback fehlgeschlagen:', mistralError);
                throw geminiError;
            }
        }
    }
});
