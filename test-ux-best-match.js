#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const css   = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');

let passed = 0;
let failed = 0;

function test(name, condition) {
  if (condition) {
    console.log(`  PASS  ${name}`);
    passed++;
  } else {
    console.log(`  FAIL  ${name}`);
    failed++;
  }
}

console.log('\nBest-Match UX Tests\n');

// CSS: section label style
test('CSS: .results-section-label rule exists',           css.includes('.results-section-label'));
test('CSS: section label is uppercase',                   /results-section-label[\s\S]{0,200}text-transform:\s*uppercase/.test(css));

// CSS: dimming rules
test('CSS: non-top cards dimmed to 0.5 opacity',          /result-card:not\(\.top-match\)\s*\{[^}]*opacity:\s*0\.5/.test(css));
test('CSS: dimmed cards restore to full opacity on hover', /result-card:not\(\.top-match\):hover\s*\{[^}]*opacity:\s*1/.test(css));
test('CSS: result-card transition includes opacity',       /\.result-card\s*\{[\s\S]{0,300}transition:[^;}]*opacity/.test(css));

// JS: section headers injected in render()
test('JS: results-section-label class used in render',    appJs.includes('results-section-label'));
test('JS: "Top Result" label inserted at index 0',        /i\s*===\s*0[\s\S]{0,300}Top Result/.test(appJs));
test('JS: "Other Matches" label inserted at index 1',     /i\s*===\s*1[\s\S]{0,300}Other Matches/.test(appJs));
test('JS: label appended to resultsEl before card',       /results-section-label[\s\S]{0,100}resultsEl\.appendChild\(label\)[\s\S]{0,200}result-card/.test(appJs));

// JS: existing top-match / badge logic unchanged
test('JS: top-match class still applied to first card',   appJs.includes("(i === 0 ? ' top-match' : '')"));
test('JS: Best match badge still present',                appJs.includes('"Best match"'));

// JS: snippet highlighting
test('JS: highlightSnippet function defined',             /function highlightSnippet\(/.test(appJs));
test('JS: highlightSnippet wraps matches in <strong>',    appJs.includes('`<strong>${escaped}</strong>`'));
test('JS: highlightSnippet escapes HTML before wrapping', /escHtml\(word\)[\s\S]{0,100}<strong>/.test(appJs));
test('JS: render uses highlightSnippet for snippet',      appJs.includes('highlightSnippet(r.snippet, tokenize(query))'));
test('JS: escHtml no longer used directly on r.snippet',  !appJs.includes('escHtml(r.snippet)'));

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
