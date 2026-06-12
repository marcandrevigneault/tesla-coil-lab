/** Per-component guidance on squeezing out transfer efficiency (η in the sim bar). */
export const TIPS: Record<string, string[]> = {
  secondary: [
    "Keep the winding height ≈ 4–5× the coil diameter — taller adds inductance and voltage gain, but also AC resistance.",
    "Thicker wire cuts Rs, the secondary's main loss. Gains taper off once the wire Ø passes ~2 skin depths.",
    "More turns raise the step-up but lower f₂ — retune the primary after any change (watch the tuned ✓).",
    "η in the sim bar = the share of bang energy that actually arrived on the topload.",
  ],
  topload: [
    "Peak voltage scales as √(Cp/Cs): a smaller topload rings up higher, but breaks out early and sprays corona.",
    "Pick the smallest toroid that stops breakout from the top turns — major Ø ≈ 3–4× the secondary Ø is the classic ratio.",
    "Smooth, large-radius surfaces waste less energy in corona. Hollow costs nothing electrically — charge lives on the skin.",
    "Resizing the topload moves f₂, so retune the primary afterwards.",
  ],
  primary: [
    "Tuning beats everything: f₁ = f₂ (green ✓ in Derived) is the single biggest efficiency lever.",
    "Fat conductor or copper tubing cuts primary resistance — after the spark gap, it's where most energy dies.",
    "Coupling k is computed from the real geometry here: raise the base height or steepen the cone angle to hug more of the secondary's flux and k climbs.",
    "k ≈ 0.1–0.2 is the sweet spot — energy crosses in fewer lossy beats. Push past ~0.3 and a real coil answers with racing sparks.",
  ],
  drive: [
    "The spark gap is loss #1 — keep gap resistance low, leads short, and quench fast (the first energy notch is the time to open).",
    "Energy per bang is ½CpV². Supply power caps your bangs/s, so a bigger Cp means fewer but harder bangs.",
    "The tank cap can only charge to the supply voltage — firing voltage above it is fiction.",
    "Solid-state: longer on-time rings the secondary higher until losses saturate; the bridge already tracks f₂, so tuning stays automatic.",
  ],
};
