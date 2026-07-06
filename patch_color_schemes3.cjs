const fs = require('fs');
let ok = true;

function patchFile(path, label, oldStr, newStr) {
  let content = fs.readFileSync(path, 'utf8');
  if (!content.includes(oldStr)) {
    console.log(`❌ ${label}: anchor not found in ${path}`);
    ok = false;
    return;
  }
  content = content.replace(oldStr, newStr);
  fs.writeFileSync(path, content);
  console.log(`✅ ${label}`);
}

// 1. index.css — Midnight → Electric Indigo
patchFile('src/index.css', 'Midnight → Electric Indigo',
`/* Midnight — deep-space teal/cyan */
[data-scheme="midnight"] { --accent: #0891b2; --accent-hover: #0e7490; --accent-light: #164e63; --sidebar-bg: #0b1220; }
[data-theme="light"][data-scheme="midnight"] { --accent: #0e7490; --accent-hover: #155e75; --accent-light: #cffafe; --sidebar-bg: #ecfeff; }`,
`/* Midnight — electric indigo */
[data-scheme="midnight"] { --accent: #5865f2; --accent-hover: #4752c4; --accent-light: #262a5e; --sidebar-bg: #1b1e3d; }
[data-theme="light"][data-scheme="midnight"] { --accent: #4752c4; --accent-hover: #3c45a5; --accent-light: #e0e3ff; --sidebar-bg: #f0f1ff; }`
);

// 2. index.css — Slate → Steel
patchFile('src/index.css', 'Slate → Steel',
`/* Slate — steel/denim blue, deepened sidebar for real contrast */
[data-scheme="slate"] { --accent: #5b7fa6; --accent-hover: #44607f; --accent-light: #1f2f3f; --sidebar-bg: #0f172a; }
[data-theme="light"][data-scheme="slate"] { --accent: #44607f; --accent-hover: #33495f; --accent-light: #e2e8f0; --sidebar-bg: #f8fafc; }`,
`/* Slate — muted steel gray-blue */
[data-scheme="slate"] { --accent: #7c94b3; --accent-hover: #6482a8; --accent-light: #263242; --sidebar-bg: #1e2632; }
[data-theme="light"][data-scheme="slate"] { --accent: #51677f; --accent-hover: #435566; --accent-light: #e2e8f0; --sidebar-bg: #f8fafc; }`
);

// 3. index.css — Crimson → Berry
patchFile('src/index.css', 'Crimson → Berry',
`/* Crimson — wine/rose, kept distinct from danger/error red */
[data-scheme="crimson"] { --accent: #be123c; --accent-hover: #9f1239; --accent-light: #4c0519; --sidebar-bg: #2b0710; }
[data-theme="light"][data-scheme="crimson"] { --accent: #9f1239; --accent-hover: #881337; --accent-light: #ffe4e6; --sidebar-bg: #fff1f2; }`,
`/* Berry — raspberry/magenta (key stays "crimson" for backward compatibility) */
[data-scheme="crimson"] { --accent: #d6409f; --accent-hover: #b8348a; --accent-light: #3f1a35; --sidebar-bg: #2c1526; }
[data-theme="light"][data-scheme="crimson"] { --accent: #b8348a; --accent-hover: #9c2b74; --accent-light: #fce7f3; --sidebar-bg: #fdf2f8; }`
);

// 4. Navbar.jsx — swatches + relabel Crimson to Berry
patchFile('src/components/Navbar.jsx', 'Navbar swatches + Berry label',
`  { key: 'midnight', label: 'Midnight', swatch: '#0891b2' },
  { key: 'forest',   label: 'Forest',   swatch: '#10b981' },
  { key: 'slate',    label: 'Slate',    swatch: '#5b7fa6' },
  { key: 'plum',     label: 'Plum',     swatch: '#a855f7' },
  { key: 'crimson',  label: 'Crimson',  swatch: '#be123c' },`,
`  { key: 'midnight', label: 'Midnight', swatch: '#5865f2' },
  { key: 'forest',   label: 'Forest',   swatch: '#10b981' },
  { key: 'slate',    label: 'Slate',    swatch: '#7c94b3' },
  { key: 'plum',     label: 'Plum',     swatch: '#a855f7' },
  { key: 'crimson',  label: 'Berry',    swatch: '#d6409f' },`
);

if (!ok) {
  console.log('\n❌ One or more anchors failed — check output above.');
  process.exit(1);
} else {
  console.log('\n✅ All patches applied.');
}
