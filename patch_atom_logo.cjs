const fs = require('fs');

const results = [];

function applyTo(filePath, name, oldStr, newStr, count = 1) {
  let content = fs.readFileSync(filePath, 'utf8');
  const occurrences = content.split(oldStr).length - 1;
  if (occurrences !== count) {
    results.push([name, false, `expected ${count} occurrence(s) in ${filePath}, found ${occurrences}`]);
    return;
  }
  content = content.replace(new RegExp(oldStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newStr);
  fs.writeFileSync(filePath, content);
  results.push([name, true, null]);
}

const ATOM_SVG_32 = `<svg width="32" height="32" viewBox="0 0 90 90" style={{ flexShrink: 0 }}>
                <ellipse cx="45" cy="45" rx="38" ry="15" fill="none" stroke="#5f6d85" strokeWidth="2.2" transform="rotate(0 45 45)" />
                <ellipse cx="45" cy="45" rx="38" ry="15" fill="none" stroke="#5f6d85" strokeWidth="2.2" transform="rotate(60 45 45)" />
                <ellipse cx="45" cy="45" rx="38" ry="15" fill="none" stroke="#5f6d85" strokeWidth="2.2" transform="rotate(120 45 45)" />
                <circle cx="45" cy="45" r="11" fill="#d85a30" />
                <circle cx="45" cy="7" r="5" fill="#3b82f6" />
                <circle cx="7" cy="64" r="5" fill="#10b981" />
                <circle cx="83" cy="64" r="5" fill="#f59e0b" />
              </svg>`;

const ATOM_SVG_22 = `<svg width="22" height="22" viewBox="0 0 90 90" style={{ flexShrink: 0 }}>
          <ellipse cx="45" cy="45" rx="38" ry="15" fill="none" stroke="#5f6d85" strokeWidth="2.2" transform="rotate(0 45 45)" />
          <ellipse cx="45" cy="45" rx="38" ry="15" fill="none" stroke="#5f6d85" strokeWidth="2.2" transform="rotate(60 45 45)" />
          <ellipse cx="45" cy="45" rx="38" ry="15" fill="none" stroke="#5f6d85" strokeWidth="2.2" transform="rotate(120 45 45)" />
          <circle cx="45" cy="45" r="11" fill="#d85a30" />
          <circle cx="45" cy="7" r="5" fill="#3b82f6" />
          <circle cx="7" cy="64" r="5" fill="#10b981" />
          <circle cx="83" cy="64" r="5" fill="#f59e0b" />
        </svg>`;

applyTo(
  'src/pages/Login.jsx',
  "replace atom icon in Login.jsx",
  `<span style={{ fontSize: 32 }}>⬡</span>`,
  ATOM_SVG_32
);

applyTo(
  'src/pages/ResetPassword.jsx',
  "replace atom icon in ResetPassword.jsx (4 occurrences)",
  `<span style={{ fontSize: 32 }}>⬡</span>`,
  ATOM_SVG_32,
  4
);

applyTo(
  'src/components/Navbar.jsx',
  "replace atom icon in Navbar.jsx",
  `<span className="brand-icon">⬡</span>`,
  `<span className="brand-icon">${ATOM_SVG_22}</span>`
);

console.log('\nPatch results:');
let allOk = true;
for (const [name, ok, err] of results) {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${err ? `  (${err})` : ''}`);
  if (!ok) allOk = false;
}

if (!allOk) {
  console.log('\n❌ One or more anchors failed. Some files may have been partially written — check git diff before committing.');
  process.exit(1);
}

console.log('\n✅ All patches applied successfully.');
