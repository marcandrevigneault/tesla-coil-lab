import { Component, type ReactNode } from "react";
import ParamPanel from "./components/ParamPanel";
import Scene3D from "./components/Scene3D";
import SelectionCard from "./components/SelectionCard";
import SimBar from "./components/SimBar";
import SystemView from "./components/SystemView";
import { useStore } from "./store";

function TopBar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  return (
    <header
      className="panel flex items-center gap-4 px-4 h-12 shrink-0"
      style={{ borderLeft: "none", borderRight: "none", borderTop: "none" }}
    >
      <h1 className="m-0 text-[16px] font-extrabold tracking-tight" style={{ fontStretch: "118%" }}>
        TESLA&nbsp;COIL&nbsp;LAB
        <span className="mono text-[10px] font-medium ml-2 align-middle" style={{ color: "var(--corona)" }}>
          dual-resonator workbench
        </span>
      </h1>
      <nav className="ml-auto flex gap-1.5">
        <button className={`btn ${view === "3d" ? "active" : "btn-ghost"}`} onClick={() => setView("3d")}>
          3D view
        </button>
        <button className={`btn ${view === "system" ? "active" : "btn-ghost"}`} onClick={() => setView("system")}>
          System view
        </button>
      </nav>
    </header>
  );
}

/** The whole tree shouldn't die if WebGL is unavailable (headless, old GPU, …). */
class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="grid place-items-center h-full text-[13px]" style={{ color: "var(--muted)" }}>
          3D view unavailable — WebGL could not start. The System view and simulations still work.
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const view = useStore((s) => s.view);
  const hovered = useStore((s) => s.hovered);
  return (
    <div className="h-full flex flex-col">
      <TopBar />
      <div className="flex grow min-h-0">
        <ParamPanel />
        {/* viewport + sim bar live right of the parameter panel, so the bar never covers it */}
        <div className="flex flex-col grow min-w-0">
          <main className="relative grow min-h-0">
            {view === "3d" ? (
              <>
                <CanvasBoundary>
                  <Scene3D />
                </CanvasBoundary>
                <SelectionCard />
                {hovered && (
                  <div
                    className="absolute bottom-3 left-3 mono text-[11px] px-2 py-1 rounded"
                    style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--corona)" }}
                  >
                    {hovered} — click to edit
                  </div>
                )}
              </>
            ) : (
              <SystemView />
            )}
          </main>
          <SimBar />
        </div>
      </div>
    </div>
  );
}
