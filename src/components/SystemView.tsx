import { useStore } from "../store";
import { computeDerived, fmt } from "../physics/formulas";

/** Clean schematic.
 *  Spark gap:    HV source → tank cap Cp ∥ (spark gap → Lp) ⇄ Ls → Cs → ground.
 *  Solid-state:  DC bus → H-bridge → series Cp → Lp ⇄ Ls → Cs → ground. */
export default function SystemView() {
  const params = useStore((s) => s.params);
  const d = computeDerived(params);
  const ink = "var(--text)";
  const dim = "var(--muted)";
  const solidState = params.drive.topology === "solid-state";

  const coil = (x: number, y: number, n: number, vertical = false) => {
    const r = 9;
    let path = "";
    for (let i = 0; i < n; i++) {
      path += vertical
        ? `M ${x} ${y + i * 2 * r} a ${r} ${r} 0 0 1 0 ${2 * r} `
        : `M ${x + i * 2 * r} ${y} a ${r} ${r} 0 0 1 ${2 * r} 0 `;
    }
    return path;
  };

  const Label = ({ x, y, title, value, anchor = "middle" as const }: any) => (
    <text x={x} y={y} textAnchor={anchor} fontFamily="JetBrains Mono" fontSize="11" fill={dim}>
      <tspan fill={ink} fontWeight="600">{title}</tspan>
      <tspan x={x} dy="14">{value}</tspan>
    </text>
  );

  return (
    <div className="w-full h-full grid place-items-center overflow-auto p-6">
      <svg viewBox="0 0 860 420" className="max-w-[920px] w-full" style={{ color: ink }}>
        <g stroke={ink} strokeWidth="1.6" fill="none" strokeLinecap="round">
          {solidState ? (
            <>
              {/* DC bus + H-bridge */}
              <rect x="48" y="86" width="64" height="48" rx="6" />
              {/* square-wave glyph */}
              <path d="M 60 118 h 8 v -16 h 12 v 16 h 12 v -16 h 8" strokeWidth="1.3" stroke="var(--corona)" />
              <path d="M 112 110 H 200" />
              <path d="M 80 134 V 310 H 200" />
              {/* series tank capacitor in the top rail */}
              <path d="M 200 110 H 286" />
              <path d="M 286 92 V 128 M 302 92 V 128" strokeWidth="2.4" />
              <path d="M 302 110 H 420" />
            </>
          ) : (
            <>
              {/* HV supply (circle with ~) */}
              <circle cx="80" cy="210" r="22" />
              <text x="80" y="216" textAnchor="middle" fill={ink} fontSize="18">∿</text>
              <path d="M 80 188 V 110 H 200" />
              <path d="M 80 232 V 310 H 200" />

              {/* Tank capacitor Cp (vertical, between rails) */}
              <path d="M 200 110 V 196 M 200 224 V 310" />
              <path d="M 184 196 H 216 M 184 224 H 216" strokeWidth="2.4" />

              {/* Spark gap on top rail */}
              <path d="M 200 110 H 296" />
              <circle cx="304" cy="110" r="3.4" fill={ink} />
              <circle cx="332" cy="110" r="3.4" fill={ink} />
              <path d="M 340 110 H 420" />
              {/* small arc glyph */}
              <path d="M 308 104 q 5 -7 10 0 q 5 7 10 0" stroke="var(--corona)" strokeWidth="1.4" />
            </>
          )}

          {/* Primary inductor Lp (vertical) */}
          <path d="M 420 110 V 140" />
          <path d={coil(420, 140, 4, true)} />
          <path d="M 420 212 V 310 H 200" />

          {/* coupling chevrons */}
          <path d="M 449 142 l 14 14 M 449 162 l 14 14 M 449 182 l 14 14" stroke={dim} strokeDasharray="3 4" />

          {/* Secondary Ls (vertical, taller) */}
          <path d="M 500 96 V 118" />
          <path d={coil(500, 118, 6, true)} />
          <path d="M 500 226 V 330" />
          {/* ground */}
          <path d="M 478 330 H 522 M 485 338 H 515 M 492 346 H 508" />

          {/* Topload Cs: line to top terminal */}
          <path d="M 500 96 V 64 H 640" />
          {params.topload.shape === "toroid" ? (
            <ellipse cx="672" cy="64" rx="32" ry="13" stroke="var(--copper)" />
          ) : (
            <circle cx="672" cy="64" r="18" stroke="var(--copper)" />
          )}
          {params.topload.construction === "hollow" && (
            params.topload.shape === "toroid" ? (
              <ellipse cx="672" cy="64" rx="22" ry="7" stroke="var(--copper)" strokeDasharray="3 3" strokeWidth="1" />
            ) : (
              <circle cx="672" cy="64" r="12" stroke="var(--copper)" strokeDasharray="3 3" strokeWidth="1" />
            )
          )}
          {/* distributed capacitance to ground (dashed cap) */}
          <path d="M 672 80 V 150" strokeDasharray="4 4" stroke={dim} />
          <path d="M 656 150 H 688 M 656 164 H 688" stroke={dim} strokeWidth="2" />
          <path d="M 672 164 V 200 M 652 200 H 692 M 659 208 H 685 M 666 216 H 678" stroke={dim} />
        </g>

        {/* labels with live values */}
        {solidState ? (
          <>
            <Label x={80} y={62} title="H-bridge" value={`bus ${fmt.si(params.drive.busVoltage, "V")}`} />
            <Label x={80} y={336} anchor="start" title="interrupter" value={`${params.drive.interrupterHz.toFixed(0)} Hz · ${(params.drive.onTime * 1e6).toFixed(0)} µs on`} />
            <Label x={294} y={66} title="Cp series" value={fmt.si(params.drive.tankCapacitance, "F")} />
          </>
        ) : (
          <>
            <Label x={80} y={262} title="HV supply" value={`${fmt.si(params.drive.supplyVoltage, "V")} · ${fmt.si(params.drive.supplyCurrent, "A")}`} />
            <Label x={232} y={206} anchor="start" title="Cp" value={fmt.si(params.drive.tankCapacitance, "F")} />
            <Label x={318} y={88} title="spark gap" value={`${params.drive.gapResistance} Ω arc`} />
          </>
        )}
        <Label x={398} y={176} anchor="end" title="Lp" value={fmt.si(d.Lp, "H")} />
        <Label x={482} y={176} anchor="end" title="Ls" value={fmt.si(d.Ls, "H")} />
        <Label x={672} y={24} title={`topload${params.topload.construction === "hollow" ? " (hollow)" : ""}`} value={fmt.si(d.CtopPF * 1e-12, "F")} />
        <Label x={736} y={156} anchor="start" title="Cs total" value={fmt.si(d.Cs, "F")} />
        <text x={456} y={250} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="11" fill="var(--corona)">
          k = {d.k.toFixed(3)} (geometric)
        </text>

        {/* resonance summary */}
        <g fontFamily="JetBrains Mono" fontSize="11.5" fill={dim}>
          <text x="560" y="290">f₁ = 1/2π√(LpCp) = <tspan fill={ink}>{fmt.si(d.fPrimary, "Hz")}</tspan></text>
          <text x="560" y="310">f₂ = 1/2π√(LsCs) = <tspan fill={ink}>{fmt.si(d.fSecondary, "Hz")}</tspan></text>
          <text x="560" y="330">M = k√(LpLs) = <tspan fill={ink}>{fmt.si(d.M, "H")}</tspan></text>
          {!solidState && (
            <text x="560" y="350">
              supply {fmt.si(d.supplyPower, "W")} → max <tspan fill={ink}>{isFinite(d.maxBps) ? d.maxBps.toFixed(0) : "—"}</tspan> bangs/s
            </text>
          )}
          <text x="560" y={solidState ? 350 : 370} fill={Math.abs(d.fPrimary / d.fSecondary - 1) < 0.05 ? "var(--arc)" : "var(--warn)"}>
            {Math.abs(d.fPrimary / d.fSecondary - 1) < 0.05 ? "tuned ✓" : `detuned ×${(d.fPrimary / d.fSecondary).toFixed(2)}`}
          </text>
        </g>
      </svg>
    </div>
  );
}
