import type { ShotKind } from "./mock-data";

/**
 * SVG-rendered mock of a browser viewport at different stages of the
 * walked target app. Honest about being a mock — distinct visual states
 * per step keep the filmstrip from looking like the same image eight
 * times.
 */
export function MockBrowserShot({ kind, label }: { kind: ShotKind; label?: string }) {
  return (
    <svg
      role="img"
      aria-label={label ?? `Mock browser screenshot — ${kind}`}
      viewBox="0 0 320 180"
      className="block h-full w-full"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="shot-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0f1422" />
          <stop offset="100%" stopColor="#07090f" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="320" height="180" fill="url(#shot-bg)" />

      <rect x="0" y="0" width="320" height="18" fill="#0b0f18" />
      <circle cx="9" cy="9" r="3" fill="#1f2740" />
      <circle cx="19" cy="9" r="3" fill="#1f2740" />
      <circle cx="29" cy="9" r="3" fill="#1f2740" />
      <rect x="46" y="4" width="220" height="10" rx="2" fill="#0f1422" />
      <text x="52" y="12" fontSize="6" fontFamily="ui-monospace, monospace" fill="#5a6480">
        {urlForKind(kind)}
      </text>

      <ShotBody kind={kind} />
    </svg>
  );
}

function urlForKind(kind: ShotKind): string {
  switch (kind) {
    case "list-view":
      return "app.tankloop.io/runs";
    case "form-empty":
      return "app.tankloop.io/flows";
    case "form-filled":
      return "app.tankloop.io/flows/discover_flows";
    case "modal-confirm":
      return "app.tankloop.io/flows/discover_flows";
    case "loading":
      return "app.tankloop.io/runs/new";
    case "error-state":
      return "app.tankloop.io/flows";
    case "details":
      return "app.tankloop.io/flows";
    case "success":
      return "app.tankloop.io/runs/abc";
  }
}

function ShotBody({ kind }: { kind: ShotKind }) {
  switch (kind) {
    case "list-view":
      return (
        <g>
          <rect x="12" y="28" width="120" height="8" rx="2" fill="#1f2740" />
          <rect x="12" y="50" width="296" height="18" rx="2" fill="#0f1422" stroke="#1f2740" />
          <rect x="12" y="74" width="296" height="18" rx="2" fill="#0f1422" stroke="#1f2740" />
          <rect x="12" y="98" width="296" height="18" rx="2" fill="#0f1422" stroke="#1f2740" />
          <rect x="12" y="122" width="296" height="18" rx="2" fill="#0f1422" stroke="#1f2740" />
          <rect x="20" y="56" width="60" height="6" rx="1" fill="#3fc9cb" opacity="0.7" />
          <rect x="92" y="56" width="40" height="6" rx="1" fill="#5a6480" />
          <rect x="20" y="80" width="80" height="6" rx="1" fill="#8a93ab" />
          <rect x="20" y="104" width="100" height="6" rx="1" fill="#8a93ab" />
        </g>
      );
    case "form-empty":
    case "details":
      return (
        <g>
          <rect x="12" y="28" width="80" height="10" rx="2" fill="#1f2740" />
          <rect x="12" y="50" width="180" height="6" rx="1" fill="#8a93ab" />
          <rect x="12" y="64" width="220" height="6" rx="1" fill="#8a93ab" opacity="0.6" />
          <rect x="12" y="92" width="296" height="28" rx="3" fill="#0f1422" stroke="#2c3654" />
          <rect x="20" y="100" width="80" height="6" rx="1" fill="#8a93ab" />
          <rect x="12" y="128" width="296" height="28" rx="3" fill="#0f1422" stroke="#2c3654" />
          <rect x="20" y="136" width="120" height="6" rx="1" fill="#8a93ab" />
        </g>
      );
    case "form-filled":
      return (
        <g>
          <rect x="12" y="28" width="120" height="10" rx="2" fill="#1f2740" />
          <rect x="12" y="50" width="160" height="6" rx="1" fill="#e8edf7" />
          <rect x="12" y="76" width="296" height="22" rx="3" fill="#0f1422" stroke="#3fc9cb" strokeOpacity="0.4" />
          <text x="20" y="91" fontSize="7" fontFamily="ui-monospace, monospace" fill="#e8edf7">
            agent_scenario_alpha
          </text>
          <rect x="12" y="108" width="100" height="22" rx="3" fill="#0f1422" stroke="#2c3654" />
          <rect x="20" y="115" width="60" height="6" rx="1" fill="#8a93ab" />
          <rect x="220" y="146" width="88" height="22" rx="3" fill="#3fc9cb" />
          <text x="246" y="160" fontSize="7" fontFamily="Geist, ui-sans-serif" fill="#07090f">
            Run walk
          </text>
        </g>
      );
    case "modal-confirm":
      return (
        <g>
          <rect x="12" y="28" width="296" height="142" rx="3" fill="#0f1422" stroke="#1f2740" opacity="0.5" />
          <rect x="0" y="22" width="320" height="158" fill="#07090f" opacity="0.55" />
          <rect x="56" y="50" width="208" height="92" rx="6" fill="#141a2a" stroke="#2c3654" />
          <rect x="68" y="64" width="120" height="9" rx="2" fill="#e8edf7" />
          <rect x="68" y="80" width="180" height="6" rx="1" fill="#8a93ab" />
          <rect x="68" y="92" width="160" height="6" rx="1" fill="#8a93ab" opacity="0.7" />
          <rect x="68" y="118" width="72" height="18" rx="3" fill="#0f1422" stroke="#2c3654" />
          <rect x="152" y="118" width="96" height="18" rx="3" fill="#3fc9cb" />
          <text x="178" y="130" fontSize="7" fontFamily="Geist, ui-sans-serif" fill="#07090f">
            Run walk
          </text>
          <rect x="148" y="116" width="100" height="22" rx="4" fill="none" stroke="#3fc9cb" strokeOpacity="0.6">
            <animate attributeName="stroke-opacity" values="0.3;1;0.3" dur="1.6s" repeatCount="indefinite" />
          </rect>
        </g>
      );
    case "loading":
      return (
        <g>
          <rect x="12" y="28" width="120" height="10" rx="2" fill="#1f2740" />
          <circle cx="160" cy="100" r="14" fill="none" stroke="#3fc9cb" strokeWidth="2" strokeDasharray="22 14" strokeOpacity="0.7" />
          <rect x="124" y="128" width="72" height="6" rx="1" fill="#8a93ab" />
        </g>
      );
    case "error-state":
      return (
        <g>
          <rect x="12" y="28" width="120" height="10" rx="2" fill="#1f2740" />
          <rect x="12" y="50" width="180" height="6" rx="1" fill="#8a93ab" />
          <rect x="12" y="76" width="296" height="22" rx="3" fill="#0f1422" stroke="#f43f5e" strokeOpacity="0.4" />
          <rect x="20" y="85" width="80" height="6" rx="1" fill="#f43f5e" opacity="0.8" />
          <rect x="12" y="108" width="296" height="22" rx="3" fill="#0f1422" stroke="#2c3654" />
          <rect x="20" y="117" width="120" height="6" rx="1" fill="#5a6480" />
          <rect x="200" y="142" width="108" height="22" rx="3" fill="#1f2740" />
          <text x="226" y="156" fontSize="7" fontFamily="Geist, ui-sans-serif" fill="#5a6480">
            [no name]
          </text>
        </g>
      );
    case "success":
      return (
        <g>
          <rect x="12" y="28" width="120" height="10" rx="2" fill="#1f2740" />
          <circle cx="160" cy="86" r="14" fill="#3fc9cb" opacity="0.18" />
          <path d="M152 86 L158 92 L168 80" stroke="#3fc9cb" strokeWidth="2" fill="none" />
          <rect x="100" y="116" width="120" height="6" rx="1" fill="#e8edf7" />
          <rect x="116" y="128" width="88" height="6" rx="1" fill="#8a93ab" />
        </g>
      );
  }
}
