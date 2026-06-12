import { useMemo } from "react";
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useStore } from "../store";
import { computeDerived, fmt, sparkEstimates } from "../physics/formulas";
import { secondaryLadder } from "../physics/ladder";
import MidiPanel from "./MidiPanel";

function Scope({
  title, data, series, xKey = "t", xLabel = "t [µs]",
}: {
  title: string;
  data: Record<string, number>[];
  series: { key: string; name: string; color: string }[];
  xKey?: string;
  xLabel?: string;
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="section-title mb-1">{title}</div>
      <ResponsiveContainer width="100%" height={168}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#232932" strokeDasharray="2 4" />
          <XAxis
            dataKey={xKey}
            stroke="#8b93a1"
            tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }}
            tickFormatter={(v) => `${v.toFixed(0)}`}
            label={{ value: xLabel, position: "insideBottomRight", offset: -2, fontSize: 10, fill: "#8b93a1" }}
          />
          <YAxis stroke="#8b93a1" tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }} width={52} />
          <Tooltip
            contentStyle={{ background: "#171b22", border: "1px solid #2a3038", fontFamily: "JetBrains Mono", fontSize: 11 }}
            labelFormatter={(v) => `${xLabel.split(" ")[0]} = ${Number(v).toFixed(2)}`}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {series.map((s) => (
            <Line key={s.key} type="linear" dataKey={s.key} name={s.name}
              stroke={s.color} dot={false} strokeWidth={1.4} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function SimBar() {
  const { sim, running, runSimulation, bottomOpen, toggleBottom, params } = useStore();
  const d = computeDerived(params);
  const solidState = params.drive.topology === "solid-state";

  const data = useMemo(() => {
    if (!sim) return [];
    return sim.t.map((t, i) => ({
      t: t * 1e6, // µs
      Vp: sim.Vp[i] / 1e3, // kV
      Vs: sim.Vs[i] / 1e3,
      Ip: sim.Ip[i],
      Is: sim.Is[i],
    }));
  }, [sim]);

  // Standing-wave profile from the distributed ladder, scaled to the bang's
  // peak — V(x) along the winding at the moment the topload tops out.
  const profileData = useMemo(() => {
    if (!sim) return [];
    const { profile } = secondaryLadder(d);
    return profile.map((pt) => ({
      h: pt.x * params.secondary.height * 100, // cm above the base
      V: (pt.v * sim.peakVs) / 1e3, // kV
      I: pt.i, // normalized current
    }));
  }, [sim, d, params.secondary.height]);

  const spark = useMemo(() => {
    if (!sim) return null;
    // Power for the repetitive-bang (Freau) estimate: wall-plug supply power
    // for a spark gap; energy actually pumped into Cs per burst × rate for SS.
    const powerW = solidState
      ? 0.5 * d.Cs * sim.peakVs ** 2 * params.drive.interrupterHz
      : d.supplyPower;
    return sparkEstimates(sim.peakVs, powerW);
  }, [sim, solidState, d.Cs, d.supplyPower, params.drive.interrupterHz]);

  const efficiency = sim && !solidState
    ? (0.5 * d.Cs * sim.peakVs ** 2) / (0.5 * params.drive.tankCapacitance * params.drive.firingVoltage ** 2)
    : null;

  const expandedH = solidState ? 320 : 252;

  return (
    <section
      className="panel shrink-0 flex flex-col transition-[height] duration-200 overflow-hidden"
      style={{ height: bottomOpen ? expandedH : 40, borderLeft: "none", borderRight: "none", borderBottom: "none" }}
    >
      <div className="flex items-center gap-3 px-3 h-10 shrink-0">
        <button className="btn btn-ghost !px-2 !py-0.5 mono" onClick={toggleBottom}>
          {bottomOpen ? "▾" : "▴"}
        </button>
        <div className="section-title">
          {solidState ? "Simulation · interrupter bursts" : "Simulation · single bang"}
        </div>
        <button className="btn btn-run" onClick={runSimulation} disabled={running}>
          {running ? "Solving…" : "▶ Run"}
        </button>
        {sim && (
          <div className="mono text-[11.5px] flex gap-4" style={{ color: "var(--muted)" }}>
            <span>V̂ topload <b style={{ color: "var(--corona)" }}>{fmt.si(sim.peakVs, "V")}</b></span>
            <span>Î primary <b style={{ color: "var(--copper)" }}>{fmt.si(sim.peakIp, "A")}</b></span>
            {efficiency !== null && (
              <span>η transfer <b style={{ color: "var(--arc)" }}>{(efficiency * 100).toFixed(0)}%</b></span>
            )}
            {spark && (
              <span title="Single-shot streamer from peak voltage (~7 kV/cm) · repetitive growth, Freau 1.7·√P. Both ±50%.">
                arc ≈ <b style={{ color: "var(--warn)" }}>{fmt.cm(spark.singleCm)}</b>
                {" "}single · <b style={{ color: "var(--warn)" }}>{fmt.cm(spark.freauCm)}</b> sustained
              </span>
            )}
          </div>
        )}
        <div className="mono text-[11.5px] ml-auto" style={{ color: "var(--muted)" }}>
          f₁ {fmt.si(d.fPrimary, "Hz")} · f₂ {fmt.si(d.fSecondary, "Hz")} · k {d.k.toFixed(3)}
          {solidState && <> · int {params.drive.interrupterHz.toFixed(0)} Hz</>}
        </div>
      </div>

      {bottomOpen && solidState && <MidiPanel />}

      {bottomOpen && (
        <div className="flex gap-4 px-3 pb-2 grow min-h-0">
          {sim ? (
            <>
              <Scope
                title="Voltages [kV]"
                data={data}
                series={[
                  { key: "Vp", name: solidState ? "V series cap" : "V tank cap", color: "#d08a4e" },
                  { key: "Vs", name: "V topload", color: "#9d7bff" },
                ]}
              />
              <Scope
                title="Currents [A]"
                data={data}
                series={[
                  { key: "Ip", name: "I primary", color: "#e8b14e" },
                  { key: "Is", name: "I secondary", color: "#5fd4e6" },
                ]}
              />
              <Scope
                title="V along secondary [kV] · λ/4 profile"
                data={profileData}
                xKey="h"
                xLabel="height [cm]"
                series={[
                  { key: "V", name: "V(x) at peak", color: "#9d7bff" },
                ]}
              />
            </>
          ) : (
            <div className="grid place-items-center w-full text-[12.5px]" style={{ color: "var(--muted)" }}>
              {solidState
                ? "Press Run — or play a note — to fire interrupter bursts through the H-bridge and watch the secondary ring up."
                : "Press Run to discharge the tank capacitor through the spark gap and watch the energy beat into the secondary."}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
