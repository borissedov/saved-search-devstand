// End-to-end scenarios for the saved-search exercise, numbered as in the exercise's
// docs/e2e-scenarios.md. They drive the real editor in Chromium against the real API.
const { test, expect, SEED, API, openEditor, field, status, save, serverState } = require('./fixtures');

const editor = (page) => page.locator('#editor');

test.describe('1. Editing (B1, B2)', () => {
  test('1.1 loads the seeded search', async ({ page, request }) => {
    await openEditor(page);
    for (const [key, value] of Object.entries(SEED)) await expect(field(page, key)).toHaveValue(String(value));
    expect((await serverState(request)).version).toBe(1);
  });

  test('1.2 a one-field edit sends only that field and keeps the rest', async ({ page, request }) => {
    await openEditor(page);
    await field(page, 'dateTo').fill('2026-06-20');
    const res = await save(page);
    expect(res.request().postDataJSON()).toEqual({ expectedVersion: 1, filters: { dateTo: '2026-06-20' } });
    expect(res.status()).toBe(200);
    await expect(status(page)).toHaveText('Saved.');
    expect(await serverState(request)).toMatchObject({ version: 2, filters: { ...SEED, dateTo: '2026-06-20' } });
  });

  test('1.3 Clear price cap removes only priceMax', async ({ page, request }) => {
    await openEditor(page);
    await editor(page).getByRole('button', { name: 'Clear price cap' }).click();
    const res = await save(page);
    expect(res.request().postDataJSON().filters).toEqual({ priceMax: null });
    const { priceMax, ...rest } = SEED;
    expect((await serverState(request)).filters).toEqual(rest);
  });

  test('1.4 emptying a text field removes only that filter', async ({ page, request }) => {
    await openEditor(page);
    await field(page, 'query').fill('');
    const res = await save(page);
    expect(res.request().postDataJSON().filters).toEqual({ query: null });
    const { query, ...rest } = SEED;
    expect((await serverState(request)).filters).toEqual(rest);
  });

  test('1.5 saving without changes sends nothing', async ({ page, request }) => {
    await openEditor(page);
    await editor(page).getByRole('button', { name: 'Save' }).click();
    await expect(status(page)).toHaveText('No changes to save.');
    expect(page.patches).toHaveLength(0);
    expect((await serverState(request)).version).toBe(1);
  });

  test('1.6 a typed price is sent as a number', async ({ page, request }) => {
    await openEditor(page);
    await field(page, 'priceMax').fill('250');
    const res = await save(page);
    expect(res.request().postDataJSON().filters).toEqual({ priceMax: 250 });
    expect((await serverState(request)).filters.priceMax).toBe(250);
  });
});

test.describe('2. Validation', () => {
  for (const bad of ['abc', '-5', '0x10', '1e3']) {
    test(`2 price "${bad}" is blocked in the form, no request`, async ({ page, request }) => {
      await openEditor(page);
      await field(page, 'priceMax').fill(bad);
      await editor(page).getByRole('button', { name: 'Save' }).click();
      expect(await field(page, 'priceMax').evaluate((el) => el.validity.patternMismatch)).toBe(true);
      expect(page.patches).toHaveLength(0);
      expect((await serverState(request)).filters.priceMax).toBe(500);
    });
  }

  test('2 a price too large for a number is rejected by the API, not cleared', async ({ page, request }) => {
    await openEditor(page);
    const huge = '9'.repeat(400);
    await field(page, 'priceMax').fill(huge);
    const res = await save(page);
    expect(res.request().postDataJSON().filters).toEqual({ priceMax: huge });
    expect(res.status()).toBe(400);
    await expect(status(page)).toContainText('Could not save (400)');
    await expect(field(page, 'priceMax')).toHaveValue(huge);
    expect(await serverState(request)).toMatchObject({ version: 1, filters: SEED });
  });

  test('2 dates use a native date input', async ({ page }) => {
    await openEditor(page);
    await expect(field(page, 'dateFrom')).toHaveAttribute('type', 'date');
    await expect(field(page, 'dateTo')).toHaveAttribute('type', 'date');
  });

  test('2 a whitespace-only category is sent as a clear (by design)', async ({ page, request }) => {
    await openEditor(page);
    await field(page, 'category').fill('   ');
    const res = await save(page);
    expect(res.request().postDataJSON().filters).toEqual({ category: null });
    expect((await serverState(request)).filters).not.toHaveProperty('category');
  });
});

test.describe('3. Concurrent edits (B3)', () => {
  async function twoTabs(page, context) {
    const pageB = await context.newPage();
    await openEditor(page);
    await openEditor(pageB);
    return pageB;
  }
  const reload = (p) => editor(p).getByRole('button', { name: 'Reload latest' });

  test('3.1-3.4 a stale save gets 409, reload re-applies, nothing is lost', async ({ page, context, request }) => {
    const pageB = await twoTabs(page, context);
    await field(page, 'category').fill('Books');
    expect((await save(page)).status()).toBe(200);

    await field(pageB, 'priceMax').fill('300');
    const conflict = await save(pageB);
    expect(conflict.status()).toBe(409);
    expect(await conflict.json()).toEqual({ error: 'version_conflict', currentVersion: 2 });
    await expect(status(pageB)).toContainText('Someone else changed this search');
    expect(await serverState(request)).toMatchObject({ version: 2, filters: { ...SEED, category: 'Books' } });

    await reload(pageB).click();
    await expect(field(pageB, 'category')).toHaveValue('Books');
    await expect(field(pageB, 'priceMax')).toHaveValue('300');

    const res = await save(pageB);
    expect(res.request().postDataJSON()).toEqual({ expectedVersion: 2, filters: { priceMax: 300 } });
    expect(await serverState(request)).toMatchObject({ version: 3, filters: { ...SEED, category: 'Books', priceMax: 300 } });
  });

  test('3.5 same-field conflict is never overwritten silently', async ({ page, context, request }) => {
    const pageB = await twoTabs(page, context);
    await field(page, 'category').fill('Books');
    await save(page);
    await field(pageB, 'category').fill('Toys');
    expect((await save(pageB)).status()).toBe(409);
    await reload(pageB).click();
    await expect(field(pageB, 'category')).toHaveValue('Toys');
    expect((await serverState(request)).filters.category).toBe('Books');
  });

  test('3.6 an edit and a clear from two tabs both survive', async ({ page, context, request }) => {
    const pageB = await twoTabs(page, context);
    await field(page, 'query').fill('gaming laptops');
    await save(page);
    await editor(pageB).getByRole('button', { name: 'Clear price cap' }).click();
    expect((await save(pageB)).status()).toBe(409);
    await reload(pageB).click();
    expect((await save(pageB)).status()).toBe(200);
    const { priceMax, ...rest } = SEED;
    expect((await serverState(request)).filters).toEqual({ ...rest, query: 'gaming laptops' });
  });
});

test.describe('4. Double actions and failures', () => {
  test('4.1 a double-click on Save sends one request', async ({ page }) => {
    await openEditor(page);
    await field(page, 'dateTo').fill('2026-06-25');
    await editor(page).getByRole('button', { name: 'Save' }).dblclick();
    await expect(status(page)).toHaveText('Saved.');
    expect(page.patches).toHaveLength(1);
  });

  test('4.2 an unreachable API keeps the edits', async ({ page }) => {
    await openEditor(page);
    await field(page, 'category').fill('Books');
    await page.route('**/api/**', (route) => route.abort());
    await editor(page).getByRole('button', { name: 'Save' }).click();
    await expect(status(page)).toContainText('Could not reach the server');
    await expect(field(page, 'category')).toHaveValue('Books');
    await expect(field(page, 'category')).toBeEnabled();
  });

  test('4.3 a failed initial load shows an error, not an endless Loading', async ({ page }) => {
    await page.route('**/api/**', (route) => route.abort());
    await page.goto('/');
    await expect(editor(page).getByRole('status')).toHaveText('Could not load this saved search.');
  });
});

test.describe('5. API directly', () => {
  const patch = (request, data) => request.patch(API, { data });

  test('5.1 the same expectedVersion twice: 200 then 409', async ({ request }) => {
    await request.post('/__reset');
    expect((await patch(request, { expectedVersion: 1, filters: { category: 'Books' } })).status()).toBe(200);
    const second = await patch(request, { expectedVersion: 1, filters: { priceMax: 300 } });
    expect(second.status()).toBe(409);
    expect(await second.json()).toEqual({ error: 'version_conflict', currentVersion: 2 });
  });

  test('5.2 missing expectedVersion: 400', async ({ request }) => {
    expect((await patch(request, { filters: { category: 'Books' } })).status()).toBe(400);
  });

  test('5.3 a __proto__ key: 400 and the server keeps answering', async ({ request }) => {
    await request.post('/__reset');
    const res = await request.patch(API, {
      headers: { 'Content-Type': 'application/json' },
      data: '{"expectedVersion":1,"filters":{"__proto__":{"x":1}}}',
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/unknown filter/);
    expect(await serverState(request)).toMatchObject({ version: 1, filters: SEED });
  });

  test('5.4 unknown id: 404', async ({ request }) => {
    expect((await request.get('/api/saved-searches/nope')).status()).toBe(404);
  });

  for (const filters of [{ priceMax: 'abc' }, { priceMax: -5 }, { priceMax: '0x10' }, { priceMax: '1e3' }, { dateTo: '2026-02-30' }, { dateTo: '2026-6-5' }]) {
    test(`5.5 invalid ${JSON.stringify(filters)}: 400, nothing applied`, async ({ request }) => {
      await request.post('/__reset');
      expect((await patch(request, { expectedVersion: 1, filters })).status()).toBe(400);
      expect(await serverState(request)).toMatchObject({ version: 1, filters: SEED });
    });
  }
});
