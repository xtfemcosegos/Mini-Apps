import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_PORT = 7006;
const BACKEND_PORT = 7001;
const PUBLIC_DIR = fs.existsSync(path.join(__dirname, 'dist')) ? path.join(__dirname, 'dist') : __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.mjs': 'text/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.webmanifest': 'application/manifest+json; charset=UTF-8',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=UTF-8'
};

const COMPRESSIBLE_EXTS = new Set(['.html', '.css', '.js', '.mjs', '.json', '.webmanifest', '.svg', '.txt']);
const staticCache = new Map();

function serveCompressedStatic(req, res, filePath, contentType, ext) {
  try {
    const stat = fs.statSync(filePath);
    const etag = `W/"${stat.size}-${Math.floor(stat.mtimeMs)}"`;
    const baseHeaders = {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      'ETag': etag
    };

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, baseHeaders);
      res.end();
      return;
    }

    const acceptEncoding = req.headers['accept-encoding'] || '';
    if (COMPRESSIBLE_EXTS.has(ext) && stat.size > 256 && acceptEncoding.includes('gzip')) {
      let cached = staticCache.get(filePath);
      if (!cached || cached.mtimeMs !== stat.mtimeMs) {
        const raw = fs.readFileSync(filePath);
        const gzipped = zlib.gzipSync(raw, { level: zlib.constants.Z_BEST_SPEED });
        cached = { mtimeMs: stat.mtimeMs, gzipped };
        if (staticCache.size > 60) staticCache.clear();
        staticCache.set(filePath, cached);
      }
      baseHeaders['Content-Encoding'] = 'gzip';
      baseHeaders['Content-Length'] = cached.gzipped.length;
      baseHeaders['Vary'] = 'Accept-Encoding';
      res.writeHead(200, baseHeaders);
      res.end(cached.gzipped);
      return;
    }

    baseHeaders['Content-Length'] = stat.size;
    res.writeHead(200, baseHeaders);
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
    res.end('Recurso no encontrado');
  }
}

const BLOCKED_FILES = new Set([
  'server.js', 'server.cjs', 'package.json', 'package-lock.json', 'vite.config.js'
]);

const server = http.createServer((req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, *',
      'Access-Control-Allow-Private-Network': 'true'
    });
    res.end();
    return;
  }

  // Proxy inverso transparente a la API de UBE en puerto 7001
  if (req.url.startsWith('/api/') || req.url.startsWith('/photos/') || req.url.startsWith('/backend/photos/')) {
    const proxyReq = http.request({
      hostname: '127.0.0.1',
      port: BACKEND_PORT,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: `127.0.0.1:${BACKEND_PORT}`,
        'x-forwarded-for': req.socket.remoteAddress,
        'x-forwarded-proto': 'http',
        'x-forwarded-host': req.headers.host || `localhost:${FRONTEND_PORT}`
      }
    }, (proxyRes) => {
      if (!res.headersSent) {
        res.writeHead(proxyRes.statusCode, {
          ...proxyRes.headers,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Private-Network': 'true'
        });
      }
      proxyRes.pipe(res);

      proxyRes.on('error', (err) => {
        try { res.end(); } catch (e) {}
      });
    });

    proxyReq.on('error', (err) => {
      console.warn(`[Mini Apps Proxy Error :7006 -> :7001] ${req.url}:`, err.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'No se pudo comunicar con el motor UBE en puerto 7001',
          detalle: err.message
        }));
      } else {
        try { res.end(); } catch (e) {}
      }
    });

    // Limpieza de sockets solo si el cliente aborta la conexión antes de finalizar la respuesta
    res.on('close', () => {
      if (!res.writableEnded) {
        try { proxyReq.destroy(); } catch (e) {}
      }
    });

    req.pipe(proxyReq);
    return;
  }

  // Servir archivos estáticos de Mini Apps
  let reqPath = req.url.split('?')[0].split('#')[0];
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  } else if (reqPath === '/checador' || reqPath === '/checador-movil') {
    reqPath = '/checador-movil.html';
  } else if (reqPath === '/recorridos' || reqPath === '/recorrido-movil') {
    reqPath = '/recorrido-movil.html';
  } else if (reqPath === '/bitacora' || reqPath === '/bitacora-movil') {
    reqPath = '/bitacora-movil.html';
  } else if (reqPath === '/prestadores' || reqPath === '/prestadores-movil') {
    reqPath = '/prestadores-movil.html';
  }

  const baseName = path.basename(reqPath);
  if (BLOCKED_FILES.has(baseName)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=UTF-8' });
    res.end('Acceso denegado');
    return;
  }

  let filePath = path.normalize(path.join(PUBLIC_DIR, reqPath));
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    // Si no está en dist, buscar en la raíz de Mini Apps
    const fallbackPath = path.normalize(path.join(__dirname, reqPath));
    if (fallbackPath.startsWith(__dirname) && fs.existsSync(fallbackPath) && fs.statSync(fallbackPath).isFile()) {
      filePath = fallbackPath;
    } else {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    serveCompressedStatic(req, res, filePath, contentType, ext);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
    res.end('Recurso no encontrado');
  }
});

server.listen(FRONTEND_PORT, '0.0.0.0', () => {
  console.log(`[Mini Apps] Servidor activo en http://localhost:${FRONTEND_PORT} (Proxy hacia UBE :${BACKEND_PORT})`);
});

export default server;
