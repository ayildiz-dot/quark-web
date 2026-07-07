const fs = require('fs');
const path = 'src/pages/Admin.jsx';
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

// 1. Clearing captureDays when switching to Daily
patch('Clear captureDays on switch to Daily',
`<select className="select select-sm" value={cycleFrequency} onChange={e => setCycleFrequency(e.target.value)}>`,
`<select className="select select-sm" value={cycleFrequency} onChange={e => { const v = e.target.value; setCycleFrequency(v); if (v === 'daily') setCaptureDays([]) }}>`
);

// 2. Also normalize on load, in case a stale record has capture_days set for a daily cycle
patch('Normalize captureDays on load for Daily cycles',
`      setCaptureDays(cfg.capture_days || [])`,
`      setCaptureDays(cfg.cycle_frequency === 'daily' ? [] : (cfg.capture_days || []))`
);

// 3. Replace weekday toggle block with conditional: Weekly shows toggles, Daily shows fixed note
patch('Conditional Capture Days UI',
`        <div>
          <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Capture Days (whose handled cases get pulled in)</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {WEEKDAYS.map(d => (
              <button key={d} type="button" onClick={() => toggleCaptureDay(d)} className="btn btn-sm"
                style={{ fontSize: 11, padding: '4px 10px',
                  backgroundColor: captureDays.includes(d) ? 'var(--accent)' : 'var(--surface)',
                  color: captureDays.includes(d) ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid ' + (captureDays.includes(d) ? 'var(--accent)' : 'var(--border)') }}>
                {d.slice(0,3).charAt(0).toUpperCase() + d.slice(1,3)}
              </button>
            ))}
          </div>
        </div>`,
`        {cycleFrequency === 'weekly' ? (
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Capture Days (whose handled cases get pulled in)</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {WEEKDAYS.map(d => (
                <button key={d} type="button" onClick={() => toggleCaptureDay(d)} className="btn btn-sm"
                  style={{ fontSize: 11, padding: '4px 10px',
                    backgroundColor: captureDays.includes(d) ? 'var(--accent)' : 'var(--surface)',
                    color: captureDays.includes(d) ? '#fff' : 'var(--text-secondary)',
                    border: '1px solid ' + (captureDays.includes(d) ? 'var(--accent)' : 'var(--border)') }}>
                  {d.slice(0,3).charAt(0).toUpperCase() + d.slice(1,3)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Capture Window</label>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', maxWidth: 320 }}>
              Daily cycles always capture the previous day's cases (Day-1). No selection needed.
            </div>
          </div>
        )}`
);

// 4. Validation only applies to Weekly
patch('Scope capture-day validation to Weekly only',
`    if (captureDays.length === 0) return flash('Select at least one capture day.', false)`,
`    if (cycleFrequency === 'weekly' && captureDays.length === 0) return flash('Select at least one capture day.', false)`
);

if (ok) {
  fs.writeFileSync(path, content);
  console.log('\n✅ All patches applied — file written.');
} else {
  console.log('\n❌ One or more anchors failed — file NOT written. Nothing was changed.');
  process.exit(1);
}
