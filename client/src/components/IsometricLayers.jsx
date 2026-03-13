export default function IsometricLayers({ className = "", style = {} }) {
  return (
    <div
      className={className}
      style={{
        background: "#08080c",
        borderRadius: 12,
        padding: 24,
        fontFamily: "var(--font-sans)",
        display: "flex",
        gap: 32,
        alignItems: "flex-start",
        ...style,
      }}
    >
      <svg width="260" height="500" viewBox="0 0 260 500" xmlns="http://www.w3.org/2000/svg">

        {/* 04 Applications */}
        <g transform="translate(100, 60)">
          <polygon points="0,-36 72,18 0,72 -72,18" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" />
          <polygon points="0,72 -72,18 -72,38 0,92" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8" />
          <polygon points="0,72 72,18 72,38 0,92" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
          <circle cx="-28" cy="8" r="3.5" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
          <circle cx="0" cy="-8" r="3.5" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
          <circle cx="28" cy="8" r="3.5" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
          <circle cx="-14" cy="28" r="3.5" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
          <circle cx="14" cy="28" r="3.5" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
        </g>
        <text x="180" y="78" fontSize="12" fill="rgba(255,255,255,0.9)" fontFamily="var(--font-sans)" fontWeight="500">04</text>
        <text x="180" y="94" fontSize="10" fill="rgba(255,255,255,0.4)" fontFamily="var(--font-sans)">Applications</text>

        <line x1="100" y1="152" x2="100" y2="172" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="4,3" />

        {/* 03 Intelligence Engine */}
        <g transform="translate(100, 200)">
          <polygon points="0,-36 72,18 0,72 -72,18" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" />
          <polygon points="0,72 -72,18 -72,38 0,92" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8" />
          <polygon points="0,72 72,18 72,38 0,92" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
          <circle cx="-28" cy="8" r="3.5" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
          <circle cx="0" cy="-8" r="3.5" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
          <circle cx="28" cy="8" r="3.5" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
          <circle cx="-14" cy="28" r="3.5" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
          <circle cx="14" cy="28" r="3.5" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
          <line x1="-28" y1="8" x2="0" y2="-8" stroke="rgba(255,255,255,0.18)" strokeWidth="0.7" />
          <line x1="0" y1="-8" x2="28" y2="8" stroke="rgba(255,255,255,0.18)" strokeWidth="0.7" />
          <line x1="-28" y1="8" x2="-14" y2="28" stroke="rgba(255,255,255,0.18)" strokeWidth="0.7" />
          <line x1="28" y1="8" x2="14" y2="28" stroke="rgba(255,255,255,0.18)" strokeWidth="0.7" />
        </g>
        <text x="180" y="218" fontSize="12" fill="rgba(255,255,255,0.9)" fontFamily="var(--font-sans)" fontWeight="500">03</text>
        <text x="180" y="234" fontSize="10" fill="rgba(255,255,255,0.4)" fontFamily="var(--font-sans)">Intelligence Engine</text>

        <line x1="100" y1="292" x2="100" y2="312" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="4,3" />

        {/* 02 Griseus Ontology */}
        <g transform="translate(100, 340)">
          <polygon points="0,-36 72,18 0,72 -72,18" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" />
          <polygon points="0,72 -72,18 -72,38 0,92" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8" />
          <polygon points="0,72 72,18 72,38 0,92" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
          <rect x="-24" y="0" width="9" height="9" rx="1.5" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.5)" strokeWidth="0.9" />
          <rect x="-6" y="-12" width="9" height="9" rx="1.5" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.5)" strokeWidth="0.9" />
          <rect x="16" y="0" width="9" height="9" rx="1.5" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.5)" strokeWidth="0.9" />
          <rect x="-14" y="20" width="9" height="9" rx="1.5" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.5)" strokeWidth="0.9" />
          <rect x="6" y="20" width="9" height="9" rx="1.5" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.5)" strokeWidth="0.9" />
        </g>
        <text x="180" y="358" fontSize="12" fill="rgba(255,255,255,0.9)" fontFamily="var(--font-sans)" fontWeight="500">02</text>
        <text x="180" y="374" fontSize="10" fill="rgba(255,255,255,0.4)" fontFamily="var(--font-sans)">Griseus Ontology</text>

        <line x1="100" y1="432" x2="100" y2="452" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="4,3" />

        {/* 01 Data Ingestion */}
        <g transform="translate(100, 468)">
          <polygon points="0,-22 50,4 0,30 -50,4" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
        </g>
        <text x="158" y="474" fontSize="12" fill="rgba(255,255,255,0.9)" fontFamily="var(--font-sans)" fontWeight="500">01</text>
        <text x="158" y="490" fontSize="10" fill="rgba(255,255,255,0.4)" fontFamily="var(--font-sans)">Data Ingestion</text>

      </svg>
    </div>
  );
}
