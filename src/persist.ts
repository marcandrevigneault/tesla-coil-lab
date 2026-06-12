import type { OptObjective, Params } from "./types";
import { DEFAULT_PARAMS } from "./store";

/**
 * Model files are plain JSON: { version, savedAt, params, locks, optObjective }.
 * On load, saved params are merged over the current defaults so files from
 * older versions of the app pick up sensible values for fields they predate.
 */

export interface ModelFile {
  version: number;
  savedAt: string;
  params: Params;
  locks: Record<string, boolean>;
  optObjective: OptObjective;
}

export function serializeModel(
  params: Params,
  locks: Record<string, boolean>,
  optObjective: OptObjective
): string {
  const file: ModelFile = { version: 1, savedAt: new Date().toISOString(), params, locks, optObjective };
  return JSON.stringify(file, null, 2);
}

export function downloadModel(params: Params, locks: Record<string, boolean>, optObjective: OptObjective): void {
  const blob = new Blob([serializeModel(params, locks, optObjective)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
  a.href = url;
  a.download = `tesla-coil-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function mergeGroup<T extends object>(defaults: T, saved: unknown): T {
  if (typeof saved !== "object" || saved === null) return { ...defaults };
  return { ...defaults, ...(saved as Partial<T>) };
}

/** Parse + validate a model file; throws with a readable message on garbage. */
export function parseModel(text: string): { params: Params; locks: Record<string, boolean>; optObjective: OptObjective } {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Not a JSON file.");
  }
  if (typeof raw !== "object" || raw === null || typeof raw.params !== "object" || raw.params === null) {
    throw new Error("Not a Tesla Coil Lab model file (missing params).");
  }
  const params: Params = {
    secondary: mergeGroup(DEFAULT_PARAMS.secondary, raw.params.secondary),
    topload: mergeGroup(DEFAULT_PARAMS.topload, raw.params.topload),
    primary: mergeGroup(DEFAULT_PARAMS.primary, raw.params.primary),
    drive: mergeGroup(DEFAULT_PARAMS.drive, raw.params.drive),
  };
  const locks =
    typeof raw.locks === "object" && raw.locks !== null
      ? Object.fromEntries(Object.entries(raw.locks).filter(([, v]) => typeof v === "boolean")) as Record<string, boolean>
      : {};
  const optObjective: OptObjective = ["voltage", "energy", "efficiency"].includes(raw.optObjective)
    ? raw.optObjective
    : "voltage";
  return { params, locks, optObjective };
}
