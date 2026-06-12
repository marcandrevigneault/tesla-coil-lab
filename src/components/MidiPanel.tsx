import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";

/**
 * Musical control of the solid-state coil: a held note sets the interrupter
 * frequency (the burst repetition rate IS the pitch of a singing arc),
 * re-runs the burst simulation, and plays a square-wave approximation of the
 * arc through WebAudio. Notes come from an attached MIDI keyboard
 * (Web MIDI API) or the on-screen keys.
 */

const noteFreq = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const noteName = (n: number) => `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
const isBlack = (n: number) => [1, 3, 6, 8, 10].includes(n % 12);

/* ---------- audio: one mono square voice, lowpassed so it buzzes, not screams ---------- */
class ArcVoice {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private gain: GainNode | null = null;

  start(freq: number) {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 2600;
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(filter).connect(this.ctx.destination);
    }
    this.ctx.resume();
    this.osc?.stop();
    this.osc = this.ctx.createOscillator();
    this.osc.type = "square";
    this.osc.frequency.value = freq;
    this.osc.connect(this.gain!);
    this.osc.start();
    this.gain!.gain.cancelScheduledValues(this.ctx.currentTime);
    this.gain!.gain.setTargetAtTime(0.07, this.ctx.currentTime, 0.004);
  }

  stop() {
    if (!this.ctx || !this.gain || !this.osc) return;
    this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
    const osc = this.osc;
    setTimeout(() => osc.stop(), 120);
    this.osc = null;
  }
}

const FIRST = 48; // C3
const LAST = 72; // C5

export default function MidiPanel() {
  const setParam = useStore((s) => s.setParam);
  const runSimulation = useStore((s) => s.runSimulation);
  const [activeNote, setActiveNote] = useState<number | null>(null);
  const [midiStatus, setMidiStatus] = useState<string | null>(null);
  const voice = useRef(new ArcVoice());
  const activeRef = useRef<number | null>(null);

  const noteOn = (n: number) => {
    activeRef.current = n;
    setActiveNote(n);
    const freq = noteFreq(n);
    voice.current.start(freq);
    setParam("drive", { interrupterHz: Math.round(freq * 10) / 10 });
    runSimulation();
  };

  const noteOff = (n: number) => {
    if (activeRef.current !== n) return; // a newer note took over
    activeRef.current = null;
    setActiveNote(null);
    voice.current.stop();
  };

  const enableMidi = async () => {
    const nav = navigator as Navigator & { requestMIDIAccess?: () => Promise<any> };
    if (!nav.requestMIDIAccess) {
      setMidiStatus("Web MIDI not supported in this browser");
      return;
    }
    try {
      const access = await nav.requestMIDIAccess();
      const hook = () => {
        let count = 0;
        access.inputs.forEach((input: any) => {
          count++;
          input.onmidimessage = (e: any) => {
            const [status, note, velocity] = e.data;
            const cmd = status & 0xf0;
            if (cmd === 0x90 && velocity > 0) noteOn(note);
            else if (cmd === 0x80 || (cmd === 0x90 && velocity === 0)) noteOff(note);
          };
        });
        setMidiStatus(count ? `${count} MIDI device${count > 1 ? "s" : ""} connected` : "no MIDI inputs — plug in a keyboard");
      };
      hook();
      access.onstatechange = hook;
    } catch {
      setMidiStatus("MIDI access denied");
    }
  };

  // Release the note if the pointer leaves the page mid-press.
  useEffect(() => {
    const up = () => activeRef.current !== null && noteOff(activeRef.current);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  const whites: number[] = [];
  for (let n = FIRST; n <= LAST; n++) if (!isBlack(n)) whites.push(n);
  const W = 26;

  return (
    <div className="flex items-center gap-3 px-3 pb-1.5 shrink-0">
      <div className="relative select-none" style={{ height: 56, width: whites.length * W }}>
        {whites.map((n, i) => (
          <button
            key={n}
            className={`pkey white ${activeNote === n ? "down" : ""}`}
            style={{ left: i * W, width: W - 1 }}
            onPointerDown={() => noteOn(n)}
            onPointerUp={() => noteOff(n)}
            onPointerLeave={() => noteOff(n)}
          >
            {n % 12 === 0 && <span>{noteName(n)}</span>}
          </button>
        ))}
        {Array.from({ length: LAST - FIRST + 1 }, (_, i) => FIRST + i)
          .filter(isBlack)
          .map((n) => {
            const whitesBefore = whites.filter((w) => w < n).length;
            return (
              <button
                key={n}
                className={`pkey black ${activeNote === n ? "down" : ""}`}
                style={{ left: whitesBefore * W - 8 }}
                onPointerDown={() => noteOn(n)}
                onPointerUp={() => noteOff(n)}
                onPointerLeave={() => noteOff(n)}
              />
            );
          })}
      </div>

      <div className="mono text-[11px] flex flex-col gap-1" style={{ color: "var(--muted)" }}>
        <span>
          {activeNote !== null ? (
            <>
              <b style={{ color: "var(--corona)" }}>{noteName(activeNote)}</b> · interrupter{" "}
              {noteFreq(activeNote).toFixed(1)} Hz
            </>
          ) : (
            "play a note → sets interrupter rate"
          )}
        </span>
        {midiStatus ? (
          <span>{midiStatus}</span>
        ) : (
          <button className="btn btn-ghost !px-2 !py-0.5 self-start" onClick={enableMidi}>
            ⌨ connect MIDI keyboard
          </button>
        )}
      </div>
    </div>
  );
}
