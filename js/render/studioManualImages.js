import { app } from '../core.js';

// ================= SchreibZauber: "Bilder manuell austauschen" - Anzeige (v0.45.0-beta) =================
// NEU: Vollbild-Liste #studioManualPanel mit ALLEN Bildern eines Werks
// (Figurenblätter, Doppelseiten bzw. Comic-Panels). Pro Bild: Vorschau, der
// komplette Prompt, Kopieren, Figurenblätter zum Anhängen herunterladen und
// Einfügen (Zwischenablage / Datei / Drag & Drop / Strg+V).
// Logik: js/studio/studioManualImages.js.
//
// "Aktiver" Eintrag: der zuletzt kopierte - Strg+V bzw. "Einfügen" oben
// landet dort. So klappt der Hin-und-her-Weg zum KI-Chat ohne Suchen.

const SOURCE_BADGE = {
    placeholder: ['🖼️ Platzhalter', 'bg-amber-100 text-amber-800'],
    upload: ['📷 eigenes Bild', 'bg-emerald-100 text-emerald-800'],
    gemini: ['✨ KI-Bild', 'bg-indigo-100 text-indigo-800'],
    pollinations: ['🎨 KI-Bild', 'bg-indigo-100 text-indigo-800']
};

let activeKey = null;
let onlyOpen = true;
let pasteHandler = null;

function project() {
    return app.studio.projects[app.state.currentStudioProjectId] || null;
}

// Keys enthalten nur Buchstaben/Ziffern/Doppelpunkt/Unterstrich (Figur-IDs
// sind "char_<Zahl>" o.ä.) - trotzdem hart filtern, weil sie in onclick landen.
function safeKey(key) {
    return String(key).replace(/[^A-Za-z0-9:_-]/g, '');
}

function isOpen(item) {
    return !item.imgUrl || item.source === 'placeholder' || item.source === '';
}

function cardHtml(p, item) {
    const s = app.utils.sanitize;
    const key = safeKey(item.key);
    const badge = SOURCE_BADGE[item.source] || ['– noch kein Bild', 'bg-slate-100 text-slate-500'];
    const prompt = app.studio.manualPromptFor(p, item);
    const refs = app.studio.manualRefsFor(p, item);
    const active = key === activeKey;
    return `
    <div id="manualCard_${key.replace(/:/g, '_')}" data-key="${key}" ondragover="event.preventDefault()" ondrop="app.actions.manualImageDrop(event, '${key}')"
        class="bg-white rounded-2xl border-2 ${active ? 'border-purple-500 ring-2 ring-purple-200' : 'border-slate-200'} shadow-sm p-3 space-y-2">
        <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-bold text-slate-800">${s(item.label)}</span>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${badge[1]}">${badge[0]}</span>
        </div>
        <div class="flex gap-3">
            ${item.imgUrl
                ? `<img src="${item.imgUrl}" alt="" class="w-24 h-24 object-cover rounded-lg border border-slate-200 flex-shrink-0">`
                : '<div class="w-24 h-24 rounded-lg bg-slate-100 flex items-center justify-center text-2xl text-slate-300 flex-shrink-0">🖼️</div>'}
            <textarea readonly rows="5" aria-label="Prompt ${s(item.label)}" class="flex-grow min-w-0 text-[11px] leading-snug text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2 resize-y">${s(prompt)}</textarea>
        </div>
        ${refs.length ? `
        <div class="flex items-center gap-2 flex-wrap">
            <span class="text-[10px] font-bold text-slate-500">Mit anhängen:</span>
            ${refs.map(c => `<a href="${c.sheetImgUrl}" download="Figurenblatt-${s((c.name || 'Figur').replace(/[^A-Za-z0-9äöüÄÖÜß_-]+/g, '-'))}.webp" class="flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-2 py-1">
                <img src="${c.sheetThumbUrl || c.sheetImgUrl}" alt="" class="w-5 h-5 rounded object-cover">⬇️ ${s(c.name)}</a>`).join('')}
        </div>` : ''}
        <div class="grid grid-cols-3 gap-2">
            <button onclick="app.actions.manualCopyPrompt('${key}')" class="text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg py-2 transition">📋 Prompt kopieren</button>
            <button onclick="app.actions.manualPasteImage('${key}')" class="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg py-2 transition">📥 Bild einfügen</button>
            <button onclick="app.actions.manualPickFile('${key}')" class="text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg py-2 transition">📁 Datei</button>
        </div>
    </div>`;
}

function onPaste(e) {
    if (!activeKey) return;
    const file = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'))?.getAsFile();
    if (!file) return;
    e.preventDefault();
    app.actions.manualApply(activeKey, file);
}

Object.assign(app.render, {
    studioManualImages() {
        const p = project();
        const list = document.getElementById('studioManualList');
        if (!p || !list) return;
        const items = app.studio.manualImageItems(p);
        const open = items.filter(isOpen);
        const shown = onlyOpen ? open : items;
        document.getElementById('studioManualProgress').innerText =
            `${items.length - open.length} von ${items.length} Bildern echt · ${open.length} offen`;
        document.getElementById('studioManualOnlyOpen').checked = onlyOpen;
        list.innerHTML = shown.length
            ? shown.map(i => cardHtml(p, i)).join('')
            : `<div class="text-center py-10 text-slate-500 bg-white rounded-2xl border border-dashed border-slate-200"><span class="text-3xl block mb-2">🎉</span><p class="text-xs font-semibold">${items.length ? 'Alle Bilder sind ausgetauscht.' : 'Noch keine Bilder - erst Figuren und Seiten anlegen.'}</p></div>`;
    }
});

Object.assign(app.actions, {
    openStudioManualImages(focusKey) {
        activeKey = focusKey ? safeKey(focusKey) : null;
        // Ein gezielt geöffneter Eintrag soll sichtbar sein, auch wenn er schon echt ist.
        if (focusKey) onlyOpen = false;
        document.getElementById('studioManualPanel').classList.remove('hidden');
        app.render.studioManualImages();
        if (!pasteHandler) { pasteHandler = onPaste; document.addEventListener('paste', pasteHandler); }
        if (activeKey) document.getElementById(`manualCard_${activeKey.replace(/:/g, '_')}`)?.scrollIntoView({ block: 'center' });
    },

    closeStudioManualImages() {
        document.getElementById('studioManualPanel').classList.add('hidden');
        if (pasteHandler) { document.removeEventListener('paste', pasteHandler); pasteHandler = null; }
        activeKey = null;
        app.render.studioWizard(); // Stufe neu zeichnen (neue Bilder/Figurenblätter)
    },

    toggleManualOnlyOpen(checked) {
        onlyOpen = !!checked;
        app.render.studioManualImages();
    },

    async manualCopyPrompt(key) {
        const p = project();
        const item = app.studio.parseManualItemKey(key);
        if (!p || !item) return;
        activeKey = safeKey(key);
        await app.studio.imageSource.copyPrompt(app.studio.manualPromptFor(p, item));
        // Nur den Rahmen umfärben statt alles neu zu zeichnen (Scrollposition bleibt).
        document.querySelectorAll('#studioManualList [data-key]').forEach(el => {
            const on = el.dataset.key === activeKey;
            el.classList.toggle('border-purple-500', on);
            el.classList.toggle('ring-2', on);
            el.classList.toggle('ring-purple-200', on);
            el.classList.toggle('border-slate-200', !on);
        });
    },

    // Alle offenen Prompts auf einmal (nummeriert) - für längere Sitzungen im KI-Chat.
    async manualCopyAllPrompts() {
        const p = project();
        if (!p) return;
        const items = app.studio.manualImageItems(p).filter(isOpen);
        if (!items.length) { app.ui.toast('Keine offenen Bilder.', 'ℹ️'); return; }
        const text = items.map((i, n) => `### ${n + 1}. ${i.label}\n\n${app.studio.manualPromptFor(p, i)}`).join('\n\n---\n\n');
        await app.studio.imageSource.copyPrompt(text);
    },

    async manualPasteImage(key) {
        activeKey = safeKey(key);
        if (!navigator.clipboard?.read) {
            app.ui.toast('Einfügen per Knopf geht in diesem Browser nicht - bitte Strg+V drücken oder „Datei“ wählen.', 'ℹ️');
            return;
        }
        try {
            const entries = await navigator.clipboard.read();
            for (const entry of entries) {
                const type = entry.types.find(t => t.startsWith('image/'));
                if (type) {
                    const blob = await entry.getType(type);
                    await app.actions.manualApply(key, new File([blob], 'eingefuegt', { type }));
                    return;
                }
            }
            app.ui.toast('In der Zwischenablage ist kein Bild. Im KI-Chat das Bild erst kopieren („Bild kopieren“).', 'ℹ️');
        } catch (e) {
            console.error('Zwischenablage nicht lesbar:', e);
            app.ui.toast('Zugriff auf die Zwischenablage nicht erlaubt - bitte Strg+V drücken oder „Datei“ wählen.', 'ℹ️');
        }
    },

    manualPickFile(key) {
        activeKey = safeKey(key);
        const input = document.getElementById('studioManualFileInput');
        input.value = '';
        input.onchange = () => { if (input.files[0]) app.actions.manualApply(key, input.files[0]); };
        input.click();
    },

    manualImageDrop(event, key) {
        event.preventDefault();
        const file = [...(event.dataTransfer?.files || [])].find(f => f.type.startsWith('image/'));
        if (file) app.actions.manualApply(key, file);
    },

    async manualApply(key, file) {
        const p = project();
        const item = app.studio.parseManualItemKey(key);
        if (!p || !item) return;
        app.ui.showLoader('Bild wird eingesetzt...', 'Einen Moment');
        try {
            const ok = await app.studio.applyManualImage(key, file, app.studio.manualPromptFor(p, item));
            if (ok) {
                app.ui.toast('Bild eingesetzt.', '✅');
                activeKey = safeKey(key);
                app.render.studioManualImages();
            }
        } catch (e) {
            console.error('Bild konnte nicht eingesetzt werden:', e);
            app.ui.toast(`Bild konnte nicht eingesetzt werden: ${e.message}`, '❌');
        } finally {
            app.ui.hideLoader();
        }
    }
});
