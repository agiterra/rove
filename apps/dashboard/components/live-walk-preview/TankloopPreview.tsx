import { RUN_META } from "./mock-data";

/**
 * Light-theme realistic render of the target app (Tankloop) at the moment
 * the agent is clicking "Run walk". Ported from Claude Design — keeps the
 * embedded-product-screenshot feel without using any external imagery.
 */
export function TankloopPreview() {
  const nav: { id: NavId; label: string; active?: boolean }[] = [
    { id: "Overview", label: "Overview", active: true },
    { id: "Runs", label: "Runs" },
    { id: "Flows", label: "Flows" },
    { id: "Findings", label: "Findings" },
    { id: "Reports", label: "Reports" },
    { id: "Settings", label: "Settings" },
    { id: "Help", label: "Help" },
  ];
  return (
    <div className="tk">
      <aside className="tk-side">
        <div className="tk-brand">
          <span className="mk" />
          <span>tankloop</span>
        </div>
        {nav.map((n) => (
          <div key={n.id} className={`tk-nav-item ${n.active ? "tk-active" : ""}`}>
            <span className="ni">{NAV_ICON[n.id]}</span>
            <span>{n.label}</span>
          </div>
        ))}
        <div className="tk-side-foot">
          <span className="av" />
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: 11, fontWeight: 500 }}>Alex Kim</div>
            <div style={{ fontSize: 10, color: "#9aa2b1" }}>Power User</div>
          </div>
        </div>
      </aside>

      <main className="tk-main">
        <div className="tk-bcrumb">
          <span className="tk-pill">Walk overview</span>
          <span className="tk-cancel">Cancel run</span>
        </div>
        <h1 className="tk-h1">Walking the app</h1>
        <p className="tk-sub">We&apos;ll explore key flows and interactions across the application.</p>

        <div className="tk-card">
          <div className="ttl">
            Progress <span className="meta">{RUN_META.elapsedLabel} elapsed</span>
          </div>
          <div className="tk-progress">
            <div className="bar" />
          </div>
          <div className="tk-step-line">
            <span>Step 8 of ~25</span>
          </div>
        </div>

        <div className="tk-card">
          <div className="ttl" style={{ marginBottom: 10 }}>
            Live action
          </div>
          {["Navigate to dashboard", "Open filters", "Apply saved view"].map((t) => (
            <div key={t} className="tk-check">
              <span className="box">
                <CheckIcon />
              </span>
              <span>{t}</span>
            </div>
          ))}
          <button className="tk-cta" type="button">
            Run walk
          </button>
        </div>
      </main>

      <aside className="tk-right">
        <h4>Run details</h4>
        <KV k="Persona" v="Power User" />
        <KV k="Budget" v={RUN_META.budgetLabel} />
        <KV k="Target URL" v={RUN_META.targetUrl} mono />
        <KV k="Flow ID" v={RUN_META.flowUuid} mono />
        <h4 style={{ marginTop: 14 }}>Recent findings</h4>
        <FindingsRow color="#c41a2e" bg="#fdecef" label="Critical" />
        <FindingsRow color="#b04a0a" bg="#fff1e6" label="Major" />
        <FindingsRow color="#8a6a00" bg="#fff8d6" label="Minor" />
        <button className="tk-viewall" type="button">
          View all
        </button>
      </aside>
    </div>
  );
}

function KV({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="tk-kv">
      <div className="k">{k}</div>
      <div className="v" style={mono ? { fontFamily: "var(--font-mono)", fontSize: 10.5 } : undefined}>
        {v}
      </div>
    </div>
  );
}

function FindingsRow({ color, bg, label }: { color: string; bg: string; label: string }) {
  return (
    <div className="tk-findings-row">
      <span className="bg" style={{ background: bg, color }}>
        1
      </span>
      <span>{label}</span>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width={9} height={9} strokeWidth={2.5} fill="none" stroke="currentColor">
      <polyline points="3 9 6 12 13 4" />
    </svg>
  );
}

export function PreviewCursor() {
  return (
    <svg
      viewBox="0 0 16 20"
      width={14}
      height={18}
      style={{
        position: "absolute",
        left: "40.5%",
        top: "78%",
        pointerEvents: "none",
        filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))",
      }}
    >
      <path
        d="M2 1 L2 16 L6 12 L8.5 17 L11 16 L8.5 11 L13 11 Z"
        fill="#fff"
        stroke="#0d1322"
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </svg>
  );
}

type NavId = "Overview" | "Runs" | "Flows" | "Findings" | "Reports" | "Settings" | "Help";

const NAV_ICON: Record<NavId, React.ReactElement> = {
  Overview: (
    <svg viewBox="0 0 16 16">
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  ),
  Runs: (
    <svg viewBox="0 0 16 16">
      <circle cx="4" cy="8" r="1.5" />
      <circle cx="12" cy="4" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <path d="M5 7l6-3M5 9l6 3" />
    </svg>
  ),
  Flows: (
    <svg viewBox="0 0 16 16">
      <path d="M3 4h6M3 8h10M3 12h6" />
    </svg>
  ),
  Findings: (
    <svg viewBox="0 0 16 16">
      <circle cx="7" cy="7" r="4" />
      <path d="M10 10l3 3" />
    </svg>
  ),
  Reports: (
    <svg viewBox="0 0 16 16">
      <path d="M3 13V3M3 13h10M5 11V7M8 11V5M11 11V8" />
    </svg>
  ),
  Settings: (
    <svg viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.8 3.8l1 1M11.2 11.2l1 1M3.8 12.2l1-1M11.2 4.8l1-1" />
    </svg>
  ),
  Help: (
    <svg viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="6" />
      <path d="M6.5 6.5c.2-1 1-1.7 2-1.5s1.5 1 1.3 2c-.3 1.2-1.6 1.2-1.6 2.3M8 11.5v.2" />
    </svg>
  ),
};
