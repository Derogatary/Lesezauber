import { app } from './core.js';

// ================= Lokale Profile (ohne Server/Login) =================
// Ein "Profil" ist rein lokal auf diesem Gerät - z.B. für mehrere Kinder
// auf einem gemeinsamen Familientablet. Kein Login, keine Cloud, nur eine
// Filterung, welche Bücher in der Bibliothek angezeigt werden.

const PROFILES_KEY = 'lz_profiles';
const ACTIVE_PROFILE_KEY = 'lz_active_profile';

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
app.state.currentProfileId = localStorage.getItem(ACTIVE_PROFILE_KEY) || app.profiles[0].id;

Object.assign(app.actions, {
    switchProfile(profileId) {
        if (profileId === '__new__') {
            this.createProfile();
            return;
        }
        app.state.currentProfileId = profileId;
        localStorage.setItem(ACTIVE_PROFILE_KEY, profileId);
        app.render.library();
    },

    createProfile() {
        const name = prompt('Name für das neue Profil (z.B. "Lena" oder "Papa"):');
        if (!name || !name.trim()) {
            app.render.library(); // Dropdown zurücksetzen, falls abgebrochen
            return;
        }

        const id = 'profile_' + Date.now();
        app.profiles.push({ id, name: name.trim() });
        saveProfiles();

        app.state.currentProfileId = id;
        localStorage.setItem(ACTIVE_PROFILE_KEY, id);
        app.render.library();
        app.ui.toast(`Profil "${name.trim()}" erstellt`, '👤');
    },

    // NEU: Profil umbenennen
    renameProfile(profileId) {
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

        if (app.state.currentProfileId === profileId) {
            app.state.currentProfileId = fallback.id;
            localStorage.setItem(ACTIVE_PROFILE_KEY, fallback.id);
        }

        app.render.library();
        app.ui.toast(`Profil "${profile.name}" gelöscht`, '🗑️');
    }
});
