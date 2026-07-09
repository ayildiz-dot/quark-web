const fs = require('fs')
const path = '/workspaces/quark-web/src/pages/ScorecardBuilder.jsx'
let src = fs.readFileSync(path, 'utf8')

// Patch 1 — add toggle UI between Division field and Save Settings button
const find1 = `            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, display: 'block' }}>
              Each scorecard belongs to one division. It will appear under that division on the dashboard.
            </span>
          </div>

          {!isPublished && (`

const replace1 = `            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, display: 'block' }}>
              Each scorecard belongs to one division. It will appear under that division on the dashboard.
            </span>
          </div>

          <div className="form-field" style={{ marginBottom: 16 }}>
            <label>Calibration Scorecard</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 6 }}>
              <input type="checkbox" checked={!!scorecard.is_calibration}
                onChange={e => { setScorecard(s => ({ ...s, is_calibration: e.target.checked })); markChanged() }} />
              <span style={{ fontSize: 13 }}>This scorecard is for calibration sessions only</span>
            </label>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
              When enabled, this scorecard will only appear in the Calibration section and not in regular evaluations.
            </span>
          </div>

          {!isPublished && (`

if (!src.includes(find1)) { console.log('❌ Anchor 1 not found'); process.exit(1) }
src = src.replace(find1, () => replace1)
console.log('✅ Patch 1 — calibration toggle UI')

// Patch 2 — add is_calibration to draft save (Save Settings button)
const find2 = `              const { error } = await supabase.from('scorecards')
                .update({ name: scorecard.name, description: scorecard.description,
                  pass_threshold: scorecard.type === 'quality' ? (Number(scorecard.pass_threshold) || 90) : null,
                  division: division,
                  updated_at: new Date().toISOString() })
                .eq('id', id)`

const replace2 = `              const { error } = await supabase.from('scorecards')
                .update({ name: scorecard.name, description: scorecard.description,
                  pass_threshold: scorecard.type === 'quality' ? (Number(scorecard.pass_threshold) || 90) : null,
                  division: division,
                  is_calibration: scorecard.is_calibration || false,
                  updated_at: new Date().toISOString() })
                .eq('id', id)`

if (!src.includes(find2)) { console.log('❌ Anchor 2 not found'); process.exit(1) }
src = src.replace(find2, () => replace2)
console.log('✅ Patch 2 — is_calibration in draft save')

// Patch 3 — add is_calibration to published save (executeVersionSave)
const find3 = `      await supabase.from('scorecards').update({
        name: scorecard.name,
        description: scorecard.description,
        pass_threshold: scorecard.type === 'quality' ? (Number(scorecard.pass_threshold) || 90) : null,
        division: division,
        updated_at: new Date().toISOString()
      }).eq('id', id)`

const replace3 = `      await supabase.from('scorecards').update({
        name: scorecard.name,
        description: scorecard.description,
        pass_threshold: scorecard.type === 'quality' ? (Number(scorecard.pass_threshold) || 90) : null,
        division: division,
        is_calibration: scorecard.is_calibration || false,
        updated_at: new Date().toISOString()
      }).eq('id', id)`

if (!src.includes(find3)) { console.log('❌ Anchor 3 not found'); process.exit(1) }
src = src.replace(find3, () => replace3)
console.log('✅ Patch 3 — is_calibration in published save')

fs.writeFileSync(path, src)
