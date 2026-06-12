export type Material = "copper" | "aluminum" | "silver";
export type ToploadShape = "toroid" | "sphere";
export type PrimaryType = "spiral" | "helix";
export type ComponentId = "primary" | "secondary" | "topload";
export type ViewMode = "3d" | "system";

export interface Params {
  secondary: {
    turns: number; // N
    height: number; // m (winding length)
    radius: number; // m (coil form radius)
    wireDiameter: number; // m
    material: Material;
  };
  topload: {
    shape: ToploadShape;
    majorDiameter: number; // m, toroid outer diameter d1
    minorDiameter: number; // m, toroid tube diameter d2
    sphereDiameter: number; // m
    material: Material;
  };
  primary: {
    type: PrimaryType;
    turns: number;
    innerRadius: number; // m
    pitch: number; // m, radial pitch (spiral) or vertical pitch (helix)
    conductorDiameter: number; // m
    material: Material;
  };
  drive: {
    firingVoltage: number; // V on tank cap at gap breakdown
    tankCapacitance: number; // F
    coupling: number; // k, 0..~0.3
    gapResistance: number; // ohm, spark gap arc + leads
    duration: number; // s, simulated time after the bang
  };
}

export interface Derived {
  Lp: number; // H
  Ls: number; // H
  Cs: number; // F (self + topload)
  CselfPF: number;
  CtopPF: number;
  Rp: number; // ohm
  Rs: number; // ohm (AC, skin-corrected)
  M: number; // H
  fPrimary: number; // Hz
  fSecondary: number; // Hz
  wireLength: number; // m
}

export interface SimResult {
  t: number[]; // s
  Ip: number[]; // A, primary loop current
  Is: number[]; // A, secondary current
  Vp: number[]; // V, tank capacitor voltage
  Vs: number[]; // V, topload (secondary capacitance) voltage
  peakVs: number;
  peakIp: number;
  steps: number;
}
