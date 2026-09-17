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

Object.assign(app.studio, {
    prompts: {
        guardrailsBlock,

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
