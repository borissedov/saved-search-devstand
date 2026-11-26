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

Node 18+, no install. React 18.3.1, Babel standalone 7.24.7 and Tailwind 3.4.5 come
from public CDNs, so the browser needs network access.

## What you get
- The editor, mounted as is and styled by the stand (the component itself has no classes).
- **Server state:** the stored search, refreshed after each editor request, on tab focus and on demand (no polling, so the Network tab stays readable).
- **Requests from the editor:** every `PATCH`, with its status, request body and response.
- **Reset data:** restores the seeded search (`version: 1`).

The store is in memory and shared by every tab, so two tabs on the same URL behave
like two users editing the same search. That is how the 409 conflict flow is
tested.

## How it works
- `server.js` routes `/api/*` to the exercise's own request handler, serves
  `public/index.html`, and serves `src/client/*.js(x)` from the exercise repo.
  `POST /__reset` resets the store.
- `public/index.html` runs a small CommonJS loader. It fetches each client file,
  compiles it with Babel (`react` + `env`/commonjs), and mounts the default export
  of `SavedSearchEditor.jsx`.

This is a dev tool only, not production code.
