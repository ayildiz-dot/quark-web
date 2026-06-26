import './DuckLoader.css'

export default function DuckLoader() {
  return (
    <div className="duck-screen">
      <div className="duck-stage">
        <div className="ground-line" />
        <div className="duck-walker">
          <svg width="64" height="72" viewBox="0 0 64 72" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g className="duck-body-group">
              <ellipse cx="54" cy="44" rx="8" ry="5" fill="#F5C842" transform="rotate(-20 54 44)"/>
              <ellipse cx="32" cy="44" rx="22" ry="16" fill="#F5C842"/>
              <g className="wing-flap">
                <ellipse cx="30" cy="44" rx="13" ry="8" fill="#E8B820" transform="rotate(-5 30 44)"/>
              </g>
              <ellipse cx="14" cy="34" rx="8" ry="11" fill="#2E8B3A"/>
              <circle cx="10" cy="24" r="11" fill="#2E8B3A"/>
              <circle cx="7" cy="21" r="2.5" fill="white"/>
              <circle cx="6.5" cy="21" r="1.2" fill="#1a1a1a"/>
              <circle cx="7.2" cy="20.3" r="0.5" fill="white"/>
              <ellipse cx="0" cy="25" rx="7" ry="3.5" fill="#FF9B21" transform="rotate(-10 0 25)"/>
              <line x1="-1" y1="25" x2="6" y2="24" stroke="#E88010" strokeWidth="0.8"/>
              <ellipse cx="13" cy="33" rx="8" ry="3" fill="#F5C842"/>
            </g>
            <g transform="translate(24, 58)">
              <g className="leg-left">
                <rect x="-5" y="0" width="4" height="10" rx="2" fill="#FF9B21"/>
                <path d="M-7 10 L-1 10 L2 13" stroke="#FF9B21" strokeWidth="2.5" strokeLinecap="round"/>
              </g>
            </g>
            <g transform="translate(36, 58)">
              <g className="leg-right">
                <rect x="-1" y="0" width="4" height="10" rx="2" fill="#FF9B21"/>
                <path d="M-3 10 L3 10 L6 13" stroke="#FF9B21" strokeWidth="2.5" strokeLinecap="round"/>
              </g>
            </g>
          </svg>
        </div>
      </div>
      <div className="duck-dots">
        <span>●</span><span>●</span><span>●</span>
      </div>
      <p className="duck-label">Loading Quark</p>
    </div>
  )
}
