export default function IsometricLayers({ className = "", style = {} }) {
  return (
    <div
      className={className}
      style={{
        background: "#08080c",
        borderRadius: 12,
        padding: "32px 24px",
        fontFamily: "var(--font-sans)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        ...style,
      }}
    >
      <svg width="420" height="480" viewBox="0 0 420 480" xmlns="http://www.w3.org/2000/svg">

        {/* Layer 04 - Applications */}
        <g transform="translate(210, 80)">
          <polygon points="0,-38 66,0 0,38 -66,0" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
          <line x1="-66" y1="0" x2="-66" y2="18" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
          <line x1="66" y1="0" x2="66" y2="18" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
          <line x1="0" y1="38" x2="0" y2="56" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
          <polygon points="0,56 66,18 0,-20 -66,18" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.18)" strokeWidth="0.8" />
          <text x="80" y="4" fontSize="11" fill="rgba(255,255,255,0.8)" fontFamily="var(--font-sans)">04</text>
          <text x="80" y="18" fontSize="10" fill="rgba(255,255,255,0.45)" fontFamily="var(--font-sans)">Applications</text>
          <circle cx="-30" cy="-8" r="3" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.55)" strokeWidth="0.8" />
          <circle cx="0" cy="-18" r="3" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.55)" strokeWidth="0.8" />
          <circle cx="30" cy="-8" r="3" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.55)" strokeWidth="0.8" />
          <circle cx="-15" cy="8" r="3" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.55)" strokeWidth="0.8" />
          <circle cx="15" cy="8" r="3" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.55)" strokeWidth="0.8" />
        </g>

        <line x1="210" y1="156" x2="210" y2="176" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8" strokeDasharray="3,3" />

        {/* Layer 03 - Intelligence Engine */}
        <g transform="translate(210, 210)">
          <polygon points="0,-38 66,0 0,38 -66,0" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
          <line x1="-66" y1="0" x2="-66" y2="18" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
          <line x1="66" y1="0" x2="66" y2="18" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
          <line x1="0" y1="38" x2="0" y2="56" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
          <polygon points="0,56 66,18 0,-20 -66,18" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.18)" strokeWidth="0.8" />
          <text x="80" y="4" fontSize="11" fill="rgba(255,255,255,0.8)" fontFamily="var(--font-sans)">03</text>
          <text x="80" y="18" fontSize="10" fill="rgba(255,255,255,0.45)" fontFamily="var(--font-sans)">Intelligence Engine</text>
          <circle cx="-30" cy="-8" r="3" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
          <circle cx="0" cy="-18" r="3" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
          <circle cx="30" cy="-8" r="3" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
          <circle cx="-15" cy="8" r="3" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
          <circle cx="15" cy="8" r="3" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
          <line x1="-30" y1="-8" x2="0" y2="-18" stroke="rgba(255,255,255,0.2)" strokeWidth="0.6" />
          <line x1="0" y1="-18" x2="30" y2="-8" stroke="rgba(255,255,255,0.2)" strokeWidth="0.6" />
          <line x1="-30" y1="-8" x2="-15" y2="8" stroke="rgba(255,255,255,0.2)" strokeWidth="0.6" />
          <line x1="30" y1="-8" x2="15" y2="8" stroke="rgba(255,255,255,0.2)" strokeWidth="0.6" />
        </g>

        <line x1="210" y1="286" x2="210" y2="306" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8" strokeDasharray="3,3" />

        {/* Layer 02 - Griseus Ontology */}
        <g transform="translate(210, 340)">
          <polygon points="0,-38 66,0 0,38 -66,0" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
          <line x1="-66" y1="0" x2="-66" y2="18" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
          <line x1="66" y1="0" x2="66" y2="18" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
          <line x1="0" y1="38" x2="0" y2="56" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
          <polygon points="0,56 66,18 0,-20 -66,18" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.18)" strokeWidth="0.8" />
          <text x="80" y="4" fontSize="11" fill="rgba(255,255,255,0.8)" fontFamily="var(--font-sans)">02</text>
          <text x="80" y="18" fontSize="10" fill="rgba(255,255,255,0.45)" fontFamily="var(--font-sans)">Griseus Ontology</text>
          <rect x="-22" y="-12" width="8" height="8" rx="1" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.45)" strokeWidth="0.8" />
          <rect x="-6" y="-20" width="8" height="8" rx="1" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.45)" strokeWidth="0.8" />
          <rect x="14" y="-12" width="8" height="8" rx="1" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.45)" strokeWidth="0.8" />
          <rect x="-14" y="4" width="8" height="8" rx="1" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.45)" strokeWidth="0.8" />
          <rect x="6" y="4" width="8" height="8" rx="1" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.45)" strokeWidth="0.8" />
        </g>

        <line x1="210" y1="416" x2="210" y2="436" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8" strokeDasharray="3,3" />

        {/* Layer 01 - Data Ingestion */}
        <g transform="translate(210, 456)">
          <polygon points="0,-18 44,0 0,18 -44,0" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
          <text x="52" y="4" fontSize="11" fill="rgba(255,255,255,0.8)" fontFamily="var(--font-sans)">01</text>
          <text x="52" y="16" fontSize="10" fill="rgba(255,255,255,0.45)" fontFamily="var(--font-sans)">Data Ingestion</text>
        </g>

      </svg>
    </div>
  );
}
