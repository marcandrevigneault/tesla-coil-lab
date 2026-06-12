import type { Derived, Params } from "../types";

/**
 * Distributed ladder model of the secondary: N series-L segments with shunt
 * capacitance to ground at every node and the topload capacitance on the top
 * node. The base is grounded, the top is open — a slow-wave λ/4 resonator.
 *
 * At a trial frequency ω the chain is propagated top → base with V_top = 1.
 * Writing I' = I/(jω) keeps everything real for the lossless mode shape:
 *
 *     I'(below node j) = I'(above) + C_j · V_j
 *     V_{j-1}          = V_j − ω² L_seg · I'
 *
 * Resonance is where the propagated base voltage hits zero (the base is a
 * voltage node). The first zero is the fundamental — its V(x) is the
 * standing-wave profile the lumped model can't see — and the second zero is
 * the ¾λ overtone that racing sparks like to excite.
 *
 * The total distributed shunt capacitance is calibrated (one outer bisection)
 * so the ladder's fundamental lands exactly on the lumped Medhurst f₂: the
 * lumped frequency stays the calibrated source of truth, the ladder adds the
 * spatial information on top of it.
 */

export interface LadderPoint {
  x: number; // 0 (base) .. 1 (top)
  v: number; // |V| normalized to V_top = 1
  i: number; // |I| normalized to max = 1
}

export interface LadderResult {
  f1: number; // fundamental, ≈ lumped f₂ by calibration
  fOvertone: number; // ¾λ mode
  profile: LadderPoint[];
}

const N = 60;

/** Base voltage with V_top = 1; optionally records the node profile. */
function propagate(
  omega: number,
  Lseg: number,
  CgNode: number,
  Ctop: number,
  out?: { V: Float64Array; I: Float64Array }
): number {
  let V = 1;
  let Icum = (Ctop + CgNode / 2) * V; // top node: topload + its half-cell
  out?.V.set([V], N);
  out?.I.set([Icum], N);
  for (let j = N - 1; j >= 0; j--) {
    V -= omega * omega * Lseg * Icum;
    out?.V.set([V], j);
    out?.I.set([Icum], j);
    if (j > 0) Icum += CgNode * V;
  }
  return V;
}

/** First `count` resonances (zeros of the base voltage) below ~4× ω0. */
function findModes(Lseg: number, CgNode: number, Ctop: number, omega0: number, count: number): number[] {
  const modes: number[] = [];
  const STEPS = 700;
  const lo = 0.2 * omega0, hi = 4.5 * omega0;
  let prevW = lo, prevV = propagate(lo, Lseg, CgNode, Ctop);
  for (let s = 1; s <= STEPS && modes.length < count; s++) {
    const w = lo * Math.pow(hi / lo, s / STEPS);
    const v = propagate(w, Lseg, CgNode, Ctop);
    if (prevV * v < 0) {
      let a = prevW, b = w;
      for (let it = 0; it < 50; it++) {
        const m = (a + b) / 2;
        if (propagate(a, Lseg, CgNode, Ctop) * propagate(m, Lseg, CgNode, Ctop) <= 0) b = m;
        else a = m;
      }
      modes.push((a + b) / 2);
    }
    prevW = w;
    prevV = v;
  }
  return modes;
}

const cache = new Map<string, LadderResult>();

export function secondaryLadder(d: Derived): LadderResult {
  const Cself = d.CselfPF * 1e-12;
  const Ctop = d.CtopPF * 1e-12;
  const key = `${d.Ls}|${Cself}|${Ctop}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const Lseg = d.Ls / N;
  const omegaTarget = 2 * Math.PI * d.fSecondary;

  // Calibrate the distributed C total: more shunt C ⇒ lower fundamental.
  const f1Of = (scale: number) =>
    findModes(Lseg, (Cself * scale) / N, Ctop, omegaTarget, 1)[0] ?? Infinity;
  let lo = 0.05, hi = 10;
  for (let it = 0; it < 40; it++) {
    const mid = Math.sqrt(lo * hi);
    if (f1Of(mid) > omegaTarget) lo = mid;
    else hi = mid;
  }
  const scale = Math.sqrt(lo * hi);
  const CgNode = (Cself * scale) / N;

  const [w1, w2] = findModes(Lseg, CgNode, Ctop, omegaTarget, 2);
  const rec = { V: new Float64Array(N + 1), I: new Float64Array(N + 1) };
  propagate(w1 ?? omegaTarget, Lseg, CgNode, Ctop, rec);

  const iMax = Math.max(...Array.from(rec.I).map(Math.abs), 1e-30);
  const profile: LadderPoint[] = Array.from({ length: N + 1 }, (_, j) => ({
    x: j / N,
    v: Math.min(Math.abs(rec.V[j]), 1),
    i: Math.abs(rec.I[j]) / iMax,
  }));

  const result: LadderResult = {
    f1: (w1 ?? omegaTarget) / (2 * Math.PI),
    fOvertone: (w2 ?? 3 * (w1 ?? omegaTarget)) / (2 * Math.PI),
    profile,
  };
  if (cache.size > 200) cache.clear();
  cache.set(key, result);
  return result;
}

/** Primary-strike risk: the ladder profile gives the secondary's local
 *  voltage at every primary turn's actual height; divide by the radial gap
 *  to that turn and compare against what the gap medium can hold off.
 *  Design limits (conservative, creepage included): air ~15 kV/cm; a PTFE
 *  barrier tube with proper creepage path ~50 kV/cm. This is why real coils
 *  put the primary at the BASE (V ≈ 0 there) and why a mid-height helix
 *  needs magnifier-style insulation engineering. */
export function strikeRisk(p: Params, d: Derived, peakVs: number) {
  const { profile } = secondaryLadder(d);
  const s = p.secondary, pr = p.primary;
  const th = (pr.coneAngle * Math.PI) / 180;
  let worst = 0;
  for (let j = 0; j < pr.turns; j++) {
    const sj = pr.pitch * (j + 0.5);
    let r: number, y: number;
    if (pr.type === "spiral") { r = pr.innerRadius + sj; y = pr.baseHeight; }
    else if (pr.type === "helix") { r = pr.innerRadius; y = pr.baseHeight + sj; }
    else { r = pr.innerRadius + sj * Math.cos(th); y = pr.baseHeight + sj * Math.sin(th); }
    const gap = r - pr.conductorDiameter / 2 - s.radius;
    if (gap < 0.005) return { gradientVm: Infinity, limitVm: 0, ratio: Infinity };
    const vLocal = profileVoltageAt(profile, y / s.height) * peakVs;
    worst = Math.max(worst, vLocal / gap);
  }
  const limitVm = pr.insulation === "ptfe" ? 5.0e6 : 1.5e6;
  return { gradientVm: worst, limitVm, ratio: worst / limitVm };
}

/** Linear interpolation of the mode voltage at height fraction t ∈ [0,1]. */
export function profileVoltageAt(profile: LadderPoint[], t: number): number {
  const x = Math.min(Math.max(t, 0), 1) * (profile.length - 1);
  const j = Math.floor(x);
  const frac = x - j;
  const a = profile[j], b = profile[Math.min(j + 1, profile.length - 1)];
  return a.v + (b.v - a.v) * frac;
}
