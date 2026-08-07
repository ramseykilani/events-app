// #region agent log
// DEBUG-ONLY instrumentation helper (temporary; remove with instrumentation).
// Tiny HTTP sink that appends NDJSON lines POSTed from the web app to
// /opt/cursor/logs/debug.log so runtime evidence can be analyzed offline.
const http = require('http');
const fs = require('fs');

const LOG_PATH = '/opt/cursor/logs/debug.log';
const PORT = 9100;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  if (req.method === 'POST' && req.url === '/log') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        fs.mkdirSync('/opt/cursor/logs', { recursive: true });
        fs.appendFileSync(LOG_PATH, body.endsWith('\n') ? body : body + '\n');
      } catch (err) {
        console.error('sink write failed:', err);
      }
      res.writeHead(204);
      res.end();
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`debug log sink listening on :${PORT}, writing to ${LOG_PATH}`);
});
// #endregion
