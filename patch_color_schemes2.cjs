const fs = require('fs');
const path = 'src/index.css';
let content = fs.readFileSync(path, 'utf8');
let ok = true;

function patch(label, oldStr, newStr) {
  if (!content.includes(oldStr)) {
    console.log(`❌ ${label}: anchor not found`);
    ok = false;
    return;
  }
  content = content.replace(oldStr, newStr);
  console.log(`✅ ${label}`);
}

patch('Midnight scheme colors',
`/* Midnight */
[data-scheme="midnight"] { --accent: #6366f1; --accent-hover: #4f46e5; --accent-light: #312e81; --sidebar-bg: #1e1b4b; }
[data-theme="light"][data-scheme="midnight"] { --accent: #4f46e5; --accent-hover: #4338ca; --accent-light: #e0e7ff; --sidebar-bg: #eef2ff; }`,
`/* Midnight — deep-space teal/cyan */
[data-scheme="midnight"] { --accent: #0891b2; --accent-hover: #0e7490; --accent-light: #164e63; --sidebar-bg: #0b1220; }
[data-theme="light"][data-scheme="midnight"] { --accent: #0e7490; --accent-hover: #155e75; --accent-light: #cffafe; --sidebar-bg: #ecfeff; }`
);

patch('Slate scheme colors',
`/* Slate */
[data-scheme="slate"] { --accent: #64748b; --accent-hover: #475569; --accent-light: #334155; --sidebar-bg: #1f2937; }
[data-theme="light"][data-scheme="slate"] { --accent: #475569; --accent-hover: #334155; --accent-light: #e2e8f0; --sidebar-bg: #f8fafc; }`,
`/* Slate — steel/denim blue, deepened sidebar for real contrast */
[data-scheme="slate"] { --accent: #5b7fa6; --accent-hover: #44607f; --accent-light: #1f2f3f; --sidebar-bg: #0f172a; }
[data-theme="light"][data-scheme="slate"] { --accent: #44607f; --accent-hover: #33495f; --accent-light: #e2e8f0; --sidebar-bg: #f8fafc; }`
);

patch('Crimson scheme colors',
`/* Crimson */
[data-scheme="crimson"] { --accent: #ef4444; --accent-hover: #dc2626; --accent-light: #5c1616; --sidebar-bg: #3f1414; }
[data-theme="light"][data-scheme="crimson"] { --accent: #dc2626; --accent-hover: #b91c1c; --accent-light: #fee2e2; --sidebar-bg: #fef2f2; }`,
`/* Crimson — wine/rose, kept distinct from danger/error red */
[data-scheme="crimson"] { --accent: #be123c; --accent-hover: #9f1239; --accent-light: #4c0519; --sidebar-bg: #2b0710; }
[data-theme="light"][data-scheme="crimson"] { --accent: #9f1239; --accent-hover: #881337; --accent-light: #ffe4e6; --sidebar-bg: #fff1f2; }`
);

if (ok) {
  fs.writeFileSync(path, content);
  console.log('\n✅ All patches applied — file written.');
} else {
  console.log('\n❌ One or more anchors failed — file NOT written. Nothing was changed.');
  process.exit(1);
}
