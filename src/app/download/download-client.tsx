"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { Download, Check, PackageOpen } from "lucide-react";

export default function DownloadClient() {
  const [status, setStatus] = useState<"idle" | "downloading" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const linkRef = useRef<HTMLAnchorElement>(null);

  const handleDownload = () => {
    setStatus("downloading");
    setProgress(0);

    // Simulate progress for APK download (browsers don't expose real download progress)
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) {
          clearInterval(interval);
          return 95;
        }
        return prev + Math.random() * 15;
      });
    }, 300);

    // Trigger the actual download
    const a = linkRef.current;
    if (a) {
      a.click();
    }

    // After a reasonable time, assume download is complete
    setTimeout(() => {
      clearInterval(interval);
      setProgress(100);
      setStatus("done");
    }, 2500);
  };

  return (
    <div className="flex flex-col items-center text-center">
      {/* App icon — now using the real logo */}
      <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-ccb-primary to-ccb-accent flex items-center justify-center mb-6 shadow-xl shadow-ccb-primary/30 overflow-hidden">
        <Image
          src="/logo-badge.png"
          alt="Crazy Chess Battles"
          width={88}
          height={88}
          className="rounded-3xl"
          priority
        />
      </div>

      <h1 className="text-3xl sm:text-4xl font-bold mb-2">Crazy Chess Battles</h1>
      <p className="text-ccb-muted text-base sm:text-lg mb-1">Africa&apos;s competitive chess arena</p>
      <p className="text-ccb-muted/70 text-sm mb-8">Android App · Version 1.0.0 · 4.1 MB</p>

      {/* Hidden anchor for actual download trigger */}
      <a ref={linkRef} href="/CCB.apk" download="CCB.apk" className="hidden" />

      {status === "idle" && (
        <button
          onClick={handleDownload}
          className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl bg-ccb-primary hover:bg-ccb-primaryHover text-white font-bold text-lg transition-all hover:scale-105 shadow-lg shadow-ccb-primary/30 mb-3"
        >
          <Download className="w-5 h-5" />
          Download APK
        </button>
      )}

      {status === "downloading" && (
        <div className="w-full max-w-sm mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-ccb-muted">Downloading…</span>
            <span className="text-sm font-medium text-ccb-primary">{Math.floor(progress)}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-ccb-surface overflow-hidden">
            <div
              className="h-full rounded-full bg-ccb-primary transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {status === "done" && (
        <div className="flex flex-col items-center gap-3 mb-3">
          <div className="flex items-center gap-2 text-ccb-primary">
            <Check className="w-5 h-5" />
            <span className="font-medium">Download complete!</span>
          </div>
          <a
            href="/CCB.apk"
            className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl bg-ccb-primary hover:bg-ccb-primaryHover text-white font-bold text-lg transition-all hover:scale-105 shadow-lg shadow-ccb-primary/30"
          >
            <PackageOpen className="w-5 h-5" />
            Open
          </a>
          <button
            onClick={() => { setStatus("idle"); setProgress(0); }}
            className="text-xs text-ccb-muted hover:text-ccb-text underline mt-1"
          >
            Download again
          </button>
        </div>
      )}

      {status === "idle" && (
        <p className="text-xs text-ccb-muted/60 mb-12">Free download · No registration required to install</p>
      )}
      {status !== "idle" && <div className="mb-8" />}
    </div>
  );
}
