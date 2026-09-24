// NEU (v0.40.0-beta, Release-Prüfung D1): gemeinsamer Einstieg für die Tests.
// Lädt nur Module, die ohne Browser auskommen (kein document/window beim Import).
import { app } from '../js/core.js';
await import('../js/config.js');
await import('../js/utils.js');
await import('../js/studio/wordSearch.js');
await import('../js/studio/studioLayout.js');
await import('../js/actions/aiReports.js');
await import('../js/actions/kidMode.js');
await import('../js/actions/familyTools.js');
await import('../js/actions/voiceRecord.js');
await import('../js/actions/nightPrep.js');
// NEU (v0.48.0-beta): Buchatlas-Teile ohne Browser-Abhängigkeit beim Import
await import('../js/atlas/actions/atlasWiki.js');
await import('../js/atlas/actions/atlasTranslate.js');
await import('../js/atlas/atlasNight.js');
export { app };
