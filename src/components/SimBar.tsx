import { useMemo } from "react";
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useStore } from "../store";
import { computeDerived, fmt } from "../physics/formulas";

function Scope({
  title, data, series,
}: {
  title: string;
  data: Record<string, number>[];
  series: { key: string; name: string; color: string }[];
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="section-title mb-1">{title}</div>
      <ResponsiveContainer width="100%" height={168}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#232932" strokeDasharray="2 4" />
          <XAxis
            dataKey="t"
            stroke="#8b93a1"
            tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }}
            tickFormatter={(v) => `${v.toFixed(0)}`}
            label={{ value: "t [µs]", position: "insideBottomRight", offset: -2, fontSize: 10, fill: "#8b93a1" }}
          />
          <YAxis stroke="#8b93a1" tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }} width={52} />
          <Tooltip
            contentStyle={{ background: "#171b22", border: "1px solid #2a3038", fontFamily: "JetBrains Mono", fontSize: 11 }}
            labelFormatter={(v) => `t = ${Number(v).toFixed(2)} µs`}
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

  return (
    <section
      className="panel shrink-0 flex flex-col transition-[height] duration-200 overflow-hidden"
      style={{ height: bottomOpen ? 252 : 40, borderLeft: "none", borderRight: "none", borderBottom: "none" }}
    >
      <div className="flex items-center gap-3 px-3 h-10 shrink-0">
        <button className="btn btn-ghost !px-2 !py-0.5 mono" onClick={toggleBottom}>
          {bottomOpen ? "▾" : "▴"}
        </button>
        <div className="section-title">Simulation · single bang</div>
        <button className="btn btn-run" onClick={runSimulation} disabled={running}>
          {running ? "Solving…" : "▶ Run"}
        </button>
        {sim && (
          <div className="mono text-[11.5px] flex gap-4" style={{ color: "var(--muted)" }}>
            <span>V̂ topload <b style={{ color: "var(--corona)" }}>{fmt.si(sim.peakVs, "V")}</b></span>
            <span>Î primary <b style={{ color: "var(--copper)" }}>{fmt.si(sim.peakIp, "A")}</b></span>
            <span>RK4 steps {sim.steps.toLocaleString()}</span>
          </div>
        )}
        <div className="mono text-[11.5px] ml-auto" style={{ color: "var(--muted)" }}>
          f₁ {fmt.si(d.fPrimary, "Hz")} · f₂ {fmt.si(d.fSecondary, "Hz")} · k {params.drive.coupling}
        </div>
      </div>

      {bottomOpen && (
        <div className="flex gap-4 px-3 pb-2 grow min-h-0">
          {sim ? (
            <>
              <Scope
                title="Voltages [kV]"
                data={data}
                series={[
                  { key: "Vp", name: "V tank cap", color: "#d08a4e" },
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
            </>
          ) : (
            <div className="grid place-items-center w-full text-[12.5px]" style={{ color: "var(--muted)" }}>
              Press Run to discharge the tank capacitor through the spark gap and watch the
              energy beat into the secondary.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
