const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {buildPublicSite} = require('../scripts/build-public-site');
const {packageHomeownerSite} = require('../scripts/package-homeowner-site');

test('public bundle contains homeowner assets and no private app or legacy builder data',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'abq-public-'));
  try {
    buildPublicSite(path.resolve(__dirname,'..'),temp,'https://builder.example.com');
    assert.ok(fs.existsSync(path.join(temp,'index.html')));
    for (const filename of ['selections.html', 'homeowner-selections.js', 'homeowner-selections.css']) {
      assert.ok(fs.existsSync(path.join(temp, filename)), `Public selections asset required: ${filename}`);
    }
    assert.ok(fs.existsSync(path.join(temp,'data/model-catalog.json')));
    assert.equal(fs.existsSync(path.join(temp,'platform')),false);
    assert.equal(fs.existsSync(path.join(temp,'docs')),false);
    assert.equal(fs.existsSync(path.join(temp,'.env')),false);
    const entry=fs.readFileSync(path.join(temp,'platform.html'),'utf8');
    assert.match(entry,/https:\/\/builder.example.com\/command-center/);
    assert.doesNotMatch(entry,/Amherst|localStorage|api_key|client_phone/);
    assert.throws(()=>buildPublicSite(path.resolve(__dirname,'..'),temp,'javascript:alert(1)'));
  } finally {fs.rmSync(temp,{recursive:true,force:true});}
});

test('server packaging refreshes only its generated public folder and preserves saved data', () => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'abq-homeowner-package-'));
  try {
    fs.mkdirSync(path.join(source, 'images'));
    fs.mkdirSync(path.join(source, 'data'));
    fs.mkdirSync(path.join(source, 'platform/server/data'), { recursive: true });
    for (const name of ['index.html', 'selections.html', 'homeowner-selections.js', 'homeowner-selections.css', 'favicon.png', 'favicon.svg', 'data/model-catalog.json']) fs.writeFileSync(path.join(source, name), 'public fixture');
    const saved = path.join(source, 'platform/server/data/saved-project.json');
    fs.writeFileSync(saved, 'private fixture');
    const output = packageHomeownerSite(source);
    fs.writeFileSync(path.join(output, 'stale.txt'), 'old output');
    fs.writeFileSync(path.join(source, 'index.html'), 'updated homeowner site');
    packageHomeownerSite(source);
    assert.equal(fs.readFileSync(path.join(output, 'index.html'), 'utf8'), 'updated homeowner site');
    assert.equal(fs.existsSync(path.join(output, 'stale.txt')), false);
    assert.equal(fs.existsSync(path.join(output, 'platform')), false);
    assert.equal(fs.readFileSync(saved, 'utf8'), 'private fixture');
    fs.unlinkSync(path.join(source, 'index.html'));
    assert.throws(() => packageHomeownerSite(source));
    assert.equal(fs.readFileSync(path.join(output, 'index.html'), 'utf8'), 'updated homeowner site', 'A failed build leaves the previous public site available');
  } finally { fs.rmSync(source, { recursive: true, force: true }); }
});
