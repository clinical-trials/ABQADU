const express = require('express');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC_UNAVAILABLE = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ABQ ADU</title></head><body><main><h1>ABQ ADU homeowner website temporarily unavailable</h1><p>Please try again shortly, or call <a href="tel:15059777659">(505) 977-7659</a>.</p></main></body></html>';
const IMAGE_EXTENSION = /\.(avif|gif|ico|jpe?g|png|svg|webp)$/i;

function createPublicHomeownerRouter({
  bundledRoot = path.resolve(__dirname, '../../public-homeowner'),
  sourceRoot = path.resolve(__dirname, '../../../..'),
} = {}) {
  const router = express.Router();
  // A deployed bundle is one release; never fill missing files from another source.
  const publicRoot = path.resolve(fs.existsSync(bundledRoot) ? bundledRoot : sourceRoot);

  function unavailable(res, homepage) {
    if (homepage) return res.status(503).set('Cache-Control', 'no-store').type('html').send(PUBLIC_UNAVAILABLE);
    return res.status(404).type('text').send('Not found');
  }

  async function sendPublicFile(relativePath, res, next, homepage = false) {
    try {
      const realRoot = await fs.promises.realpath(publicRoot);
      const filename = path.resolve(realRoot, relativePath);
      const realFile = await fs.promises.realpath(filename);
      // Reject symlink escapes as well as traversal; only these public files are served.
      if (!filename.startsWith(`${realRoot}${path.sep}`) || realFile !== filename) {
        return unavailable(res, homepage);
      }
      return res.sendFile(realFile, { dotfiles: 'deny' }, error => {
        if (!error) return;
        if (res.headersSent) return next(error);
        return unavailable(res, homepage);
      });
    } catch (_error) {
      return unavailable(res, homepage);
    }
  }

  router.get(['/', '/index.html'], (_req, res, next) => sendPublicFile('index.html', res, next, true));
  router.get('/platform.html', (_req, res) => res.redirect('/command-center'));
  for (const filename of ['favicon.png', 'favicon.svg', 'data/model-catalog.json']) {
    router.get(`/${filename}`, (_req, res, next) => sendPublicFile(filename, res, next));
  }
  router.get('/images/*', (req, res, next) => {
    const filename = req.params[0];
    if (!IMAGE_EXTENSION.test(filename) || filename.includes('\\') || filename.split('/').some(part => !part || part.startsWith('.'))) {
      return unavailable(res, false);
    }
    return sendPublicFile(`images/${filename}`, res, next);
  });
  // Missing public assets must not fall through to a private workspace HTML page.
  router.use(['/images', '/data', '/favicon.png', '/favicon.svg', '/favicon.ico'], (_req, res) => unavailable(res, false));
  return router;
}

module.exports = { createPublicHomeownerRouter };
