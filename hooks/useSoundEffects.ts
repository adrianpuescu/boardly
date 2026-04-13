"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "boardly:soundEnabled";

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  return new AudioContext();
}

async function ensureRunning(ctx: AudioContext | PromiseLike<AudioContext>) {
  const c = await Promise.resolve(ctx);
  if (c.state === "suspended") {
    try {
      await c.resume();
    } catch {
      /* ignore */
    }
  }
  return c;
}

/** Soft percussive click using a short sine burst + quick decay */
function playClick(
  ctx: AudioContext,
  freq: number,
  durationMs: number,
  peakGain: number
): void {
  const t0 = ctx.currentTime;
  const dur = durationMs / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function playToneHeld(
  ctx: AudioContext,
  freq: number,
  durationMs: number,
  peakGain: number
): void {
  const t0 = ctx.currentTime;
  const dur = durationMs / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function playNeutralTone(ctx: AudioContext, freq: number, durationMs: number): void {
  playToneHeld(ctx, freq, durationMs, 0.07);
}

function playMelodyAscending(ctx: AudioContext): void {
  const notes = [523.25, 659.25, 783.99];
  const step = 0.09;
  let t = ctx.currentTime;
  for (const f of notes) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + step);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + step + 0.02);
    t += step;
  }
}

function playMelodyDescending(ctx: AudioContext): void {
  const notes = [392.0, 349.23, 293.66];
  const step = 0.1;
  let t = ctx.currentTime;
  for (const f of notes) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.085, t + 0.022);
    g.gain.exponentialRampToValueAtTime(0.0001, t + step);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + step + 0.02);
    t += step;
  }
}

export function useSoundEffects() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const [respectReducedMotion, setRespectReducedMotion] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "false") setSoundEnabledState(false);
      else if (v === "true") setSoundEnabledState(true);
    } catch {
      /* ignore */
    }

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setRespectReducedMotion(mq.matches);
    const onChange = () => setRespectReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const canPlay = soundEnabled && !respectReducedMotion;

  const getCtx = useCallback(async () => {
    if (!canPlay) return null;
    if (!ctxRef.current) {
      ctxRef.current = getAudioContext();
    }
    return ensureRunning(ctxRef.current!);
  }, [canPlay]);

  const setSoundEnabled = useCallback((value: boolean) => {
    setSoundEnabledState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabledState((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "true" : "false");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const playMove = useCallback(async () => {
    const ctx = await getCtx();
    if (!ctx) return;
    playClick(ctx, 220, 80, 0.06);
  }, [getCtx]);

  const playCapture = useCallback(async () => {
    const ctx = await getCtx();
    if (!ctx) return;
    playClick(ctx, 520, 100, 0.09);
  }, [getCtx]);

  const playCheck = useCallback(async () => {
    const ctx = await getCtx();
    if (!ctx) return;
    playToneHeld(ctx, 880, 150, 0.08);
  }, [getCtx]);

  const playDraw = useCallback(async () => {
    const ctx = await getCtx();
    if (!ctx) return;
    playNeutralTone(ctx, 440, 140);
  }, [getCtx]);

  const playGameOver = useCallback(
    async (variant: "win" | "loss") => {
      const ctx = await getCtx();
      if (!ctx) return;
      if (variant === "win") playMelodyAscending(ctx);
      else playMelodyDescending(ctx);
    },
    [getCtx]
  );

  /** Resume audio on user interaction (browser autoplay policy). */
  const primeAudio = useCallback(async () => {
    const ctx = await getCtx();
    if (ctx && ctx.state === "suspended") await ctx.resume();
  }, [getCtx]);

  return {
    soundEnabled,
    setSoundEnabled,
    toggleSound,
    respectReducedMotion,
    canPlay,
    playMove,
    playCapture,
    playCheck,
    playDraw,
    playGameOver,
    primeAudio,
  };
}
