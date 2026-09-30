const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');

function contains(snippet) {
  assert(html.includes(snippet), `Expected index.html to contain: ${snippet}`);
}

contains('hero-trust-strip');
contains('hero-trust-inner');
contains('ABQ ADU phone contact');
contains('height: clamp(220px, 58vw, 340px);');
contains('max-width: 760px');
contains('class="hero-phone-card"');
contains('href="tel:15059777659"');
for (const removedCredential of ['We are an accredited', 'Steven Miller', 'www.aduspecialist.org', 'images/adu-specialist-logo.png']) {
  assert(!html.includes(removedCredential), `Removed accreditation content should not be present: ${removedCredential}`);
}

assert(
  !html.includes('.hero-photo { display: none; }'),
  'Hero photo should remain visible on tablet/mobile.'
);

for (const removedSnippet of [
  'Model Intelligence',
  'Pulled Model',
  'source-catalog',
  'source-model-grid',
]) {
  assert(
    !html.includes(removedSnippet),
    `Removed model catalog content should not be present: ${removedSnippet}`
  );
}
