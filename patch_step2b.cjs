const fs = require('fs')
const BASE = '/workspaces/quark-web/src/pages/'

function patch(file, label, find, replace) {
  const p = BASE + file
  let src = fs.readFileSync(p, 'utf8')
  if (!src.includes(find)) {
    console.log('❌ ' + label + ' — anchor not found in ' + file)
    return
  }
  fs.writeFileSync(p, src.replace(find, () => replace))
  console.log('✅ ' + label)
}

// Evaluations.jsx — 6-space chain indent
patch(
  'Evaluations.jsx',
  'Evaluations: exclude calibration scorecards',
  "      .select('id, name, type')\n      .eq('is_published', true)\n      .order('name')",
  "      .select('id, name, type')\n      .eq('is_published', true)\n      .eq('is_calibration', false)\n      .order('name')"
)

// EvaluationForm.jsx — 6-space chain indent
patch(
  'EvaluationForm.jsx',
  'EvaluationForm: exclude calibration scorecards',
  "      .select('*')\n      .eq('is_published', true)\n      .order('name')",
  "      .select('*')\n      .eq('is_published', true)\n      .eq('is_calibration', false)\n      .order('name')"
)

// DashboardHome.jsx — 8-space chain indent (inside async IIFE inside useEffect)
patch(
  'DashboardHome.jsx',
  'DashboardHome: exclude calibration scorecards',
  "        .eq('is_published', true)\n        .eq('division', divisionName)",
  "        .eq('is_published', true)\n        .eq('is_calibration', false)\n        .eq('division', divisionName)"
)
