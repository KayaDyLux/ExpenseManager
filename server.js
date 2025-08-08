const http = require('http');

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello from Expense Manager API!');
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
