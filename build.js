// build.js — compiles src/*.jsx to plain JS and bundles everything into
// a single self-contained KuBi.html. Run: node build.js
const babel = require('@babel/core');
const fs = require('fs');
const path = require('path');

const FILES = require('./build-files.js');

let out = '';
for (const f of FILES) {
  const code = fs.readFileSync(f, 'utf8');
  // runtime:'classic' emits React.createElement — no imports, so the
  // bundle runs as a plain script with no module loader.
  const res = babel.transformSync(code, {
    presets: [[require.resolve('@babel/preset-react'), { runtime: 'classic', development: false }]],
    filename: f,
  });
  out += `\n// ---- ${f} ----\n` + res.code + '\n';
}

const stamp = 'Build: ' + new Date().toLocaleString('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

let html = fs.readFileSync('index.html', 'utf8').replace('__BUILD_STAMP__', function () { return stamp; });
const vendor = ['vendor/react.development.js', 'vendor/react-dom.development.js']
  .map(v => '<script>\n' + fs.readFileSync(v, 'utf8') + '\n</script>')
  .join('\n');

// NOTE: a function replacer is REQUIRED here. With a string replacement,
// JS treats `$$` as an escape for a literal `$`, which silently corrupts
// React's internal `$$typeof` markers and breaks the bundle.
const payload = vendor + '\n<script>\n' + out + '\n</script>\n</body>';
html = html.replace('</body>', function () { return payload; });
fs.writeFileSync('KuBi.html', html);

console.log('Built KuBi.html  (' + (fs.statSync('KuBi.html').size / 1e6).toFixed(2) + ' MB)  ' + stamp);
