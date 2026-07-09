const fs = require('fs')

function patch(file, label, find, replace) {
  let src = fs.readFileSync(file, 'utf8')
  if (!src.includes(find)) { console.log('❌ ' + label + ' — anchor not found'); return }
  fs.writeFileSync(file, src.replace(find, () => replace))
  console.log('✅ ' + label)
}

const NAVBAR = '/workspaces/quark-web/src/components/Navbar.jsx'
const APP    = '/workspaces/quark-web/src/App.jsx'

// 1. Navbar — add Calibration nav item after Evaluations, before Control Room
patch(NAVBAR, 'Navbar: add Calibration nav item',
  "          Evaluations\n        </button>\n        {['admin', 'owner'].includes(profile?.role) && (",
  "          Evaluations\n        </button>\n        {profile?.email?.endsWith('@kaizengaming.com') && (\n          <button className={`nav-item ${isActive('/calibration') ? 'active' : ''}`}\n            onClick={() => safeNavigate('/calibration')}>\n            <i className=\"ti ti-target\" aria-hidden=\"true\" />\n            Calibration\n          </button>\n        )}\n        {['admin', 'owner'].includes(profile?.role) && ("
)

// 2. App.jsx — import Calibration page
patch(APP, 'App: import Calibration',
  "import DuckLoader from './components/DuckLoader'",
  "import DuckLoader from './components/DuckLoader'\nimport Calibration from './pages/Calibration'"
)

// 3. App.jsx — isKgUser constant
patch(APP, 'App: isKgUser constant',
  "  const isAdminOrOwner = ['admin', 'owner'].includes(profile?.role)",
  "  const isAdminOrOwner = ['admin', 'owner'].includes(profile?.role)\n  const isKgUser = profile?.email?.endsWith('@kaizengaming.com')"
)

// 4. App.jsx — add /calibration route before catch-all
patch(APP, 'App: add /calibration route',
  "                <Route path=\"*\" element={<Navigate to=\"/dashboard\" replace />} />",
  "                <Route path=\"/calibration\" element={isKgUser ? <Calibration /> : <Navigate to=\"/dashboard\" replace />} />\n                <Route path=\"*\" element={<Navigate to=\"/dashboard\" replace />} />"
)
