// Real Chrome DevTools Protocol runner for the LeseZauber IndexedDB test.
// Uses Node 22's native WebSocket + fetch; no npm runtime dependencies.
const endpoint = 'http://127.0.0.1:9222/json/list';
const url = 'http://127.0.0.1:8765/tests/browser/full-backup-browser.html';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let target;
for (let attempt = 0; attempt < 60; attempt++) {
    try {
        const response = await fetch(endpoint);
        if (response.ok) {
            const tabs = await response.json();
            target = tabs.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
            if (target) break;
        }
    } catch {}
    await sleep(250);
}
if (!target) throw new Error('Chrome DevTools target not found');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome WebSocket timeout')), 5000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener('error', e => { clearTimeout(timer); reject(e); }, { once: true });
});
let serial = 0;
const pending = new Map();
ws.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    const p = pending.get(data.id);
    if (p) {
        pending.delete(data.id);
        if (data.error) p.reject(new Error(JSON.stringify(data.error)));
        else p.resolve(data.result);
    }
});
function command(method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = ++serial;
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error('CDP command timeout: ' + method));
        }, 6000);
        pending.set(id, {
            resolve: value => { clearTimeout(timer); resolve(value); },
            reject: error => { clearTimeout(timer); reject(error); }
        });
        ws.send(JSON.stringify({ id, method, params }));
    });
}
try {
    await command('Page.enable');
    await command('Runtime.enable');
    await command('Page.navigate', { url });
    let last = '';
    const started = Date.now();
    while (Date.now() - started < 40000) {
        try {
            const result = await command('Runtime.evaluate', {
                expression: "document.querySelector('#result')?.textContent ?? ''",
                returnByValue: true,
                awaitPromise: false
            });
            const value = result.result?.value || '';
            if (value !== last) {
                console.log('Browser result:', JSON.stringify(value.slice(0, 450)));
                last = value;
            }
            if (value === 'PASS_BROWSER_IDB_RELOAD_AUDIO_0_CREDITS') {
                console.log('PASS: real Chromium IndexedDB rollback + binary audio persistence after reload');
                process.exitCode = 0;
                break;
            }
            if (value.startsWith('FAIL_BROWSER_IDB')) throw new Error(value);
        } catch (e) {
            if (String(e.message).includes('FAIL_BROWSER_IDB')) throw e;
            // Renderer can temporarily have no JS context while reloading.
        }
        await sleep(250);
    }
    if (last !== 'PASS_BROWSER_IDB_RELOAD_AUDIO_0_CREDITS')
        throw new Error('Browser did not complete: ' + JSON.stringify(last));
} finally {
    ws.close();
}
