const http = require('http');
const { initDb } = require('./db');

const PORT = process.env.PORT || 8080;

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/health') {
      const db = await initDb();
      await db.command({ ping: 1 });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', mongo: 'up', time: new Date().toISOString() }));
      return;
    }
    if (req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Hello from Expense Manager API (MongoDB ready)!');
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'error', message: err.message }));
  }
});

server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
