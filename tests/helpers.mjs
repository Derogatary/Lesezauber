// NEU (v0.40.0-beta, Release-Prüfung D1): gemeinsamer Einstieg für die Tests.
// Lädt nur Module, die ohne Browser auskommen (kein document/window beim Import).
import { app } from '../js/core.js';
await import('../js/config.js');
await import('../js/utils.js');
await import('../js/studio/wordSearch.js');
await import('../js/studio/studioLayout.js');
export { app };
