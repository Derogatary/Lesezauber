// core.js
// Das gemeinsame "app"-Objekt. Jedes andere Modul importiert dieses eine
// Objekt und hängt seine eigenen Funktionen daran (z.B. app.actions.foo = ...).
// So bleibt "app.irgendwas()" aus dem HTML (onclick="...") unverändert nutzbar,
// obwohl der Code jetzt auf viele Dateien verteilt ist.
export const app = {
    state: {},
    settings: {},
    library: {},
    personas: [],
    dbOps: {},
    nav: {},
    api: {},
    tts: {},
    ui: {},
    actions: {},
    render: {},
    readerUI: {},
    settingsConfig: {},
    utils: {}
};
