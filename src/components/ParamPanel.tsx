import { useStore } from "../store";
import { computeDerived, fmt } from "../physics/formulas";
import type { Material, Params } from "../types";

const MATERIALS: Material[] = ["copper", "aluminum", "silver"];

function Num({
  label, value, onChange, step = 1, min, max, scale = 1, unit,
}: {
  label: string; value: number; onChange: (v: number) => void;
  step?: number; min?: number; max?: number; scale?: number; unit?: string;
}) {
  return (
    <div className="field">
      <label>
        {label}
        {unit && <span className="mono" style={{ opacity: 0.6 }}> [{unit}]</span>}
      </label>
      <input
        type="number"
        value={+(value * scale).toPrecision(6)}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (isFinite(v)) onChange(v / scale);
        }}
      />
    </div>
  );
}

function MaterialSelect({ value, onChange }: { value: Material; onChange: (m: Material) => void }) {
  return (
    <div className="field">
      <label>Material</label>
      <select value={value} onChange={(e) => onChange(e.target.value as Material)}>
        {MATERIALS.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open className="border-b" style={{ borderColor: "var(--line)" }}>
      <summary
        className="section-title cursor-pointer select-none py-2.5 px-1 list-none"
        style={{ color: "var(--copper)" }}
      >
        {title}
      </summary>
      <div className="pb-3 px-1">{children}</div>
    </details>
  );
}

export default function ParamPanel() {
  const params = useStore((s) => s.params);
  const setParam = useStore((s) => s.setParam);
  const reset = useStore((s) => s.reset);
  const open = useStore((s) => s.leftOpen);
  const toggle = useStore((s) => s.toggleLeft);
  const d = computeDerived(params);

  const set = <K extends keyof Params>(g: K) => (patch: Partial<Params[K]>) => setParam(g, patch);
  const s = set("secondary"), t = set("topload"), pr = set("primary"), dr = set("drive");

  return (
    <aside
      className="panel relative flex flex-col transition-[width] duration-200 shrink-0"
      style={{ width: open ? 296 : 36, borderTop: "none", borderBottom: "none", borderLeft: "none" }}
    >
      <button
        className="btn btn-ghost absolute top-2 right-1.5 z-10 !px-2 !py-1 mono"
        onClick={toggle}
        title={open ? "Collapse parameters" : "Expand parameters"}
      >
        {open ? "⟨" : "⟩"}
      </button>

      {open ? (
        <div className="overflow-y-auto px-3 pt-3 pb-6 grow">
          <h2 className="text-[15px] font-bold tracking-wide mb-1" style={{ fontStretch: "112%" }}>
            Parameters
          </h2>

          <Section title="Secondary coil">
            <Num label="Turns N" value={params.secondary.turns} onChange={(v) => s({ turns: Math.round(v) })} min={50} />
            <Num label="Winding height" unit="cm" scale={100} step={1} value={params.secondary.height} onChange={(v) => s({ height: v })} min={5} />
            <Num label="Form radius" unit="cm" scale={100} step={0.5} value={params.secondary.radius} onChange={(v) => s({ radius: v })} min={1} />
            <Num label="Wire Ø" unit="mm" scale={1000} step={0.05} value={params.secondary.wireDiameter} onChange={(v) => s({ wireDiameter: v })} min={0.05} />
            <MaterialSelect value={params.secondary.material} onChange={(m) => s({ material: m })} />
          </Section>

          <Section title="Topload">
            <div className="field">
              <label>Shape</label>
              <select value={params.topload.shape} onChange={(e) => t({ shape: e.target.value as any })}>
                <option value="toroid">toroid</option>
                <option value="sphere">sphere</option>
              </select>
            </div>
            {params.topload.shape === "toroid" ? (
              <>
                <Num label="Major Ø d₁" unit="cm" scale={100} value={params.topload.majorDiameter} onChange={(v) => t({ majorDiameter: v })} min={5} />
                <Num label="Minor Ø d₂" unit="cm" scale={100} value={params.topload.minorDiameter} onChange={(v) => t({ minorDiameter: v })} min={1} />
              </>
            ) : (
              <Num label="Sphere Ø" unit="cm" scale={100} value={params.topload.sphereDiameter} onChange={(v) => t({ sphereDiameter: v })} min={2} />
            )}
            <MaterialSelect value={params.topload.material} onChange={(m) => t({ material: m })} />
          </Section>

          <Section title="Primary coil">
            <div className="field">
              <label>Geometry</label>
              <select value={params.primary.type} onChange={(e) => pr({ type: e.target.value as any })}>
                <option value="spiral">flat spiral</option>
                <option value="helix">helical</option>
              </select>
            </div>
            <Num label="Turns" value={params.primary.turns} onChange={(v) => pr({ turns: Math.round(v) })} min={2} />
            <Num label="Inner radius" unit="cm" scale={100} value={params.primary.innerRadius} onChange={(v) => pr({ innerRadius: v })} min={2} />
            <Num label="Pitch" unit="mm" scale={1000} value={params.primary.pitch} onChange={(v) => pr({ pitch: v })} min={1} />
            <Num label="Conductor Ø" unit="mm" scale={1000} value={params.primary.conductorDiameter} onChange={(v) => pr({ conductorDiameter: v })} min={1} />
            <MaterialSelect value={params.primary.material} onChange={(m) => pr({ material: m })} />
          </Section>

          <Section title="Drive · tank circuit">
            <Num label="Firing voltage" unit="kV" scale={1e-3} step={0.5} value={params.drive.firingVoltage} onChange={(v) => dr({ firingVoltage: v })} min={1} />
            <Num label="Tank capacitance" unit="nF" scale={1e9} step={0.5} value={params.drive.tankCapacitance} onChange={(v) => dr({ tankCapacitance: v })} min={0.5} />
            <Num label="Coupling k" step={0.01} value={params.drive.coupling} onChange={(v) => dr({ coupling: Math.min(Math.max(v, 0.01), 0.6) })} />
            <Num label="Gap resistance" unit="Ω" step={0.1} value={params.drive.gapResistance} onChange={(v) => dr({ gapResistance: v })} min={0} />
            <Num label="Sim duration" unit="µs" scale={1e6} step={10} value={params.drive.duration} onChange={(v) => dr({ duration: v })} min={10} />
          </Section>

          <div className="mt-3 p-2.5 rounded-lg" style={{ background: "var(--panel-2)" }}>
            <div className="section-title mb-1.5">Derived</div>
            <table className="mono text-[11.5px] w-full" style={{ color: "var(--muted)" }}>
              <tbody>
                {[
                  ["L primary", fmt.si(d.Lp, "H")],
                  ["L secondary", fmt.si(d.Ls, "H")],
                  ["C topload", fmt.si(d.CtopPF * 1e-12, "F")],
                  ["C self (Medhurst)", fmt.si(d.CselfPF * 1e-12, "F")],
                  ["f primary", fmt.si(d.fPrimary, "Hz")],
                  ["f secondary", fmt.si(d.fSecondary, "Hz")],
                  ["R sec (AC)", fmt.si(d.Rs, "Ω")],
                  ["Mutual M", fmt.si(d.M, "H")],
                ].map(([k, v]) => (
                  <tr key={k as string}>
                    <td className="py-0.5 pr-2">{k}</td>
                    <td className="text-right" style={{ color: "var(--text)" }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div
              className="mt-1.5 text-[11px]"
              style={{ color: Math.abs(d.fPrimary / d.fSecondary - 1) < 0.05 ? "var(--arc)" : "var(--warn)" }}
            >
              {Math.abs(d.fPrimary / d.fSecondary - 1) < 0.05
                ? "✓ resonators tuned"
                : `detuned: f₁/f₂ = ${(d.fPrimary / d.fSecondary).toFixed(2)}`}
            </div>
          </div>

          <button className="btn btn-ghost w-full mt-3" onClick={reset}>
            Reset to defaults
          </button>
        </div>
      ) : (
        <div
          className="section-title mt-12"
          style={{ writingMode: "vertical-rl", marginLeft: 10, color: "var(--copper)" }}
        >
          Parameters
        </div>
      )}
    </aside>
  );
}
