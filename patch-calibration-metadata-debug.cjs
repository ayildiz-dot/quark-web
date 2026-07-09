const fs = require("fs");
const path = "src/pages/Calibration.jsx";
let src = fs.readFileSync(path, "utf8");
let allOk = true;

// --- patch 40: add error state for the metadata lists ---
{
  const oldStr = "  const [bpoOptions, setBpoOptions]       = useState([])\n  const [hubOptions, setHubOptions]       = useState([])\n  const [marketOptions, setMarketOptions] = useState([])\n";
  const newStr = "  const [bpoOptions, setBpoOptions]       = useState([])\n  const [hubOptions, setHubOptions]       = useState([])\n  const [marketOptions, setMarketOptions] = useState([])\n  const [metadataLoadError, setMetadataLoadError] = useState(null)\n";
  const count = src.split(oldStr).length - 1;
  if (count === 1) { src = src.replace(oldStr, newStr); console.log("\u2705 patch 40 applied"); }
  else { allOk = false; console.log("\u274c patch 40 FAILED (found " + count + " occurrences, expected 1)"); }
}

// --- patch 41: surface the real error instead of silently returning empty lists ---
{
  const oldStr = "  async function loadMetadataOptions() {\n    const { data } = await supabase.from('calibration_metadata_options').select('category, name').order('name')\n    const byCategory = cat => (data || []).filter(o => o.category === cat).map(o => o.name)\n    setBpoOptions(byCategory('bpo'))\n    setHubOptions(byCategory('hub'))\n    setMarketOptions(byCategory('market'))\n  }\n";
  const newStr = "  async function loadMetadataOptions() {\n    const { data, error } = await supabase.from('calibration_metadata_options').select('category, name').order('name')\n    if (error) {\n      console.error('Failed to load BPO/HUB/Market options:', error)\n      setMetadataLoadError(error.message)\n      return\n    }\n    setMetadataLoadError(null)\n    const byCategory = cat => (data || []).filter(o => o.category === cat).map(o => o.name)\n    setBpoOptions(byCategory('bpo'))\n    setHubOptions(byCategory('hub'))\n    setMarketOptions(byCategory('market'))\n  }\n";
  const count = src.split(oldStr).length - 1;
  if (count === 1) { src = src.replace(oldStr, newStr); console.log("\u2705 patch 41 applied"); }
  else { allOk = false; console.log("\u274c patch 41 FAILED (found " + count + " occurrences, expected 1)"); }
}

// --- patch 42: show that error under the BPO/HUB/Market fields ---
{
  const oldStr = "                    <option value=\"\">— Select a Market —</option>\n                    {marketOptions.map(name => <option key={name} value={name}>{name}</option>)}\n                    <option value=\"__add_new__\">+ Add a new Market</option>\n                  </select>\n                </div>\n              </div>\n              <div>\n                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>\n                  Participants\n                </label>\n";
  const newStr = "                    <option value=\"\">— Select a Market —</option>\n                    {marketOptions.map(name => <option key={name} value={name}>{name}</option>)}\n                    <option value=\"__add_new__\">+ Add a new Market</option>\n                  </select>\n                </div>\n              </div>\n              {metadataLoadError && (\n                <div style={{ fontSize: 11, color: '#dc2626' }}>\n                  Couldn't load the saved BPO/HUB/Market lists ({metadataLoadError}). Values you type here will still save on this session — reload the page and try again to get the full dropdown lists back.\n                </div>\n              )}\n              <div>\n                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>\n                  Participants\n                </label>\n";
  const count = src.split(oldStr).length - 1;
  if (count === 1) { src = src.replace(oldStr, newStr); console.log("\u2705 patch 42 applied"); }
  else { allOk = false; console.log("\u274c patch 42 FAILED (found " + count + " occurrences, expected 1)"); }
}

if (!allOk) {
  console.log("\n\u274c Aborting: not all anchors matched. No changes written to " + path + ".");
  process.exit(1);
}
fs.writeFileSync(path, src);
console.log("\n\u2705 All patches applied successfully to " + path);
