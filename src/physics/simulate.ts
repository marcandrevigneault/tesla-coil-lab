import type { Derived, Params, SimQuality, SimResult } from "../types";

/**
 * Lumped dual-resonator model.
 *
 * Spark-gap mode — a single "bang": tank capacitor Cp (charged to V0)
 * discharges through the closed gap into Lp with series resistance Rp.
 *
 * Solid-state (DRSSTC) mode — an H-bridge drives the series Cp–Lp primary
 * with a square wave at the secondary's resonant frequency for `onTime`
 * (one interrupter burst), then the system rings down. Two interrupter
 * periods are simulated so the burst envelope and repetition are visible.
 *
 * Both share the coupled equations (Vp = tank/series cap voltage):
 *
 *   Lp İp + M İs = e_p            V̇p = ±Ip / Cp
 *   M  İp + Ls İs = −Vs − Rs Is   V̇s =  Is / Cs
 *
 * spark:        e_p = Vp − Rp Ip          (cap is the source)
 * solid-state:  e_p = V_drive − Vp − Rp Ip (cap in series with the bridge)
 *
 * The 2×2 inductance matrix is inverted analytically
 * (det = Lp Ls − M² = Lp Ls (1 − k²) > 0 for k < 1) and the 4-state system
 * y = [Ip, Is, Vp, Vs] is integrated with classical RK4.
 *
 * Peak secondary voltage in spark mode is bounded by energy conservation:
 * ½ Cs Vs² ≤ ½ Cp V0²  ⇒  Vs,max ≤ V0 √(Cp/Cs). In solid-state mode it
 * instead builds over the burst, limited by losses and on-time.
 */

interface Drive {
  duration: number;
  v0: number; // initial tank voltage
  vDrive: (t: number) => number; // external EMF (0 for spark mode)
  seriesCap: boolean;
}

function integrate(p: Params, d: Derived, drive: Drive, q: SimQuality): SimResult {
  const { Lp, Ls, Cs, Rp, Rs, M } = d;
  const Cp = p.drive.tankCapacitance;

  const det = Lp * Ls - M * M;
  // Inverse of [[Lp, M], [M, Ls]]
  const iA = Ls / det, iB = -M / det, iD = Lp / det;
  const { vDrive, seriesCap } = drive;

  const deriv = (tNow: number, y: Float64Array, dy: Float64Array) => {
    const [Ip, Is, Vp, Vs] = y;
    const ep = seriesCap ? vDrive(tNow) - Vp - Rp * Ip : Vp - Rp * Ip;
    const es = -Vs - Rs * Is;
    dy[0] = iA * ep + iB * es; // İp
    dy[1] = iB * ep + iD * es; // İs
    dy[2] = (seriesCap ? Ip : -Ip) / Cp; // V̇p
    dy[3] = Is / Cs; // V̇s
  };

  // Time step: resolve the faster normal mode ω+ = ω0/√(1−k).
  const pts = q.ptsPerPeriod ?? 300;
  const fMax = Math.max(d.fPrimary, d.fSecondary) / Math.sqrt(1 - Math.min(d.k, 0.95));
  const dt = 1 / (fMax * pts);
  const steps = Math.min(Math.ceil(drive.duration / dt), q.maxSteps ?? 400_000);

  const y = new Float64Array([0, 0, drive.v0, 0]);
  const k1 = new Float64Array(4), k2 = new Float64Array(4),
        k3 = new Float64Array(4), k4 = new Float64Array(4),
        tmp = new Float64Array(4);

  const outN = 2400;
  const every = Math.max(1, Math.floor(steps / outN));
  const t: number[] = [], Ip: number[] = [], Is: number[] = [], Vp: number[] = [], Vs: number[] = [];
  let peakVs = 0, peakIp = 0;

  for (let i = 0; i < steps; i++) {
    const tNow = i * dt;
    if (i % every === 0) {
      t.push(tNow);
      Ip.push(y[0]); Is.push(y[1]); Vp.push(y[2]); Vs.push(y[3]);
    }
    peakVs = Math.max(peakVs, Math.abs(y[3]));
    peakIp = Math.max(peakIp, Math.abs(y[0]));

    deriv(tNow, y, k1);
    for (let j = 0; j < 4; j++) tmp[j] = y[j] + 0.5 * dt * k1[j];
    deriv(tNow + dt / 2, tmp, k2);
    for (let j = 0; j < 4; j++) tmp[j] = y[j] + 0.5 * dt * k2[j];
    deriv(tNow + dt / 2, tmp, k3);
    for (let j = 0; j < 4; j++) tmp[j] = y[j] + dt * k3[j];
    deriv(tNow + dt, tmp, k4);
    for (let j = 0; j < 4; j++) y[j] += (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]);
  }

  return { t, Ip, Is, Vp, Vs, peakVs, peakIp, steps };
}

export function simulateBang(p: Params, d: Derived, q: SimQuality = {}): SimResult {
  return integrate(
    p,
    d,
    {
      duration: q.durationOverride ?? p.drive.duration,
      v0: p.drive.firingVoltage,
      vDrive: () => 0,
      seriesCap: false,
    },
    q
  );
}

export function simulateSolidState(p: Params, d: Derived, q: SimQuality = {}): SimResult {
  const { busVoltage, interrupterHz } = p.drive;
  const period = 1 / Math.max(interrupterHz, 1);
  // On-time can't exceed roughly half the interrupter period.
  const onTime = Math.min(p.drive.onTime, 0.45 * period);
  // Drive at the secondary's resonance — what a real DRSSTC feedback loop locks to.
  const fDrive = d.fSecondary;
  const vDrive = (t: number) => {
    const tIn = t % period;
    if (tIn >= onTime) return 0;
    return Math.sin(2 * Math.PI * fDrive * tIn) >= 0 ? busVoltage : -busVoltage;
  };
  const duration = q.durationOverride ?? Math.min(2 * period, 0.009);
  return integrate(
    p,
    d,
    { duration, v0: 0, vDrive, seriesCap: true },
    { ptsPerPeriod: q.ptsPerPeriod ?? 200, maxSteps: q.maxSteps ?? 700_000 }
  );
}

export function simulate(p: Params, d: Derived, q: SimQuality = {}): SimResult {
  return p.drive.topology === "solid-state"
    ? simulateSolidState(p, d, q)
    : simulateBang(p, d, q);
}
