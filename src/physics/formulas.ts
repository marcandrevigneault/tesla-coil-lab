import type { Derived, Material, Params } from "../types";

/**
 * Geometry -> lumped element values.
 *
 * Inductances: Wheeler's empirical formulas (1928), accurate to ~1% for the
 * geometries Tesla coils actually use. Original forms are in inches and µH.
 *
 *   Single-layer solenoid:  L[µH] = r² N² / (9 r + 10 l)          (r = radius, l = length, inches)
 *   Flat (Archimedean) spiral: L[µH] = a² N² / (8 a + 11 w)       (a = mean radius, w = winding depth)
 *
 * Secondary self-capacitance: Medhurst (1947):
 *   C[pF] = D_cm · ( 0.1126 l/D + 0.08 + 0.27 √(D/l) )
 *
 * Toroid free-space capacitance: standard coiler empirical fit (Bert Pool),
 * dimensions in inches, ±~5%:
 *   C[pF] = 2.8 (1.2781 − d2/d1) √( π (d1 − d2) d2 / 4 )
 *
 * Sphere: exact isolated-sphere result C = 4πε0 R.
 */

const M_TO_IN = 39.3700787;
const EPS0 = 8.8541878128e-12;
const MU0 = 4 * Math.PI * 1e-7;

export const RESISTIVITY: Record<Material, number> = {
  silver: 1.59e-8,
  copper: 1.68e-8,
  aluminum: 2.65e-8,
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
  const delta = Math.sqrt((2 * rho) / (2 * Math.PI * freqHz * MU0));
  const factor = Math.max(1, wireDiameterM / (4 * delta) + 0.25);
  return Rdc * factor;
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

  const Lp =
    p.primary.type === "spiral"
      ? spiralInductance(p.primary.innerRadius, p.primary.pitch, p.primary.turns)
      : solenoidInductance(p.primary.innerRadius, p.primary.pitch * p.primary.turns, p.primary.turns);

  const fSecondary = 1 / (2 * Math.PI * Math.sqrt(Ls * Cs));
  const fPrimary = 1 / (2 * Math.PI * Math.sqrt(Lp * p.drive.tankCapacitance));

  const wireLength = s.turns * 2 * Math.PI * s.radius;
  const Rs = wireResistanceAC(RESISTIVITY[s.material], wireLength, s.wireDiameter, fSecondary);

  const primLen =
    p.primary.turns * 2 * Math.PI * (p.primary.innerRadius + (p.primary.pitch * p.primary.turns) / 2);
  const Rp =
    p.drive.gapResistance +
    wireResistanceAC(RESISTIVITY[p.primary.material], primLen, p.primary.conductorDiameter, fPrimary);

  const M = p.drive.coupling * Math.sqrt(Lp * Ls);

  return { Lp, Ls, Cs, CselfPF: Cself * 1e12, CtopPF: Ctop * 1e12, Rp, Rs, M, fPrimary, fSecondary, wireLength };
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
};
