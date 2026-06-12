import { create } from "zustand";
import type { ComponentId, OptInfo, Params, SimResult, ViewMode } from "./types";
import { computeDerived } from "./physics/formulas";
import { simulate } from "./physics/simulate";
import { OPT_ITERS, activeOptVars, objective, perturb } from "./physics/optimize";

export const DEFAULT_PARAMS: Params = {
  secondary: { turns: 1000, height: 0.5, radius: 0.05, wireDiameter: 0.0004, material: "copper" },
  topload: {
    shape: "toroid", construction: "hollow", wallThickness: 0.001,
    majorDiameter: 0.3, minorDiameter: 0.08, sphereDiameter: 0.2, material: "aluminum",
  },
  primary: {
    type: "spiral", turns: 10, innerRadius: 0.12, pitch: 0.011, coneAngle: 30, baseHeight: 0.02,
    conductorDiameter: 0.006, conductorStyle: "tube", tubeWall: 0.001, material: "copper",
  },
  drive: {
    topology: "spark-gap",
    supplyVoltage: 5_000, supplyCurrent: 0.03, // Marc-André's 5 kV / 30 mA supply
    firingVoltage: 5_000, gapResistance: 1.5, duration: 120e-6,
    busVoltage: 340, onTime: 100e-6, interrupterHz: 220,
    tankCapacitance: 10e-9,
  },
};

const DEFAULT_LOCKS: Record<string, boolean> = {
  "drive.supplyVoltage": true,
  "drive.supplyCurrent": true,
};

interface Store {
  params: Params;
  locks: Record<string, boolean>;
  hovered: ComponentId | null;
  selected: ComponentId | null;
  view: ViewMode;
  leftOpen: boolean;
  bottomOpen: boolean;
  sim: SimResult | null;
  running: boolean;
  optimizing: boolean;
  optInfo: OptInfo | null;

  setParam: <K extends keyof Params>(group: K, patch: Partial<Params[K]>) => void;
  toggleLock: (key: string) => void;
  setHovered: (id: ComponentId | null) => void;
  setSelected: (id: ComponentId | null) => void;
  setView: (v: ViewMode) => void;
  toggleLeft: () => void;
  toggleBottom: () => void;
  runSimulation: () => void;
  startOptimize: () => void;
  stopOptimize: () => void;
  reset: () => void;
}

export const useStore = create<Store>((set, get) => ({
  params: DEFAULT_PARAMS,
  locks: { ...DEFAULT_LOCKS },
  hovered: null,
  selected: null,
  view: "3d",
  leftOpen: true,
  bottomOpen: true,
  sim: null,
  running: false,
  optimizing: false,
  optInfo: null,

  setParam: (group, patch) =>
    set((s) => ({ params: { ...s.params, [group]: { ...s.params[group], ...patch } } })),
  toggleLock: (key) => set((s) => ({ locks: { ...s.locks, [key]: !s.locks[key] } })),
  setHovered: (hovered) => set({ hovered }),
  setSelected: (selected) => set({ selected }),
  setView: (view) => set({ view }),
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  toggleBottom: () => set((s) => ({ bottomOpen: !s.bottomOpen })),

  runSimulation: () => {
    set({ running: true });
    // Yield one frame so the button state paints before the (fast) solve.
    requestAnimationFrame(() => {
      const p = get().params;
      const sim = simulate(p, computeDerived(p));
      set({ sim, running: false, bottomOpen: true });
    });
  },

  startOptimize: async () => {
    const { optimizing, locks } = get();
    if (optimizing) return;
    const vars = activeOptVars(get().params, locks);
    if (vars.length === 0) {
      set({ optInfo: { iter: 0, total: 0, bestVs: 0, startVs: 0, improved: 0, varCount: 0 } });
      return;
    }

    let best: Params = JSON.parse(JSON.stringify(get().params));
    let bestScore = objective(best);
    const startVs = bestScore;
    let improved = 0;
    set({
      optimizing: true,
      optInfo: { iter: 0, total: OPT_ITERS, bestVs: bestScore, startVs, improved, varCount: vars.length },
    });

    for (let i = 0; i < OPT_ITERS; i++) {
      if (!get().optimizing) break;
      const temp = 0.35 * (1 - i / OPT_ITERS) + 0.03;
      const cand = perturb(best, vars, temp);
      const score = objective(cand);
      if (score > bestScore) {
        best = cand;
        bestScore = score;
        improved++;
        // Live-apply improvements so the 3D model morphs as the search runs.
        set({ params: JSON.parse(JSON.stringify(best)) });
      }
      set({ optInfo: { iter: i + 1, total: OPT_ITERS, bestVs: bestScore, startVs, improved, varCount: vars.length } });
      if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0)); // keep the UI alive
    }

    set({ params: best, optimizing: false });
    get().runSimulation();
  },

  stopOptimize: () => set({ optimizing: false }),

  reset: () => set({ params: DEFAULT_PARAMS, locks: { ...DEFAULT_LOCKS }, sim: null, selected: null, optInfo: null }),
}));

/** Derived lumped values, recomputed on demand (cheap). */
export const useDerived = () => computeDerived(useStore((s) => s.params));
