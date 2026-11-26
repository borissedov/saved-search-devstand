#!/usr/bin/env node
'use strict';
// src/client/* is read from the exercise repo on every request; src/app.js is loaded
// once at startup, so restart the stand (or use `node --watch`) after API changes.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const repoArg = process.argv[2];
if (!repoArg) {
  console.error('usage: node server.js <path-to-exercise-repo> [port]');
  process.exit(1);
}
const repo = path.resolve(repoArg);
const port = Number(process.argv[3] || process.env.PORT || 5173);
const { createApp } = require(path.join(repo, 'src/app.js'));

const api = createApp();
if (typeof api._store?._reset !== 'function') {
  console.error('createApp() has no _store._reset(); the Reset button needs it.');
  process.exit(1);
}
const pagePath = path.join(__dirname, 'public/index.html');
const clientDir = path.join(repo, 'src/client');

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname.startsWith('/api/')) {
    res.on('finish', () => console.log(new Date().toISOString().slice(11, 19), req.method, url.pathname, res.statusCode));
    return api.emit('request', req, res); // the exercise's own listener(s), with `this` = its server
  }
  if (url.pathname === '/' || url.pathname === '/index.html') {
    return send(res, 200, 'text/html; charset=utf-8', fs.readFileSync(pagePath));
  }
  if (url.pathname === '/__reset' && req.method === 'POST') {
    api._store._reset();
    return send(res, 204, 'text/plain', '');
  }
  const m = url.pathname.match(/^\/src\/client\/([\w.-]+\.jsx?)$/);
  if (m) {
    const file = path.join(clientDir, m[1]);
    if (file.startsWith(clientDir + path.sep) && fs.existsSync(file)) {
      return send(res, 200, 'text/plain; charset=utf-8', fs.readFileSync(file));
    }
  }
  send(res, 404, 'text/plain', 'not found');
}).listen(port, '127.0.0.1', () => {
  console.log(`saved-search dev stand: http://localhost:${port}`);
  console.log(`exercise repo:          ${repo}`);
});
