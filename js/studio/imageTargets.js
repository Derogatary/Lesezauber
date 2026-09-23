import { app } from '../core.js';

// ================= SchreibZauber: Zielprogramme für kopierte Bild-Prompts (v0.46.0-beta) =================
// NEU (Nutzerwunsch: "Muss man die Prompts für unterschiedliche Programme
// unterschiedlich anpassen? ... ja, passe das so an. Bei weiteren Anbietern
// kann man es ja erweitern"). Beim manuellen Austausch
// (js/studio/studioManualImages.js) wählt man, WOHIN der Prompt kopiert wird;
// jedes Programm bekommt seine passende Fassung:
//   - Nano Banana (Gemini-App/AI Studio): deutsch, erzählend, positiv
//     formuliert, Seitenverhältnis aus dessen Liste, Figurenblätter anhängen.
//   - ChatGPT/Copilot: ebenfalls deutsch und erzählend, kennt aber nur
//     1:1, 3:2 und 2:3.
//   - Leonardo, Ideogram, Canva, Firefly & Co.: ENGLISCH (verstehen Deutsch
//     deutlich schlechter) plus eigener "Negative Prompt" für das gleichnamige
//     Eingabefeld. Die frei geschriebenen Teile (Szene, Stil, Figuren,
//     Textfläche) übersetzt die KI einmal - Ergebnis im Speicher gemerkt.
//
// NEUES ZIELPROGRAMM = ein neuer Eintrag in TARGETS (id, label, lang, ratios,
// hint, optional negative). Die Auswahl in der Austausch-Ansicht baut sich
// daraus automatisch auf.

const TARGET_KEY = 'lz_image_target';

const NEGATIVE_EN = 'text, letters, words, numbers, captions, speech bubbles, watermark, logo, signature, scary, horror, violence, weapons, blood, gloomy, photorealistic, deformed hands, extra fingers, blurry';

const TARGETS = [
    {
        id: 'nanobanana',
        label: 'Nano Banana (Gemini-App / AI Studio)',
        lang: 'de',
        ratios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
        hint: 'Prompt einfügen, Figurenblätter als Bild dazulegen. In AI Studio rechts das Seitenverhältnis einstellen.'
    },
    {
        id: 'chatgpt',
        label: 'ChatGPT / Copilot',
        lang: 'de',
        ratios: ['1:1', '3:2', '2:3'],
        hint: 'Prompt einfügen, Figurenblätter als Bild anhängen. Kennt nur 1:1, 3:2 und 2:3 - der Rand wird beim Druck passend beschnitten.'
    },
    {
        id: 'english',
        label: 'Leonardo, Ideogram, Canva, Firefly & Co. (Englisch)',
        lang: 'en',
        ratios: ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9'],
        negative: NEGATIVE_EN,
        hint: 'Prompt ins Hauptfeld, „Negative Prompt“ ins gleichnamige Feld (falls vorhanden). Seitenverhältnis in den Einstellungen des Programms wählen. Figurenblatt, falls möglich, als „Character Reference“ / „Image Reference“ hochladen.'
    }
];

// Übersetzungen der frei geschriebenen Teile: Schlüssel = JSON der deutschen Teile.
const translations = new Map();

function freeTextOf(p) {
    return { scene: p.scene, style: p.style, zone: p.zone, characters: p.characters.map(c => c.desc) };
}

function englishPrompt(p, aspect, t) {
    const orient = app.studio.formats.orientationLabel(aspect);
    const orientEn = { Hochformat: 'portrait', Querformat: 'landscape', quadratisch: 'square' }[orient] || '';
    return [
        `Children's book illustration, ${orientEn} format, aspect ratio ${aspect}.`,
        `Scene: ${t.scene}.`,
        t.style ? `Style: ${t.style}.` : '',
        p.characters.length
            ? `Characters (keep appearance, clothing and colors exactly consistent): ${p.characters.map((c, i) => `${c.name}: ${t.characters[i] || 'as in the character sheet'}`).join('; ')}.`
            : '',
        t.zone ? `Composition: calm, simple background (sky, meadow or wall) in the area "${t.zone}", leaving room for the book text.` : '',
        p.fold ? 'The image is folded vertically in the middle (book binding): only calm background runs through the center, faces and characters stay left and right of it.' : '',
        'Pure illustration without any lettering; signs, books and surfaces stay blank.',
        'Warm, friendly, child-appropriate mood.',
        'Original characters, places and motifs, not based on any known brand, franchise, logo or artwork.'
    ].filter(Boolean).join(' ');
}

Object.assign(app.studio, {
    imageTargets: {
        list() { return TARGETS; },

        get(id) { return TARGETS.find(t => t.id === id) || TARGETS[0]; },

        currentId() {
            try { return localStorage.getItem(TARGET_KEY) || TARGETS[0].id; } catch (e) { return TARGETS[0].id; }
        },

        setCurrent(id) {
            try { localStorage.setItem(TARGET_KEY, id); } catch (e) { console.error('Zielprogramm nicht speicherbar:', e); }
        },

        // Braucht dieses Zielprogramm (noch) eine Übersetzung für diese Bausteine?
        needsTranslation(targetId, parts) {
            return this.get(targetId).lang === 'en' && !translations.has(JSON.stringify(freeTextOf(parts)));
        },

        // Übersetzt die frei geschriebenen Teile einmal (Gemini, sonst Mistral).
        // Ohne Key oder bei Fehlern bleibt es deutsch - mit Hinweis, nie stumm.
        async translate(parts) {
            const key = JSON.stringify(freeTextOf(parts));
            if (translations.has(key)) return true;
            try {
                const result = await app.studio.api.translateImagePromptParts(freeTextOf(parts));
                if (!result || typeof result.scene !== 'string') throw new Error('Antwort unvollständig');
                translations.set(key, {
                    scene: result.scene, style: result.style || '', zone: result.zone || '',
                    characters: Array.isArray(result.characters) ? result.characters : []
                });
                return true;
            } catch (e) {
                console.error('Bild-Prompt konnte nicht übersetzt werden:', e);
                app.ui.toast(e.message === 'API_KEY_MISSING'
                    ? 'Zum Übersetzen braucht es einen Gemini-Key (Einstellungen) - die Bildbeschreibung bleibt deutsch.'
                    : 'Übersetzen fehlgeschlagen - die Bildbeschreibung bleibt deutsch.', 'ℹ️');
                return false;
            }
        },

        // { prompt, negative, aspect } für ein Zielprogramm. refNames: Figuren,
        // deren Figurenblatt als Referenzbild angehängt werden soll.
        build(targetId, parts, refNames = []) {
            const target = this.get(targetId);
            const aspect = nearest(parts.fmt, target.ratios);
            if (target.lang === 'en') {
                const t = translations.get(JSON.stringify(freeTextOf(parts))) || freeTextOf(parts);
                const refs = refNames.length ? `\n\nReference images attached: the character sheets of ${refNames.join(', ')} - match their look, clothing and colors exactly.` : '';
                return { prompt: englishPrompt(parts, aspect, t) + refs, negative: target.negative || '', aspect };
            }
            const refs = refNames.length ? `\n\nAngehängte Referenzbilder: die Figurenblätter von ${refNames.join(', ')} - Aussehen, Kleidung und Farben dieser Figuren genau übernehmen.` : '';
            return { prompt: app.studio.imageSource.germanPromptFromParts(parts, aspect) + refs, negative: '', aspect };
        }
    }
});

function nearest(fmt, ratios) {
    if (!fmt) return ratios[0];
    return app.studio.formats.supportedAspect(fmt.id, ratios);
}
