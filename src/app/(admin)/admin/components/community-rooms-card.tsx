"use client";

// Admin card: configure each community room's icon. Empty = platform logo.

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, MessageCircle, X } from "lucide-react";

interface Room {
  id: string;
  name: string;
  country: string | null;
  image_url: string | null;
}

export default function CommunityRoomsCard() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/rooms");
      if (res.ok) setRooms(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (room: Room) => {
    setSaving(room.id);
    try {
      const res = await fetch("/api/admin/rooms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: room.id, imageUrl: edits[room.id] ?? room.image_url ?? "" }),
      });
      const data = await res.json();
      if (res.ok) {
        setRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, image_url: data.image_url } : r)));
        setToast({ msg: `${room.name} icon saved`, ok: true });
      } else {
        setToast({ msg: data.error || "Failed to save", ok: false });
      }
    } catch {
      setToast({ msg: "Failed to save", ok: false });
    } finally {
      setSaving(null);
      setTimeout(() => setToast(null), 2500);
    }
  };

  return (
    <div className="card p-4 space-y-3">
      <p className="text-[11px] uppercase tracking-wide text-ccb-muted">Community Rooms</p>
      <p className="text-xs text-ccb-muted -mt-1">
        Icon shown in the Chats list and room header. Leave empty to use the platform logo.
      </p>

      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-ccb-muted mx-auto" />
      ) : (
        <div className="space-y-2">
          {rooms.map((r) => {
            const value = edits[r.id] ?? r.image_url ?? "";
            const preview = value || "/logo-badge.png";
            return (
              <div key={r.id} className="flex items-center gap-2 rounded-lg bg-ccb-surface border border-ccb-border p-2">
                <div className="w-10 h-10 rounded-xl bg-ccb-surface border border-ccb-border overflow-hidden shrink-0 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt={r.name} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-ccb-text truncate">
                    {r.name} <span className="text-ccb-muted font-normal">· {r.country ? r.country : "Global"}</span>
                  </p>
                  <input
                    value={value}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    placeholder="/logo-badge.png"
                    className="mt-1 w-full px-2 py-1 rounded-md bg-ccb-dark border border-ccb-border text-xs text-ccb-text placeholder:text-ccb-muted/60"
                  />
                </div>
                <button
                  onClick={() => save(r)}
                  disabled={saving === r.id || value === (r.image_url ?? "")}
                  className="px-3 py-1.5 rounded-lg bg-ccb-primary text-white text-xs font-medium disabled:opacity-40 shrink-0"
                >
                  {saving === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {toast && (
        <p className={`text-xs flex items-center gap-1 ${toast.ok ? "text-ccb-success" : "text-red-400"}`}>
          {toast.ok ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />} {toast.msg}
        </p>
      )}
    </div>
  );
}
