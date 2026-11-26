# Saved search dev stand

A local stand for manually testing the saved-search exercise end to end: the
exercise's **real** React editor (`src/client/SavedSearchEditor.jsx`) in a
browser, talking to its **real** API (`createApp()` from `src/app.js`).

It lives outside the exercise repository on purpose. The exercise rules out adding
a build tool, and the stand compiles JSX in the browser with Babel. Nothing from
the exercise is copied here. Client files (`src/client/*`) are read live on every
request. The API (`src/app.js`) is loaded once at startup, so restart the stand
(or run it with `node --watch`) after API changes.

## Run

```bash
node server.js /path/to/exercise-repo        # http://localhost:5173
node server.js /path/to/exercise-repo 8080   # another port
```

Node 18+ for the stand, no install (the e2e suite needs Node 20+). React 18.3.1, Babel standalone 7.24.7 and Tailwind 3.4.5 come
from public CDNs, so the browser needs network access.

## What you get
- The editor, mounted as is and styled by the stand (the component itself has no classes).
- **Server state:** the stored search, refreshed after each editor request, on tab focus and on demand (no polling, so the Network tab stays readable).
- **Requests from the editor:** every `PATCH`, with its status, request body and response.
- **Reset data:** restores the seeded search (`version: 1`).

The store is in memory and shared by every tab, so two tabs on the same URL behave
like two users editing the same search. That is how the 409 conflict flow is
tested.

## End-to-end tests

`e2e/` holds a Playwright suite, numbered as in the exercise's
`docs/e2e-scenarios.md`.
- **Editing:** exact `PATCH` bodies for one-field edits and clears.
- **Validation:** checks in both the form and the API.
- **Concurrent edits:** two tabs, a 409, then *Reload latest* re-applies the pending edits.
- **Failures:** a double submit, and an unreachable API on save and on load.
- **API:** direct checks.

Every page also fails the test on any browser console script error.

```bash
npm install && npx playwright install chromium
EXERCISE_REPO=/path/to/exercise-repo npm run test:e2e
```

The suite needs Node 20+ and starts its own stand on port 5199. Tests share one
in-memory store, which is reset before each test, so they run serially. Against the
original starter, every test fails except 1.1 (the page loads) and 5.4 (unknown
id → 404).

## How it works
- `server.js` routes `/api/*` to the exercise's own request handler, serves
  `public/index.html`, and serves `src/client/*.js(x)` from the exercise repo.
  `POST /__reset` resets the store.
- `public/index.html` runs a small CommonJS loader. It fetches each client file,
  compiles it with Babel (`react` + `env`/commonjs), and mounts the default export
  of `SavedSearchEditor.jsx`.

This is a dev tool only, not production code.
