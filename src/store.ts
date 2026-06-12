import { create } from "zustand";
import type { ComponentId, Params, SimResult, ViewMode } from "./types";
import { computeDerived } from "./physics/formulas";
import { simulateBang } from "./physics/simulate";

export const DEFAULT_PARAMS: Params = {
  secondary: { turns: 1000, height: 0.5, radius: 0.05, wireDiameter: 0.0004, material: "copper" },
  topload: { shape: "toroid", majorDiameter: 0.3, minorDiameter: 0.08, sphereDiameter: 0.2, material: "aluminum" },
  primary: { type: "spiral", turns: 10, innerRadius: 0.12, pitch: 0.011, conductorDiameter: 0.006, material: "copper" },
  drive: { firingVoltage: 15_000, tankCapacitance: 10e-9, coupling: 0.12, gapResistance: 1.5, duration: 120e-6 },
};

interface Store {
  params: Params;
  hovered: ComponentId | null;
  selected: ComponentId | null;
  view: ViewMode;
  leftOpen: boolean;
  bottomOpen: boolean;
  sim: SimResult | null;
  running: boolean;

  setParam: <K extends keyof Params>(group: K, patch: Partial<Params[K]>) => void;
  setHovered: (id: ComponentId | null) => void;
  setSelected: (id: ComponentId | null) => void;
  setView: (v: ViewMode) => void;
  toggleLeft: () => void;
  toggleBottom: () => void;
  runSimulation: () => void;
  reset: () => void;
}

export const useStore = create<Store>((set, get) => ({
  params: DEFAULT_PARAMS,
  hovered: null,
  selected: null,
  view: "3d",
  leftOpen: true,
  bottomOpen: true,
  sim: null,
  running: false,

  setParam: (group, patch) =>
    set((s) => ({ params: { ...s.params, [group]: { ...s.params[group], ...patch } } })),
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
      const sim = simulateBang(p, computeDerived(p));
      set({ sim, running: false, bottomOpen: true });
    });
  },

  reset: () => set({ params: DEFAULT_PARAMS, sim: null, selected: null }),
}));

/** Derived lumped values, recomputed on demand (cheap). */
export const useDerived = () => computeDerived(useStore((s) => s.params));
