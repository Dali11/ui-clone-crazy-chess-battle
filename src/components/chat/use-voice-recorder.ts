"use client";

// Tap-to-record mic hook (MediaRecorder). Auto-stops at MAX_RECORD_SECONDS.
// stop() resolves to { blob, duration, mime } ready for upload; cancel()
// discards. iOS Safari records audio/mp4 (AAC); Android/Chrome webm/opus.

import { useCallback, useEffect, useRef, useState } from "react";

export const MAX_RECORD_SECONDS = 120;

export interface VoiceClip {
  blob: Blob;
  duration: number; // whole seconds
  mime: string;
}

export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const resolveRef = useRef<((clip: VoiceClip | null) => void) | null>(null);
  const cancelledRef = useRef(false);

  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const stream = recorderRef.current?.stream;
    stream?.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    setElapsed(0);
  }, []);

  const stop = useCallback((): Promise<VoiceClip | null> => {
    return new Promise((resolve) => {
      const rec = recorderRef.current;
      if (!rec || rec.state === "inactive") { resolve(null); return; }
      resolveRef.current = resolve;
      rec.stop(); // onstop fires below
    });
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    else cleanup();
  }, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    if (typeof MediaRecorder === "undefined") {
      setError("Voice notes aren't supported on this browser");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime =
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4"
        : "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      cancelledRef.current = false;

      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const duration = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
        const resolve = resolveRef.current;
        resolveRef.current = null;
        const wasCancelled = cancelledRef.current;
        cancelledRef.current = false;
        cleanup();
        if (resolve) {
          if (wasCancelled || chunksRef.current.length === 0) resolve(null);
          else resolve({ blob: new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" }), duration, mime: rec.mimeType || "audio/webm" });
        }
      };

      recorderRef.current = rec;
      startedAtRef.current = Date.now();
      setElapsed(0);
      setRecording(true);
      rec.start(500); // timeslice so long clips arrive in chunks

      timerRef.current = setInterval(() => {
        const secs = Math.round((Date.now() - startedAtRef.current) / 1000);
        setElapsed(secs);
        if (secs >= MAX_RECORD_SECONDS) {
          const r = recorderRef.current;
          if (r && r.state !== "inactive") r.stop();
        }
      }, 500);
    } catch (err: any) {
      cleanup();
      if (err?.name === "NotAllowedError" || err?.name === "SecurityError")
        setError("Microphone access was denied — check your browser permissions");
      else
        setError("Couldn't start recording — try again");
    }
  }, [cleanup]);

  useEffect(() => () => {
    // unmount safety: release mic
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") { cancelledRef.current = true; rec.stop(); }
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  return { recording, elapsed, error, start, stop, cancel, setError };
}
