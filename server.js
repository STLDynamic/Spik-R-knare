import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const files = { '/': ['index.html', 'text/html'], '/src/app.js': ['src/app.js', 'text/javascript'], '/src/model.js': ['src/model.js', 'text/javascript'], '/src/style.css': ['src/style.css', 'text/css'] };
const port = Number(process.env.PORT || 3000);
createServer(async (req, res) => {
  const file = files[new URL(req.url, 'http://localhost').pathname];
  if (!file || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const body = await readFile(new URL(file[0], import.meta.url));
    res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(500); res.end('Unable to read application'); }
}).listen(port, '0.0.0.0', () => console.log(`Spik: port ${port}`));
