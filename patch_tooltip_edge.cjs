const fs = require('fs');

const FILE = 'src/index.css';
let content = fs.readFileSync(FILE, 'utf8');

const results = [];

function apply(name, oldStr, newStr, count = 1) {
  const occurrences = content.split(oldStr).length - 1;
  if (occurrences !== count) {
    results.push([name, false, `expected ${count} occurrence(s), found ${occurrences}`]);
    return;
  }
  content = content.replace(oldStr, newStr);
  results.push([name, true, null]);
}

apply(
  "fix info-tip-bubble viewport clipping",
  `.info-tip .info-tip-bubble {
  position: absolute;
  bottom: 140%;
  left: 50%;
  transform: translateX(-50%);
  background-color: #1e293b;
  color: #fff;
  font-size: 11px;
  font-weight: 400;
  padding: 8px 10px;
  border-radius: 6px;
  width: 220px;
  line-height: 1.4;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.15s ease;
  z-index: 50;
  pointer-events: none;
  text-align: left;
  text-transform: none;
  letter-spacing: normal;
}`,
  `.info-tip .info-tip-bubble {
  position: absolute;
  bottom: 140%;
  right: 0;
  left: auto;
  transform: none;
  background-color: #1e293b;
  color: #fff;
  font-size: 11px;
  font-weight: 400;
  padding: 8px 10px;
  border-radius: 6px;
  width: 220px;
  max-width: min(220px, 90vw);
  line-height: 1.4;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.15s ease;
  z-index: 50;
  pointer-events: none;
  text-align: left;
  text-transform: none;
  letter-spacing: normal;
}`
);

console.log('\nPatch results:');
let allOk = true;
for (const [name, ok, err] of results) {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${err ? `  (${err})` : ''}`);
  if (!ok) allOk = false;
}

if (!allOk) {
  console.log('\n❌ Anchor failed. NOTHING WAS WRITTEN. Fix anchor and re-run.');
  process.exit(1);
}

fs.writeFileSync(FILE, content);
console.log(`\n✅ Applied successfully. ${FILE} updated.`);
