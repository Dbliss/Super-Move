import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import fs from 'fs';

// Dev-only endpoints that let the /dimensions editor persist hand-authored data straight back
// into the repo's JSON files. Each route GETs the current file and POST-merges (shallow) into it.
const dataFiles = {
  '/api/dimensions': path.resolve(__dirname, 'src/data/objectDimensions.json'),
  '/api/attributes': path.resolve(__dirname, 'src/data/objectAttributes.json'),
};

const dataFileApiPlugin = () => ({
  name: 'editor-data-api',
  configureServer(server) {
    for (const [route, file] of Object.entries(dataFiles)) {
      server.middlewares.use(route, (req, res) => {
        const read = () => JSON.parse(fs.readFileSync(file, 'utf-8') || '{}');
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(read()));
          return;
        }
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const payload = JSON.parse(body || '{}');
              const next = { ...read(), ...payload };
              // Keep keys sorted so diffs stay readable.
              const sorted = Object.fromEntries(Object.keys(next).sort().map((k) => [k, next[k]]));
              fs.writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true, saved: Object.keys(payload) }));
            } catch (error) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: String(error) }));
            }
          });
          return;
        }
        res.statusCode = 405;
        res.end();
      });
    }
  },
});

export default defineConfig({
  base: '/Super-Move/',
  plugins: [vue(), dataFileApiPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        sandbox: path.resolve(__dirname, 'sandbox.html'),
        dimensions: path.resolve(__dirname, 'dimensions.html'),
      },
    },
  },
});
