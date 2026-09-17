import { app } from './core.js';

Object.assign(app.settings, {
    apiKey: localStorage.getItem('lz_api_key') || '',
    mistralApiKey: localStorage.getItem('lz_mistral_key') || '',
    persona: localStorage.getItem('lz_persona') || 'standard',
    voiceUri: localStorage.getItem('lz_voice') || '',
    backgroundPregenEnabled: localStorage.getItem('lz_bg_pregen') === '1',
    // NEU: einstellbare Vorlesegeschwindigkeit (0.5 = langsam, 1.5 = schnell)
    speechRate: parseFloat(localStorage.getItem('lz_speech_rate') || '0.9'),
    // NEU: einstellbare Farbe fuer die Wort-Hervorhebung beim Vorlesen
    highlightColor: localStorage.getItem('lz_highlight_color') || '#fde047',
    // NEU: zweiseitiges Layout (Bild links, Text rechts) - nur Option,
    // wirkt sich per CSS ohnehin erst ab Tablet-Breite aus (siehe style.css)
    twoPageLayout: localStorage.getItem('lz_two_page_layout') === '1',
    // NEU: Ken-Burns-Effekt + Kreuzblende im Vollbild-Vorlese-Modus
    // ("Kino-Modus", siehe docs/KONZEPT-Video.md Abschnitt 3, Stufe 1).
    // Standardmäßig an, abschaltbar (z.B. auf schwächeren Geräten).
    focusEffectsEnabled: localStorage.getItem('lz_focus_effects') !== '0',

    // NEU: KI-Stimmen statt der maschinellen Gerätestimme.
    // 'device' = wie bisher die eingebaute Stimme (Standard, damit sich für
    // niemanden ungefragt etwas ändert und ohne Zusatz-Key alles läuft).
    // FIX: seit den Profil-Rollen ist die Stimme pro Profil gespeichert
    // (app.profileTtsMap, siehe js/profiles.js) statt global. Die beiden
    // Werte hier dienen nur noch als Migrations-Ausgangswert (einmalig für
    // alle Profile übernommen) und werden direkt danach von
    // app.utils.syncActiveProfileTtsSettings() überschrieben.
    ttsProvider: localStorage.getItem('lz_tts_provider') || 'device',
    // Pro Anbieter eine eigene Stimme merken - die IDs sind nicht
    // untereinander austauschbar.
    ttsVoices: (() => {
        try {
            return JSON.parse(localStorage.getItem('lz_tts_voices') || '{}');
        } catch (e) {
            console.error('Gespeicherte Stimmen-Auswahl unlesbar:', e);
            return {};
        }
    })(),
    // Eigene/geklonte Stimmen, die aus dem ElevenLabs-Konto geladen wurden
    elevenVoices: (() => {
        try {
            return JSON.parse(localStorage.getItem('lz_eleven_voices') || '[]');
        } catch (e) {
            return [];
        }
    })(),
    // NEU: dasselbe für Speechify (5. Anbieter, siehe ttsProviders.js)
    speechifyVoices: (() => {
        try {
            return JSON.parse(localStorage.getItem('lz_speechify_voices') || '[]');
        } catch (e) {
            return [];
        }
    })(),
    googleTtsKey: localStorage.getItem('lz_google_tts_key') || '',
    elevenLabsKey: localStorage.getItem('lz_eleven_key') || '',
    openAiKey: localStorage.getItem('lz_openai_key') || '',
    speechifyKey: localStorage.getItem('lz_speechify_key') || '',
    // Erzeugte Sprachaufnahmen behalten: dieselbe Seite ein zweites Mal
    // vorlesen kostet dann kein Kontingent mehr. Standard: an.
    ttsCacheEnabled: localStorage.getItem('lz_tts_cache') !== '0',
    // Sprechanweisung aus der Erzähler-Persona mitgeben (nur Gemini/OpenAI)
    ttsPersonaStyle: localStorage.getItem('lz_tts_persona_style') !== '0'
});

Object.assign(app.state, {
    currentView: 'lib',
    currentBookId: null,
    currentPageIdx: 0,
    activeTab: 'original',
    cancelAnalysis: false,
    mediaStream: null,
    autoReadActive: false,
    currentProfileId: null,
    readingPersonaId: localStorage.getItem('lz_persona') || 'standard',
    apiBusy: false,
    // NEU: Vollbild-Vorlese-Modus aktiv?
    focusMode: false,
    // NEU: welches der beiden übereinanderliegenden <img>-Elemente im
    // Kino-Modus gerade sichtbar ist (Kreuzblende, siehe app.render.focusMode()
    // in js/render/reader.js) - hält die DOM-Referenz, nicht nur eine ID.
    _focusFrontImg: null,
    // NEU: Backup-Erinnerung für diese Sitzung weggeklickt?
    backupReminderDismissed: false,
    // NEU: Zustand für den Vokabeltrainer (aktuelles Karten-Deck + Position)
    vocabDeck: [],
    vocabIndex: 0,
    // NEU: kombinierter Modus - beim Auto-Vorlesen auch Raetselfragen stellen
    autoReadWithQuiz: false,
    // NEU: Mitmachmodus - liest den Erstleser-Text statt des Originaltexts
    // vor und pausiert bei jedem durch ein Emoji ersetzten Wort, damit das
    // Kind es selbst raten/mitsprechen kann
    mitmachModus: false,
    // NEU: Art des NAECHSTEN neu angelegten Buches ('story' oder 'workbook').
    // Bewusst nur zur Laufzeit und nicht in localStorage: sonst legt man
    // Wochen spaeter unbemerkt weiter Uebungshefte statt Geschichten an.
    newBookType: 'story'
});
