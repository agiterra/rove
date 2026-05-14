import type { ThumbKind } from "./mock-data";
export type { ThumbKind };

/**
 * Light-theme realistic SVG thumbnails of the target app being walked.
 * Ported from Claude Design's thumbs.jsx — these stand in for real
 * screenshots in the preview and keep the filmstrip visually varied.
 */

const T = {
  bg: "#f6f7f9",
  card: "#ffffff",
  border: "#e7e9ee",
  border2: "#d8dbe2",
  text: "#1a1f2c",
  muted: "#6b7280",
  faint: "#9aa2b1",
  accent: "#1f5fff",
  cyan: "#3fc9cb",
  rose: "#f43f5e",
  amber: "#facc15",
};

function Frame({ children, sidebar = true }: { children: React.ReactNode; sidebar?: boolean }) {
  return (
    <svg
      viewBox="0 0 320 180"
      preserveAspectRatio="xMidYMid slice"
      shapeRendering="crispEdges"
      className="block h-full w-full"
    >
      <rect width="320" height="180" fill={T.bg} />
      {sidebar ? (
        <g>
          <rect x="0" y="0" width="56" height="180" fill={T.card} />
          <rect x="0" y="0" width="56" height="180" fill="none" stroke={T.border} />
          <rect x="8" y="10" width="8" height="8" rx="2" fill={T.cyan} />
          <rect x="20" y="11" width="22" height="6" rx="1" fill={T.text} />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <g key={i}>
              <rect x="6" y={28 + i * 16} width="44" height="11" rx="3" fill={i === 0 ? "#eef0f5" : "transparent"} />
              <rect x="11" y={31 + i * 16} width="6" height="6" rx="1" fill={T.faint} opacity={i === 0 ? 1 : 0.7} />
              <rect x="21" y={32 + i * 16} width="22" height="4" rx="1" fill={i === 0 ? T.text : T.muted} opacity={i === 0 ? 1 : 0.8} />
            </g>
          ))}
        </g>
      ) : null}
      {children}
    </svg>
  );
}

function ThumbDashboard() {
  return (
    <Frame>
      <rect x="68" y="12" width="36" height="5" rx="1" fill={T.faint} />
      <rect x="248" y="10" width="44" height="10" rx="2" fill="#fff" stroke={T.border2} />
      <rect x="68" y="28" width="120" height="9" rx="1" fill={T.text} />
      <rect x="68" y="42" width="84" height="4" rx="1" fill={T.faint} />
      <rect x="68" y="58" width="240" height="10" fill="#eef0f5" />
      <rect x="74" y="61" width="40" height="4" rx="1" fill={T.muted} />
      <rect x="160" y="61" width="34" height="4" rx="1" fill={T.muted} />
      <rect x="220" y="61" width="34" height="4" rx="1" fill={T.muted} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <g key={i}>
          <rect x="68" y={70 + i * 16} width="240" height="15" fill={T.card} stroke={T.border} />
          <rect x="74" y={75 + i * 16} width="6" height="6" rx="1" fill={[T.cyan, T.amber, T.cyan, T.rose, T.cyan, T.faint][i]} />
          <rect x="84" y={76 + i * 16} width="70" height="4" rx="1" fill={T.text} />
          <rect x="160" y={76 + i * 16} width="36" height="4" rx="1" fill={T.muted} />
          <rect x="220" y={76 + i * 16} width="42" height="4" rx="1" fill={T.muted} />
        </g>
      ))}
    </Frame>
  );
}

function ThumbRuns() {
  return (
    <Frame>
      <rect x="68" y="12" width="36" height="5" rx="1" fill={T.faint} />
      <rect x="68" y="26" width="80" height="9" rx="1" fill={T.text} />
      <rect x="240" y="24" width="58" height="14" rx="3" fill={T.accent} />
      <rect x="252" y="29" width="34" height="4" rx="1" fill="#fff" />
      <rect x="68" y="44" width="230" height="22" rx="4" fill={T.card} stroke={T.border} />
      <rect x="76" y="52" width="6" height="6" rx="3" fill={T.faint} />
      <rect x="88" y="53" width="120" height="4" rx="1" fill={T.faint} />
      <rect x="264" y="50" width="28" height="10" rx="3" fill="#eef0f5" />
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <rect x="68" y={74 + i * 18} width="230" height="16" fill={T.card} stroke={T.border} />
          <rect x="76" y={79 + i * 18} width="6" height="6" rx="1" fill={T.cyan} />
          <rect x="88" y={80 + i * 18} width="80" height="4" rx="1" fill={T.text} />
          <rect x="180" y={80 + i * 18} width="40" height="4" rx="1" fill={T.muted} />
          <rect x="240" y={80 + i * 18} width="40" height="4" rx="1" fill={T.muted} />
        </g>
      ))}
    </Frame>
  );
}

function ThumbFilters() {
  return (
    <Frame>
      <rect x="68" y="12" width="36" height="5" rx="1" fill={T.faint} />
      <rect x="68" y="26" width="44" height="9" rx="1" fill={T.text} />
      <rect x="68" y="44" width="100" height="118" rx="6" fill={T.card} stroke={T.border} />
      <rect x="76" y="52" width="38" height="5" rx="1" fill={T.text} />
      <rect x="76" y="64" width="84" height="11" rx="2" fill="#fff" stroke={T.border2} />
      <rect x="79" y="67" width="50" height="5" rx="1" fill={T.faint} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x="76" y={84 + i * 14} width="68" height="4" rx="1" fill={T.muted} />
          <circle cx="156" cy={86 + i * 14} r="3" fill={i === 1 ? T.accent : "#fff"} stroke={T.border2} />
        </g>
      ))}
      <rect x="76" y="132" width="40" height="14" rx="3" fill={T.accent} />
      <rect x="120" y="132" width="36" height="14" rx="3" fill="#fff" stroke={T.border2} />
      <g opacity="0.45">
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x="180" y={44 + i * 18} width="128" height="14" rx="3" fill={T.card} stroke={T.border} />
        ))}
      </g>
    </Frame>
  );
}

function ThumbSaveView() {
  return (
    <Frame>
      <rect x="0" y="0" width="320" height="180" fill="#070a14" opacity="0.30" />
      <rect x="68" y="32" width="184" height="116" rx="8" fill={T.card} stroke={T.border} />
      <rect x="80" y="44" width="60" height="9" rx="1" fill={T.text} />
      <rect x="80" y="62" width="44" height="4" rx="1" fill={T.faint} />
      <rect x="80" y="70" width="160" height="14" rx="3" fill="#fff" stroke={T.border2} />
      <rect x="86" y="74" width="76" height="5" rx="1" fill={T.text} />
      <rect x="80" y="92" width="60" height="4" rx="1" fill={T.faint} />
      <rect x="80" y="100" width="160" height="14" rx="3" fill="#fff" stroke={T.border2} />
      <rect x="120" y="128" width="50" height="14" rx="3" fill="#fff" stroke={T.border2} />
      <rect x="176" y="128" width="60" height="14" rx="3" fill={T.accent} />
      <rect x="190" y="133" width="32" height="4" rx="1" fill="#fff" />
    </Frame>
  );
}

function ThumbWalkOverview({ highlight }: { highlight: boolean }) {
  return (
    <Frame>
      <rect x="68" y="10" width="40" height="14" rx="999" fill="#eef0f5" />
      <rect x="74" y="14" width="28" height="6" rx="1" fill={T.muted} />
      <rect x="266" y="10" width="40" height="14" rx="3" fill="#fff" stroke={T.border2} />
      <rect x="68" y="30" width="120" height="11" rx="1" fill={T.text} />
      <rect x="68" y="46" width="160" height="4" rx="1" fill={T.faint} />
      <rect x="68" y="58" width="170" height="46" rx="5" fill={T.card} stroke={T.border} />
      <rect x="76" y="66" width="48" height="5" rx="1" fill={T.text} />
      <rect x="76" y="78" width="154" height="5" rx="2" fill="#eef0f5" />
      <rect x="76" y="78" width="50" height="5" rx="2" fill={T.cyan} />
      <rect x="76" y="92" width="60" height="4" rx="1" fill={T.muted} />
      <rect x="68" y="110" width="170" height="56" rx="5" fill={T.card} stroke={T.border} />
      <rect x="76" y="118" width="40" height="5" rx="1" fill={T.text} />
      <g>
        {highlight ? (
          <rect x="116" y="142" width="78" height="20" rx="4" fill="none" stroke={T.accent} opacity="0.5" strokeWidth="2.5" />
        ) : null}
        <rect x="120" y="146" width="70" height="14" rx="3" fill={T.accent} />
        <rect x="138" y="151" width="36" height="4" rx="1" fill="#fff" />
      </g>
      <rect x="246" y="58" width="64" height="108" rx="5" fill="#fafbfc" stroke={T.border} />
      <rect x="252" y="66" width="40" height="5" rx="1" fill={T.text} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x="252" y={80 + i * 14} width="36" height="3" rx="1" fill={T.faint} />
          <rect x="252" y={86 + i * 14} width="50" height="3" rx="1" fill={T.muted} />
        </g>
      ))}
      <rect x="252" y="138" width="50" height="14" rx="3" fill="#eef0f5" />
    </Frame>
  );
}

function ThumbLiveAction() {
  return (
    <Frame>
      <rect x="68" y="12" width="80" height="6" rx="1" fill={T.text} />
      <rect x="68" y="26" width="240" height="140" rx="6" fill={T.card} stroke={T.border} />
      <rect x="76" y="34" width="60" height="6" rx="1" fill={T.text} />
      {["a", "b", "c", "d", "e"].map((_, i) => (
        <g key={i}>
          <rect x="76" y={50 + i * 18} width="12" height="12" rx="3" fill={i < 3 ? "#10b981" : "#fff"} stroke={i < 3 ? "#10b981" : T.border2} />
          {i < 3 ? <polyline points={`${79} ${56 + i * 18} ${82} ${59 + i * 18} ${86} ${54 + i * 18}`} stroke="#fff" strokeWidth="1.5" fill="none" /> : null}
          <rect x="94" y={54 + i * 18} width="120" height="4" rx="1" fill={i < 3 ? T.text : T.muted} />
        </g>
      ))}
    </Frame>
  );
}

function ThumbSettings() {
  return (
    <Frame>
      <rect x="68" y="12" width="60" height="7" rx="1" fill={T.text} />
      {["a", "b", "c", "d"].map((_, i) => (
        <g key={i}>
          <rect x="68" y={30 + i * 30} width="240" height="24" rx="4" fill={T.card} stroke={T.border} />
          <rect x="76" y={38 + i * 30} width="60" height="5" rx="1" fill={T.text} />
          <rect x="76" y={46 + i * 30} width="120" height="3" rx="1" fill={T.faint} />
          <rect x="280" y={38 + i * 30} width="24" height="10" rx="5" fill={i % 2 === 0 ? T.cyan : "#dde0e6"} />
          <circle cx={i % 2 === 0 ? 298 : 286} cy={43 + i * 30} r="4" fill="#fff" />
        </g>
      ))}
    </Frame>
  );
}

function ThumbDangerZone() {
  return (
    <Frame>
      <rect x="68" y="12" width="80" height="7" rx="1" fill={T.text} />
      <rect x="68" y="28" width="240" height="44" rx="6" fill={T.card} stroke={T.border} />
      <rect x="76" y="36" width="60" height="5" rx="1" fill={T.text} />
      <rect x="76" y="46" width="140" height="4" rx="1" fill={T.faint} />
      <rect x="76" y="54" width="120" height="4" rx="1" fill={T.faint} />
      <rect x="68" y="80" width="240" height="80" rx="6" fill="#fff5f5" stroke="#fbb6c2" />
      <rect x="76" y="90" width="76" height="6" rx="1" fill={T.rose} />
      <rect x="76" y="102" width="50" height="5" rx="1" fill={T.text} />
      <rect x="76" y="112" width="160" height="4" rx="1" fill={T.muted} />
      <rect x="76" y="120" width="120" height="4" rx="1" fill={T.muted} />
      <rect x="260" y="100" width="40" height="16" rx="3" fill={T.rose} />
      <rect x="270" y="106" width="22" height="4" rx="1" fill="#fff" />
    </Frame>
  );
}

function ThumbWorkspace() {
  return (
    <Frame>
      <rect x="68" y="12" width="100" height="7" rx="1" fill={T.text} />
      <rect x="68" y="28" width="240" height="120" rx="6" fill={T.card} stroke={T.border} />
      <rect x="76" y="38" width="74" height="5" rx="1" fill={T.text} />
      <rect x="76" y="52" width="40" height="4" rx="1" fill={T.faint} />
      <rect x="76" y="60" width="200" height="14" rx="3" fill="#fff" stroke={T.border2} />
      <rect x="82" y="64" width="60" height="5" rx="1" fill={T.text} />
      <rect x="76" y="80" width="40" height="4" rx="1" fill={T.faint} />
      <rect x="76" y="88" width="200" height="14" rx="3" fill="#fff" stroke={T.border2} />
      <rect x="76" y="108" width="40" height="4" rx="1" fill={T.faint} />
      <rect x="76" y="116" width="200" height="22" rx="3" fill="#fff" stroke={T.border2} />
      <rect x="216" y="156" width="76" height="14" rx="3" fill={T.accent} />
      <rect x="232" y="160" width="44" height="5" rx="1" fill="#fff" />
    </Frame>
  );
}

function ThumbLoading() {
  return (
    <Frame>
      <rect x="68" y="12" width="80" height="6" rx="1" fill={T.text} />
      <rect x="68" y="26" width="240" height="140" rx="6" fill={T.card} stroke={T.border} />
      <g transform="translate(186, 96)">
        <circle r="13" fill="none" stroke="#eef0f5" strokeWidth="3" />
        <circle r="13" fill="none" stroke={T.accent} strokeWidth="3" strokeDasharray="20 80" />
      </g>
      <rect x="156" y="118" width="60" height="5" rx="1" fill={T.muted} />
    </Frame>
  );
}

function ThumbLogin() {
  return (
    <Frame sidebar={false}>
      <rect x="0" y="0" width="320" height="32" fill="#fff" stroke={T.border} />
      <rect x="14" y="12" width="40" height="9" rx="2" fill={T.text} />
      <rect x="110" y="40" width="100" height="116" rx="8" fill="#fff" stroke={T.border} />
      <rect x="122" y="52" width="38" height="7" rx="1" fill={T.text} />
      <rect x="122" y="68" width="30" height="4" rx="1" fill={T.faint} />
      <rect x="122" y="76" width="76" height="12" rx="2" fill="#fff" stroke={T.border2} />
      <rect x="122" y="96" width="30" height="4" rx="1" fill={T.faint} />
      <rect x="122" y="104" width="76" height="12" rx="2" fill="#fff" stroke={T.border2} />
      <rect x="122" y="124" width="76" height="14" rx="3" fill={T.accent} />
      <rect x="142" y="129" width="36" height="4" rx="1" fill="#fff" />
    </Frame>
  );
}

const THUMB_MAP: Record<ThumbKind, () => React.ReactElement> = {
  dashboard: ThumbDashboard,
  runs: ThumbRuns,
  filters: ThumbFilters,
  saveView: ThumbSaveView,
  walkOver: () => <ThumbWalkOverview highlight={true} />,
  walkIdle: () => <ThumbWalkOverview highlight={false} />,
  liveAction: ThumbLiveAction,
  settings: ThumbSettings,
  dangerZone: ThumbDangerZone,
  workspace: ThumbWorkspace,
  loading: ThumbLoading,
  login: ThumbLogin,
};

export function MockThumb({ kind }: { kind: ThumbKind }) {
  const C = THUMB_MAP[kind] ?? ThumbDashboard;
  return <C />;
}
