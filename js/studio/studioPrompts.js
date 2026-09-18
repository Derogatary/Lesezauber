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
    return `Diese Geschichte soll später eventuell veröffentlicht werden (z.B. über Amazon KDP als Self-Publishing) - deshalb gelten diese Regeln IMMER, ohne Ausnahme:
- Erfinde ALLES komplett neu und eigenständig: eigene Figurennamen, eigene Welt, eigene Handlung. Verwende NIEMALS bekannte/reale Figuren, Marken, Buchtitel, Filme, Serien oder deren Stil (auch nicht "im Stil von ...").
- Keine echten, lebenden oder historischen Personen, auch nicht angedeutet.
- Kindgerecht, freundlich, keine Gewalt, keine Angst- oder Horror-Motive, keine diskriminierenden oder anzüglichen Inhalte.
- Text bleibt IMMER reiner Text - keine Formatierungsanweisungen, kein Bild wird hier beschrieben oder erzeugt.`;
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

// NEU: Die fünf in dieser Ausbaustufe umgesetzten Aufgabentypen (siehe
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
Jede Aufgabe braucht außerdem: "instruction" (kurze Aufgabenstellung, wird oben auf dem Blatt gedruckt), "explanation" (dieselbe Aufgabe nochmal in 1-2 einfachen, freundlichen Sätzen erklärt, für ein Kind vorgelesen), "solution" (die richtige Lösung als kurzer Text - bei "frei" ein leerer String, weil freies Schreiben keine Musterlösung hat).`;

Object.assign(app.studio, {
    prompts: {
        guardrailsBlock,
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
        }
    }
});
