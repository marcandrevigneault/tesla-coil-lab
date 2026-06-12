import { useState } from "react";
import { useStore } from "../store";
import { computeDerived, fmt, skinDepth, RESISTIVITY } from "../physics/formulas";
import { secondaryLadder } from "../physics/ladder";
import { InfoButton, TipBox } from "./InfoTip";
import { TIPS } from "../tips";
import type { Material, Params } from "../types";

const MATERIALS: Material[] = ["copper", "aluminum", "silver"];

function LockIcon({ closed }: { closed: boolean }) {
  return (
    <svg width="11" height="12" viewBox="0 0 11 12" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="1.2" y="5.2" width="8.6" height="6" rx="1.2" />
      {closed ? (
        <path d="M 3 5 V 3.4 a 2.5 2.5 0 0 1 5 0 V 5" />
      ) : (
        <path d="M 3 5 V 3.4 a 2.5 2.5 0 0 1 5 0" transform="translate(2.4 -1.4) rotate(18 5.5 3)" />
      )}
    </svg>
  );
}

/** Per-variable optimizer lock. Locked = the optimizer must not touch it. */
function LockBtn({ k }: { k?: string }) {
  const locked = useStore((s) => (k ? !!s.locks[k] : false));
  const toggleLock = useStore((s) => s.toggleLock);
  if (!k) return <span />;
  return (
    <button
      className={`lock ${locked ? "locked" : ""}`}
      onClick={() => toggleLock(k)}
      title={locked ? "Locked — the optimizer keeps this value" : "Unlocked — the optimizer may change it"}
    >
      <LockIcon closed={locked} />
    </button>
  );
}

function Num({
  label, value, onChange, step = 1, min, max, scale = 1, unit, lockKey,
}: {
  label: string; value: number; onChange: (v: number) => void;
  step?: number; min?: number; max?: number; scale?: number; unit?: string; lockKey?: string;
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
      <LockBtn k={lockKey} />
    </div>
  );
}

function Select<T extends string>({
  label, value, options, onChange,
}: {
  label: string; value: T; options: [T, string][]; onChange: (v: T) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>{text}</option>
        ))}
      </select>
      <span />
    </div>
  );
}

function MaterialSelect({ value, onChange }: { value: Material; onChange: (m: Material) => void }) {
  return <Select label="Material" value={value} options={MATERIALS.map((m) => [m, m] as [Material, string])} onChange={onChange} />;
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] leading-snug my-1 px-1" style={{ color: "var(--muted)" }}>
      {children}
    </p>
  );
}

function Section({ title, tips, children }: { title: string; tips?: string[]; children: React.ReactNode }) {
  const [showTips, setShowTips] = useState(false);
  return (
    <details open className="border-b" style={{ borderColor: "var(--line)" }}>
      <summary
        className="section-title cursor-pointer select-none py-2.5 px-1 list-none flex items-center gap-1.5"
        style={{ color: "var(--copper)" }}
      >
        {title}
        {tips && <InfoButton active={showTips} onClick={() => setShowTips((v) => !v)} />}
      </summary>
      <div className="pb-3 px-1">
        {tips && showTips && <TipBox tips={tips} />}
        {children}
      </div>
    </details>
  );
}

const OBJECTIVE_HINT: Record<string, string> = {
  voltage: "Chases the highest topload voltage — favors small toploads that ring up hard.",
  energy: "Maximizes ½CsV̂² parked on the topload — the best proxy for streamer length.",
  efficiency: "Maximizes the fraction of each bang that reaches the topload, regardless of scale.",
};

function fmtScore(v: number, objective: string): string {
  if (objective === "voltage") return fmt.si(v, "V");
  if (objective === "energy") return fmt.si(v, "J");
  return `${(v * 100).toFixed(0)}%`;
}

function OptimizeBox() {
  const { optimizing, optInfo, startOptimize, stopOptimize, locks, params, optObjective, setOptObjective } = useStore();
  const lockedCount = Object.values(locks).filter(Boolean).length;
  return (
    <div className="mt-3 p-2.5 rounded-lg" style={{ background: "var(--panel-2)" }}>
      <div className="section-title mb-1.5">Optimizer</div>
      <Select label="Goal" value={optObjective}
        options={[["voltage", "peak voltage V̂"], ["energy", "arc energy ½CsV̂²"], ["efficiency", "transfer η"]]}
        onChange={setOptObjective} />
      <Hint>
        {OBJECTIVE_HINT[optObjective]} Anneals every <b>unlocked</b> variable ({lockedCount} locked),
        accepting bad moves while hot so reruns can escape the previous optimum. Firing voltage stays
        capped at the {fmt.si(params.drive.supplyVoltage, "V")} supply.
      </Hint>
      {optimizing ? (
        <>
          <div className="opt-track mt-2">
            <div className="opt-fill" style={{ width: `${optInfo ? (100 * optInfo.iter) / optInfo.total : 0}%` }} />
          </div>
          <div className="mono text-[11px] mt-1.5 flex justify-between" style={{ color: "var(--muted)" }}>
            <span>{optInfo?.iter}/{optInfo?.total}</span>
            <span style={{ color: "var(--corona)" }}>
              best {fmtScore(optInfo?.best ?? 0, optInfo?.objective ?? "voltage")}
            </span>
            <span>+{optInfo?.improved}</span>
          </div>
          <button className="btn w-full mt-2" onClick={stopOptimize}>Stop</button>
        </>
      ) : (
        <>
          <button className="btn btn-run w-full mt-1" onClick={startOptimize}>
            ✦ Optimize unlocked parameters
          </button>
          {optInfo && optInfo.total > 0 && (
            <div className="mono text-[11px] mt-1.5" style={{ color: "var(--muted)" }}>
              done · {fmtScore(optInfo.start, optInfo.objective)} →{" "}
              <span style={{ color: "var(--arc)" }}>{fmtScore(optInfo.best, optInfo.objective)}</span>
              {" "}({optInfo.improved} improvements, {optInfo.varCount} free vars)
            </div>
          )}
          {optInfo && optInfo.varCount === 0 && (
            <div className="mono text-[11px] mt-1.5" style={{ color: "var(--warn)" }}>
              everything is locked — nothing to optimize
            </div>
          )}
        </>
      )}
    </div>
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

  const sparkMode = params.drive.topology === "spark-gap";
  const deltaPrimary = skinDepth(RESISTIVITY[params.primary.material], d.fPrimary);
  const firingTooHigh = sparkMode && params.drive.firingVoltage > params.drive.supplyVoltage;

  return (
    <aside
      className="panel relative flex flex-col transition-[width] duration-200 shrink-0"
      style={{ width: open ? 312 : 36, borderTop: "none", borderBottom: "none", borderLeft: "none" }}
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

          <Section title="Secondary coil" tips={TIPS.secondary}>
            <Num label="Turns N" value={params.secondary.turns} onChange={(v) => s({ turns: Math.round(v) })} min={50} lockKey="secondary.turns" />
            <Num label="Winding height" unit="cm" scale={100} step={1} value={params.secondary.height} onChange={(v) => s({ height: v })} min={5} lockKey="secondary.height" />
            <Num label="Form radius" unit="cm" scale={100} step={0.5} value={params.secondary.radius} onChange={(v) => s({ radius: v })} min={1} lockKey="secondary.radius" />
            <Num label="Wire Ø" unit="mm" scale={1000} step={0.05} value={params.secondary.wireDiameter} onChange={(v) => s({ wireDiameter: v })} min={0.05} lockKey="secondary.wireDiameter" />
            <MaterialSelect value={params.secondary.material} onChange={(m) => s({ material: m })} />
          </Section>

          <Section title="Topload" tips={TIPS.topload}>
            <Select label="Shape" value={params.topload.shape}
              options={[["toroid", "toroid"], ["sphere", "sphere"]]}
              onChange={(shape) => t({ shape })} />
            <Select label="Construction" value={params.topload.construction}
              options={[["hollow", "hollow"], ["solid", "solid"]]}
              onChange={(construction) => t({ construction })} />
            {params.topload.construction === "hollow" && (
              <>
                <Num label="Wall" unit="mm" scale={1000} step={0.2} value={params.topload.wallThickness} onChange={(v) => t({ wallThickness: v })} min={0.1} />
                <Hint>Hollow changes nothing electrically — charge sits on the outer surface — but mass drops to {d.toploadMassKg >= 1 ? `${d.toploadMassKg.toFixed(2)} kg` : `${(d.toploadMassKg * 1000).toFixed(0)} g`}.</Hint>
              </>
            )}
            {params.topload.shape === "toroid" ? (
              <>
                <Num label="Major Ø d₁" unit="cm" scale={100} value={params.topload.majorDiameter} onChange={(v) => t({ majorDiameter: v })} min={5} lockKey="topload.majorDiameter" />
                <Num label="Minor Ø d₂" unit="cm" scale={100} value={params.topload.minorDiameter} onChange={(v) => t({ minorDiameter: v })} min={1} lockKey="topload.minorDiameter" />
              </>
            ) : (
              <Num label="Sphere Ø" unit="cm" scale={100} value={params.topload.sphereDiameter} onChange={(v) => t({ sphereDiameter: v })} min={2} lockKey="topload.sphereDiameter" />
            )}
            <MaterialSelect value={params.topload.material} onChange={(m) => t({ material: m })} />
          </Section>

          <Section title="Primary coil" tips={TIPS.primary}>
            <Select label="Geometry" value={params.primary.type}
              options={[["spiral", "flat spiral"], ["cone", "conical"], ["helix", "helical"]]}
              onChange={(type) => pr({ type })} />
            {params.primary.type === "cone" && (
              <Num label="Cone angle" unit="°" step={1} value={params.primary.coneAngle} onChange={(v) => pr({ coneAngle: Math.min(Math.max(v, 1), 85) })} lockKey="primary.coneAngle" />
            )}
            <Num label="Turns" value={params.primary.turns} onChange={(v) => pr({ turns: Math.round(v) })} min={2} lockKey="primary.turns" />
            <Num label="Inner radius" unit="cm" scale={100} value={params.primary.innerRadius} onChange={(v) => pr({ innerRadius: v })} min={2} lockKey="primary.innerRadius" />
            <Num label="Pitch" unit="mm" scale={1000} value={params.primary.pitch} onChange={(v) => pr({ pitch: v })} min={1} lockKey="primary.pitch" />
            <Num label="Base height" unit="cm" scale={100} step={0.5} value={params.primary.baseHeight} onChange={(v) => pr({ baseHeight: v })} lockKey="primary.baseHeight" />
            <Select label="Conductor" value={params.primary.conductorStyle}
              options={[["tube", "copper tubing (hollow)"], ["wire", "solid wire"]]}
              onChange={(conductorStyle) => pr({ conductorStyle })} />
            <Num label="Conductor Ø" unit="mm" scale={1000} value={params.primary.conductorDiameter} onChange={(v) => pr({ conductorDiameter: v })} min={1} lockKey="primary.conductorDiameter" />
            {params.primary.conductorStyle === "tube" && (
              <>
                <Num label="Tube wall" unit="mm" scale={1000} step={0.1} value={params.primary.tubeWall} onChange={(v) => pr({ tubeWall: v })} min={0.1} />
                <Hint>
                  Skin depth at f₁ is {fmt.si(deltaPrimary, "m")} — current only uses the outer
                  {" "}{fmt.si(deltaPrimary, "m")} shell, so tubing ≈ solid at RF.
                </Hint>
              </>
            )}
            <MaterialSelect value={params.primary.material} onChange={(m) => pr({ material: m })} />
          </Section>

          <Section title="Drive · power" tips={TIPS.drive}>
            <Select label="Topology" value={params.drive.topology}
              options={[["spark-gap", "spark gap (SGTC)"], ["solid-state", "solid-state (DRSSTC)"]]}
              onChange={(topology) => dr({ topology })} />
            <Num label="HV supply" unit="kV" scale={1e-3} step={0.5} value={params.drive.supplyVoltage} onChange={(v) => dr({ supplyVoltage: v })} min={0.5} lockKey="drive.supplyVoltage" />
            <Num label="Supply current" unit="mA" scale={1e3} step={5} value={params.drive.supplyCurrent} onChange={(v) => dr({ supplyCurrent: v })} min={1} lockKey="drive.supplyCurrent" />
            <Hint>{fmt.si(d.supplyPower, "W")} available{sparkMode && isFinite(d.maxBps) ? ` → max ${d.maxBps.toFixed(0)} bangs/s at this tank energy` : ""}.</Hint>

            {sparkMode ? (
              <>
                <Num label="Firing voltage" unit="kV" scale={1e-3} step={0.5} value={params.drive.firingVoltage} onChange={(v) => dr({ firingVoltage: v })} min={1} lockKey="drive.firingVoltage" />
                {firingTooHigh && (
                  <Hint>
                    <span style={{ color: "var(--warn)" }}>
                      ⚠ firing voltage exceeds the supply — the cap can only charge to {fmt.si(params.drive.supplyVoltage, "V")}.
                    </span>
                  </Hint>
                )}
                <Num label="Gap resistance" unit="Ω" step={0.1} value={params.drive.gapResistance} onChange={(v) => dr({ gapResistance: v })} min={0} />
                <Num label="Sim duration" unit="µs" scale={1e6} step={10} value={params.drive.duration} onChange={(v) => dr({ duration: v })} min={10} />
              </>
            ) : (
              <>
                <Num label="Bus voltage" unit="V" step={10} value={params.drive.busVoltage} onChange={(v) => dr({ busVoltage: v })} min={20} lockKey="drive.busVoltage" />
                <Num label="On-time" unit="µs" scale={1e6} step={10} value={params.drive.onTime} onChange={(v) => dr({ onTime: v })} min={10} lockKey="drive.onTime" />
                <Num label="Interrupter" unit="Hz" step={1} value={params.drive.interrupterHz} onChange={(v) => dr({ interrupterHz: Math.max(v, 1) })} />
                <Num label="Loop resistance" unit="Ω" step={0.1} value={params.drive.gapResistance} onChange={(v) => dr({ gapResistance: v })} min={0} />
                <Hint>The interrupter rate is the musical pitch — play it from the MIDI bar below.</Hint>
              </>
            )}
            <Num label="Tank capacitance" unit="nF" scale={1e9} step={0.5} value={params.drive.tankCapacitance} onChange={(v) => dr({ tankCapacitance: v })} min={0.5} lockKey="drive.tankCapacitance" />
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
                  ["R prim (AC)", fmt.si(d.Rp, "Ω")],
                  ["Mutual M", fmt.si(d.M, "H")],
                  ["Coupling k (geom)", d.k.toFixed(3)],
                  ["Wire ℓ vs λ/4", `${d.wireLength.toFixed(0)} / ${(299792458 / d.fSecondary / 4).toFixed(0)} m`],
                  ["¾λ overtone (dist.)", fmt.si(secondaryLadder(d).fOvertone, "Hz")],
                  ["Topload mass", d.toploadMassKg >= 1 ? `${d.toploadMassKg.toFixed(2)} kg` : `${(d.toploadMassKg * 1000).toFixed(0)} g`],
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

          <OptimizeBox />

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
