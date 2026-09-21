const fs = require('node:fs');
const path = require('node:path');

function buildPublicSite(source, output, builderOrigin = '') {
  let target = '';
  if (builderOrigin) {
    const url = new URL(builderOrigin);
    if (url.protocol !== 'https:' || url.username || url.password || url.origin !== builderOrigin.replace(/\/$/, '')) {
      throw new Error('BUILDER_APP_URL must be an HTTPS origin without credentials or a path.');
    }
    target = `${url.origin}/command-center`;
  }
  if (path.resolve(source) === path.resolve(output)) throw new Error('Public output must be separate from the source.');
  fs.mkdirSync(output,{recursive:true});
  if (fs.readdirSync(output).length) throw new Error('Use an empty output folder so no old private files are included.');
  for (const name of ['index.html','favicon.png','favicon.svg','images']) {
    fs.cpSync(path.join(source,name),path.join(output,name),{recursive:true});
  }
  fs.mkdirSync(path.join(output,'data'));
  fs.copyFileSync(path.join(source,'data/model-catalog.json'),path.join(output,'data/model-catalog.json'));
  // The legacy browser-local builder stays in the working copy, not the public bundle.
  fs.writeFileSync(path.join(output,'platform.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ABQ ADU Builder Sign-in</title><style>body{font:18px/1.6 system-ui;background:#faf7f2;color:#1c1917;margin:0;padding:10vh 24px}main{max-width:560px;margin:auto}a{color:#3d5247}h1{line-height:1.15}</style></head><body><main><p>ABQ ADU</p><h1>Private builder workspace</h1><p>Project records, invoices, and payments are available to authorized staff.</p>${target ? `<p><a href="${target}">Sign in to the builder app</a></p>` : '<p>The builder sign-in address has not been published yet. Contact your workspace owner for access.</p>'}<p><a href="index.html">Return to the homeowner website</a></p></main></body></html>`);
}

if (require.main === module) {
  buildPublicSite(path.resolve(__dirname,'..'),path.resolve(__dirname,'../public-dist'),process.env.BUILDER_APP_URL || '');
}
module.exports = {buildPublicSite};
