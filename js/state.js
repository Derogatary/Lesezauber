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
    highlightColor: localStorage.getItem('lz_highlight_color') || '#fde047'
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
    // NEU: Backup-Erinnerung für diese Sitzung weggeklickt?
    backupReminderDismissed: false,
    // NEU: Zustand für den Vokabeltrainer (aktuelles Karten-Deck + Position)
    vocabDeck: [],
    vocabIndex: 0,
    // NEU: kombinierter Modus - beim Auto-Vorlesen auch Raetselfragen stellen
    autoReadWithQuiz: false
});
