import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './helpers.mjs';
await import('../js/actions/backup.js');

// Browser printing is exercised with a document mock. No network, files,
// image decoding, real printer, or changes to saved user books are involved.
function printedHtml(page) {
    const bookId = '__worksheet_print_regression__';
    const oldWindow = globalThis.window;
    const oldBook = app.library[bookId];
    const oldCurrentId = app.state.currentBookId;
    const oldReadingPersona = app.state.readingPersonaId;
    const oldPersona = app.settings.persona;
    let html = '';
    const fakePrintWindow = {
        document: {
            write(value) { html += value; },
            close() {}
        },
        focus() {},
        print() {}
    };

    try {
        globalThis.window = { open: () => fakePrintWindow };
        app.library[bookId] = {
            id: bookId, title: 'Druckprobe', bookType: 'workbook',
            pages: [{
                id: 42, imgUrl: 'data:image/png;base64,dGVzdA==', status: 'done',
                variants: { papa: { text: 'Erklärung', erstleserText: 'Erklärung', helpSteps: [] } },
                ...page
            }]
        };
        app.state.currentBookId = bookId;
        app.state.readingPersonaId = null;
        app.settings.persona = 'papa';
        app.actions.printBook();
        return html;
    } finally {
        if (oldBook === undefined) delete app.library[bookId];
        else app.library[bookId] = oldBook;
        app.state.currentBookId = oldCurrentId;
        app.state.readingPersonaId = oldReadingPersona;
        app.settings.persona = oldPersona;
        if (oldWindow === undefined) delete globalThis.window;
        else globalThis.window = oldWindow;
    }
}

test('text worksheets keep sharp HTML text in the print view', () => {
    const html = printedHtml({
        generatedSheet: { heading: 'Übung', body: ['2 + 2 = __'], printAsImage: false }
    });
    assert.match(html, /2 \+ 2 = __/);
    assert.doesNotMatch(html, /<img src=/);
});

test('graphical worksheets print the saved canvas picture, not its text fallback', () => {
    const html = printedHtml({
        generatedSheet: { heading: 'Bilder', body: ['[Ausmalbild: Garten]'], printAsImage: true }
    });
    assert.match(html, /<img src="data:image\/png;base64,dGVzdA=="/);
    assert.doesNotMatch(html, /\[Ausmalbild: Garten\]/);
});

test('legacy text worksheets without a print mode still print text', () => {
    const html = printedHtml({
        generatedSheet: { heading: 'Alt', body: ['Kreis und Dreieck'] }
    });
    assert.match(html, /Kreis und Dreieck/);
    assert.doesNotMatch(html, /<img src=/);
});

test('pages without generatedSheet still print their image', () => {
    const html = printedHtml({});
    assert.match(html, /<img src="data:image\/png;base64,dGVzdA=="/);
});
