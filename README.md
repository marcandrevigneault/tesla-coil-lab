# Tesla Coil Lab

Interactive workbench for a spark-gap Tesla coil (SGTC): a 3D model you can orbit,
hover and edit component-by-component, a clean schematic **system view**, and a
**lumped dual-resonator simulation** of a single spark-gap firing with voltage and
current traces across every element.

**Stack:** Vite · React 18 · TypeScript · three.js via @react-three/fiber + drei ·
zustand · recharts · Tailwind CSS.

## Run

```bash
npm install
npm run dev
```

## Publish to GitHub (one-time)

The repo is already initialized with a first commit. With the [GitHub CLI](https://cli.github.com):

```bash
gh repo create tesla-coil-lab --public --source=. --push
```

or manually: create an empty repo on github.com, then

```bash
git remote add origin git@github.com:<you>/tesla-coil-lab.git
git push -u origin main
```

## UI

| Region | Purpose |
| --- | --- |
| Left panel (collapsible) | All geometric and electrical parameters, grouped; live derived values (L, C, f, R, M) and a tuning indicator |
| Center | Draggable 3D view (orbit/zoom). Hover highlights a component; click selects it and opens a card to change shape (toroid/sphere, spiral/helix) and material |
| Top right | Switch between **3D view** and **System view** (live annotated schematic) |
| Bottom bar (collapsible) | Run a single-bang simulation; oscilloscope-style traces of tank/topload voltages and primary/secondary currents |

## Physics model

### Geometry → lumped elements (`src/physics/formulas.ts`)

- **Secondary inductance** — Wheeler (1928), single-layer solenoid, ~1% accurate
  for the aspect ratios used here:
  `L[µH] = r²N² / (9r + 10ℓ)` (inches).
- **Primary inductance** — Wheeler flat-spiral form `L[µH] = a²N² / (8a + 11w)`
  with `a` the mean radius and `w` the radial winding depth; helical primaries
  reuse the solenoid form.
- **Secondary self-capacitance** — Medhurst (1947) empirical fit:
  `C[pF] = D_cm (0.1126 ℓ/D + 0.08 + 0.27 √(D/ℓ))`.
- **Topload** — isolated sphere `C = 4πε₀R` (exact), or the standard empirical
  toroid fit `C[pF] = 2.8 (1.2781 − d₂/d₁) √(π(d₁−d₂)d₂/4)` (inches, ±5%).
- **Resistances** — DC resistance from ρℓ/A with a first-order skin-effect
  correction: skin depth `δ = √(2ρ/ωµ₀)` and, for wire diameter d ≫ δ,
  `R_AC/R_DC ≈ d/(4δ) + ¼`.

### Dynamics (`src/physics/simulate.ts`)

After the gap fires, the system is two magnetically coupled series RLC loops.
With capacitor voltages `Vp, Vs`, loop currents `Ip, Is`, and `M = k√(LpLs)`:

```
Lp İp + M İs = Vp − Rp Ip        V̇p = −Ip/Cp
M  İp + Ls İs = −Vs − Rs Is       V̇s =  Is/Cs
```

The 2×2 inductance matrix is inverted analytically (det = LpLs(1−k²) > 0) and
the 4-state system is integrated with classical RK4, with the time step chosen
to resolve the *upper* normal mode.

For the lossless, tuned case (1/LpCp = 1/LsCs = ω₀²) the normal modes are

```
ω± = ω₀ / √(1 ∓ k)
```

so the traces show fast oscillation under a beat envelope at (ω₊−ω₋)/2 — the
energy sloshing between resonators. Energy conservation bounds the output:

```
½ Cs V̂s² ≤ ½ Cp V₀²   ⇒   V̂s ≤ V₀ √(Cp/Cs)
```

which you can verify directly against the reported peak topload voltage
(losses and detuning keep it below the bound).

### Deliberate simplifications

- Single bang, gap conducting throughout (no quench/re-ignition model, no
  streamer loading — streamers add a nonlinear, lossy capacitance).
- Lumped model: valid while the secondary is electrically short; near ¼-wave
  behavior a transmission-line model would refine the voltage profile.
- `k` is a free parameter rather than computed from the Neumann double integral
  of the two windings — a good candidate for a future numerical addition.

## Safety

This is a simulator. Real spark-gap Tesla coils involve lethal voltages and
currents at the tank circuit; do not treat these numbers as engineering
clearance for physical construction.
