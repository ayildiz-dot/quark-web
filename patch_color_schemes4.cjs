const fs = require('fs');

const results = [];

function applyTo(filePath, name, oldStr, newStr, count = 1) {
  let content = fs.readFileSync(filePath, 'utf8');
  const occurrences = content.split(oldStr).length - 1;
  if (occurrences !== count) {
    results.push([name, false, `expected ${count} occurrence(s) in ${filePath}, found ${occurrences}`]);
    return;
  }
  content = content.replace(oldStr, newStr);
  fs.writeFileSync(filePath, content);
  results.push([name, true, null]);
}

applyTo(
  'src/components/Navbar.jsx',
  "update SCHEMES labels/swatches",
  `  { key: 'midnight', label: 'Midnight', swatch: '#5865f2' },
  { key: 'forest',   label: 'Forest',   swatch: '#10b981' },
  { key: 'slate',    label: 'Slate',    swatch: '#7c94b3' },`,
  `  { key: 'midnight', label: 'Violet',   swatch: '#7c6fd6' },
  { key: 'forest',   label: 'Forest',   swatch: '#10b981' },
  { key: 'slate',    label: 'Sunset',   swatch: '#d85a30' },`
);

applyTo(
  'src/index.css',
  "replace Midnight colors with Violet",
  `[data-scheme="midnight"] { --accent: #5865f2; --accent-hover: #4752c4; --accent-light: #262a5e; --sidebar-bg: #1b1e3d; }
[data-theme="light"][data-scheme="midnight"] { --accent: #4752c4; --accent-hover: #3c45a5; --accent-light: #e0e3ff; --sidebar-bg: #f0f1ff; }`,
  `[data-scheme="midnight"] { --accent: #7c6fd6; --accent-hover: #6355c4; --accent-light: #26215c; --sidebar-bg: #1e1626; }
[data-theme="light"][data-scheme="midnight"] { --accent: #6355c4; --accent-hover: #4f3fa8; --accent-light: #ece9fc; --sidebar-bg: #f5f3ff; }`
);

applyTo(
  'src/index.css',
  "replace Slate colors with Sunset",
  `[data-scheme="slate"] { --accent: #7c94b3; --accent-hover: #6482a8; --accent-light: #263242; --sidebar-bg: #1e2632; }
[data-theme="light"][data-scheme="slate"] { --accent: #51677f; --accent-hover: #435566; --accent-light: #e2e8f0; --sidebar-bg: #f8fafc; }`,
  `[data-scheme="slate"] { --accent: #d85a30; --accent-hover: #b8481f; --accent-light: #4a1b0c; --sidebar-bg: #241a10; }
[data-theme="light"][data-scheme="slate"] { --accent: #b8481f; --accent-hover: #963a19; --accent-light: #faece7; --sidebar-bg: #fdf5f2; }`
);

console.log('\nPatch results:');
let allOk = true;
for (const [name, ok, err] of results) {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${err ? `  (${err})` : ''}`);
  if (!ok) allOk = false;
}

if (!allOk) {
  console.log('\n❌ One or more anchors failed. Files that succeeded were still written — check git diff carefully before committing.');
  process.exit(1);
}

console.log('\n✅ All patches applied successfully.');
