import type { ConductorStyle, Derived, Material, Params } from "../types";

/**
 * Geometry -> lumped element values.
 *
 * Inductances: Wheeler's empirical formulas (1928), accurate to ~1% for the
 * geometries Tesla coils actually use. Original forms are in inches and µH.
 *
 *   Single-layer solenoid:  L[µH] = r² N² / (9 r + 10 l)          (r = radius, l = length, inches)
 *   Flat (Archimedean) spiral: L[µH] = a² N² / (8 a + 11 w)       (a = mean radius, w = winding depth)
 *   Inverse cone: the usual coiler hybrid — compute the helix and spiral
 *   inductances of the projected geometry and combine by cone angle θ:
 *       L = √[ (L_helix sinθ)² + (L_spiral cosθ)² ]
 *   (θ = 0 reduces to the flat spiral, θ = 90° to the helix.)
 *
 * Secondary self-capacitance: Medhurst (1947):
 *   C[pF] = D_cm · ( 0.1126 l/D + 0.08 + 0.27 √(D/l) )
 *
 * Toroid free-space capacitance: standard coiler empirical fit (Bert Pool),
 * dimensions in inches, ±~5%:
 *   C[pF] = 2.8 (1.2781 − d2/d1) √( π (d1 − d2) d2 / 4 )
 *
 * Sphere: exact isolated-sphere result C = 4πε0 R.
 *
 * Hollow vs solid toploads have identical capacitance — the charge sits on
 * the outer surface either way. What changes is the mass, computed below.
 */

const M_TO_IN = 39.3700787;
const EPS0 = 8.8541878128e-12;
const MU0 = 4 * Math.PI * 1e-7;

export const RESISTIVITY: Record<Material, number> = {
  silver: 1.59e-8,
  copper: 1.68e-8,
  aluminum: 2.65e-8,
};

export const DENSITY: Record<Material, number> = {
  silver: 10_490,
  copper: 8_960,
  aluminum: 2_700,
};

export const MATERIAL_COLOR: Record<Material, string> = {
  copper: "#b87333",
  aluminum: "#c8ccd2",
  silver: "#e8eaec",
};

export function solenoidInductance(radiusM: number, lengthM: number, N: number): number {
  const r = radiusM * M_TO_IN;
  const l = lengthM * M_TO_IN;
  const LuH = (r * r * N * N) / (9 * r + 10 * l);
  return LuH * 1e-6;
}

export function spiralInductance(innerRadiusM: number, pitchM: number, N: number): number {
  const width = pitchM * N; // radial extent of winding
  const aMean = innerRadiusM + width / 2;
  const a = aMean * M_TO_IN;
  const w = Math.max(width * M_TO_IN, 0.1);
  const LuH = (a * a * N * N) / (8 * a + 11 * w);
  return LuH * 1e-6;
}

export function coneInductance(
  innerRadiusM: number,
  pitchM: number,
  N: number,
  angleDeg: number
): number {
  const th = (angleDeg * Math.PI) / 180;
  const slope = pitchM * N; // winding extent along the cone surface
  const radial = slope * Math.cos(th);
  const height = Math.max(slope * Math.sin(th), 1e-4);
  const aMean = innerRadiusM + radial / 2;
  const Lh = solenoidInductance(aMean, height, N);
  const Lsp = spiralInductance(innerRadiusM, Math.max(pitchM * Math.cos(th), 1e-5), N);
  return Math.hypot(Lh * Math.sin(th), Lsp * Math.cos(th));
}

export function medhurstSelfCapacitance(radiusM: number, lengthM: number): number {
  const Dcm = 2 * radiusM * 100;
  const ratio = lengthM / (2 * radiusM); // l/D
  const H = 0.1126 * ratio + 0.08 + 0.27 * Math.sqrt(1 / ratio);
  return H * Dcm * 1e-12; // F
}

export function toroidCapacitance(d1M: number, d2M: number): number {
  const d1 = d1M * M_TO_IN;
  const d2 = Math.min(d2M, 0.9 * d1M) * M_TO_IN;
  const CpF = 2.8 * (1.2781 - d2 / d1) * Math.sqrt((Math.PI * (d1 - d2) * d2) / 4);
  return Math.max(CpF, 0) * 1e-12;
}

export function sphereCapacitance(diameterM: number): number {
  return 4 * Math.PI * EPS0 * (diameterM / 2);
}

/* ---------- geometric coupling ---------- */

/** Complete elliptic integrals K(m), E(m) by the AGM, m = modulus². */
function ellipticKE(m: number): [number, number] {
  let a = 1, b = Math.sqrt(1 - m), c = Math.sqrt(m);
  let sum = c * c / 2, pow = 0.5;
  while (c > 1e-12) {
    const an = (a + b) / 2;
    b = Math.sqrt(a * b);
    c = (a - b) / 2;
    a = an;
    pow *= 2;
    sum += pow * c * c;
  }
  const K = Math.PI / (2 * a);
  return [K, K * (1 - sum)];
}

/** Mutual inductance of two coaxial circular loops (Maxwell's formula):
 *  radii a, b, axial separation z. */
export function loopMutual(a: number, b: number, z: number): number {
  const m = (4 * a * b) / ((a + b) ** 2 + z * z); // modulus²
  if (m < 1e-12) return 0;
  const kMod = Math.sqrt(m);
  const [K, E] = ellipticKE(m);
  return MU0 * Math.sqrt(a * b) * ((2 / kMod - kMod) * K - (2 / kMod) * E);
}

/** Total primary↔secondary mutual inductance: each primary turn is one
 *  filament placed by its geometry (incl. base height); the secondary's
 *  many turns are collapsed into ~40 weighted slices. k = M/√(LpLs) then
 *  reacts to cone angle, radii, and the primary's vertical position —
 *  raise the primary and watch the coupling climb, like on a real coil. */
export function mutualInductance(p: Params): number {
  const s = p.secondary, pr = p.primary;
  const SLICES = 40;
  const wSec = s.turns / SLICES;
  const th = (pr.coneAngle * Math.PI) / 180;

  let M = 0;
  for (let j = 0; j < pr.turns; j++) {
    const sj = pr.pitch * (j + 0.5);
    let rP: number, yP: number;
    if (pr.type === "spiral") { rP = pr.innerRadius + sj; yP = pr.baseHeight; }
    else if (pr.type === "helix") { rP = pr.innerRadius; yP = pr.baseHeight + sj; }
    else { rP = pr.innerRadius + sj * Math.cos(th); yP = pr.baseHeight + sj * Math.sin(th); }

    for (let i = 0; i < SLICES; i++) {
      const ySec = ((i + 0.5) / SLICES) * s.height;
      M += wSec * loopMutual(rP, s.radius, ySec - yP);
    }
  }
  return M;
}

export function toploadMass(p: Params["topload"]): number {
  const rho = DENSITY[p.material];
  if (p.shape === "sphere") {
    const r = p.sphereDiameter / 2;
    if (p.construction === "solid") return rho * (4 / 3) * Math.PI * r ** 3;
    const w = Math.min(p.wallThickness, r);
    return rho * ((4 / 3) * Math.PI * (r ** 3 - (r - w) ** 3));
  }
  const rMinor = p.minorDiameter / 2;
  const rMajor = Math.max((p.majorDiameter - p.minorDiameter) / 2, rMinor);
  if (p.construction === "solid") return rho * 2 * Math.PI ** 2 * rMajor * rMinor ** 2;
  const w = Math.min(p.wallThickness, rMinor);
  return rho * 2 * Math.PI ** 2 * rMajor * (rMinor ** 2 - (rMinor - w) ** 2);
}

export function skinDepth(rho: number, freqHz: number): number {
  return Math.sqrt((2 * rho) / (2 * Math.PI * Math.max(freqHz, 1) * MU0));
}

/** AC resistance with first-order skin-effect correction.
 *  δ = √(2ρ / ωµ0);  for d ≫ δ:  R_AC/R_DC ≈ d/(4δ) + 0.25  (round wire). */
export function wireResistanceAC(
  rho: number,
  lengthM: number,
  wireDiameterM: number,
  freqHz: number
): number {
  const area = Math.PI * (wireDiameterM / 2) ** 2;
  const Rdc = (rho * lengthM) / area;
  if (freqHz <= 0) return Rdc;
  const delta = skinDepth(rho, freqHz);
  const factor = Math.max(1, wireDiameterM / (4 * delta) + 0.25);
  return Rdc * factor;
}

/** Solid wire vs hollow tubing. At RF the current crowds into one skin depth
 *  at the outer surface, so a tube with wall ≥ δ has the same AC resistance
 *  as solid stock — the inside is dead metal. Only a wall thinner than δ
 *  raises R (it is then DC-area limited). */
export function conductorResistanceAC(
  rho: number,
  lengthM: number,
  diameterM: number,
  freqHz: number,
  style: ConductorStyle,
  tubeWallM: number
): number {
  const Rsolid = wireResistanceAC(rho, lengthM, diameterM, freqHz);
  if (style === "wire") return Rsolid;
  const r = diameterM / 2;
  const w = Math.min(Math.max(tubeWallM, 1e-5), r);
  const annulus = Math.PI * (r ** 2 - (r - w) ** 2);
  const RdcTube = (rho * lengthM) / annulus;
  return Math.max(Rsolid, RdcTube);
}

/** Discharge-length estimates, both very rough (±50%):
 *  - single-shot streamer from one bang's peak topload voltage, using the
 *    coiler rule of thumb ~7 kV/cm of streamer growth for an isolated bang;
 *  - John Freau's repetitive-bang formula L[in] = 1.7 √P[W] (≈ 4.32 √P in cm),
 *    which describes hot, repeatedly re-struck channels at full supply power.
 */
export function sparkEstimates(peakVsV: number, powerW: number) {
  return {
    singleCm: peakVsV / 7_000,
    freauCm: 4.32 * Math.sqrt(Math.max(powerW, 0)),
  };
}

export function computeDerived(p: Params): Derived {
  const s = p.secondary;
  const Ls = solenoidInductance(s.radius, s.height, s.turns);

  const Cself = medhurstSelfCapacitance(s.radius, s.height);
  const Ctop =
    p.topload.shape === "toroid"
      ? toroidCapacitance(p.topload.majorDiameter, p.topload.minorDiameter)
      : sphereCapacitance(p.topload.sphereDiameter);
  const Cs = Cself + Ctop;

  const pr = p.primary;
  const Lp =
    pr.type === "spiral"
      ? spiralInductance(pr.innerRadius, pr.pitch, pr.turns)
      : pr.type === "helix"
        ? solenoidInductance(pr.innerRadius, pr.pitch * pr.turns, pr.turns)
        : coneInductance(pr.innerRadius, pr.pitch, pr.turns, pr.coneAngle);

  const fSecondary = 1 / (2 * Math.PI * Math.sqrt(Ls * Cs));
  const fPrimary = 1 / (2 * Math.PI * Math.sqrt(Lp * p.drive.tankCapacitance));

  const wireLength = s.turns * 2 * Math.PI * s.radius;
  const Rs = wireResistanceAC(RESISTIVITY[s.material], wireLength, s.wireDiameter, fSecondary);

  const radialExtent =
    pr.type === "helix"
      ? 0
      : pr.pitch * pr.turns * (pr.type === "cone" ? Math.cos((pr.coneAngle * Math.PI) / 180) : 1);
  const primLen = pr.turns * 2 * Math.PI * (pr.innerRadius + radialExtent / 2);
  const Rp =
    p.drive.gapResistance +
    conductorResistanceAC(
      RESISTIVITY[pr.material],
      primLen,
      pr.conductorDiameter,
      fPrimary,
      pr.conductorStyle,
      pr.tubeWall
    );

  // Coupling from the real geometry. Clamped just shy of the model's k → 1
  // singularity; real coils sit nowhere near it.
  const Mgeo = mutualInductance(p);
  const k = Math.min(Mgeo / Math.sqrt(Lp * Ls), 0.55);
  const M = k * Math.sqrt(Lp * Ls);

  const supplyPower = p.drive.supplyVoltage * p.drive.supplyCurrent;
  const bangEnergy = 0.5 * p.drive.tankCapacitance * p.drive.firingVoltage ** 2;
  const maxBps = bangEnergy > 0 ? supplyPower / bangEnergy : 0;

  return {
    Lp, Ls, Cs,
    CselfPF: Cself * 1e12,
    CtopPF: Ctop * 1e12,
    Rp, Rs, M, k, fPrimary, fSecondary, wireLength,
    toploadMassKg: toploadMass(p.topload),
    supplyPower,
    maxBps,
  };
}

/* ---------- formatting helpers ---------- */
export const fmt = {
  si(v: number, unit: string, digits = 3): string {
    if (!isFinite(v)) return "—";
    const abs = Math.abs(v);
    const table: [number, string][] = [
      [1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""],
      [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"],
    ];
    for (const [scale, prefix] of table) {
      if (abs >= scale || scale === 1e-12) {
        return `${(v / scale).toPrecision(digits)} ${prefix}${unit}`;
      }
    }
    return `${v} ${unit}`;
  },
  cm(v: number): string {
    return v >= 100 ? `${(v / 100).toFixed(2)} m` : `${v.toFixed(0)} cm`;
  },
};
