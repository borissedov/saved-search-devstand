const base = require('@playwright/test');

const SEED = { query: 'laptops', category: 'Electronics', dateFrom: '2026-06-01', dateTo: '2026-06-15', priceMax: 500 };
const API = '/api/saved-searches/cheap-laptops';

// Every page is checked for console errors and for the PATCH requests it sends.
const test = base.test.extend({
  page: async ({ page, request }, use) => {
    await request.post('/__reset');
    const errors = [];
    // Chrome logs every 4xx/aborted request as a console error; those are asserted
    // explicitly by the tests, so only real script errors count here.
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    page.patches = [];
    page.on('request', (r) => { if (r.method() === 'PATCH') page.patches.push(r); });
    await use(page);
    base.expect(errors, 'browser console errors').toEqual([]);
  },
});

async function openEditor(page, url = '/') {
  await page.goto(url);
  await base.expect(page.getByRole('heading', { name: 'Cheap laptops' })).toBeVisible();
  // Wait for the editor (not the stand's own status) to be ready.
  await base.expect(field(page, 'query')).toHaveValue(/.*/);
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

async function serverState(request) {
  return (await request.get(API)).json();
}

module.exports = { test, expect: base.expect, SEED, API, openEditor, field, status, save, serverState };
