const base = require('@playwright/test');

const SEED = { query: 'laptops', category: 'Electronics', dateFrom: '2026-06-01', dateTo: '2026-06-15', priceMax: 500 };
const API = '/api/saved-searches/cheap-laptops';

// Chrome logs every 4xx and aborted request as a console error. The tests assert
// those statuses themselves, so only real script errors count.
const isScriptError = (text) => !/Failed to load resource|net::ERR_/.test(text);

function monitorPage(page, errors) {
  page.on('console', (m) => { if (m.type() === 'error' && isScriptError(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.patches = [];
  page.on('request', (r) => { if (r.method() === 'PATCH') page.patches.push(r); });
}

const test = base.test.extend({
  resetStore: [async ({ request }, use) => { await request.post('/__reset'); await use(); }, { auto: true }],

  // Every page in the context (the second tab in section 3 too) is monitored.
  context: async ({ context }, use) => {
    const errors = [];
    context.pages().forEach((p) => monitorPage(p, errors));
    context.on('page', (p) => monitorPage(p, errors));
    await use(context);
    base.expect(errors, 'browser console errors').toEqual([]);
  },
});

async function openEditor(page) {
  await page.goto('/');
  await base.expect(field(page, 'query')).toHaveValue(SEED.query);
}

const field = (page, name) => page.locator('#editor').getByLabel(name, { exact: true });
const status = (page) => page.locator('#editor [role=status]');

async function save(page) {
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'PATCH'),
    page.locator('#editor').getByRole('button', { name: 'Save' }).click(),
  ]);
  return res;
}

async function reloadLatest(page) {
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'GET' && r.url().endsWith(API)),
    page.locator('#editor').getByRole('button', { name: 'Reload latest' }).click(),
  ]);
  await base.expect(status(page)).toContainText('Reloaded the latest version');
}

async function serverState(request) {
  return (await request.get(API)).json();
}

module.exports = { test, expect: base.expect, SEED, API, openEditor, field, status, save, reloadLatest, serverState };
