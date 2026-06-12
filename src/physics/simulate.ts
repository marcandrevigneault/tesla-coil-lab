import type { Derived, Params, SimResult } from "../types";

/**
 * Lumped dual-resonator model of a single "bang" (one spark-gap firing).
 *
 * Primary loop:  tank capacitor Cp (charged to V0) discharges through the
 * closed spark gap into Lp with series resistance Rp.
 * Secondary:     Ls in series with Rs, terminated by the total top
 * capacitance Cs (Medhurst self-C + topload). Mutual inductance M = k√(LpLs).
 *
 * Kirchhoff, with Vp/Vs the capacitor voltages and Ip/Is the loop currents:
 *
 *   Lp İp + M İs = Vp − Rp Ip            V̇p = −Ip / Cp
 *   M  İp + Ls İs = −Vs − Rs Is          V̇s =  Is / Cs
 *
 * The 2×2 inductance matrix is inverted analytically
 * (det = Lp Ls − M² = Lp Ls (1 − k²) > 0 for k < 1) and the 4-state system
 * y = [Ip, Is, Vp, Vs] is integrated with classical RK4.
 *
 * The undamped, tuned (ω0² = 1/LpCp = 1/LsCs) system has the well-known pair
 * of normal modes ω± = ω0 / √(1 ∓ k): energy beats between the resonators at
 * the difference frequency, which is what you see as the envelope in the
 * traces. Peak secondary voltage is bounded by energy conservation:
 * ½ Cs Vs² ≤ ½ Cp V0²  ⇒  Vs,max ≤ V0 √(Cp/Cs).
 */
export function simulateBang(p: Params, d: Derived): SimResult {
  const { Lp, Ls, Cs, Rp, Rs, M } = d;
  const Cp = p.drive.tankCapacitance;
  const V0 = p.drive.firingVoltage;

  const det = Lp * Ls - M * M;
  // Inverse of [[Lp, M], [M, Ls]]
  const iA = Ls / det, iB = -M / det, iD = Lp / det;

  const deriv = (y: Float64Array, dy: Float64Array) => {
    const [Ip, Is, Vp, Vs] = y;
    const ep = Vp - Rp * Ip; // primary loop EMF
    const es = -Vs - Rs * Is; // secondary loop EMF
    dy[0] = iA * ep + iB * es; // İp
    dy[1] = iB * ep + iD * es; // İs
    dy[2] = -Ip / Cp; // V̇p
    dy[3] = Is / Cs; // V̇s
  };

  // Time step: resolve the faster normal mode ω+ = ω0/√(1−k) with ≥ ~300 pts/period.
  const fMax = Math.max(d.fPrimary, d.fSecondary) / Math.sqrt(1 - p.drive.coupling);
  const dt = 1 / (fMax * 300);
  const steps = Math.min(Math.ceil(p.drive.duration / dt), 400_000);

  const y = new Float64Array([0, 0, V0, 0]);
  const k1 = new Float64Array(4), k2 = new Float64Array(4),
        k3 = new Float64Array(4), k4 = new Float64Array(4),
        tmp = new Float64Array(4);

  const outN = 2000;
  const every = Math.max(1, Math.floor(steps / outN));
  const t: number[] = [], Ip: number[] = [], Is: number[] = [], Vp: number[] = [], Vs: number[] = [];
  let peakVs = 0, peakIp = 0;

  for (let i = 0; i < steps; i++) {
    if (i % every === 0) {
      t.push(i * dt);
      Ip.push(y[0]); Is.push(y[1]); Vp.push(y[2]); Vs.push(y[3]);
    }
    peakVs = Math.max(peakVs, Math.abs(y[3]));
    peakIp = Math.max(peakIp, Math.abs(y[0]));

    deriv(y, k1);
    for (let j = 0; j < 4; j++) tmp[j] = y[j] + 0.5 * dt * k1[j];
    deriv(tmp, k2);
    for (let j = 0; j < 4; j++) tmp[j] = y[j] + 0.5 * dt * k2[j];
    deriv(tmp, k3);
    for (let j = 0; j < 4; j++) tmp[j] = y[j] + dt * k3[j];
    deriv(tmp, k4);
    for (let j = 0; j < 4; j++) y[j] += (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]);
  }

  return { t, Ip, Is, Vp, Vs, peakVs, peakIp, steps };
}
