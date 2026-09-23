import { app } from './core.js';

// ================= Lokale Profile (ohne Server/Login) =================
// Ein "Profil" ist rein lokal auf diesem Gerät - z.B. für mehrere Kinder
// auf einem gemeinsamen Familientablet. Kein Login, keine Cloud, nur eine
// Filterung, welche Bücher in der Bibliothek angezeigt werden.

const PROFILES_KEY = 'lz_profiles';
const ACTIVE_PROFILE_KEY = 'lz_active_profile';
// NEU: Sonderwert für "alle Profile anzeigen" - löst den Fall, dass
// Bücher eines anderen/verwaisten Profils sonst unsichtbar blieben,
// obwohl sie z.B. beim Export mitgezählt wurden. Gleicher String-Wert
// wird in render/library.js und den Buch-Erstellungs-Stellen genutzt.
const ALL_PROFILES_ID = '__all__';
// NEU: Vorlese-Stimme (Anbieter + Stimmen-Auswahl je Anbieter) ist ab jetzt
// pro Profil gespeichert, nicht mehr global - siehe Migration weiter unten.
const PROFILE_TTS_KEY = 'lz_profile_tts';

function loadProfiles() {
    try {
        const raw = localStorage.getItem(PROFILES_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
        console.error('Profile konnten nicht geladen werden:', e);
    }
    // Es gibt immer mindestens dieses Standardprofil - Bücher aus der Zeit
    // vor dieser Funktion (ohne profileId) landen automatisch hier.
    return [{ id: 'default', name: 'Familie' }];
}

function saveProfiles() {
    try {
        localStorage.setItem(PROFILES_KEY, JSON.stringify(app.profiles));
    } catch (e) {
        console.error('Profile konnten nicht gespeichert werden:', e);
    }
}

app.profiles = loadProfiles();

// FIX: ein gespeicherter Profil-Wert kann veraltet sein (Profil wurde auf
// einem anderen Gerät gelöscht, Backup eingespielt o.ä.). Stand dann eine
// unbekannte ID im Speicher, war die Bibliothek dauerhaft leer, ohne dass
// erkennbar war warum. Der Sonderwert "Alle Profile" bleibt gültig.
const storedProfileId = localStorage.getItem(ACTIVE_PROFILE_KEY);
const storedIsValid = storedProfileId === ALL_PROFILES_ID
    || app.profiles.some(p => p.id === storedProfileId);
app.state.currentProfileId = storedIsValid ? storedProfileId : app.profiles[0].id;

function loadProfileTtsMap() {
    try {
        const raw = localStorage.getItem(PROFILE_TTS_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : null;
    } catch (e) {
        console.error('Profil-Stimmeneinstellungen unlesbar:', e);
        return null;
    }
}

function saveProfileTtsMap() {
    try {
        localStorage.setItem(PROFILE_TTS_KEY, JSON.stringify(app.profileTtsMap));
    } catch (e) {
        console.error('Profil-Stimmeneinstellungen konnten nicht gespeichert werden:', e);
    }
}

// NEU: Stimmen-Anbieter/-Auswahl (app.settings.ttsProvider/ttsVoices) waren
// bis v0.12 global, in state.js schon aus localStorage geladen. Gibt es
// noch keine Zuordnung pro Profil, übernimmt JEDES vorhandene ECHTE Profil
// einmalig die bisherige globale Wahl, damit niemand seine Stimme verliert.
// '__all__' ist kein echtes Profil (siehe ALL_PROFILES_ID) und bekommt
// bewusst keinen eigenen Eintrag.
app.profileTtsMap = loadProfileTtsMap();
if (!app.profileTtsMap) {
    app.profileTtsMap = {};
    app.profiles.forEach(p => {
        app.profileTtsMap[p.id] = {
            ttsProvider: app.settings.ttsProvider,
            ttsVoices: { ...app.settings.ttsVoices }
        };
    });
    saveProfileTtsMap();
}

// NEU: Hilfsfunktionen rund um Profile - liegen bewusst in app.utils, dem
// üblichen Ort für "nie direkt lesen, immer über diese Funktion" (siehe
// CLAUDE.md, z.B. resolveBookType). app.utils existiert als Objekt schon
// aus core.js, auch wenn utils.js selbst erst später geladen wird.
Object.assign(app.utils, {
    // Stimmen-Einstellung eines ECHTEN Profils - Fallback Gerätestimme,
    // falls das Profil noch keine eigene Wahl hat (z.B. gerade neu angelegt).
    getProfileTtsSettings(profileId) {
        // FIX: '__all__' ist kein echtes Profil (siehe ALL_PROFILES_ID) und hat
        // deshalb nie einen eigenen Eintrag. Ohne Rückfall landete der
        // "Alle Profile"-Überblick stumm auf der Gerätestimme, obwohl gerade
        // eben noch eine KI-Stimme lief - deshalb die Werte des ersten echten
        // Profils übernehmen statt zurückzufallen.
        const realId = (profileId && profileId !== ALL_PROFILES_ID)
            ? profileId
            : (app.profiles[0] && app.profiles[0].id);
        return app.profileTtsMap[realId] || { ttsProvider: 'device', ttsVoices: {} };
    },

    // Speichert die Stimmen-Einstellung EINES Profils dauerhaft.
    setProfileTtsSettings(profileId, { ttsProvider, ttsVoices }) {
        app.profileTtsMap[profileId] = { ttsProvider, ttsVoices: { ...ttsVoices } };
        saveProfileTtsMap();
    },

    // Kopiert die Stimmen-Einstellung des aktuell aktiven (echten) Profils
    // nach app.settings, wo ttsProviders.js/tts.js/ttsNeural.js/
    // settingsConfig.js sie unverändert weiter auslesen - so bleibt nur
    // diese eine Stelle profil-bewusst. Wird beim Start (main.js) und bei
    // jedem Profilwechsel aufgerufen.
    syncActiveProfileTtsSettings() {
        const stored = this.getProfileTtsSettings(this.resolveCreationProfileId());
        app.settings.ttsProvider = stored.ttsProvider;
        app.settings.ttsVoices = { ...stored.ttsVoices };
    },

    // NEU: liest die Profil-Rolle immer über diese Funktion, nie direkt -
    // fehlendes Feld (alte Profile) zählt bewusst als 'child', siehe
    // Auftrag "Profil-Rollen".
    resolveProfileRole(profile) {
        return profile && profile.role === 'adult' ? 'adult' : 'child';
    },

    // NEU: sind die teuren/heiklen Einstellungen (Stimmen-Anbieter-Wechsel,
    // API-Keys, Stimmen-Speicher-Verwaltung) gerade gesperrt? Nur bei einem
    // konkret ausgewählten Kinderprofil - beim "Alle Profile"-Filter (eher
    // ein Eltern-Überblick als ein aktives Kind-Profil) bleibt alles frei.
    // Reine Kindersicherung (sichtbar ausgegraut), kein Passwortschutz.
    isSettingsLockedForActiveProfile() {
        if (app.state.currentProfileId === ALL_PROFILES_ID) return false;
        const profile = app.profiles.find(p => p.id === app.state.currentProfileId);
        return this.resolveProfileRole(profile) === 'child';
    }
});

Object.assign(app.actions, {
    switchProfile(profileId) {
        if (profileId === '__new__') {
            this.createProfile();
            return;
        }
        app.state.currentProfileId = profileId;
        localStorage.setItem(ACTIVE_PROFILE_KEY, profileId);
        // NEU: Vorlese-Stimme ist pro Profil - beim Wechsel die zum neuen
        // Profil gehörende Wahl nach app.settings übernehmen.
        app.utils.syncActiveProfileTtsSettings();
        app.render.library();
    },

    createProfile() {
        const name = prompt('Name für das neue Profil (z.B. "Lena" oder "Papa"):');
        if (!name || !name.trim()) {
            app.render.library(); // Dropdown zurücksetzen, falls abgebrochen
            return;
        }

        // NEU: Rolle gleich beim Anlegen festlegen - steuert, ob teure/
        // heikle Einstellungen (Stimmen-Anbieter, API-Keys, Stimmen-Speicher)
        // für dieses Profil gesperrt sind. Reine Kindersicherung, kein
        // Passwortschutz, daher genügt ein einfacher Bestätigungsdialog.
        const isAdult = confirm(`Ist "${name.trim()}" ein Erwachsenen-Profil?\n\nDamit sind alle Einstellungen freigeschaltet (Stimmen-Anbieter, API-Keys, Stimmen-Speicher). Bei "Abbrechen" wird ein Kinderprofil angelegt, bei dem diese Einstellungen ausgegraut sind - lässt sich später jederzeit über das Rollen-Symbol neben der Profil-Auswahl ändern.`);

        const id = 'profile_' + Date.now();
        app.profiles.push({ id, name: name.trim(), role: isAdult ? 'adult' : 'child' });
        saveProfiles();

        // NEU: neues Profil startet mit der Stimmen-Einstellung des bisher
        // aktiven Profils, statt stumm auf die Gerätestimme zurückzufallen.
        app.utils.setProfileTtsSettings(id, app.utils.getProfileTtsSettings(
            app.utils.resolveCreationProfileId()
        ));

        app.state.currentProfileId = id;
        localStorage.setItem(ACTIVE_PROFILE_KEY, id);
        app.utils.syncActiveProfileTtsSettings();
        app.render.library();
        app.ui.toast(`Profil "${name.trim()}" erstellt`, '👤');
    },

    // NEU: Rolle eines Profils umschalten (Kind <-> Erwachsen). Kein
    // Passwortschutz, nur eine sichtbare Kindersicherung - deshalb reicht
    // ein einfacher Klick mit kurzer Bestätigung.
    toggleProfileRole(profileId) {
        const profile = app.profiles.find(p => p.id === profileId);
        if (!profile) return;

        const currentlyAdult = app.utils.resolveProfileRole(profile) === 'adult';
        const confirmed = currentlyAdult
            ? confirm(`"${profile.name}" wieder als Kinderprofil einstufen? Teure/heikle Einstellungen (Stimmen-Anbieter, API-Keys, Stimmen-Speicher) werden dann wieder ausgegraut.`)
            : confirm(`"${profile.name}" als Erwachsenen-Profil einstufen? Damit werden alle Einstellungen freigeschaltet.`);
        if (!confirmed) return;

        profile.role = currentlyAdult ? 'child' : 'adult';
        saveProfiles();
        app.render.library();
        if (app.state.currentView === 'settings') app.render.settings();
        app.ui.toast(currentlyAdult ? 'Als Kinderprofil eingestuft' : 'Als Erwachsenen-Profil eingestuft', currentlyAdult ? '🧒' : '🧑');
    },

    // NEU (v0.42.0-beta): "Frag den Zauberer" pro Profil - 'always' | 'parents' | 'never',
    // gelesen über app.utils.resolveChatMode() (js/actions/kidMode.js).
    setProfileChatMode(profileId, mode) {
        const profile = app.profiles.find(p => p.id === profileId);
        if (!profile || !['always', 'parents', 'never'].includes(mode)) return;
        profile.chatMode = mode;
        saveProfiles();
        app.ui.toast(`„Frag den Zauberer“ für ${profile.name}: ${mode === 'always' ? 'immer' : mode === 'never' ? 'aus' : 'nur mit Eltern'}`, '💬');
    },

    // NEU: Profil umbenennen
    renameProfile(profileId) {
        // FIX (künstliches Nutzer-Feedback): "__all__" ist kein echtes Profil
        // (siehe ALL_PROFILES_ID) - dieser Aufruf lief bisher lautlos ins
        // Leere, wenn "🔍 Alle Profile" gewählt war (der Knopf ist zwar seit
        // demselben Fix in render/library.js dafür ausgeblendet, aber ein
        // Fehler soll auch bei einem künftigen anderen Aufrufweg nicht still
        // verschluckt werden, siehe CLAUDE.md Code-Konventionen).
        if (profileId === ALL_PROFILES_ID) {
            app.ui.toast('"Alle Profile" ist kein echtes Profil - bitte erst ein einzelnes wählen.', 'ℹ️');
            return;
        }
        const profile = app.profiles.find(p => p.id === profileId);
        if (!profile) return;

        const name = prompt('Neuer Name für dieses Profil:', profile.name);
        if (!name || !name.trim()) return;

        profile.name = name.trim();
        saveProfiles();
        app.render.library();
        app.ui.toast('Profil umbenannt', '✏️');
    },

    // NEU: Profil löschen - die Bücher darin gehen NICHT verloren, sondern
    // wandern automatisch in ein verbleibendes Profil.
    deleteProfile(profileId) {
        // FIX (künstliches Nutzer-Feedback): gleicher Grund wie bei
        // renameProfile() oben - "__all__" ist kein echtes Profil.
        if (profileId === ALL_PROFILES_ID) {
            app.ui.toast('"Alle Profile" ist kein echtes Profil - bitte erst ein einzelnes wählen.', 'ℹ️');
            return;
        }
        if (app.profiles.length <= 1) {
            app.ui.toast('Das letzte Profil kann nicht gelöscht werden.', 'ℹ️');
            return;
        }

        const profile = app.profiles.find(p => p.id === profileId);
        if (!profile) return;

        const confirmed = confirm(`Profil "${profile.name}" löschen? Die Bücher darin bleiben erhalten und wandern in ein anderes Profil.`);
        if (!confirmed) return;

        const fallback = app.profiles.find(p => p.id !== profileId);

        Object.values(app.library).forEach(book => {
            if ((book.profileId || 'default') === profileId) {
                book.profileId = fallback.id;
                app.dbOps.saveBook(book);
            }
        });

        app.profiles = app.profiles.filter(p => p.id !== profileId);
        saveProfiles();

        // NEU: verwaisten Stimmen-Eintrag des gelöschten Profils entfernen.
        delete app.profileTtsMap[profileId];
        saveProfileTtsMap();

        if (app.state.currentProfileId === profileId) {
            app.state.currentProfileId = fallback.id;
            localStorage.setItem(ACTIVE_PROFILE_KEY, fallback.id);
            app.utils.syncActiveProfileTtsSettings();
        }

        app.render.library();
        app.ui.toast(`Profil "${profile.name}" gelöscht`, '🗑️');
    }
});
