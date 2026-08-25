// test-bundle.js — loads the BUILT KuBi.html and checks it actually runs.
// The journey test compiles src/ directly, so it cannot catch faults
// introduced by the bundling step itself. This one can.
const { JSDOM } = require('jsdom');
const fs = require('fs');

const html = fs.readFileSync('KuBi.html', 'utf8');
const errors = [];

const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
const w = dom.window;
w.addEventListener('error', e => errors.push(e.message || String(e.error)));

setTimeout(function () {
  const root = w.document.getElementById('root');
  const txt = root ? root.textContent : '';

  const checks = [
    ['React loaded', typeof w.React === 'object' && !!w.React],
    ['ReactDOM loaded', typeof w.ReactDOM === 'object' && !!w.ReactDOM],
    ['App namespace present', !!w.KuBi && typeof w.KuBi.nextAction === 'function'],
    ['Root rendered content', root && root.children.length > 0],
    ['Login screen visible', /Enter your PIN|पिन/.test(txt)],
    // Check for the actual inserted element — body.textContent would also
    // match the error handler's own source inside the inline <script>.
    ['No error banner', !w.__kubiErrorShown],
    ['No runtime errors', errors.length === 0],
  ];

  let failed = 0;
  checks.forEach(function (c) {
    if (!c[1]) failed++;
    console.log((c[1] ? 'PASS  ' : 'FAIL  ') + c[0]);
  });

  console.log('\n================================');
  console.log('BUNDLE: ' + (checks.length - failed) + '/' + checks.length + ' passed');
  if (errors.length) {
    console.log('ERRORS:');
    errors.slice(0, 5).forEach(e => console.log('  ' + e));
  }
  process.exit(failed ? 1 : 0);
}, 900);
