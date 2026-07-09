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

// 1. GovernanceTab scorecard picker — exclude calibration scorecards
patch(
  'Admin.jsx',
  'GovernanceTab: exclude calibration from queue picker',
  "supabase.from('scorecards').select('id, name, type, is_published').eq('is_published', true).order('name'),",
  "supabase.from('scorecards').select('id, name, type, is_published').eq('is_published', true).eq('is_calibration', false).order('name'),"
)

// 2. ScorecardsTab table — add calibration badge (admin sees all scorecards, but with badge)
patch(
  'Admin.jsx',
  'ScorecardsTab: add calibration badge in table',
  "              <td><TypeBadge type={sc.type} /></td>",
  "              <td style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>\n                <TypeBadge type={sc.type} />\n                {sc.is_calibration && (\n                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 6, fontWeight: 600,\n                    backgroundColor: '#7c3aed22', color: '#7c3aed', border: '1px solid #7c3aed44' }}>Calibration</span>\n                )}\n              </td>"
)

// 3. Evaluations.jsx — exclude calibration scorecards
patch(
  'Evaluations.jsx',
  'Evaluations: exclude calibration scorecards',
  "    .select('id, name, type')\n    .eq('is_published', true)\n    .order('name')",
  "    .select('id, name, type')\n    .eq('is_published', true)\n    .eq('is_calibration', false)\n    .order('name')"
)

// 4. EvaluationForm.jsx — exclude calibration scorecards
patch(
  'EvaluationForm.jsx',
  'EvaluationForm: exclude calibration scorecards',
  "    .select('*')\n    .eq('is_published', true)\n    .order('name')",
  "    .select('*')\n    .eq('is_published', true)\n    .eq('is_calibration', false)\n    .order('name')"
)

// 5. DashboardHome.jsx — exclude calibration scorecards
patch(
  'DashboardHome.jsx',
  'DashboardHome: exclude calibration scorecards',
  "      .eq('is_published', true)\n      .eq('division', divisionName)",
  "      .eq('is_published', true)\n      .eq('is_calibration', false)\n      .eq('division', divisionName)"
)
