import { useCallback } from "react";
import { useSettings } from "./settings";

// Sound effects are synthesised with the Web Audio API, so there are no audio files to ship or load.

export type SoundName = "tap" | "toggle" | "success" | "error" | "flip" | "pop" | "complete" | "delete" | "open";

let context: AudioContext | undefined;

function audio(): AudioContext | undefined {
  if (typeof window === "undefined" || !("AudioContext" in window)) return undefined;
  context ??= new AudioContext();
  if (context.state === "suspended") void context.resume();
  return context;
}

type Note = { freq: number; at?: number; dur?: number; type?: OscillatorType; gain?: number; slideTo?: number };

function tones(ctx: AudioContext, out: AudioNode, notes: Note[]) {
  const now = ctx.currentTime;
  for (const { freq, at = 0, dur = 0.12, type = "sine", gain = 0.5, slideTo } of notes) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now + at);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + at + dur);
    env.gain.setValueAtTime(0.0001, now + at);
    env.gain.exponentialRampToValueAtTime(gain, now + at + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, now + at + dur);
    osc.connect(env).connect(out);
    osc.start(now + at);
    osc.stop(now + at + dur + 0.02);
  }
}

function whoosh(ctx: AudioContext, out: AudioNode, dur = 0.22) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const env = ctx.createGain();
  source.buffer = buffer;
  filter.type = "bandpass";
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(600, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(2800, ctx.currentTime + dur);
  env.gain.value = 0.35;
  source.connect(filter).connect(env).connect(out);
  source.start();
}

const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5;

export function playSound(name: SoundName, volume: number) {
  const ctx = audio();
  if (!ctx || volume <= 0) return;
  const master = ctx.createGain();
  master.gain.value = volume * 0.35;
  master.connect(ctx.destination);
  switch (name) {
    case "tap": return tones(ctx, master, [{ freq: 1400, dur: 0.035, type: "triangle", gain: 0.25 }]);
    case "toggle": return tones(ctx, master, [{ freq: 880, dur: 0.05, type: "triangle", gain: 0.3 }, { freq: 1320, at: 0.045, dur: 0.05, type: "triangle", gain: 0.25 }]);
    case "pop": return tones(ctx, master, [{ freq: 420, slideTo: 980, dur: 0.09, gain: 0.45 }]);
    case "open": return tones(ctx, master, [{ freq: 660, dur: 0.07, type: "triangle", gain: 0.3 }, { freq: 990, at: 0.06, dur: 0.1, type: "triangle", gain: 0.25 }]);
    case "success": return tones(ctx, master, [{ freq: C5, dur: 0.12, type: "triangle" }, { freq: E5, at: 0.08, dur: 0.12, type: "triangle" }, { freq: G5, at: 0.16, dur: 0.22, type: "triangle" }]);
    case "error": return tones(ctx, master, [{ freq: 220, slideTo: 150, dur: 0.22, type: "square", gain: 0.18 }]);
    case "delete": return tones(ctx, master, [{ freq: 520, slideTo: 180, dur: 0.18, type: "sine", gain: 0.4 }]);
    case "flip": return whoosh(ctx, master);
    case "complete": return tones(ctx, master, [
      { freq: C5, dur: 0.14, type: "triangle" }, { freq: E5, at: 0.1, dur: 0.14, type: "triangle" },
      { freq: G5, at: 0.2, dur: 0.14, type: "triangle" }, { freq: C6, at: 0.3, dur: 0.4, type: "triangle" },
      { freq: G5 * 2, at: 0.3, dur: 0.4, type: "sine", gain: 0.15 },
    ]);
  }
}

/** Returns a `play` function that respects the user's sound settings. */
export function useSound() {
  const { settings } = useSettings();
  return useCallback((name: SoundName) => {
    if (settings.sound) playSound(name, settings.volume);
  }, [settings.sound, settings.volume]);
}
