import type { CSSProperties } from "react";

interface Props {
  className?: string;
  style?: CSSProperties;
}

export default function IsometricLayers({ className = "", style = {} }: Props) {
  return (
    <div
      className={className}
      style={{
        background: "#08080c",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      <svg viewBox="0 0 420 520" style={{ width: "100%", maxWidth: 420, height: "auto" }}>
        {/* Title */}
        <text x="210" y="30" textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.3)" fontFamily="'JetBrains Mono', monospace" fontWeight="600" letterSpacing="2">
          GRISEUS ARCHITECTURE
        </text>

        {/* Layer 04 - Applications */}
        <g transform="translate(210, 100)">
          <polygon points="0,-38 66,0 0,38 -66,0" fill="rgba(255,255,255,0.06)" stroke="rgba(129,140,248,0.5)" strokeWidth="1" />
          <line x1="-66" y1="0" x2="-66" y2="18" stroke="rgba(129,140,248,0.25)" strokeWidth="1" />
          <line x1="66" y1="0" x2="66" y2="18" stroke="rgba(129,140,248,0.25)" strokeWidth="1" />
          <line x1="0" y1="38" x2="0" y2="56" stroke="rgba(129,140,248,0.25)" strokeWidth="1" />
          <polygon points="0,56 66,18 0,-20 -66,18" fill="rgba(129,140,248,0.03)" stroke="rgba(129,140,248,0.18)" strokeWidth="0.8" />
          <text x="80" y="4" fontSize="12" fill="rgba(129,140,248,0.9)" fontFamily="'JetBrains Mono', monospace" fontWeight="700">04</text>
          <text x="80" y="18" fontSize="10" fill="rgba(255,255,255,0.45)" fontFamily="'DM Sans', sans-serif">Applications</text>
          <circle cx="-30" cy="-8" r="3" fill="rgba(129,140,248,0.2)" stroke="rgba(129,140,248,0.55)" strokeWidth="0.8" />
          <circle cx="0" cy="-18" r="3" fill="rgba(129,140,248,0.2)" stroke="rgba(129,140,248,0.55)" strokeWidth="0.8" />
          <circle cx="30" cy="-8" r="3" fill="rgba(129,140,248,0.2)" stroke="rgba(129,140,248,0.55)" strokeWidth="0.8" />
          <circle cx="-15" cy="8" r="3" fill="rgba(129,140,248,0.2)" stroke="rgba(129,140,248,0.55)" strokeWidth="0.8" />
          <circle cx="15" cy="8" r="3" fill="rgba(129,140,248,0.2)" stroke="rgba(129,140,248,0.55)" strokeWidth="0.8" />
        </g>

        <line x1="210" y1="176" x2="210" y2="196" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" strokeDasharray="3,3" />

        {/* Layer 03 - Intelligence Engine */}
        <g transform="translate(210, 230)">
          <polygon points="0,-38 66,0 0,38 -66,0" fill="rgba(255,255,255,0.06)" stroke="rgba(52,211,153,0.5)" strokeWidth="1" />
          <line x1="-66" y1="0" x2="-66" y2="18" stroke="rgba(52,211,153,0.25)" strokeWidth="1" />
          <line x1="66" y1="0" x2="66" y2="18" stroke="rgba(52,211,153,0.25)" strokeWidth="1" />
          <line x1="0" y1="38" x2="0" y2="56" stroke="rgba(52,211,153,0.25)" strokeWidth="1" />
          <polygon points="0,56 66,18 0,-20 -66,18" fill="rgba(52,211,153,0.03)" stroke="rgba(52,211,153,0.18)" strokeWidth="0.8" />
          <text x="80" y="4" fontSize="12" fill="rgba(52,211,153,0.9)" fontFamily="'JetBrains Mono', monospace" fontWeight="700">03</text>
          <text x="80" y="18" fontSize="10" fill="rgba(255,255,255,0.45)" fontFamily="'DM Sans', sans-serif">Intelligence Engine</text>
          <circle cx="-30" cy="-8" r="3" fill="none" stroke="rgba(52,211,153,0.5)" strokeWidth="1" />
          <circle cx="0" cy="-18" r="3" fill="none" stroke="rgba(52,211,153,0.5)" strokeWidth="1" />
          <circle cx="30" cy="-8" r="3" fill="none" stroke="rgba(52,211,153,0.5)" strokeWidth="1" />
          <circle cx="-15" cy="8" r="3" fill="none" stroke="rgba(52,211,153,0.5)" strokeWidth="1" />
          <circle cx="15" cy="8" r="3" fill="none" stroke="rgba(52,211,153,0.5)" strokeWidth="1" />
          <line x1="-30" y1="-8" x2="0" y2="-18" stroke="rgba(52,211,153,0.2)" strokeWidth="0.6" />
          <line x1="0" y1="-18" x2="30" y2="-8" stroke="rgba(52,211,153,0.2)" strokeWidth="0.6" />
          <line x1="-30" y1="-8" x2="-15" y2="8" stroke="rgba(52,211,153,0.2)" strokeWidth="0.6" />
          <line x1="30" y1="-8" x2="15" y2="8" stroke="rgba(52,211,153,0.2)" strokeWidth="0.6" />
        </g>

        <line x1="210" y1="306" x2="210" y2="326" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" strokeDasharray="3,3" />

        {/* Layer 02 - Griseus Ontology */}
        <g transform="translate(210, 360)">
          <polygon points="0,-38 66,0 0,38 -66,0" fill="rgba(255,255,255,0.06)" stroke="rgba(251,191,36,0.5)" strokeWidth="1" />
          <line x1="-66" y1="0" x2="-66" y2="18" stroke="rgba(251,191,36,0.25)" strokeWidth="1" />
          <line x1="66" y1="0" x2="66" y2="18" stroke="rgba(251,191,36,0.25)" strokeWidth="1" />
          <line x1="0" y1="38" x2="0" y2="56" stroke="rgba(251,191,36,0.25)" strokeWidth="1" />
          <polygon points="0,56 66,18 0,-20 -66,18" fill="rgba(251,191,36,0.03)" stroke="rgba(251,191,36,0.18)" strokeWidth="0.8" />
          <text x="80" y="4" fontSize="12" fill="rgba(251,191,36,0.9)" fontFamily="'JetBrains Mono', monospace" fontWeight="700">02</text>
          <text x="80" y="18" fontSize="10" fill="rgba(255,255,255,0.45)" fontFamily="'DM Sans', sans-serif">Griseus Ontology</text>
          <rect x="-22" y="-12" width="8" height="8" rx="1" fill="rgba(251,191,36,0.1)" stroke="rgba(251,191,36,0.45)" strokeWidth="0.8" />
          <rect x="-6" y="-20" width="8" height="8" rx="1" fill="rgba(251,191,36,0.1)" stroke="rgba(251,191,36,0.45)" strokeWidth="0.8" />
          <rect x="14" y="-12" width="8" height="8" rx="1" fill="rgba(251,191,36,0.1)" stroke="rgba(251,191,36,0.45)" strokeWidth="0.8" />
          <rect x="-14" y="4" width="8" height="8" rx="1" fill="rgba(251,191,36,0.1)" stroke="rgba(251,191,36,0.45)" strokeWidth="0.8" />
          <rect x="6" y="4" width="8" height="8" rx="1" fill="rgba(251,191,36,0.1)" stroke="rgba(251,191,36,0.45)" strokeWidth="0.8" />
        </g>

        <line x1="210" y1="436" x2="210" y2="456" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" strokeDasharray="3,3" />

        {/* Layer 01 - Data Ingestion */}
        <g transform="translate(210, 480)">
          <polygon points="0,-18 44,0 0,18 -44,0" fill="rgba(255,255,255,0.04)" stroke="rgba(239,68,68,0.4)" strokeWidth="1" />
          <text x="52" y="4" fontSize="12" fill="rgba(239,68,68,0.9)" fontFamily="'JetBrains Mono', monospace" fontWeight="700">01</text>
          <text x="52" y="16" fontSize="10" fill="rgba(255,255,255,0.45)" fontFamily="'DM Sans', sans-serif">Data Ingestion</text>
        </g>
      </svg>
    </div>
  );
}
