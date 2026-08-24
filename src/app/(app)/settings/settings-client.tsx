"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { User, LogOut, Save, ChevronRight, Trophy, Swords, Wallet, Camera, Circle, AlertCircle, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  phone: string | null;
  gender: string | null;
  identity_verified: boolean | null;
  rating: number | null;
  games_played: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  tournaments_played: number | null;
  tournaments_won: number | null;
  wallet_balance_cents: number | null;
  is_admin: boolean | null;
}

const GENDER_OPTIONS = [
  { value: "male", label: "Male", icon: User, color: "text-blue-400" },
  { value: "female", label: "Female", icon: User, color: "text-pink-400" },
  { value: "other", label: "Other", icon: Circle, color: "text-purple-400" },
  { value: "prefer_not_to_say", label: "Prefer not to say", icon: Circle, color: "text-ccb-muted" },
];

export default function SettingsClient({ profile, userId }: { profile: Profile | null; userId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [gender, setGender] = useState(profile?.gender || "");
  const [identityVerified, setIdentityVerified] = useState(profile?.identity_verified || false);
  const [genderChanged, setGenderChanged] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url || null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          const maxDim = 256;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Failed to get canvas context"));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error("Canvas to Blob conversion failed"));
              }
            },
            "image/jpeg",
            0.8
          );
        };
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarUploading(true);
    setAvatarError(null);

    try {
      const blob = await compressImage(file);
      const path = `${userId}/${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { contentType: "image/jpeg" });

      if (uploadError) {
        throw uploadError;
      }

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(path);

      const publicUrl = urlData.publicUrl;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", userId);

      if (updateError) {
        throw updateError;
      }

      setAvatarUrl(publicUrl);
      router.refresh();
    } catch (err: any) {
      setAvatarError(err.message || "Failed to upload avatar");
    } finally {
      setAvatarUploading(false);
      if (e.target) {
        e.target.value = "";
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const updates: Record<string, any> = { display_name: displayName, bio, phone };
    const genderChangedFlag = gender !== (profile?.gender || "");
    if (gender) updates.gender = gender;
    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", userId);
    if (error) {
      setError(error.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      if (genderChangedFlag && identityVerified) {
        setIdentityVerified(false);
        setGenderChanged(true);
      }
      router.refresh();
    }
    setSaving(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const walletBalance = profile?.wallet_balance_cents
    ? `MK ${Math.floor(profile.wallet_balance_cents / 100).toLocaleString("en-US")}`
    : "MK 0";

  return (
    <div className="space-y-4 sm:space-y-6 pb-24 sm:pb-6 max-w-2xl">
      <h1 className="text-xl sm:text-2xl font-bold">Settings</h1>

      {/* Profile section */}
      <div className="card p-4 space-y-4">
        <h3 className="font-bold text-base flex items-center gap-2">
          <User className="w-4 h-4 text-ccb-primary" />
          Profile
        </h3>

        {/* Profile Picture Section */}
        <div className="space-y-2">
          <label className="text-sm font-medium block">Profile Picture</label>
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20 rounded-full overflow-hidden bg-ccb-surface border border-ccb-border flex items-center justify-center shrink-0">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className="w-20 h-20 rounded-full object-cover"
                />
              ) : (
                <User className="w-10 h-10 text-ccb-muted" />
              )}
              {avatarUploading && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-xs text-white font-medium">
                  Uploading...
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleAvatarChange}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                className="btn-secondary text-xs flex items-center gap-1.5 px-3 py-2"
              >
                <Camera className="w-3.5 h-3.5" />
                {avatarUploading ? "Uploading..." : "Change Photo"}
              </button>
              {avatarUploading && (
                <span className="text-xs text-ccb-muted">Uploading image...</span>
              )}
              {avatarError && (
                <span className="text-xs text-ccb-danger">{avatarError}</span>
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium block mb-1.5">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="input"
            placeholder="Your name"
            maxLength={30}
          />
        </div>

        {/* Gender Identity */}
        <div>
          <label className="text-sm font-medium block mb-2">Gender Identity</label>
          <p className="text-xs text-ccb-muted mb-2.5">
            Determines which league divisions you're eligible for. Women's and Men's leagues run in parallel with the same prize pools.
          </p>

          {/* Verification status badge */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl mb-2.5 text-xs font-medium ${
            identityVerified
              ? "bg-ccb-success/10 text-ccb-success border border-ccb-success/30"
              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30"
          }`}>
            {identityVerified ? (
              <>
                <CheckCircle className="w-3.5 h-3.5" />
                Identity verified — your gender is confirmed for league eligibility
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5" />
                Identity not verified — gender-restricted leagues will be locked until an admin verifies your identity
              </>
            )}
          </div>

          {/* Warning if gender change will reset verification */}
          {genderChanged && !identityVerified && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-2.5 text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
              <AlertCircle className="w-3.5 h-3.5" />
              Changing your gender requires re-verification by an admin before you can join gender-restricted leagues.
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {GENDER_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isSelected = gender === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setGender(opt.value)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    isSelected
                      ? "border-ccb-primary bg-ccb-primary/10 text-ccb-primary"
                      : "border-ccb-border bg-ccb-surface hover:border-ccb-primary/30"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isSelected ? opt.color : "text-ccb-muted"}`} />
                  <span className={isSelected ? "" : "text-ccb-text"}>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium block mb-1.5">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="input min-h-[80px] resize-none"
            placeholder="Tell players about yourself"
            maxLength={200}
          />
        </div>

        <div>
          <label className="text-sm font-medium block mb-1.5">Phone (for withdrawals)</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="input"
            placeholder="+265 991 23 45 67"
          />
        </div>

        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            <Save className="w-4 h-4 mr-1" />
            {saving ? "Saving..." : "Save Changes"}
          </button>
          {saved && <span className="text-sm text-ccb-success">Saved!</span>}
          {error && <span className="text-sm text-ccb-danger">{error}</span>}
        </div>
      </div>

      {/* Account overview */}
      <div className="card p-4">
        <h3 className="font-bold text-base mb-3">Account</h3>
        <div className="space-y-3">
          <Link href={profile?.username ? `/profile/${profile.username}` : "/dashboard"} className="flex items-center justify-between hover:bg-ccb-surface -mx-2 px-2 py-2 rounded-lg transition-colors">
            <div className="flex items-center gap-2.5">
              <Trophy className="w-4 h-4 text-ccb-accent" />
              <span className="text-sm">Public Profile</span>
            </div>
            <ChevronRight className="w-4 h-4 text-ccb-muted" />
          </Link>
          <Link href="/wallet" className="flex items-center justify-between hover:bg-ccb-surface -mx-2 px-2 py-2 rounded-lg transition-colors">
            <div className="flex items-center gap-2.5">
              <Wallet className="w-4 h-4 text-ccb-accent" />
              <span className="text-sm">Wallet · {walletBalance}</span>
            </div>
            <ChevronRight className="w-4 h-4 text-ccb-muted" />
          </Link>
          <Link href="/history" className="flex items-center justify-between hover:bg-ccb-surface -mx-2 px-2 py-2 rounded-lg transition-colors">
            <div className="flex items-center gap-2.5">
              <Swords className="w-4 h-4 text-ccb-text" />
              <span className="text-sm">Game History</span>
            </div>
            <ChevronRight className="w-4 h-4 text-ccb-muted" />
          </Link>
        </div>
      </div>

      {/* Sign out */}
      <div className="card p-4">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm text-ccb-danger hover:opacity-80"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
