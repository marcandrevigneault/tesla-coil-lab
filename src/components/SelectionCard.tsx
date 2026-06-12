import { useStore } from "../store";
import type { Material } from "../types";

const MATERIALS: Material[] = ["copper", "aluminum", "silver"];

const TITLES = {
  primary: "Primary coil",
  secondary: "Secondary coil",
  topload: "Topload",
} as const;

export default function SelectionCard() {
  const selected = useStore((s) => s.selected);
  const params = useStore((s) => s.params);
  const setParam = useStore((s) => s.setParam);
  const setSelected = useStore((s) => s.setSelected);
  if (!selected) return null;

  const material = params[selected].material;

  return (
    <div className="card absolute top-3 right-3 w-60 p-3 z-20">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="section-title" style={{ color: "var(--corona)" }}>selected</div>
          <div className="font-bold text-[14px]">{TITLES[selected]}</div>
        </div>
        <button className="btn btn-ghost !px-2 !py-0.5 mono" onClick={() => setSelected(null)}>✕</button>
      </div>

      {selected === "topload" && (
        <>
          <div className="field">
            <label>Shape</label>
            <select
              value={params.topload.shape}
              onChange={(e) => setParam("topload", { shape: e.target.value as any })}
            >
              <option value="toroid">toroid</option>
              <option value="sphere">sphere</option>
            </select>
          </div>
          <div className="field">
            <label>Construction</label>
            <select
              value={params.topload.construction}
              onChange={(e) => setParam("topload", { construction: e.target.value as any })}
            >
              <option value="hollow">hollow</option>
              <option value="solid">solid</option>
            </select>
          </div>
        </>
      )}

      {selected === "primary" && (
        <>
          <div className="field">
            <label>Geometry</label>
            <select
              value={params.primary.type}
              onChange={(e) => setParam("primary", { type: e.target.value as any })}
            >
              <option value="spiral">flat spiral</option>
              <option value="cone">conical</option>
              <option value="helix">helical</option>
            </select>
          </div>
          {params.primary.type === "cone" && (
            <div className="field">
              <label>Cone angle [°]</label>
              <input
                type="number"
                value={params.primary.coneAngle}
                min={1}
                max={85}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (isFinite(v)) setParam("primary", { coneAngle: Math.min(Math.max(v, 1), 85) });
                }}
              />
            </div>
          )}
          <div className="field">
            <label>Conductor</label>
            <select
              value={params.primary.conductorStyle}
              onChange={(e) => setParam("primary", { conductorStyle: e.target.value as any })}
            >
              <option value="tube">copper tubing</option>
              <option value="wire">solid wire</option>
            </select>
          </div>
        </>
      )}

      <div className="field">
        <label>Material</label>
        <select
          value={material}
          onChange={(e) => setParam(selected, { material: e.target.value as Material } as any)}
        >
          {MATERIALS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      <p className="text-[11px] mt-2 mb-0" style={{ color: "var(--muted)" }}>
        Full dimensions are in the Parameters panel.
      </p>
    </div>
  );
}
