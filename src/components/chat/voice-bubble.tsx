"use client";

// WhatsApp-style voice-note bubble: play/pause, deterministic waveform
// bars, progress tint, duration label. Only one note plays at a time
// (module-level singleton); when the bubble is deleted the audio stops.

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";

let stopCurrentlyPlaying: (() => void) | null = null;

function fmt(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// Deterministic pseudo-waveform from the message id — same shape on every render
function barsFor(id: number, count = 26): number[] {
  const bars: number[] = [];
  let h = (id * 2654435761) >>> 0;
  for (let i = 0; i < count; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    bars.push(0.3 + ((h >>> 16) % 100) / 100 * 0.7);
  }
  return bars;
}

export default function VoiceBubble({
  id,
  url,
  duration,
  mine,
}: { id: number; url: string; duration?: number | null; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [len, setLen] = useState(duration || 0);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  // Pause when another note starts
  useEffect(() => {
    stopCurrentlyPlaying = () => pause();
    return () => { if (stopCurrentlyPlaying === (() => pause())) stopCurrentlyPlaying = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pause]);

  const toggle = useCallback(() => {
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio(url);
      audio.preload = "metadata";
      audioRef.current = audio;
      audio.addEventListener("loadedmetadata", () => { if (audio && isFinite(audio.duration)) setLen(audio.duration); });
      audio.addEventListener("timeupdate", () => {
        if (audio && isFinite(audio.duration) && audio.duration > 0) setProgress(audio.currentTime / audio.duration);
      });
      audio.addEventListener("ended", () => { setPlaying(false); setProgress(0); });
      audio.addEventListener("canplay", () => setLoading(false));
    }
    if (playing) {
      pause();
    } else {
      stopCurrentlyPlaying?.(); // stop any other note
      stopCurrentlyPlaying = () => pause();
      setLoading(true);
      audio.play().finally(() => setLoading(false));
      setPlaying(true);
    }
  }, [playing, pause, url]);

  useEffect(() => () => {
    // stop audio when bubble unmounts (e.g. message deleted)
    audioRef.current?.pause();
  }, []);

  const bars = barsFor(id);
  const shown = len || duration || 0;

  return (
    <div className="flex items-center gap-2 min-w-[180px] sm:min-w-[200px]">
      <button
        onClick={(e) => { e.stopPropagation(); toggle(); }}
        className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center ${mine ? "bg-white/25" : "bg-ccb-primary text-white"}`}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : playing ? (
          <Pause className="w-3.5 h-3.5" />
        ) : (
          <Play className="w-3.5 h-3.5" />
        )}
      </button>
      <div className="flex items-center gap-[2px] flex-1 h-8">
        {bars.map((b, i) => {
          const active = progress > 0 && i / bars.length <= progress;
          return (
            <span
              key={i}
              className={`w-[3px] rounded-full ${mine ? (active ? "bg-white" : "bg-white/45") : (active ? "bg-ccb-primary" : "bg-ccb-border")}`}
              style={{ height: `${Math.round(b * 100)}%` }}
            />
          );
        })}
      </div>
      <span className={`text-[10px] shrink-0 tabular-nums ${mine ? "text-white/80" : "text-ccb-muted"}`}>
        {fmt(shown)}
      </span>
    </div>
  );
}
