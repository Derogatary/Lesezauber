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
    utils: {}
};
