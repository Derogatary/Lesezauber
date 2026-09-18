// core.js
// Das gemeinsame "app"-Objekt. Jedes andere Modul importiert dieses eine
// Objekt und hängt seine eigenen Funktionen daran (z.B. app.actions.foo = ...).
// So bleibt "app.irgendwas()" aus dem HTML (onclick="...") unverändert nutzbar,
// obwohl der Code jetzt auf viele Dateien verteilt ist.
export const app = {
    state: {},
    settings: {},
    library: {},
    // NEU: gesammelte Vokabeln (Wort -> Emoji), profilübergreifend
    vocabulary: {},
    personas: [],
    dbOps: {},
    nav: {},
    api: {},
    tts: {},
    // NEU: KI-Stimmen (Anbieter-Liste + Wiedergabe), siehe ttsProviders.js
    ttsProviders: {},
    ttsNeural: {},
    ui: {},
    actions: {},
    render: {},
    // NEU: Lernfortschritt + Belohnungen (Heft-/Seiten-Häkchen pro Kind-Profil)
    progress: {},
    readerUI: {},
    settingsConfig: {},
    utils: {},
    // NEU: rein lokale Kosten-/Verbrauchsanzeige (js/costMeter.js) - zaehlt
    // tatsaechlich synthetisierte TTS-Zeichen und Gemini-Textaufrufe mit.
    costMeter: {},
    // NEU: Canvas-Renderer + Zeitplan ("Regie") für den Video-Export,
    // Weg B (siehe docs/KONZEPT-Video.md). Eigener Namespace statt
    // app.render.*, weil hier NICHTS ins DOM geschrieben wird - es wird
    // ausschließlich auf einen Canvas gezeichnet, und dieselben Funktionen
    // müssen später auch ohne sichtbare Ansicht (beim Kodieren) laufen.
    cinema: {},
    // NEU: reserviert für den Schreib-/Generierungs-Bereich "SchreibZauber"
    // (js/studio/*). Steht hier, damit die Studio-Module denselben
    // Namespace-Regeln folgen wie alles andere - siehe
    // docs/KONZEPT-SchreibZauber.md.
    studio: {}
};
