import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

function localVercelApiPlugin() {
  return {
    name: 'local-vercel-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next();

        const pathname = new URL(req.url, 'http://localhost').pathname;
        const routeName = pathname.replace(/^\/api\//, '').replace(/\/+$/, '');
        if (!/^[a-z0-9_-]+$/i.test(routeName)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'Rota não encontrada.' }));
          return;
        }

        const handlerFile = path.resolve(process.cwd(), 'api', `${routeName}.js`);
        if (!fs.existsSync(handlerFile)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'Rota não encontrada.' }));
          return;
        }

        try {
          const mod = await server.ssrLoadModule(`/api/${routeName}.js`);
          if (typeof mod.default !== 'function') {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'Handler inválido.' }));
            return;
          }
          await mod.default(req, res);
        } catch (err) {
          server.ssrFixStacktrace(err);
          console.error('[api]', err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'Erro interno do servidor.' }));
          }
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [localVercelApiPlugin()],
});
