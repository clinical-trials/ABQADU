const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');

function contains(snippet) {
  assert(html.includes(snippet), `Expected index.html to contain: ${snippet}`);
}

contains('hero-trust-strip');
contains('hero-trust-inner');
contains('ABQ ADU credentials and phone contact');
contains('height: clamp(220px, 58vw, 340px);');
contains('max-width: 760px');
contains('We are an accredited <a href="https://www.aduspecialist.org/"');

assert(
  !html.includes('.hero-photo { display: none; }'),
  'Hero photo should remain visible on tablet/mobile.'
);

