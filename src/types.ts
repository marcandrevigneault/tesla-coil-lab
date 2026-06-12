export type Material = "copper" | "aluminum" | "silver";
export type ToploadShape = "toroid" | "sphere";
export type Construction = "solid" | "hollow";
export type ConductorStyle = "wire" | "tube";
export type PrimaryType = "spiral" | "helix" | "cone";
export type Topology = "spark-gap" | "solid-state";
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
    construction: Construction; // hollow: same C (charge sits on the outer surface), much lighter
    wallThickness: number; // m, shell wall when hollow
    majorDiameter: number; // m, toroid outer diameter d1
    minorDiameter: number; // m, toroid tube diameter d2
    sphereDiameter: number; // m
    material: Material;
  };
  primary: {
    type: PrimaryType;
    turns: number;
    innerRadius: number; // m
    pitch: number; // m, turn-to-turn spacing (radial for spiral, axial for helix, along the slope for cone)
    coneAngle: number; // degrees from horizontal, used when type === "cone"
    conductorDiameter: number; // m
    conductorStyle: ConductorStyle; // tube = hollow copper tubing
    tubeWall: number; // m, tube wall thickness when style === "tube"
    material: Material;
  };
  drive: {
    topology: Topology;
    supplyVoltage: number; // V, HV charging supply (spark-gap) — also caps firing voltage
    supplyCurrent: number; // A, supply current rating
    // spark-gap mode
    firingVoltage: number; // V on tank cap at gap breakdown
    gapResistance: number; // ohm, spark gap arc + leads (loop R in solid-state mode)
    duration: number; // s, simulated time after the bang
    // solid-state mode
    busVoltage: number; // V, H-bridge DC bus
    onTime: number; // s, interrupter on-time per burst
    interrupterHz: number; // Hz, burst repetition rate == musical pitch
    // shared
    tankCapacitance: number; // F
    coupling: number; // k, 0..~0.3
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
  toploadMassKg: number;
  supplyPower: number; // W
  maxBps: number; // bangs/s the supply can sustain (spark-gap)
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

export interface SimQuality {
  ptsPerPeriod?: number; // default 300
  maxSteps?: number;
  durationOverride?: number; // s
}

export interface OptInfo {
  iter: number;
  total: number;
  bestVs: number; // V, best peak topload voltage found
  startVs: number;
  improved: number; // count of accepted improvements
  varCount: number;
}
