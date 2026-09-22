import { app } from '../core.js';

// ================= SchreibZauber: Prompt-Bausteine =================
// ALLE Prompt-Texte der Werkstatt leben hier (Konzept D.4) - kein anderer
// Ort im Code darf eigene Formulierungen für die KI zusammenbauen, sonst
// laufen die Leitplanken auseinander, sobald eine Stelle vergessen wird.

// NEU (Entscheidung 6, "Nachtrag: Veröffentlichung von Anfang an
// mitdenken", docs/KONZEPT-SchreibZauber.md): Diese Leitplanken müssen von
// Anfang an so streng sein, wie es eine spätere Veröffentlichung (z.B.
// Amazon KDP) verlangt - das lässt sich nicht sauber nachrüsten, wenn
// Stufe 1 erst auf "nur privat" ausgelegt gebaut wird. Deshalb steht dieser
// Block in JEDEM Werkstatt-Prompt, der Inhalte erzeugt, nicht nur optional,
// und wird als eigene Funktion exportiert, damit die späteren Werktyp-Pfade
// (Bilderbuch Stufe 2+3, Comic Stufe 5, Arbeitsheft Stufe 4) ihn 1:1
// übernehmen können, statt ihn erneut zu formulieren.
function guardrailsBlock() {
    // FIX: bisher wurden AUSNAHMSLOS alle bekannten Figuren verboten - dadurch
    // hat die KI z.B. aus einer gewünschten biblischen Figur ("Samuel")
    // eigenmächtig eine erfundene ("Mio") gemacht, obwohl daran urheberrechtlich
    // gar nichts zu schützen ist. Die eigentliche Gefahr für eine spätere
    // Veröffentlichung sind fremde, geschützte WERKE (Marken, aktuelle Bücher/
    // Filme/Serien) - gemeinfreie Stoffe (Märchen, Sagen, Mythologie, religiöse
    // Geschichten) sind dagegen schon immer frei nacherzählbar und deshalb
    // ausdrücklich erlaubt, wenn das Thema sie nennt.
    return `Diese Geschichte soll später eventuell veröffentlicht werden (z.B. über Amazon KDP als Self-Publishing) - deshalb gelten diese Regeln IMMER, ohne Ausnahme:
- Verwende NIEMALS urheberrechtlich oder markenrechtlich geschützte Figuren, Welten, Buchtitel, Filme oder Serien (auch nicht "im Stil von ..."), also keine Figuren aus aktuellen, noch geschützten Kinderbüchern/Comics/Filmen/Marken.
- Gemeinfreie Stoffe sind dagegen ausdrücklich erlaubt, wenn das Thema sie nennt: klassische Volksmärchen (z.B. Brüder Grimm), Sagen, Fabeln, Mythologie sowie biblische/religiöse Geschichten und Figuren (z.B. "Samuel" oder "Rotkäppchen" dürfen beim Namen bleiben). Erzähle sie in eigenen Worten nach, ohne der bekannten Geschichte zu widersprechen.
- Nennt das Thema einen Figurennamen (ob erfunden oder gemeinfrei), behalte GENAU diesen Namen bei - erfinde ihn nicht eigenmächtig um.
- Wird KEIN bekannter Stoff genannt, erfinde ALLES komplett neu und eigenständig: eigene Figurennamen, eigene Welt, eigene Handlung.
- Keine echten, lebenden Personen, auch nicht angedeutet. Historische Persönlichkeiten dürfen sachlich vorkommen, wenn das Thema ausdrücklich von ihnen handelt (z.B. eine kindgerechte Biografie) - nicht als beliebig verwendbare Nebenfigur in einer sonst erfundenen Geschichte.
- Kindgerecht, freundlich, keine Gewalt, keine Angst- oder Horror-Motive, keine diskriminierenden oder anzüglichen Inhalte.
- Text bleibt IMMER reiner Text - keine Formatierungsanweisungen, kein Bild wird hier beschrieben oder erzeugt.`;
}

// NEU (Nutzerwunsch: "was landet im Prompt" - Bild-Prompts hatten bisher
// 1:1 denselben guardrailsBlock() wie die Text-Generierung bekommen, siehe
// js/studio/imageSource.js buildPrompt(). Das ist bei Gemini (ein
// Sprachmodell mit Bildausgabe, kann Meta-Regeln als solche erkennen und
// ignorieren) wohl kein Problem, bei Pollinations (reines Text-zu-Bild-
// Diffusionsmodell OHNE Sprachverständnis - jedes Wort wird als visueller
// Hinweis gewichtet, nicht als Anweisung gelesen) aber vermutlich eher
// Störung: Wörter wie "Urheberrecht", "Amazon KDP" oder der Satz "Text
// bleibt reiner Text - kein Bild wird hier erzeugt" haben im Bild nichts zu
// suchen und verdünnen nur die eigentliche Bildbeschreibung. Deshalb ein
// EIGENER, kurzer Satz nur für Bild-Prompts statt des kompletten Blocks -
// der einzige Teil aus guardrailsBlock(), der für ein BILD (statt Text)
// überhaupt relevant ist (keine geschützten Figuren/Werke im Bild
// nachzeichnen), der Rest (gemeinfreie Stoffe, Namen beibehalten, Text
// bleibt Text) betrifft nur die Geschichte, nicht die Illustration.
function imageGuardrailsLine() {
    return 'Keine urheber- oder markenrechtlich geschützten Figuren, Welten oder Logos zeichnen - auch nicht "im Stil von ..." einer bekannten Marke/eines bekannten Werks.';
}

// NEU: Alters-/Lesestufenregeln. "Erstlesebuch" ist laut Konzept A.2 kein
// eigener Werktyp, sondern ein Regelprofil auf dem Bilderbuch - genau das
// bildet dieser Block ab, statt eine eigene Textgenerierung zu brauchen.
function readingLevelRule(readingLevel) {
    if (readingLevel === 'erstleser') {
        return 'Das Kind liest MIT (Erstleser/Leseanfänger): sehr kurze, einfache Sätze, EIN Satz pro Zeile/Gedanke, kein Nebensatz, einfacher Grundwortschatz, keine Fremdwörter.';
    }
    if (readingLevel === 'selbstleser') {
        return 'Das Kind liest ALLEIN (sicherer Leser): etwas anspruchsvollere, aber trotzdem klare Sätze sind erlaubt, gelegentlich ein kurzer Nebensatz.';
    }
    return 'Ein Erwachsener liest VOR (Vorlesealter): Sätze dürfen normal fließen, aber bildhaft und rhythmisch klingen, wie ein klassisches Vorlesebuch.';
}

const AGE_LABEL = { '3-5': '3 bis 5 Jahre', '6-7': '6 bis 7 Jahre', '8-10': '8 bis 10 Jahre' };

// NEU (Ausbaustufe 4 - Arbeitsheft, docs/KONZEPT-SchreibZauber.md TEIL C.4):
// Klassenstufen-/Fach-Label für die Prompts. Liegt hier statt in
// worksheet.js, weil ALLE Prompt-Textbausteine an einem Ort leben sollen
// (Kommentar oben in dieser Datei) - worksheet.js selbst baut keine
// Formulierungen zusammen, nur Datenstrukturen.
const GRADE_LABEL = {
    vorschule: 'Vorschule (5-6 Jahre, noch vor der Einschulung)',
    '1': '1. Klasse Grundschule',
    '2': '2. Klasse Grundschule',
    '3': '3. Klasse Grundschule',
    '4': '4. Klasse Grundschule'
};
const SUBJECT_LABEL = {
    deutsch: 'Deutsch', mathematik: 'Mathematik', sachunterricht: 'Sachunterricht', frei: 'fächerübergreifend/frei'
};

// NEU: Die in dieser Ausbaustufe umgesetzten Aufgabentypen (inzwischen sechs, Suchsel kam später dazu) (siehe
// js/studio/worksheet.js, TASK_TYPES - dort auch die restlichen vier als
// "kommt später" markiert). Nur EIN Ort beschreibt der KI das exakte
// JSON-Schema pro Typ, damit generateChapterTasks() zuverlässig parsen
// kann - kein zweiter Prompt darf eigene Feldnamen erfinden.
const TASK_SCHEMA_HINT = `Wähle für jede Aufgabe GENAU EINEN dieser Typen und halte dich EXAKT an das jeweilige JSON-Feld "data":
- "luecke" (Lückentext): data = {"sentence": "Satz mit ___ als Lücke.", "wordBank": ["wort1","wort2","wort3"], "correctWord": "wort1"}
- "ankreuzen" (Ankreuzen): data = {"question": "Frage?", "options": ["Antwort A","Antwort B","Antwort C"], "correctIndex": 0}
- "rechnen" (Rechenaufgaben): data = {"problems": ["3 + 4 = __","7 - 2 = __"], "answers": [7,5]} (gleich viele Einträge in problems und answers)
- "zuordnen" (Zuordnen): data = {"left": ["Begriff1","Begriff2","Begriff3"], "right": ["Passt2","Passt3","Passt1"], "matches": [2,0,1]} (matches[i] ist der Index in "right", der zu left[i] passt - right darf NICHT in derselben Reihenfolge wie die Lösung stehen, sonst ist die Aufgabe zu leicht)
- "frei" (Frei schreiben): data = {"prompt": "Schreibimpuls als Frage/Satzanfang.", "lines": 4} (lines = Anzahl Schreiblinien, 3-6)
- "suchsel" (Suchsel/Wörterrätsel): data = {"words": ["HUND","KATZE","MAUS"]} (3-6 einzelne Wörter ohne Leerzeichen, je 3-10 Buchstaben, passend zum Seitenziel - das Buchstabengitter baut die App selbst, also KEIN Gitter mitliefern; "solution" darf ein leerer String sein)
Jede Aufgabe braucht außerdem: "instruction" (kurze Aufgabenstellung, wird oben auf dem Blatt gedruckt), "explanation" (dieselbe Aufgabe nochmal in 1-2 einfachen, freundlichen Sätzen erklärt, für ein Kind vorgelesen), "solution" (die richtige Lösung als kurzer Text - bei "frei" ein leerer String, weil freies Schreiben keine Musterlösung hat).`;

// NEU: "Master-Prompt" fürs Komplett-Setup (Stufe 1) - Bugreport: "Es fehlt
// eine Funktion, um alle Eingabefelder strukturiert vorzubefüllen... ein
// Master-Prompt, der das Ergebnis für jedes Eingabefeld in einem eigenen
// Codeblock ausgibt, damit die Werte manuell reinkopiert werden können."
// Bewusst NUR Stufe 1 (Idee + die drei Verlagsfelder aus studioMetaPages.js)
// - Bauplan (Stufe 2) ist eine Format-/Zahlenentscheidung, keine
// Kreativaufgabe, und Geschichte (Stufe 3) hat mit "✨ Von der KI schreiben
// lassen" bereits einen eigenen Ein-Klick-Weg MIT der App-eigenen API - ein
// externer Copy-Paste-Umweg über Dutzende Doppelseiten wäre dort nur
// umständlicher, nicht hilfreicher. Nutzt denselben "Prompt kopieren, in
// einem KI-Chat einfügen, Ergebnis zurückkopieren"-Weg wie schon bei den
// Bildern (siehe app.studio.imageSource.copyPrompt(),
// docs/KONZEPT-Bildquellen.md) - kostet dadurch nichts, auch ohne eigenen
// API-Key nutzbar.
function buildMasterSetupPrompt(draft) {
    const b = draft.brief;
    const given = [];
    if (draft.title) given.push(`Arbeitstitel: ${draft.title}`);
    if (b.topic) given.push(`Thema: ${b.topic}`);
    if (b.tone) given.push(`Ton/Stimmung: ${b.tone}`);
    if (b.message) given.push(`Botschaft: ${b.message}`);
    if (draft.seriesName) given.push(`Reihe: ${draft.seriesName}`);

    return `Du hilfst beim Komplett-Setup für ein selbst geschriebenes Kinderbuch (App "LeseZauber Pro", Bereich "SchreibZauber").
Zielgruppe: ${AGE_LABEL[b.audienceAge] || b.audienceAge}. ${readingLevelRule(b.readingLevel)}
${given.length ? `Bereits festgelegt (bitte unverändert übernehmen):\n${given.join('\n')}` : 'Noch nichts festgelegt - erfinde alles frei.'}

${guardrailsBlock()}

Fülle ALLE folgenden Felder aus (auch die oben schon festgelegten unverändert übernehmen). Antworte GENAU in diesem Format, jedes Feld in seinem eigenen Codeblock, sonst nichts drumherum:

\`\`\`titel
Ein kurzer, kindgerechter Buchtitel
\`\`\`

\`\`\`thema
Worum es geht, 1-2 Sätze
\`\`\`

\`\`\`ton
Ton/Stimmung in 2-4 Worten
\`\`\`

\`\`\`botschaft
Was am Ende hängenbleiben soll, 1 Satz
\`\`\`

\`\`\`autor
Kurzer, erfundener Autoren-Steckbrief in Ich-Form, 1-2 Sätze
\`\`\`

\`\`\`verlag
Ein erfundener, freundlicher Kleinverlag-Name (leer lassen, wenn Selbstverlag besser passt)
\`\`\`

\`\`\`klappentext
Anreißer für die Buchrückseite, 2-3 Sätze, macht neugierig ohne das Ende zu verraten
\`\`\``;
}

// NEU: Import-Funktion, Gegenstück zu buildMasterSetupPrompt() oben
// (Nutzerwunsch: "wenn ich dich oder eine andere KI außerhalb der
// Gemini-API frage... die alle Felder abdeckt, One-Click"). Liest die
// Antwort einer BELIEBIGEN KI - nicht zwingend exakt Gemini, der
// Master-Prompt lässt sich ja in jedem KI-Chat einfügen - und versucht,
// die sieben Stufe-1-Felder herauszulesen:
// 1. zuerst über die im Prompt verlangten Codeblöcke (```titel ... ```),
// 2. als Rückfall über einfache "Titel: ..."-Zeilen, falls die
//    aufrufende KI die Codeblock-Anweisung ignoriert hat (kommt vor,
//    z.B. bei einer KI, die stattdessen eine Aufzählung liefert).
// Liefert NUR tatsächlich gefundene Felder zurück - ein nicht erkanntes
// Feld bleibt im Formular unangetastet, statt es mit einem leeren
// String zu überschreiben.
const MASTER_FIELD_KEYS = {
    titel: 'title', thema: 'topic', ton: 'tone', botschaft: 'message',
    autor: 'authorBio', verlag: 'publisher', klappentext: 'blurb'
};

const MASTER_FIELD_LABEL_FALLBACKS = {
    title: /^(?:Arbeitstitel|Titel)\s*[:\-]\s*(.+)$/im,
    topic: /^Thema\s*[:\-]\s*(.+)$/im,
    tone: /^Ton(?:\/Stimmung)?\s*[:\-]\s*(.+)$/im,
    message: /^Botschaft\s*[:\-]\s*(.+)$/im,
    authorBio: /^Autor(?:en-?Steckbrief)?\s*[:\-]\s*(.+)$/im,
    publisher: /^Verlag\s*[:\-]\s*(.+)$/im,
    blurb: /^Klappentext\s*[:\-]\s*(.+)$/im
};

function parseMasterSetupResponse(rawText) {
    const text = String(rawText || '');
    const found = {};

    const fenceRe = /```\s*(\w+)\s*\n([\s\S]*?)```/g;
    let m;
    while ((m = fenceRe.exec(text))) {
        const key = MASTER_FIELD_KEYS[m[1].trim().toLowerCase()];
        if (key && !found[key] && m[2].trim()) found[key] = m[2].trim();
    }

    // NEU: Rückfall greift auf eine von Markdown-Zierde befreite Fassung
    // zu - manche KIs antworten trotz Anweisung mit "**Titel:** ..." statt
    // dem verlangten Codeblock. Entfernt führende Aufzählungs-/Überschrift-
    // zeichen (-, *, #, >) UND alle "**"-Fettungen, damit "**Titel:**" wie
    // das einfache "Titel:" oben erkannt wird - ohne diesen Schritt müsste
    // jedes Label-Regex selbst mit beliebig vielen Sternchen umgehen.
    const cleaned = text.split('\n').map(line => line.replace(/^[\s>#*\-]+/, '').replace(/\*\*/g, '')).join('\n');
    Object.entries(MASTER_FIELD_LABEL_FALLBACKS).forEach(([key, re]) => {
        if (found[key]) return;
        const match = re.exec(cleaned);
        if (match && match[1].trim()) found[key] = match[1].trim();
    });

    return found;
}

Object.assign(app.studio, {
    prompts: {
        guardrailsBlock,
        imageGuardrailsLine,
        buildMasterSetupPrompt,
        parseMasterSetupResponse,
        GRADE_LABEL, SUBJECT_LABEL,

        // Stufe 4' – Progression: Kapitelfolge vom Leichten zum Schweren
        // vorschlagen, inkl. Wiederholungsseiten (Konzept A.4 #3
        // "Spiralprinzip"). Liefert nur Ziele/Struktur, NOCH keine
        // einzelnen Aufgaben - die kommen erst in Stufe 5' pro Kapitel,
        // damit ein einzelnes Kapitel neu erzeugt werden kann, ohne das
        // ganze Heft zu verwerfen (gleiches Kostendenken wie beim
        // Bilderbuch-Storyboard, Konzept C.2 "Warum Stufe 5 vor Stufe 6").
        buildProgressionPrompt(worksheet) {
            return `Du bist eine erfahrene Grundschul-Redakteurin/ein erfahrener Grundschul-Redakteur für Arbeitshefte.
Klassenstufe: ${GRADE_LABEL[worksheet.grade] || worksheet.grade}. Fach: ${SUBJECT_LABEL[worksheet.subject] || worksheet.subject}.
Lernziel: ${worksheet.goal}

${guardrailsBlock()}

Schlage eine Kapitelfolge für ein kompaktes Übungsheft zu diesem Lernziel vor: 3 bis 5 Kapitel, vom Leichten zum Schwierigeren (Spiralprinzip). Jedes Kapitel hat 2 bis 4 Seiten. Baue an passender Stelle mindestens eine reine Wiederholungsseite ein (kind: "wiederholung"), die schon Gelerntes noch einmal übt statt Neues einzuführen.

Antworte AUSSCHLIESSLICH in validem JSON, ohne Markdown-Blöcke, exakt in diesem Format:
{
  "chapters": [
    {
      "title": "Kurzer Kapiteltitel",
      "goal": "Das Kind kann ... (konkret, messbar, zu diesem Kapitel)",
      "pages": [
        {"goal": "Kurze Beschreibung, was diese Seite übt", "kind": "neu"}
      ]
    }
  ]
}`;
        },

        // Stufe 5' – Aufgabenbaukasten: für EIN Kapitel die Aufgaben aller
        // seiner Seiten in einem Aufruf erzeugen (statt pro Seite einzeln -
        // spart Aufrufe, ein Kapitel hat ohnehin nur 2-4 Seiten).
        buildChapterTasksPrompt(worksheet, chapter) {
            const pageList = chapter.pages.map((p, i) =>
                `${i + 1}. ${p.goal || 'freie Übung'}${p.kind === 'wiederholung' ? ' (Wiederholung - schon Bekanntes üben)' : ''}`
            ).join('\n');

            return `Du bist eine erfahrene Grundschul-Redakteurin/ein erfahrener Grundschul-Redakteur für Arbeitshefte.
Klassenstufe: ${GRADE_LABEL[worksheet.grade] || worksheet.grade}. Fach: ${SUBJECT_LABEL[worksheet.subject] || worksheet.subject}.
Gesamtlernziel des Hefts: ${worksheet.goal}
Kapitel "${chapter.title}" - Kapitelziel: ${chapter.goal}

${guardrailsBlock()}

Erzeuge für JEDE der folgenden ${chapter.pages.length} Seiten 1 bis 3 Aufgaben, die genau zum Seitenziel passen:
${pageList}

${TASK_SCHEMA_HINT}

Antworte AUSSCHLIESSLICH in validem JSON, ohne Markdown-Blöcke, mit GENAU ${chapter.pages.length} Einträgen in "pages" (in derselben Reihenfolge wie oben):
{
  "pages": [
    {"tasks": [{"type": "luecke", "instruction": "...", "explanation": "...", "data": {...}, "solution": "..."}]}
  ]
}`;
        },

        // Differenzierung (Konzept C.4): dieselbe Aufgabe auf einem anderen
        // Niveau (leichter/schwerer) neu formulieren, OHNE den Aufgabentyp
        // zu wechseln - sonst würde aus einer Rechenaufgabe plötzlich ein
        // Lückentext, nur weil das Kind auf ⭐⭐⭐ tippt.
        buildTaskLevelPrompt(worksheet, chapter, task, targetLevel) {
            const levelText = targetLevel === 1
                ? 'LEICHTER (⭐ Basis) - einfacher, kleinere Zahlen/kürzere Wörter, mehr Hilfe in "explanation"'
                : 'SCHWERER (⭐⭐⭐ Fordern) - etwas anspruchsvoller, aber immer noch altersgerecht für diese Klassenstufe';

            return `Du bearbeitest EINE bereits bestehende Übungsaufgabe für ein Arbeitsheft.
Klassenstufe: ${GRADE_LABEL[worksheet.grade] || worksheet.grade}. Kapitelziel: ${chapter.goal}
Bisherige Aufgabe (Aufgabentyp bleibt "${task.type}", NUR Inhalt/Schwierigkeit ändert sich): "${task.instruction}"

${guardrailsBlock()}

Formuliere GENAU DIESELBE ART Aufgabe (Typ "${task.type}") neu, aber Niveau ${levelText}.

${TASK_SCHEMA_HINT}

Antworte AUSSCHLIESSLICH in validem JSON, ohne Markdown-Blöcke, exakt in diesem Format (nur die eine Aufgabe, kein "type"-Feld nötig, der Typ bleibt "${task.type}"):
{"instruction": "...", "explanation": "...", "data": {...}, "solution": "..."}`;
        },

        // Stufe 3 – Geschichte: Manuskript UND Text-Breakdown auf
        // Doppelseiten in einem KI-Aufruf (Konzept C.2, Zeile "3. Die
        // Geschichte"). Jede Doppelseite bekommt zusätzlich ihren
        // Umblätter-Moment (Page-Turn-Hook, Konzept A.1 #5) mitgeliefert.
        buildManuscriptPrompt(brief, spec) {
            return `Du bist eine erfahrene Kinderbuch-Autorin/ein erfahrener Kinderbuch-Autor.
Zielgruppe: ${AGE_LABEL[brief.audienceAge] || brief.audienceAge}. ${readingLevelRule(brief.readingLevel)}
Sprache: Deutsch.
Thema: ${brief.topic}
${brief.tone ? `Ton/Stimmung: ${brief.tone}` : ''}
${brief.message ? `Das soll am Ende hängenbleiben: ${brief.message}` : ''}

${guardrailsBlock()}

Schreibe eine vollständige Bilderbuch-Geschichte mit GENAU ${spec.storySpreads} Doppelseiten und insgesamt ca. ${spec.wordBudget} Wörtern (also ca. ${Math.round(spec.wordBudget / spec.storySpreads)} Wörter pro Doppelseite, kurze Sätze). Jede Doppelseite außer der letzten endet mit einem kleinen Zug zum Weiterblättern (eine Frage, eine Überraschung, ein Cliffhanger) - das ist die wichtigste handwerkliche Regel des Bilderbuchs.

Antworte AUSSCHLIESSLICH in validem JSON, ohne Markdown-Blöcke, exakt in diesem Format mit GENAU ${spec.storySpreads} Einträgen in "spreads":
{
  "title": "Ein kurzer, kindgerechter Buchtitel",
  "spreads": [
    {"text": "Der Text dieser Doppelseite.", "pageTurnHook": "Kurze Notiz, WAS hier zum Weiterblättern reizt (nicht Teil des Vorlesetexts) - bei der letzten Doppelseite leerer String."}
  ]
}`;
        },

        // NEU (Ausbaustufe 5, überarbeitet nach Nutzer-Feedback "sonst ist es
        // einfach ein Bilderbuch") – Stufe 3 beim Comic: ECHTES
        // Panel-Skript statt EINER Szene pro Seite. Jede Seite hat 1-4
        // Panels (Konzept C.1 "Script->Panels->Lettering"), jedes Panel mit
        // eigener Bildbeschreibung UND eigenen Dialogzeilen - erst DAS
        // erzeugt später eine echte Panel-Anordnung (siehe
        // js/studio/studioComicPanels.js) statt einer bloßen Bilderreihe.
        buildComicScriptPrompt(brief, spec) {
            return `Du bist eine erfahrene Comic-Szenaristin/ein erfahrener Comic-Szenarist für Kinder (amerikanisch/europäischer Comic-Stil, keine Manga-/Webtoon-Konventionen).
Zielgruppe: ${AGE_LABEL[brief.audienceAge] || brief.audienceAge}. ${readingLevelRule(brief.readingLevel)}
Sprache: Deutsch.
Thema: ${brief.topic}
${brief.tone ? `Ton/Stimmung: ${brief.tone}` : ''}
${brief.message ? `Das soll am Ende hängenbleiben: ${brief.message}` : ''}

${guardrailsBlock()}

Schreibe ein vollständiges Comic-Skript mit GENAU ${spec.storySpreads} Seiten. JEDE Seite besteht aus 1 bis 4 Panels (die meisten Seiten 1-3 Panels - mehr Panels nur bei viel Dialog oder schneller Bewegung, ein einzelnes großes Panel für einen wichtigen/ruhigen Moment). Für JEDES Panel: eine kurze Bildbeschreibung (wer/was/wo, Kameraperspektive/Ausschnitt - KEIN Bild-Prompt, nur die Idee), 0 bis 3 kurze Sprechblasen-Zeilen (Dialog, keine erzählende Prosa - kurze, natürlich klingende Sätze) UND optional EIN kurzes Geräuschwort (Manga-/Comic-Lautmalerei wie "BUMM", "PATSCH", "ZOOM" - NUR bei einer Aktion/einem Geräusch, die meisten Panels brauchen keins - leerer String, wenn nicht passend). Halte dich an feste, wiederkehrende Figurennamen über das ganze Skript hinweg - erfinde nicht bei jeder Seite neue Namen für dieselbe Figur. Jede Seite außer der letzten endet mit einem kleinen Zug zum Weiterblättern (eine Frage, eine Überraschung, ein Cliffhanger).

Antworte AUSSCHLIESSLICH in validem JSON, ohne Markdown-Blöcke, exakt in diesem Format mit GENAU ${spec.storySpreads} Einträgen in "spreads":
{
  "title": "Ein kurzer, kindgerechter Comic-Titel",
  "spreads": [
    {
      "pageTurnHook": "Kurze Notiz, WAS hier zum Weiterblättern reizt - bei der letzten Seite leerer String.",
      "panels": [
        {
          "visual": "Kurze Bildidee: wer/was/wo, Perspektive/Ausschnitt",
          "soundEffect": "Geräuschwort in Großbuchstaben, oder leerer String \\"\\"",
          "dialogue": [
            {"speaker": "Name der sprechenden Figur", "line": "Was sie sagt, kurz und natürlich."}
          ]
        }
      ]
    }
  ]
}`;
        },

        // Stufe 4 – Die Figuren: aus dem bereits geschriebenen Manuskript
        // Steckbrief-Vorschläge ableiten (Konzept D.4 "suggestCharacters").
        // Liefert reine Textvorschläge - das Figurenblatt-BILD entsteht
        // getrennt danach über die Bildquellen-Schicht (studioCharacters.js),
        // nicht hier.
        buildSuggestCharactersPrompt(project) {
            // NEU (Ausbaustufe 5): beim Comic steckt die Handlung in den
            // Dialogzeilen (balloons), nicht in spread.text - app.studio.
            // spreadSceneHint() liefert für beide Werktypen die richtige
            // Quelle (siehe js/studio/studioCore.js).
            const manuscript = project.spreads.map(s => app.studio.spreadSceneHint(s)).filter(Boolean).join('\n');
            return `Du bist eine erfahrene Kinderbuch-Redakteurin/ein erfahrener Kinderbuch-Redakteur und liest das folgende bereits fertige Manuskript einer Kinderbuch-Geschichte:

"""
${manuscript}
"""

${guardrailsBlock()}

Leite daraus Steckbriefe für die wichtigsten (maximal 4) Figuren ab, die für ein Figurenblatt (Character Sheet) gebraucht werden - damit sie auf jeder Doppelseite gleich aussehen.

Antworte AUSSCHLIESSLICH in validem JSON, ohne Markdown-Blöcke, exakt in diesem Format:
{
  "characters": [
    {
      "name": "Name der Figur",
      "role": "kurze Rolle, z.B. Hauptfigur/bester Freund",
      "age": "Altersangabe, kindgerecht, z.B. \\"5 Jahre\\" oder \\"weiß nicht, ist ein Fuchs\\"",
      "kind": "Art, z.B. Kind, Tier, Fantasiewesen",
      "look": "Aussehen in 1-2 Sätzen (Körperbau, Haare/Fell, Gesicht)",
      "clothing": "Kleidung/Ausstattung in 1-2 Sätzen",
      "colors": ["#hex1", "#hex2", "#hex3"],
      "quirk": "EINE unverwechselbare Eigenart, an der man die Figur sofort erkennt"
    }
  ]
}`;
        },

        // NEU: Direkter API-Weg fürs Stufe-1-Ausfüllen, als Ergänzung zum
        // Master-Prompt oben (Bugreport/Wunsch: "Ausfüllfunktion durch API...
        // man gibt einfach ein Thema ein und KI füllt die Felder aus, wie
        // beim Bildvorschlag"). Bewusst ZUSÄTZLICH, nicht als Ersatz - der
        // Master-Prompt bleibt der kostenlose Weg ganz ohne eigenen API-Key
        // (siehe Begründung oben), dieser hier ist der bequeme Ein-Klick-Weg
        // MIT der App-eigenen API, gleiches Muster wie suggestSketches().
        // Braucht zwingend einen Thema-Text (das EINE Pflichtfeld, siehe
        // studioTopic) - Alter/Lesesituation werden respektiert, nicht neu
        // vorgeschlagen, weil das bewusste Nutzer-Entscheidungen sind, keine
        // Kreativaufgabe der KI.
        buildSuggestBriefPrompt(topic, audienceAge, readingLevel) {
            return `Du hilfst beim Ausfüllen der Rahmendaten für ein selbst geschriebenes Kinderbuch (App "LeseZauber Pro", Bereich "SchreibZauber").
Zielgruppe: ${AGE_LABEL[audienceAge] || audienceAge}. ${readingLevelRule(readingLevel)}
Thema (bereits festgelegt, unverändert übernehmen, nicht umschreiben): ${topic}

${guardrailsBlock()}

Schlage dazu passend vor: einen kurzen, kindgerechten Buchtitel, Ton/Stimmung (2-4 Worte), eine Botschaft (was am Ende hängenbleiben soll, 1 Satz), einen kurzen erfundenen Autoren-Steckbrief in Ich-Form (1-2 Sätze), einen erfundenen, freundlichen Kleinverlag-Namen (leerer String, wenn Selbstverlag besser passt) und einen Klappentext für die Buchrückseite (2-3 Sätze, macht neugierig ohne das Ende zu verraten).

Antworte AUSSCHLIESSLICH in validem JSON, ohne Markdown-Blöcke, exakt in diesem Format:
{
  "title": "...", "tone": "...", "message": "...",
  "authorBio": "...", "publisher": "...", "blurb": "..."
}`;
        },

        // Stufe 5 – Das Daumenkino: Bildideen (Stichworte, KEIN
        // ausformulierter Bild-Prompt) für jede Doppelseite vorschlagen
        // (Konzept D.4 "suggestSketches" - AUSDRÜCKLICH ohne Bildaufruf,
        // reiner Text). Die Doppelseite selbst entscheidet mit dem
        // Storyboard-Knopf "🤖 Bildideen vorschlagen", ob sie übernommen wird.
        buildSuggestSketchesPrompt(project) {
            const spreadsList = project.spreads.map((s, i) =>
                `${i + 1}. ${app.studio.spreadSceneHint(s) || '(noch kein Text)'}`).join('\n');
            const characterList = project.characters.length
                ? project.characters.map(c => `${c.name}: ${c.sheetText}`).join(' | ')
                : '(noch keine Figuren angelegt)';

            return `Du bist eine Illustratorin/ein Illustrator, die/der ein Storyboard (Daumenkino) für ein Kinderbuch skizziert - noch OHNE ein einziges fertiges Bild zu malen.

Figuren: ${characterList}

Doppelseiten der Geschichte:
${spreadsList}

${guardrailsBlock()}

Schlage für JEDE Doppelseite EINE kurze Bildidee als Stichwort vor (max. 20 Wörter): welche Figur(en) tun WAS, WO, mit welcher Perspektive/Komposition. Kein ausformulierter Bild-Prompt, nur die Idee - der Bild-Prompt entsteht später automatisch daraus.

Antworte AUSSCHLIESSLICH in validem JSON, ohne Markdown-Blöcke, exakt in diesem Format mit GENAU ${project.spreads.length} Einträgen:
{
  "sketches": ["Bildidee für Doppelseite 1", "Bildidee für Doppelseite 2"]
}`;
        }
    }
});
