import { app } from '../core.js';

// ============ Canvas-Renderer für den Video-Export ("Kino-Bild") ============
// Teil 1 von Weg B (WebCodecs + MP4-Muxer), siehe docs/KONZEPT-Video.md
// Abschnitt 4.3 und 4.5. Dieses Modul kodiert NICHT und spielt NICHTS ab -
// es kann genau eine Sache: zu einem Zeitpunkt t einen einzelnen Frame auf
// einen Canvas zeichnen (Seitenbild + Untertitel-Balken mit mitlaufender
// Wort-Hervorhebung).
//
// WARUM so getrennt: Der Encoder (Teil 2) zieht die Frames später so
// schnell wie er kann, die Vorschau (js/actions/videoPreview.js) dagegen in
// Echtzeit per requestAnimationFrame. Beide brauchen bei gleichem t exakt
// dasselbe Bild - ein Renderer, der die Zeit selbst verwaltet, könnte das
// nicht leisten. Deshalb ist hier alles zustandslos bis auf zwei
// Zwischenspeicher (dekodierte Bilder, ausgemessene Textzeilen), die rein
// der Geschwindigkeit dienen.
//
// Der Zeitplan (welche Szene wann läuft) kommt aus js/actions/videoTimeline.js.

// Zielformate. Standard ist Hochkant 9:16 - so schaut das Kind den Film auf
// dem Handy im Vollbild, und er passt ohne Ränder in WhatsApp-Status/Shorts
// (Entscheidung aus docs/KONZEPT-Video.md, Abschnitt 4.5, "Seitenverhältnis").
// subtitleLines legt fest, wie viele Textzeilen gleichzeitig stehen - daraus
// ergibt sich die feste Höhe des Untertitel-Balkens. Fest muss sie sein,
// damit das Bild nicht mitten in der Seite springt, wenn ein Textblock
// weniger Zeilen hat als der vorige.
const FORMATS = {
    portrait: { id: 'portrait', label: 'Hochkant 9:16 (Handy, Status)', width: 1080, height: 1920, subtitleLines: 4 },
    landscape: { id: 'landscape', label: 'Quer 16:9 (Fernseher, YouTube)', width: 1920, height: 1080, subtitleLines: 3 },
    square: { id: 'square', label: 'Quadratisch 1:1', width: 1080, height: 1080, subtitleLines: 3 }
};
const DEFAULT_FORMAT = 'portrait';

// Farben bewusst hier als Konstanten und nicht aus Tailwind/CSS gelesen:
// auf dem Canvas gibt es keine Klassen, und beim Kodieren im Hintergrund
// (Teil 2) ist evtl. gar kein sichtbares DOM vorhanden, aus dem man eine
// berechnete Farbe auslesen könnte.
const COLOR_BG = '#0b1220';
const COLOR_BAR = 'rgba(15, 23, 42, 0.88)';
const COLOR_TEXT = '#f8fafc';
const COLOR_TEXT_ON_HIGHLIGHT = '#1e293b';
const COLOR_MUTED = '#94a3b8';
const FALLBACK_HIGHLIGHT = '#fde047';

// Schriftfamilie: dieselbe System-Schrift wie im Reader (Tailwind
// "font-sans"). Keine Webfont - dadurch kann auch nichts still auf eine
// Ersatzschrift zurückfallen (siehe fontsReady() unten).
const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// Höchstens so viele dekodierte Seitenbilder gleichzeitig im Speicher.
// Ein 1600px-WebP als ImageBitmap belegt mehrere MB - bei einem Buch mit 40
// Seiten wäre "alle behalten" auf dem Handy der schnellste Weg in einen
// Absturz (siehe docs/KONZEPT-Video.md, Abschnitt 4.5, "Arbeitsspeicher").
const MAX_BITMAPS = 3;

// Ken-Burns: dieselben vier Zoom-Richtungen wie im Kino-Modus
// (css/style.css, .focus-kb-0..3) - Zoom auf 1.12 mit leichtem Schwenk.
// Zyklisch nach Seitenindex, sonst wirkt der immer gleiche Schwenk über
// mehrere Seiten mechanisch.
const KEN_BURNS = [
    { dx: -0.02, dy: -0.015 },
    { dx: 0.02, dy: -0.015 },
    { dx: -0.02, dy: 0.015 },
    { dx: 0.02, dy: 0.015 }
];
const KEN_BURNS_ZOOM = 0.12;
// Kreuzblende beim Szenenwechsel (Sekunden). Optische Vorlage ist der
// Kino-Modus (css/style.css, 1.1s Opacity-Übergang); im Video ist sie
// kürzer, weil dort jede Szene wirklich nur ein paar Sekunden steht.
const CROSSFADE_SEC = 0.6;
// Unter dieser Szenenlänge wird der Zoom anteilig zurückgenommen: 12% Zoom
// in 2 Sekunden wäre eine Fahrt, kein Ken-Burns-Effekt.
const KEN_BURNS_FULL_SEC = 12;

Object.assign(app.cinema, {
    // ---------- Formate ----------
    formats() {
        return Object.values(FORMATS);
    },

    format(id) {
        return FORMATS[id] || FORMATS[DEFAULT_FORMAT];
    },

    defaultFormatId() {
        return DEFAULT_FORMAT;
    },

    // ---------- Schrift ----------
    // Vor dem ersten Zeichnen abwarten: sonst misst der Canvas die Textbreite
    // mit einer Ersatzschrift aus und bricht die Zeilen falsch um - und zwar
    // lautlos, ohne Fehlermeldung (docs/KONZEPT-Video.md, Abschnitt 4.5,
    // "Untertitel").
    fontsReady() {
        if (!this._fontsPromise) {
            this._fontsPromise = (document.fonts && document.fonts.ready)
                ? document.fonts.ready.catch(e => { console.error('Schriften-Ladezustand unbekannt:', e); })
                : Promise.resolve();
        }
        return this._fontsPromise;
    },

    // ---------- Seitenbilder ----------
    _bitmaps: new Map(),

    // Dekodiert ein Seitenbild EINMAL in eine ImageBitmap. Pro Frame neu zu
    // dekodieren wäre um Größenordnungen zu langsam (25 Frames/Sekunde x
    // Data-URL-Dekodierung) - gezeichnet wird danach nur noch per drawImage().
    async loadBitmap(src) {
        if (!src) return null;
        const cached = this._bitmaps.get(src);
        if (cached) {
            // Neu einsortieren, damit die LRU-Reihenfolge unten stimmt.
            this._bitmaps.delete(src);
            this._bitmaps.set(src, cached);
            return cached;
        }

        let bitmap = null;
        try {
            if (window.createImageBitmap) {
                const blob = await (await fetch(src)).blob();
                bitmap = await createImageBitmap(blob);
            }
        } catch (e) {
            console.warn('ImageBitmap nicht möglich, weiche auf <img> aus:', e);
        }

        if (!bitmap) {
            // Rückfall für Browser ohne createImageBitmap: ein fertig
            // dekodiertes <img> taugt für drawImage() genauso, kostet nur
            // mehr Speicher.
            bitmap = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('Seitenbild konnte nicht geladen werden.'));
                img.src = src;
            });
        }

        this._bitmaps.set(src, bitmap);
        this._trimBitmaps(src);
        return bitmap;
    },

    _trimBitmaps(keepSrc) {
        while (this._bitmaps.size > MAX_BITMAPS) {
            const oldest = this._bitmaps.keys().next().value;
            if (oldest === keepSrc) break;
            const victim = this._bitmaps.get(oldest);
            this._bitmaps.delete(oldest);
            if (victim && typeof victim.close === 'function') victim.close();
        }
    },

    // Das dekodierte Bild einer Szene, falls es gerade vorliegt.
    // WICHTIG: Der Zwischenspeicher oben ist die EINZIGE Stelle, die
    // ImageBitmaps besitzt - eine Szene hält bewusst keine eigene
    // Referenz. Sonst würde die Verdrängung (MAX_BITMAPS) ein Bild
    // schließen, das eine ältere Szene noch festhält, und ein Sprung
    // zurück im Zeitbalken würde beim Zeichnen mit einem
    // "InvalidStateError" abbrechen.
    bitmapFor(scene) {
        return (scene && scene.imgUrl) ? (this._bitmaps.get(scene.imgUrl) || null) : null;
    },

    // Sorgt dafür, dass das Bild dieser Szene gezeichnet werden kann.
    // Fehler werden hier NICHT verschluckt, aber auch nicht weitergeworfen:
    // ein fehlendes Bild soll den Film nicht abbrechen, die Szene zeigt dann
    // nur den Untertitel auf dunklem Grund.
    // Mehrfachaufrufe während des Ladens liefern dieselbe Zusage zurück -
    // die Vorschau fragt pro Frame nachvorne, das darf nicht jedes Mal einen
    // neuen Ladevorgang starten.
    ensureBitmap(scene) {
        if (!scene || !scene.imgUrl) return Promise.resolve(null);
        const ready = this.bitmapFor(scene);
        if (ready) return Promise.resolve(ready);
        if (scene._bitmapPromise) return scene._bitmapPromise;

        scene._bitmapPromise = this.loadBitmap(scene.imgUrl)
            .catch(e => {
                console.error('Seitenbild für den Film nicht ladbar:', e);
                scene._bitmapFailed = true;
                return null;
            })
            .finally(() => { scene._bitmapPromise = null; });
        return scene._bitmapPromise;
    },

    // Das Bild der FOLGENDEN Szene schon holen, während die aktuelle läuft -
    // sonst stockt genau am Szenenwechsel das Bild.
    async prefetchNext(timeline, timeSec) {
        const idx = this.sceneIndexAt(timeline, timeSec);
        const next = idx >= 0 ? timeline.scenes[idx + 1] : null;
        if (next && !this.bitmapFor(next) && !next._bitmapFailed) await this.ensureBitmap(next);
    },

    // Alles freigeben (Vorschau geschlossen, Export fertig). Wichtig, weil
    // ImageBitmaps nicht vom Garbage Collector abgeräumt werden, solange
    // sie in der Map hängen.
    release(timeline) {
        this._bitmaps.forEach(bitmap => {
            if (bitmap && typeof bitmap.close === 'function') bitmap.close();
        });
        this._bitmaps.clear();
        if (timeline && timeline.scenes) {
            timeline.scenes.forEach(scene => {
                scene._bitmapPromise = null;
                scene._bitmapFailed = false;
                scene._backdrop = null;
                scene._backdropFormat = null;
                scene._layout = null;
                scene._layoutFormat = null;
            });
        }
    },

    // ---------- Zeitplan abfragen ----------
    // Welche Szene läuft zum Zeitpunkt t? Merkt sich den letzten Treffer,
    // weil die Vorschau die Zeit fast immer nur ein Stück weiterdreht -
    // dann ist es dieselbe oder die nächste Szene.
    sceneIndexAt(timeline, timeSec) {
        const scenes = timeline?.scenes;
        if (!scenes || !scenes.length) return -1;

        const hit = (i) => {
            const s = scenes[i];
            return s && timeSec >= s.startSec && timeSec < s.endSec;
        };

        const hint = timeline._lastSceneIdx || 0;
        if (hit(hint)) return hint;
        if (hit(hint + 1)) { timeline._lastSceneIdx = hint + 1; return hint + 1; }

        for (let i = 0; i < scenes.length; i++) {
            if (hit(i)) { timeline._lastSceneIdx = i; return i; }
        }
        // Hinter dem Ende (letzter Frame) das letzte Bild stehen lassen.
        return timeSec >= scenes[scenes.length - 1].endSec ? scenes.length - 1 : 0;
    },

    sceneAt(timeline, timeSec) {
        const idx = this.sceneIndexAt(timeline, timeSec);
        return idx >= 0 ? timeline.scenes[idx] : null;
    },

    // ---------- Der eigentliche Frame ----------
    // Zeichnet den Zustand zum Zeitpunkt timeSec (Sekunden ab Filmbeginn).
    // Der Canvas muss in der Auflösung des Formats vorliegen (siehe
    // prepareCanvas()).
    drawFrame(ctx, timeline, timeSec) {
        const fmt = this.format(timeline.formatId);
        const metrics = this._metrics(fmt);

        ctx.save();
        ctx.fillStyle = COLOR_BG;
        ctx.fillRect(0, 0, fmt.width, fmt.height);

        const idx = this.sceneIndexAt(timeline, timeSec);
        const scene = idx >= 0 ? timeline.scenes[idx] : null;
        if (!scene) { ctx.restore(); return; }

        // Kreuzblende: am Anfang einer Szene liegt die vorige noch darunter
        // und wird überblendet - derselbe Eindruck wie im Kino-Modus, nur
        // hier gerechnet statt per CSS (im Video gibt es kein DOM und keine
        // Opacity-Animation, es gibt nur diesen einen Frame).
        const previous = idx > 0 ? timeline.scenes[idx - 1] : null;
        const alpha = this._crossfadeAlpha(scene, previous, timeSec);

        if (alpha < 1 && previous) {
            // Die alte Szene in ihrem Endzustand darunter legen (also mit
            // vollem Ken-Burns-Zoom und ihrem letzten Untertitel-Block).
            this._paintScene(ctx, fmt, metrics, previous, previous.endSec - 0.001);
        }

        ctx.save();
        ctx.globalAlpha = alpha;
        this._paintScene(ctx, fmt, metrics, scene, timeSec);
        ctx.restore();

        ctx.restore();
    },

    // Deckkraft der NEUEN Szene: 1 = fertig eingeblendet.
    _crossfadeAlpha(scene, previous, timeSec) {
        if (!previous || !this._effectsOn()) return 1;
        // Nur blenden, wenn sich das Bild wirklich ändert. Zwischen Text und
        // Bildbeschreibung derselben Seite steht dasselbe Bild - eine Blende
        // wäre dort nur ein sinnloses Aufflackern.
        if (previous.imgUrl === scene.imgUrl && previous.kind === scene.kind) return 1;
        // Ohne fertiges Bild der alten Szene gäbe die Blende nur ein
        // "Bild wird geladen..." unter dem neuen Bild frei - dann harter Schnitt.
        if (previous.imgUrl && !this.bitmapFor(previous)) return 1;

        const local = timeSec - scene.startSec;
        if (local >= CROSSFADE_SEC) return 1;
        return Math.max(0, Math.min(1, local / CROSSFADE_SEC));
    },

    // Eine einzelne Szene zu einem Zeitpunkt zeichnen (ohne Hintergrundfläche
    // und ohne Blende) - von drawFrame() ein- oder zweimal aufgerufen.
    _paintScene(ctx, fmt, metrics, scene, timeSec) {
        const local = Math.max(0, Math.min(scene.durationSec, timeSec - scene.startSec));
        const progress = scene.durationSec > 0 ? Math.min(1, local / scene.durationSec) : 1;

        this._drawBackdrop(ctx, scene, fmt);

        if (scene.kind === 'page') {
            this._drawPageImage(ctx, scene, fmt, metrics, progress);
            this._drawSubtitle(ctx, scene, fmt, metrics, local);
        } else if (scene.kind === 'quiz') {
            // NEU: Rätselfrage/-antwort als eigene Karte statt Untertitel-
            // Balken (siehe docs/KONZEPT-Video.md, "Noch offen").
            this._drawQuizCard(ctx, scene, fmt, metrics, local);
        } else {
            this._drawCard(ctx, scene, fmt, metrics, progress);
        }
    },

    // Bewegung/Blenden erlaubt? Dieselben zwei Schalter wie im Kino-Modus:
    // die Einstellung und die Betriebssystem-Vorgabe "reduzierte Bewegung".
    _effectsOn() {
        if (app.settings.focusEffectsEnabled === false) return false;
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
        return true;
    },

    // Bequemlichkeit für Vorschau und (später) Export: setzt die
    // Canvas-Auflösung auf das Zielformat und liefert den 2D-Kontext.
    // alpha:false ist kein Detail - ohne Transparenz zeichnet der Browser
    // messbar schneller, und ein Video hat ohnehin keinen Alphakanal.
    prepareCanvas(canvas, formatId) {
        const fmt = this.format(formatId);
        if (canvas.width !== fmt.width) canvas.width = fmt.width;
        if (canvas.height !== fmt.height) canvas.height = fmt.height;
        return canvas.getContext('2d', { alpha: false });
    },

    // ---------- Maße eines Formats ----------
    // Alles hängt an der kürzeren Kante, damit Hochkant und Quer mit einer
    // einzigen Formel vernünftig aussehen (bei 1080 kurzer Kante: 46px
    // Schrift, 62px Zeilenhöhe).
    _metrics(fmt) {
        if (fmt._metrics) return fmt._metrics;

        const base = Math.min(fmt.width, fmt.height);
        const fontSize = Math.round(base * 0.043);
        const lineHeight = Math.round(fontSize * 1.34);
        const pad = Math.round(base * 0.032);
        const margin = Math.round(base * 0.022);
        const barHeight = pad * 2 + lineHeight * fmt.subtitleLines;

        fmt._metrics = {
            fontSize,
            lineHeight,
            pad,
            margin,
            radius: Math.round(base * 0.026),
            bar: {
                x: margin,
                y: fmt.height - margin - barHeight,
                w: fmt.width - margin * 2,
                h: barHeight
            },
            // Bildbereich: über dem Balken, nicht dahinter. Text auf dem Bild
            // wäre bei hellen Illustrationen schlecht lesbar, und für Kinder,
            // die gerade lesen lernen, ist Lesbarkeit wichtiger als Fläche.
            image: { x: 0, y: 0, w: fmt.width, h: fmt.height - barHeight - margin * 2 },
            textWidth: fmt.width - margin * 2 - pad * 2
        };
        return fmt._metrics;
    },

    // ---------- Hintergrund ----------
    // Füllt die Ränder, die ein hochkant fotografiertes Buch in einem
    // 9:16- oder 16:9-Rahmen übrig lässt: dasselbe Bild formatfüllend,
    // unscharf und abgedunkelt. Wird EINMAL pro Szene in einen eigenen
    // kleinen Puffer gerendert - ein Weichzeichner pro Frame wäre bei 25
    // Frames/Sekunde die teuerste Operation im ganzen Renderer.
    _drawBackdrop(ctx, scene, fmt) {
        const bitmap = this.bitmapFor(scene);
        if (!bitmap) return;

        if (!scene._backdrop || scene._backdropFormat !== fmt.id) {
            scene._backdrop = this._renderBackdrop(bitmap, fmt);
            scene._backdropFormat = fmt.id;
        }
        if (scene._backdrop) ctx.drawImage(scene._backdrop, 0, 0, fmt.width, fmt.height);
    },

    _renderBackdrop(bitmap, fmt) {
        // Klein rendern und hochskalieren: das kostet fast nichts und
        // verstärkt die Unschärfe zusätzlich - praktisch für Browser, die
        // ctx.filter nicht kennen (dort ist das Hochskalieren die einzige
        // Weichzeichnung).
        const w = Math.max(32, Math.round(fmt.width / 8));
        const h = Math.max(32, Math.round(fmt.height / 8));
        const surface = this._surface(w, h);
        if (!surface) return null;

        const sctx = surface.getContext('2d', { alpha: false });
        sctx.fillStyle = COLOR_BG;
        sctx.fillRect(0, 0, w, h);

        // "cover": Bild formatfüllend, Überstand wird abgeschnitten.
        const scale = Math.max(w / bitmap.width, h / bitmap.height);
        const dw = bitmap.width * scale;
        const dh = bitmap.height * scale;
        if ('filter' in sctx) sctx.filter = 'blur(2px)';
        sctx.drawImage(bitmap, (w - dw) / 2, (h - dh) / 2, dw, dh);
        if ('filter' in sctx) sctx.filter = 'none';

        // Abdunkeln, damit das Seitenbild davor klar im Vordergrund steht.
        sctx.fillStyle = 'rgba(8, 12, 22, 0.62)';
        sctx.fillRect(0, 0, w, h);
        return surface;
    },

    // OffscreenCanvas wo vorhanden (kein DOM nötig, im Export auch im
    // Hintergrund nutzbar), sonst ein losgelöstes <canvas>.
    _surface(w, h) {
        try {
            if (window.OffscreenCanvas) return new OffscreenCanvas(w, h);
        } catch (e) {
            console.warn('OffscreenCanvas nicht verfügbar:', e);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        return canvas;
    },

    // ---------- Seitenbild mit Ken-Burns ----------
    _drawPageImage(ctx, scene, fmt, metrics, progress) {
        const area = metrics.image;
        const bitmap = this.bitmapFor(scene);

        if (!bitmap) {
            ctx.save();
            ctx.fillStyle = COLOR_MUTED;
            ctx.font = `${Math.round(metrics.fontSize * 0.8)}px ${FONT_STACK}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(scene._bitmapFailed ? 'Bild nicht verfügbar' : 'Bild wird geladen...', area.x + area.w / 2, area.y + area.h / 2);
            ctx.restore();
            return;
        }

        // "contain": ganze Seite sichtbar, nichts abgeschnitten - bei einem
        // Buch darf kein Bildrand verloren gehen, dort steht manchmal Text.
        const scale = Math.min(area.w / bitmap.width, area.h / bitmap.height);
        const dw = bitmap.width * scale;
        const dh = bitmap.height * scale;
        const cx = area.x + area.w / 2;
        const cy = area.y + area.h / 2;

        const kb = this._kenBurns(scene, progress);

        ctx.save();
        // Zuschneiden auf den Bildbereich: der Zoom soll nicht in den
        // Untertitel-Balken hineinwachsen.
        ctx.beginPath();
        ctx.rect(area.x, area.y, area.w, area.h);
        ctx.clip();
        ctx.translate(cx + kb.dx * dw, cy + kb.dy * dh);
        ctx.scale(kb.scale, kb.scale);
        ctx.drawImage(bitmap, -dw / 2, -dh / 2, dw, dh);
        ctx.restore();
    },

    // Liefert Zoom und Verschiebung für den Fortschritt einer Szene.
    // Respektiert dieselben zwei Schalter wie der Kino-Modus: die
    // Einstellung und die Betriebssystem-Vorgabe "reduzierte Bewegung".
    _kenBurns(scene, progress) {
        const still = { scale: 1, dx: 0, dy: 0 };
        if (!this._effectsOn()) return still;

        const dir = KEN_BURNS[(scene.kenBurns || 0) % KEN_BURNS.length];
        // Kurze Szenen bekommen anteilig weniger Zoom (siehe KEN_BURNS_FULL_SEC).
        const amount = KEN_BURNS_ZOOM * Math.min(1, (scene.durationSec || 0) / KEN_BURNS_FULL_SEC);
        const eased = this._ease(progress);
        return {
            scale: 1 + amount * eased,
            dx: dir.dx * eased * (amount / KEN_BURNS_ZOOM || 0),
            dy: dir.dy * eased * (amount / KEN_BURNS_ZOOM || 0)
        };
    },

    // ease-in-out, wie die CSS-Animation im Kino-Modus.
    _ease(p) {
        const t = Math.max(0, Math.min(1, p));
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    },

    // ---------- Untertitel mit Wort-Hervorhebung ----------
    _drawSubtitle(ctx, scene, fmt, metrics, localSec) {
        const layout = this._layout(ctx, scene, fmt, metrics);
        if (!layout || !layout.blocks.length) return;

        const wordIdx = this._currentWordIndex(scene, localSec);
        const block = this._blockFor(layout, wordIdx);

        const bar = metrics.bar;
        ctx.save();
        ctx.fillStyle = COLOR_BAR;
        this._roundRect(ctx, bar.x, bar.y, bar.w, bar.h, metrics.radius);
        ctx.fill();

        ctx.font = `600 ${metrics.fontSize}px ${FONT_STACK}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        const highlightColor = app.settings.highlightColor || FALLBACK_HIGHLIGHT;
        // Erste Zeile mittig im Balken beginnen, wenn der Block weniger
        // Zeilen hat als das Format erlaubt - sonst "klebt" ein einzeiliger
        // Schlusssatz oben.
        const usedLines = block.lines.length;
        const freeLines = Math.max(0, fmt.subtitleLines - usedLines);
        const top = bar.y + metrics.pad + Math.round(freeLines * metrics.lineHeight / 2);

        block.lines.forEach((line, row) => {
            // Basislinie: Zeilenoberkante + Schrifthöhe, leicht angehoben
            // (0.82) - das ist die üblich wirkende Lage für Großbuchstaben.
            const baseline = top + row * metrics.lineHeight + Math.round(metrics.fontSize * 0.82);
            const startX = bar.x + metrics.pad + Math.round((metrics.textWidth - line.width) / 2);
            let x = startX;

            line.words.forEach(word => {
                if (word.index === wordIdx) {
                    ctx.fillStyle = highlightColor;
                    this._roundRect(
                        ctx,
                        x - metrics.fontSize * 0.14,
                        baseline - metrics.fontSize * 0.86,
                        word.width + metrics.fontSize * 0.28,
                        metrics.fontSize * 1.16,
                        Math.round(metrics.fontSize * 0.24)
                    );
                    ctx.fill();
                    ctx.fillStyle = COLOR_TEXT_ON_HIGHLIGHT;
                } else {
                    ctx.fillStyle = COLOR_TEXT;
                }
                ctx.fillText(word.text, x, baseline);
                x += word.advance;
            });
        });

        ctx.restore();
    },

    // Welches Wort wird zu diesem Zeitpunkt gesprochen? scene.words trägt
    // die Zeiten RELATIV zum Szenenbeginn (siehe videoTimeline.js).
    _currentWordIndex(scene, localSec) {
        const words = scene.words || [];
        let current = -1;
        for (let i = 0; i < words.length; i++) {
            if (words[i].start <= localSec) current = i; else break;
        }
        return current;
    },

    // ---------- Zeilenumbruch ----------
    // Bricht den Text in Zeilen und gruppiert die Zeilen zu Blöcken von
    // höchstens fmt.subtitleLines Zeilen. Ein langer Seitentext läuft also
    // wie echte Untertitel blockweise durch, statt unten aus dem Bild zu
    // wachsen. Das Ergebnis wird an der Szene zwischengespeichert -
    // measureText() pro Frame wäre unnötig teuer.
    _layout(ctx, scene, fmt, metrics) {
        if (scene._layout && scene._layoutFormat === fmt.id) return scene._layout;

        const words = scene.words || [];
        if (!words.length) {
            scene._layout = { blocks: [] };
            scene._layoutFormat = fmt.id;
            return scene._layout;
        }

        ctx.save();
        ctx.font = `600 ${metrics.fontSize}px ${FONT_STACK}`;
        const spaceWidth = ctx.measureText(' ').width;

        const lines = [];
        let line = { words: [], width: 0 };
        words.forEach((entry, index) => {
            const width = ctx.measureText(entry.word).width;
            const needed = line.words.length ? line.width + spaceWidth + width : width;
            if (line.words.length && needed > metrics.textWidth) {
                lines.push(line);
                line = { words: [], width: 0 };
            }
            const x = line.width + (line.words.length ? spaceWidth : 0);
            line.words.push({ index, text: entry.word, width, advance: width + spaceWidth, x });
            line.width = x + width;
        });
        if (line.words.length) lines.push(line);
        ctx.restore();

        const blocks = [];
        for (let i = 0; i < lines.length; i += fmt.subtitleLines) {
            const chunk = lines.slice(i, i + fmt.subtitleLines);
            blocks.push({
                lines: chunk,
                firstWord: chunk[0].words[0].index,
                lastWord: chunk[chunk.length - 1].words[chunk[chunk.length - 1].words.length - 1].index
            });
        }

        scene._layout = { blocks };
        scene._layoutFormat = fmt.id;
        return scene._layout;
    },

    // Der Block, in dem das gerade gesprochene Wort steht. Vor dem ersten
    // Wort (z.B. in der Anlaufzeit einer Szene) der erste Block, nach dem
    // letzten der letzte - so ist nie ein leerer Balken zu sehen.
    _blockFor(layout, wordIdx) {
        if (wordIdx < 0) return layout.blocks[0];
        const found = layout.blocks.find(b => wordIdx >= b.firstWord && wordIdx <= b.lastWord);
        return found || layout.blocks[layout.blocks.length - 1];
    },

    // ---------- Titel- und Abspannkarte ----------
    // Gehört zur "Regie" aus docs/KONZEPT-Video.md, Abschnitt 3: ein
    // Buch-Film fängt mit Titel und Autor an und endet mit einem Abspann.
    // Bewusst hier und nicht im Zeitplan-Modul, weil es reines Zeichnen ist.
    _drawCard(ctx, scene, fmt, metrics, progress) {
        const area = metrics.image;
        const bitmap = this.bitmapFor(scene);

        if (bitmap) {
            // Cover kleiner und ruhiger als eine Seite: leichter Zoom,
            // damit die Karte nicht statisch wirkt, aber nichts ablenkt.
            const boxW = area.w * 0.62;
            const boxH = area.h * 0.62;
            const scale = Math.min(boxW / bitmap.width, boxH / bitmap.height) * (1 + 0.04 * this._ease(progress));
            const dw = bitmap.width * scale;
            const dh = bitmap.height * scale;
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
            ctx.shadowBlur = Math.round(metrics.fontSize * 0.8);
            ctx.drawImage(bitmap, area.x + (area.w - dw) / 2, area.y + (area.h - dh) / 2 - metrics.fontSize, dw, dh);
            ctx.restore();
        }

        const bar = metrics.bar;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        const centerX = fmt.width / 2;

        const titleSize = Math.round(metrics.fontSize * 1.5);
        ctx.font = `800 ${titleSize}px ${FONT_STACK}`;
        const titleLines = this._wrapPlain(ctx, scene.title || '', metrics.textWidth, 3);
        let y = bar.y + metrics.pad + Math.round(titleSize * 0.85);
        titleLines.forEach(text => {
            ctx.fillStyle = COLOR_TEXT;
            ctx.fillText(text, centerX, y);
            y += Math.round(titleSize * 1.2);
        });

        if (scene.subtitle) {
            ctx.font = `500 ${Math.round(metrics.fontSize * 0.86)}px ${FONT_STACK}`;
            ctx.fillStyle = COLOR_MUTED;
            this._wrapPlain(ctx, scene.subtitle, metrics.textWidth, 2).forEach(text => {
                ctx.fillText(text, centerX, y);
                y += Math.round(metrics.fontSize * 1.1);
            });
        }
        ctx.restore();
    },

    // Schlichter Zeilenumbruch ohne Wort-Indizes - nur für Titel/Abspann,
    // die keine Hervorhebung brauchen. Über maxLines hinaus wird gekürzt,
    // damit ein sehr langer Titel nicht aus der Karte läuft.
    _wrapPlain(ctx, text, maxWidth, maxLines) {
        const words = String(text || '').split(/\s+/).filter(Boolean);
        const lines = [];
        let current = '';
        words.forEach(word => {
            const candidate = current ? `${current} ${word}` : word;
            if (current && ctx.measureText(candidate).width > maxWidth) {
                lines.push(current);
                current = word;
            } else {
                current = candidate;
            }
        });
        if (current) lines.push(current);
        if (lines.length <= maxLines) return lines;
        const cut = lines.slice(0, maxLines);
        cut[maxLines - 1] = `${cut[maxLines - 1].replace(/\s+\S*$/, '')}...`;
        return cut;
    },

    // ---------- Quiz-Karte mit Denkpause ----------
    // NEU (docs/KONZEPT-Video.md, "Noch offen"): eigene Karte für Frage und
    // Antwort, statt sie wie Seitentext im Untertitel-Balken durchlaufen zu
    // lassen - ein Rätsel soll auffallen, nicht nebenbei vorbeiziehen. Die
    // Denkpause selbst braucht hier keinen eigenen Code: sie steckt in der
    // Länge der Frage-Szene (siehe QUIZ_THINK_PAUSE_SEC in
    // js/actions/videoTimeline.js) - die Frage bleibt nach dem letzten Wort
    // einfach länger stehen, bevor die Antwort-Karte folgt. Keine
    // Wort-Hervorhebung wie beim Untertitel-Balken - für eine kurze Frage/
    // Antwort auf einer eigenen Karte reicht ruhiger, größerer Text.
    _drawQuizCard(ctx, scene, fmt, metrics, localSec) {
        const area = metrics.image;
        const isAnswer = scene.quizRole === 'answer';

        const boxMargin = metrics.margin * 2;
        const boxX = boxMargin;
        const boxY = Math.round(area.y + area.h * 0.14);
        const boxW = fmt.width - boxMargin * 2;
        const boxH = Math.round(area.h * 0.72);
        const innerWidth = boxW - metrics.pad * 2;

        ctx.save();
        ctx.fillStyle = COLOR_BAR;
        this._roundRect(ctx, boxX, boxY, boxW, boxH, metrics.radius * 1.4);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        const centerX = fmt.width / 2;

        const badgeSize = Math.round(metrics.fontSize * 0.8);
        ctx.font = `700 ${badgeSize}px ${FONT_STACK}`;
        ctx.fillStyle = isAnswer ? '#86efac' : '#fde047';
        ctx.fillText(isAnswer ? '✅ Antwort' : '❓ Rätselfrage', centerX, boxY + metrics.pad + badgeSize);

        ctx.font = `700 ${Math.round(metrics.fontSize * 1.05)}px ${FONT_STACK}`;
        ctx.fillStyle = COLOR_TEXT;
        const lines = this._wrapPlain(ctx, scene.text || '', innerWidth, 6);
        let y = boxY + metrics.pad + badgeSize + Math.round(metrics.fontSize * 1.4);
        lines.forEach(text => {
            ctx.fillText(text, centerX, y);
            y += Math.round(metrics.fontSize * 1.35);
        });

        // Bei der Frage: sobald das letzte Wort gesprochen ist (der Rest der
        // Szenenlänge ist die Denkpause), einen Hinweis einblenden - sonst
        // wirkt der stehende Frame wie ein Hänger statt wie Bedenkzeit.
        if (!isAnswer) {
            const words = scene.words || [];
            const spokenEnd = words.length ? words[words.length - 1].end : 0;
            if (localSec > spokenEnd) {
                ctx.font = `600 ${Math.round(metrics.fontSize * 0.86)}px ${FONT_STACK}`;
                ctx.fillStyle = COLOR_MUTED;
                ctx.fillText('🤔 Zeit zum Überlegen...', centerX, boxY + boxH - metrics.pad);
            }
        }
        ctx.restore();
    },

    // ctx.roundRect() gibt es erst in neueren Browsern - der Rückfall hält
    // den Renderer auch dort am Leben, wo (noch) kein WebCodecs-Export
    // möglich ist, denn die Vorschau soll überall laufen.
    _roundRect(ctx, x, y, w, h, r) {
        const radius = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(x, y, w, h, radius);
            return;
        }
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + w, y, x + w, y + h, radius);
        ctx.arcTo(x + w, y + h, x, y + h, radius);
        ctx.arcTo(x, y + h, x, y, radius);
        ctx.arcTo(x, y, x + w, y, radius);
        ctx.closePath();
    }
});
