const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {buildPublicSite} = require('../scripts/build-public-site');

test('public bundle contains homeowner assets and no private app or legacy builder data',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'abq-public-'));
  try {
    buildPublicSite(path.resolve(__dirname,'..'),temp,'https://builder.example.com');
    assert.ok(fs.existsSync(path.join(temp,'index.html')));
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
