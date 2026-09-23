import { app } from '../core.js';

Object.assign(app.render, {
    // NEU: Der Bereich "Vorlese-Stimme" baut sich komplett aus
    // app.ttsProviders.list auf. Ein neuer Anbieter dort taucht hier
    // automatisch auf, ohne dass diese Datei angefasst werden muss.
    // NEU: "locked" kommt aus settings() (Kindersicherung) - sperrt hier
    // Anbieter-Wechsel, API-Key-Feld und Stimmen-Speicher-Verwaltung.
    async ttsProviderCard(locked = false) {
        const select = document.getElementById('selectTtsProvider');
        if (!select) return;

        const provider = app.ttsProviders.current();

        // NEU: Tarif-Lock - kleines Preis-Symbol je nach costTier, damit
        // die teurere Stufe schon in der Auswahl selbst sichtbar ist, nicht
        // erst nach dem Wechsel im Bestätigungsdialog.
        const costBadge = { free: '', cheap: ' 💶', expensive: ' 💶💶' };
        select.innerHTML = app.ttsProviders.list
            .map(p => `<option value="${p.id}">${app.utils.sanitize(p.label)}${costBadge[p.costTier] || ''}</option>`)
            .join('');
        select.value = provider.id;
        select.disabled = locked;

        const hint = document.getElementById('ttsProviderHint');
        if (hint) hint.innerText = provider.hint || '';

        // Key-Feld nur bei Anbietern mit eigenem Key. Gemini nutzt den
        // Key, der weiter oben ohnehin schon eingetragen ist.
        const keyRow = document.getElementById('ttsKeyRow');
        const keyInput = document.getElementById('inputProviderKey');
        const keyLabel = document.getElementById('ttsKeyLabel');
        const keyLink = document.getElementById('ttsKeyLink');
        const needsOwnKey = !!provider.keySetting && provider.keySetting !== 'apiKey';
        if (keyRow) keyRow.classList.toggle('hidden', !needsOwnKey);
        if (needsOwnKey && keyInput) {
            keyInput.value = app.settings[provider.keySetting] || '';
            keyInput.disabled = locked;
            if (keyLabel) keyLabel.innerText = `API-Key (${provider.label.split(' (')[0]})`;
        }

        // NEU: Links zum Anbieter (Key-Seite + Preisliste) bei jeder
        // KI-Stimme zeigen - auch bei Gemini, das kein eigenes Key-Feld hat.
        const linkRow = document.getElementById('ttsLinkRow');
        const pricingLink = document.getElementById('ttsPricingLink');
        if (linkRow) linkRow.classList.toggle('hidden', !provider.neural);
        if (keyLink) {
            keyLink.href = provider.keyUrl || '#';
            keyLink.classList.toggle('hidden', !provider.keyUrl);
        }
        if (pricingLink) {
            pricingLink.href = provider.pricingUrl || '#';
            pricingLink.classList.toggle('hidden', !provider.pricingUrl);
        }

        // Stimmen-Auswahl: bei ElevenLabs bevorzugt die aus dem Konto
        // geladenen Stimmen, sonst die fest hinterlegte Auswahl.
        const voiceRow = document.getElementById('ttsVoiceRow');
        const voiceSelect = document.getElementById('selectTtsVoice');
        if (voiceRow) voiceRow.classList.toggle('hidden', !provider.neural);
        if (provider.neural && voiceSelect) {
            // NEU: Speechify nachgeladene Stimmen genauso bevorzugen wie
            // bei ElevenLabs (beide unterstützen supportsVoiceFetch).
            const fetchedByProvider = { elevenlabs: app.settings.elevenVoices, speechify: app.settings.speechifyVoices };
            const loaded = fetchedByProvider[provider.id] || [];
            const voices = loaded.length ? loaded : provider.voices;
            voiceSelect.innerHTML = voices
                .map(v => `<option value="${app.utils.sanitize(v.id)}">${app.utils.sanitize(v.label)}</option>`)
                .join('');
            voiceSelect.value = app.ttsProviders.voiceFor(provider);
            // Steht die gemerkte Stimme nicht (mehr) zur Auswahl, greift
            // wieder die Standardstimme des Anbieters.
            if (!voiceSelect.value) voiceSelect.value = provider.defaultVoice;
        }

        const elevenBtn = document.getElementById('btnLoadElevenVoices');
        // NEU (Merge Welle 0 + Profil-Rollen): beide Nachlade-Knöpfe hängen am
        // jeweiligen Anbieter UND an der Kindersicherung - Stimmen nachladen
        // geht auf das Kontingent des hinterlegten Keys.
        if (elevenBtn) {
            elevenBtn.classList.toggle('hidden', provider.id !== 'elevenlabs' || !provider.supportsVoiceFetch);
            elevenBtn.disabled = locked;
        }
        const speechifyBtn = document.getElementById('btnLoadSpeechifyVoices');
        if (speechifyBtn) {
            speechifyBtn.classList.toggle('hidden', provider.id !== 'speechify' || !provider.supportsVoiceFetch);
            speechifyBtn.disabled = locked;
        }

        // Zusatz-Optionen (Persona-Stil, Stimmen-Speicher) sind nur bei
        // einer KI-Stimme sinnvoll.
        const optionsRow = document.getElementById('ttsOptionsRow');
        if (optionsRow) optionsRow.classList.toggle('hidden', !provider.neural);

        const styleRow = document.getElementById('ttsStyleRow');
        if (styleRow) styleRow.classList.toggle('hidden', !provider.supportsStyle);
        const styleToggle = document.getElementById('toggleTtsPersonaStyle');
        if (styleToggle) styleToggle.checked = app.settings.ttsPersonaStyle !== false;

        const cacheToggle = document.getElementById('toggleTtsCache');
        if (cacheToggle) {
            cacheToggle.checked = app.settings.ttsCacheEnabled !== false;
            cacheToggle.disabled = locked;
        }
        const clearCacheBtn = document.getElementById('btnClearTtsCache');
        if (clearCacheBtn) clearCacheBtn.disabled = locked;

        const cacheInfo = document.getElementById('ttsCacheInfo');
        if (cacheInfo && provider.neural) {
            const stats = await app.dbOps.getTtsCacheStats();
            const mb = (stats.bytes / (1024 * 1024)).toFixed(1);
            cacheInfo.innerText = stats.count
                ? `${stats.count} gespeicherte Aufnahme(n), ${mb} MB`
                : 'Noch nichts gespeichert.';
        }
    },

    // NEU: rein lokale Kosten-/Verbrauchsanzeige (js/costMeter.js) - zeigt,
    // wie viele Zeichen diesen Kalendermonat WIRKLICH synthetisiert wurden
    // (Cache-Treffer zaehlen nicht mit) und einen daraus GESCHAETZTEN Betrag.
    // NEU (Profil-Rollen): "locked" sperrt das Zurücksetzen des Zählers -
    // der Verbrauch ist eine Eltern-Information, ein Kind soll ihn nicht
    // versehentlich löschen. Die Anzeige selbst bleibt sichtbar.
    costMeterCard(locked = false) {
        const list = document.getElementById('costMeterList');
        const totalEl = document.getElementById('costMeterTotal');
        if (!list || !totalEl) return;

        const resetBtn = document.getElementById('btnResetCostMeter');
        if (resetBtn) resetBtn.disabled = locked;

        const stats = app.costMeter.currentMonthStats();
        const fmtChars = n => n.toLocaleString('de-DE');
        const fmtCost = n => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const rows = stats.providers.map(p => {
            const costText = p.estCost > 0 ? `≈ ${fmtCost(p.estCost)} USD` : 'kostenlos';
            return `<div class="flex items-center justify-between gap-2">
                <span>${app.utils.sanitize(p.label)}: ${fmtChars(p.chars)} Zeichen (${p.requests}×)</span>
                <span class="font-bold text-slate-700 flex-shrink-0">${costText}</span>
            </div>`;
        });

        if (stats.geminiText.chars > 0) {
            rows.push(`<div class="flex items-center justify-between gap-2 text-slate-400">
                <span>Gemini-Textaufrufe (Analyse/Quiz): ${fmtChars(stats.geminiText.chars)} Zeichen (${stats.geminiText.requests}×)</span>
                <span class="flex-shrink-0">separat, siehe Gemini-Preisliste</span>
            </div>`);
        }

        list.innerHTML = rows.length
            ? rows.join('')
            : '<p class="text-slate-500">Diesen Monat noch keine KI-Stimme genutzt.</p>';

        totalEl.innerText = stats.totalCost > 0
            ? `Ungefähr ${fmtCost(stats.totalCost)} USD diesen Monat geschätzt - ohne Gewähr, verbindlich ist die Abrechnung des Anbieters.`
            : 'Diesen Monat noch keine geschätzten Kosten.';
    },

    async settings() {
        // NEU (v0.41.0-beta): Liste der gemeldeten KI-Inhalte aktualisieren.
        app.render.aiReports?.();
        // NEU: Kinderprofile haben teure/heikle Einstellungen gesperrt
        // (Stimmen-Anbieter, API-Keys, Stimmen-Speicher-Verwaltung) - reine
        // Kindersicherung, sichtbar ausgegraut, kein Passwortschutz.
        const locked = app.utils.isSettingsLockedForActiveProfile();
        const lockNotice = document.getElementById('settingsLockNotice');
        if (lockNotice) lockNotice.classList.toggle('hidden', !locked);

        // NEU: zusätzlich zum zentralen Hinweis oben steht die Erklärung
        // direkt am jeweiligen Feld - wer bis hierher scrollt, sieht sonst nur
        // ein ausgegrautes Feld ohne Grund.
        const apiKeyInput = document.getElementById('inputApiKey');
        if (apiKeyInput) apiKeyInput.disabled = locked;
        const apiKeyHint = document.getElementById('apiKeyChildLockHint');
        if (apiKeyHint) apiKeyHint.classList.toggle('hidden', !locked);

        const mistralKeyInput = document.getElementById('inputMistralKey');
        if (mistralKeyInput) mistralKeyInput.disabled = locked;
        const mistralKeyHint = document.getElementById('mistralKeyChildLockHint');
        if (mistralKeyHint) mistralKeyHint.classList.toggle('hidden', !locked);

        // Die Persona-Liste kommt aus config.js statt fest im HTML zu
        // stehen. Ergänzt man dort eine Persona, erscheint sie automatisch
        // hier - ohne diese Datei anzufassen.
        const personaSelect = document.getElementById('selectPersona');
        // FIX: als einzige Stelle fehlte hier das sanitize() - die
        // Reader-Auswahl in render/reader.js macht es bereits. Personas
        // stammen zwar aus config.js und sind damit ungefährlich, aber die
        // Regel "vor innerHTML immer sanitize" soll ausnahmslos gelten,
        // damit sie beim nächsten Mal nicht versehentlich reißt.
        // NEU (v0.39.0-beta): Symbol + Kurzbeschreibung wie im Reader.
        personaSelect.innerHTML = app.personas.map(p => `<option value="${p.id}">${p.icon || '🎭'} ${app.utils.sanitize(p.label)}${p.tagline ? ` – ${app.utils.sanitize(p.tagline)}` : ''}</option>`).join('');

        document.getElementById('inputApiKey').value = app.settings.apiKey;
        document.getElementById('inputMistralKey').value = app.settings.mistralApiKey;
        personaSelect.value = app.settings.persona;

        // NEU (Birkenbihl-Methode): Zielsprachen-Liste kommt aus config.js,
        // gleiches Muster wie die Persona-Liste oben.
        const birkenbihlSelect = document.getElementById('selectBirkenbihlLanguage');
        if (birkenbihlSelect) {
            birkenbihlSelect.innerHTML = app.birkenbihlLanguages.map(l => `<option value="${l.id}">${app.utils.sanitize(l.label)}</option>`).join('');
            birkenbihlSelect.value = app.settings.birkenbihlLanguage;
        }

        // NEU: gespeicherte Vorlesegeschwindigkeit anzeigen
        const rateInput = document.getElementById('inputSpeechRate');
        const rateLabel = document.getElementById('speechRateValue');
        if (rateInput) {
            rateInput.value = app.settings.speechRate;
            if (rateLabel) rateLabel.innerText = app.settings.speechRate.toFixed(1) + 'x';
        }

        // NEU: gespeicherte Hervorhebungsfarbe anzeigen
        const colorInput = document.getElementById('inputHighlightColor');
        if (colorInput) colorInput.value = app.settings.highlightColor;

        // NEU: Hintergrund-Vorbereitung - Status + Fortschritt anzeigen
        const bgToggle = document.getElementById('toggleBackgroundPregen');
        if (bgToggle) bgToggle.checked = app.settings.backgroundPregenEnabled;

        // NEU (Birkenbihl-Hintergrundvorbereitung, Nutzerwunsch): eigener
        // Zusatz-Schalter, siehe js/state.js/js/settingsConfig.js.
        const bgBirkenbihlToggle = document.getElementById('toggleBackgroundPregenBirkenbihl');
        if (bgBirkenbihlToggle) bgBirkenbihlToggle.checked = app.settings.backgroundPregenBirkenbihl;

        // NEU (Nutzerwunsch: "auch wieder die background Durchführung der
        // fehlenden gesprochenen Teile als eigener Toggle") - nur sichtbar
        // mit aktiver KI-Stimme, die Gerätestimme liefert keine Datei zum
        // Zwischenspeichern (siehe app.ttsNeural.isActive).
        const bgAudioRow = document.getElementById('toggleBackgroundPregenAudioRow');
        const bgAudioToggle = document.getElementById('toggleBackgroundPregenAudio');
        const neuralActive = app.ttsNeural.isActive();
        if (bgAudioRow) bgAudioRow.classList.toggle('hidden', !neuralActive);
        if (bgAudioToggle) bgAudioToggle.checked = app.settings.backgroundPregenAudio;

        // NEU: zweiseitiges Layout - Schalterstellung anzeigen
        const twoPageToggle = document.getElementById('toggleTwoPageLayout');
        if (twoPageToggle) twoPageToggle.checked = app.settings.twoPageLayout;

        // NEU (SchreibZauber Stufe 2): echte Bildgenerierung - Schalterstellung
        // anzeigen, für Kinderprofile gesperrt wie der API-Key selbst (kostet
        // Geld, siehe app.settingsConfig.toggleStudioImageGen).
        const studioImgToggle = document.getElementById('toggleStudioImageGen');
        if (studioImgToggle) {
            studioImgToggle.checked = app.settings.studioImageGenEnabled;
            studioImgToggle.disabled = locked;
        }

        // NEU (Nutzerwunsch "kostenlos Bilderbücher erstellen"): Pollinations
        // als zweite Bildquelle - gleiche Sperre wie oben (Kind-Profile
        // sollen keinen unmoderierten Drittanbieter-Dienst selbst umschalten
        // können), auch wenn hier kein Geld im Spiel ist.
        const studioPollinationsToggle = document.getElementById('toggleStudioImagePollinations');
        if (studioPollinationsToggle) {
            studioPollinationsToggle.checked = app.settings.studioImagePollinationsEnabled;
            studioPollinationsToggle.disabled = locked;
        }

        // NEU: Übersicht statt nur einer einzelnen Zeile (Nutzerwunsch) -
        // zeigt alle drei Hintergrund-Aufgaben getrennt, in derselben
        // Reihenfolge, in der js/backgroundPregen.js sie auch abarbeitet
        // ("erst Seiten, dann anderer Kram").
        const pregenOverview = document.getElementById('pregenOverview');
        if (pregenOverview) {
            // NEU (Nutzerhinweis: "es sind nicht die fehlenden Seiten der
            // Bücher mit drinnen") - eigene Zeile für Seiten ohne jede
            // Grundanalyse, in derselben Prioritäts-Reihenfolge wie
            // js/backgroundPregen.js findNextMissingTask() (höchste zuerst).
            const missingScans = app.utils.countMissingScans();
            const missingVariants = app.utils.countMissingVariants();
            const missingQuiz = app.utils.countMissingBookQuiz();
            const missingBirkenbihl = app.utils.countMissingBirkenbihl();
            const line = (label, count) => count > 0 ? `${label}: ${count} offen` : `${label}: alles fertig ✅`;
            const lines = [
                line('📷 Nicht ausgelesene Seiten', missingScans),
                line('🧑 Erzähler-Varianten', missingVariants),
                line('❓ Buch-Quiz', missingQuiz),
                line('🌍 Birkenbihl', missingBirkenbihl)
            ];
            // NEU (Nutzerwunsch): nur mit aktiver KI-Stimme aussagekräftig -
            // ohne sie liefert countMissingAudio() ohnehin immer 0, das
            // sähe fälschlich nach "alles fertig" statt "nicht zutreffend"
            // aus. async wie der Stimmen-Speicher-Stand weiter unten.
            if (neuralActive) {
                lines.push(line('🎧 KI-Stimme', await app.utils.countMissingAudio()));
            }
            pregenOverview.innerHTML = lines.map(l => `<p>${app.utils.sanitize(l)}</p>`).join('');
        }

        // NEU: Kino-Effekte (Ken-Burns + Kreuzblende) - Schalterstellung anzeigen
        const focusEffectsToggle = document.getElementById('toggleFocusEffects');
        if (focusEffectsToggle) focusEffectsToggle.checked = app.settings.focusEffectsEnabled;
        app.tts.loadVoices();
        await this.ttsProviderCard(locked);
        this.costMeterCard(locked);

        // NEU: Speicherplatz-Nutzung anzeigen (grobe Schätzung des Browsers)
        const infoEl = document.getElementById('storageInfo');
        const barEl = document.getElementById('storageBar');
        if (infoEl && navigator.storage && navigator.storage.estimate) {
            try {
                const { usage, quota } = await navigator.storage.estimate();
                const usageMb = (usage / (1024 * 1024)).toFixed(1);
                if (quota) {
                    const quotaMb = (quota / (1024 * 1024)).toFixed(0);
                    const pct = Math.min(100, Math.round((usage / quota) * 100));
                    infoEl.innerText = `${usageMb} MB von ca. ${quotaMb} MB genutzt (${pct}%)`;
                    if (barEl) {
                        barEl.style.width = pct + '%';
                        // NEU: proaktive Warnfarbe ab 80%, statt erst beim
                        // tatsächlichen Fehlschlag zu merken, dass es eng wird.
                        barEl.className = pct >= 80
                            ? 'bg-red-500 h-full transition-all'
                            : 'bg-indigo-500 h-full transition-all';
                    }
                    if (pct >= 80) {
                        infoEl.innerHTML += ' <span class="text-red-600 font-bold">- wird knapp, evtl. Zeit für ein Backup + Aufräumen</span>';
                    }
                } else {
                    infoEl.innerText = `${usageMb} MB genutzt`;
                }
            } catch (e) {
                console.error('Speicherplatz konnte nicht ermittelt werden:', e);
                infoEl.innerText = 'Konnte nicht ermittelt werden.';
            }
        } else if (infoEl) {
            infoEl.innerText = 'Von diesem Browser nicht unterstützt.';
        }
    }
});
