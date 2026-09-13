import { app } from '../core.js';

Object.assign(app.actions, {
    // NEU: Vollbild-Vorlese-Modus - blendet alle Bedienelemente aus,
    // zeigt nur Bild + Play/Pause. Startet das Auto-Vorlesen automatisch,
    // falls es nicht schon läuft.
    toggleFocusMode() {
        app.state.focusMode = !app.state.focusMode;
        const focusView = document.getElementById('viewFocus');
        if (!focusView) return;

        if (app.state.focusMode) {
            focusView.classList.remove('hidden');
            app.render.focusMode();
            if (!app.state.autoReadActive) app.tts.startAutoRead();
        } else {
            focusView.classList.add('hidden');
        }
    },

    // NEU: Backup-Erinnerung für diese Sitzung ausblenden
    dismissBackupReminder() {
        app.state.backupReminderDismissed = true;
        document.getElementById('backupReminder')?.classList.add('hidden');
    }
});
