import { app } from './core.js';

Object.assign(app.readerUI, {
    setTab(tab) {
        app.state.activeTab = tab;
        ['Original', 'Erstleser', 'Quiz', 'Birkenbihl'].forEach(t => {
            const btn = document.getElementById(`tab${t}`);
            const content = document.getElementById(`content${t}`);
            if (t.toLowerCase() === tab) {
                btn.className = 'flex-1 py-2 rounded-lg text-center bg-white shadow-sm text-indigo-900 font-bold';
                content.classList.remove('hidden');
            } else {
                btn.className = 'flex-1 py-2 rounded-lg text-center text-slate-600 hover:text-slate-900 font-medium';
                content.classList.add('hidden');
            }
        });
    }
});
