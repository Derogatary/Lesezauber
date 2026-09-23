// NEU (v0.40.0-beta, Release-Prüfung D1/D2): die vier "Sanity-Checks vor jedem
// Commit" aus CLAUDE.md als EIN Skript - läuft lokal (`npm run check`), in der
// GitHub-Action (.github/workflows/checks.yml) und im Skill "releasecheck".
// Vorher waren es Bash-Einzeiler zum Kopieren, die niemand automatisch ausgeführt hat.
// Ergebnis: Exit-Code 0 = alles gut, 1 = mindestens ein Fehler (Liste in der Ausgabe).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const problems = [];

function jsFiles(dir) {
    return readdirSync(dir).flatMap(name => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return name === 'vendor' ? [] : jsFiles(full);
        return name.endsWith('.js') || name.endsWith('.mjs') ? [full] : [];
    });
}
const files = jsFiles(join(root, 'js'));
const html = readFileSync(join(root, 'index.html'), 'utf8');
const allJs = files.map(f => readFileSync(f, 'utf8')).join('\n');

// 1. Syntax aller eigenen JS-Dateien
for (const f of files) {
    try {
        execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    } catch (e) {
        problems.push(`Syntaxfehler in ${relative(root, f)}: ${String(e.stderr).split('\n').slice(0, 5).join(' ')}`);
    }
}

// 2. Jede per getElementById benutzte ID muss im HTML existieren
const usedIds = new Set([...allJs.matchAll(/getElementById\('([a-zA-Z0-9]+)'\)/g)].map(m => m[1]));
const htmlIds = new Set([...html.matchAll(/id="([a-zA-Z0-9]+)"/g)].map(m => m[1]));
for (const id of usedIds) if (!htmlIds.has(id)) problems.push(`ID "${id}" wird in JS benutzt, fehlt aber in index.html`);

// 3. Jeder app.x.y(...)-Aufruf im HTML muss definiert sein
const calls = new Set([...html.matchAll(/app\.([a-zA-Z]+)\.([a-zA-Z]+)\(/g)].map(m => `${m[1]}.${m[2]}`));
for (const call of calls) {
    const fn = call.split('.')[1];
    if (!new RegExp(`^\\s*(async )?${fn}\\s*\\(`, 'm').test(allJs)) problems.push(`index.html ruft app.${call}() auf, die Funktion ist nirgends definiert`);
}

// 4. sw.js: alle gelisteten Dateien existieren
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
for (const m of sw.matchAll(/'\.\/([^']+)'/g)) {
    if (m[1] && !existsSync(join(root, m[1]))) problems.push(`sw.js listet ./${m[1]}, die Datei existiert nicht`);
}

// 5. (NEU) Jede JS-Datei unter js/ (außer vendor) muss in sw.js stehen - sonst
// fehlt sie offline. Ausnahme: Dateien, die nur per import() nachgeladen werden.
for (const f of files) {
    const rel = relative(root, f).split('\\').join('/');
    if (!sw.includes(`'./${rel}'`)) problems.push(`${rel} fehlt in der APP_SHELL-Liste von sw.js`);
}

// 6. (NEU) Version im App-Header und CACHE_NAME vorhanden
if (!/data-app-version[^>]*>v\d+\.\d+\.\d+(-beta)?</.test(html)) problems.push('Versionsanzeige (data-app-version) in index.html nicht gefunden');
if (!/const CACHE_NAME = 'lesezauber-shell-v\d+'/.test(sw)) problems.push('CACHE_NAME in sw.js nicht gefunden');

// 7. (NEU) Jede Adresse, die der Code per fetch() aufruft, muss in der
// Content-Security-Policy (connect-src in index.html) stehen - sonst blockt der
// Browser den Aufruf still. Fängt vergessene CSP-Einträge bei neuen Anbietern ab.
const csp = (html.match(/Content-Security-Policy" content="([^"]+)"/) || [])[1];
if (!csp) {
    problems.push('Content-Security-Policy fehlt in index.html');
} else {
    const connect = (csp.match(/connect-src ([^;]+)/) || [])[1] || '';
    const hosts = new Set([...allJs.matchAll(/fetch\(\s*[`'"]https:\/\/([a-zA-Z0-9.-]+)/g)].map(m => m[1]));
    hosts.add('image.pollinations.ai'); // wird über eine zusammengesetzte URL abgerufen
    for (const h of hosts) if (!connect.includes(`https://${h}`)) problems.push(`fetch() an https://${h}, aber nicht in connect-src der CSP`);
}

if (problems.length) {
    console.log(`❌ ${problems.length} Problem(e):`);
    problems.forEach(p => console.log(' - ' + p));
    process.exit(1);
}
console.log(`✅ Sanity-Checks bestanden (${files.length} JS-Dateien, ${usedIds.size} IDs, ${calls.size} onclick-Aufrufe).`);
