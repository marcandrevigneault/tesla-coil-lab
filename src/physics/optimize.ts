import type { OptObjective, Params } from "../types";
import { computeDerived } from "./formulas";
import { simulate } from "./simulate";

/**
 * Parameter search: simulated annealing over every unlocked numeric variable.
 *
 * Selectable objectives, all evaluated with a fast low-resolution run of the
 * same RK4 model the Run button uses (so tuning, coupling and losses are
 * always priced in — a detuned candidate scores poorly on its own):
 *
 *   voltage    — peak topload voltage V̂s. Loves small toploads.
 *   energy     — ½·Cs·V̂s², the charge actually parked on the topload; the
 *                best proxy for streamer length. Wants topload AND voltage.
 *   efficiency — ½CsV̂s² / ½CpV₀², fraction of the bang that arrived.
 *
 * They are linked by V̂s² = η·V₀²·(Cp/Cs) but pull geometry in different
 * directions — pick the one that matches what you're building for.
 *
 * The walk is true Metropolis annealing: while hot it accepts WORSE
 * candidates with probability exp(Δrel/T), and the temperature reheats in
 * cycles, so repeated runs can cross valleys instead of polishing the same
 * local optimum every time.
 *
 * Hard constraints: the spark-gap firing voltage can never exceed the HV
 * supply voltage (a capacitor charges at most to its source), and every
 * variable stays inside the build-realistic bounds below.
 */

export interface OptVar {
  key: string; // lock key, "group.field"
  group: keyof Params;
  field: string;
  min: number;
  max: number;
  integer?: boolean;
}

export function activeOptVars(p: Params, locks: Record<string, boolean>): OptVar[] {
  const vars: OptVar[] = [
    { key: "secondary.turns", group: "secondary", field: "turns", min: 400, max: 1800, integer: true },
    { key: "secondary.height", group: "secondary", field: "height", min: 0.2, max: 1.0 },
    { key: "secondary.radius", group: "secondary", field: "radius", min: 0.03, max: 0.12 },
    { key: "secondary.wireDiameter", group: "secondary", field: "wireDiameter", min: 0.0002, max: 0.0012 },
    { key: "primary.turns", group: "primary", field: "turns", min: 4, max: 24, integer: true },
    { key: "primary.innerRadius", group: "primary", field: "innerRadius", min: 0.06, max: 0.3 },
    { key: "primary.pitch", group: "primary", field: "pitch", min: 0.004, max: 0.03 },
    { key: "primary.conductorDiameter", group: "primary", field: "conductorDiameter", min: 0.003, max: 0.012 },
    { key: "primary.baseHeight", group: "primary", field: "baseHeight", min: -0.05, max: 0.25 },
    { key: "drive.tankCapacitance", group: "drive", field: "tankCapacitance", min: 2e-9, max: 100e-9 },
  ];

  if (p.topload.shape === "toroid") {
    vars.push(
      { key: "topload.majorDiameter", group: "topload", field: "majorDiameter", min: 0.1, max: 0.6 },
      { key: "topload.minorDiameter", group: "topload", field: "minorDiameter", min: 0.03, max: 0.16 }
    );
  } else {
    vars.push({ key: "topload.sphereDiameter", group: "topload", field: "sphereDiameter", min: 0.1, max: 0.5 });
  }

  if (p.primary.type === "cone") {
    vars.push({ key: "primary.coneAngle", group: "primary", field: "coneAngle", min: 5, max: 75 });
  }

  if (p.drive.topology === "spark-gap") {
    vars.push({
      key: "drive.firingVoltage", group: "drive", field: "firingVoltage",
      min: 1000, max: Math.max(p.drive.supplyVoltage, 1000),
    });
  } else {
    vars.push(
      { key: "drive.busVoltage", group: "drive", field: "busVoltage", min: 100, max: 800 },
      { key: "drive.onTime", group: "drive", field: "onTime", min: 20e-6, max: 400e-6 }
    );
  }

  return vars.filter((v) => !locks[v.key]);
}

const clone = (p: Params): Params => JSON.parse(JSON.stringify(p));

function getVar(p: Params, v: OptVar): number {
  return (p[v.group] as any)[v.field];
}
function setVar(p: Params, v: OptVar, value: number): void {
  let x = Math.min(Math.max(value, v.min), v.max);
  if (v.integer) x = Math.round(x);
  (p[v.group] as any)[v.field] = x;
}

/** Sanity clamps that must hold no matter what the walker does. */
function enforceConstraints(p: Params): void {
  p.drive.firingVoltage = Math.min(p.drive.firingVoltage, p.drive.supplyVoltage);
  // Toroid tube can't be fatter than the toroid itself.
  p.topload.minorDiameter = Math.min(p.topload.minorDiameter, 0.45 * p.topload.majorDiameter);
}

export function evaluate(p: Params, objective: OptObjective): number {
  enforceConstraints(p);
  const d = computeDerived(p);
  // Overcoupled coils flash over between windings long before the model's
  // k → 1 limit; treat k ≥ 0.35 as a build failure, not a candidate.
  if (!isFinite(d.fPrimary) || !isFinite(d.fSecondary) || d.k >= 0.35) return -Infinity;
  const quick =
    p.drive.topology === "solid-state"
      ? { ptsPerPeriod: 80, maxSteps: 60_000, durationOverride: Math.min(p.drive.onTime + 150e-6, 1 / p.drive.interrupterHz) }
      : { ptsPerPeriod: 90, maxSteps: 60_000, durationOverride: Math.min(p.drive.duration, 80e-6) };
  const Vs = simulate(p, d, quick).peakVs;
  if (objective === "voltage") return Vs;
  const toploadEnergy = 0.5 * d.Cs * Vs * Vs;
  if (objective === "energy") return toploadEnergy;
  const v0 = p.drive.topology === "spark-gap" ? p.drive.firingVoltage : p.drive.busVoltage;
  return toploadEnergy / (0.5 * p.drive.tankCapacitance * v0 * v0);
}

// Box–Muller, good enough for a perturbation kernel.
function gauss(): number {
  const u = Math.random() || 1e-9;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

export function perturb(p: Params, vars: OptVar[], temp: number): Params {
  const out = clone(p);
  const n = Math.random() < 0.35 && vars.length > 1 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const v = vars[Math.floor(Math.random() * vars.length)];
    const span = v.max - v.min;
    setVar(out, v, getVar(out, v) + gauss() * span * temp * 0.25);
  }
  enforceConstraints(out);
  return out;
}

export const OPT_ITERS = 300;
export const OPT_REHEATS = 3; // temperature sawtooth cycles per run

/** Annealing temperature with periodic reheating. */
export function temperature(iter: number): number {
  const cycle = OPT_ITERS / OPT_REHEATS;
  const tProg = (iter % cycle) / cycle;
  return 0.45 * (1 - tProg) + 0.04;
}

/** Metropolis: always take improvements; take regressions with a
 *  temperature-scaled probability so the walk can leave local optima. */
export function accepts(curScore: number, candScore: number, temp: number): boolean {
  if (candScore >= curScore) return true;
  if (!isFinite(candScore)) return false;
  const dRel = (candScore - curScore) / Math.max(Math.abs(curScore), 1e-12);
  return Math.random() < Math.exp(dRel / (0.5 * temp));
}
