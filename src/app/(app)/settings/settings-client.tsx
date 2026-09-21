"use client";

import BoardThemePicker from "@/components/game/board-theme-picker";
import { getStoredBoardTheme, storeBoardTheme, BOARD_THEMES, type BoardTheme } from "@/lib/game/board-themes";
import { normalizeDepositPhone, depositPhoneFormatHint, depositPhonePlaceholder } from "@/lib/payments/deposit-phone-normalize";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  User, LogOut, Save, ChevronRight, Trophy, Swords, Wallet, Camera,
  AlertCircle, CheckCircle, Lock, Shield, Bell, Eye,
  Loader2, Upload, Clock, Smartphone, MapPin, GraduationCap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCurrency } from "@/hooks/use-currency";

interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  phone: string | null;
  phone_number: string | null;
  deposit_phone_numbers: string[] | null;
  gender: string | null;
  country: string | null;
  country_change_used: boolean | null;
  chesscom_username: string | null;
  chesscom_verified: boolean | null;
  identity_verified: boolean | null;
  identity_verification_method: string | null;
  identity_verified_at: string | null;
  full_name: string | null;
  rating: number | null;
  games_played: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  tournaments_played: number | null;
  tournaments_won: number | null;
  wallet_balance: number | null;
  is_admin: boolean | null;
}

type Tab = "profile" | "competitive" | "verification" | "preferences" | "notifications" | "privacy" | "security";

const TABS: { id: Tab; label: string; icon: typeof User }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "competitive", label: "Competitive", icon: Trophy },
  { id: "verification", label: "Verify", icon: Shield },
  { id: "preferences", label: "Preferences", icon: Swords },
  { id: "notifications", label: "Alerts", icon: Bell },
  { id: "privacy", label: "Privacy", icon: Eye },
  { id: "security", label: "Security", icon: Lock },
];

const COUNTRIES = [
  { code: "MW", name: "Malawi", flag: "🇲🇼" },
  { code: "ZM", name: "Zambia", flag: "🇿🇲" },
  { code: "KE", name: "Kenya", flag: "🇰🇪" },
  { code: "NG", name: "Nigeria", flag: "🇳🇬" },
  { code: "ZA", name: "South Africa", flag: "🇿🇦" },
  { code: "GH", name: "Ghana", flag: "🇬🇭" },
  { code: "TZ", name: "Tanzania", flag: "🇹🇿" },
  { code: "UG", name: "Uganda", flag: "🇺🇬" },
  { code: "RW", name: "Rwanda", flag: "🇷🇼" },
  { code: "ZW", name: "Zimbabwe", flag: "🇿🇼" },
  { code: "BW", name: "Botswana", flag: "🇧🇼" },
  { code: "CM", name: "Cameroon", flag: "🇨🇲" },
  { code: "EG", name: "Egypt", flag: "🇪🇬" },
  { code: "ET", name: "Ethiopia", flag: "🇪🇹" },
  { code: "MZ", name: "Mozambique", flag: "🇲🇿" },
  { code: "NA", name: "Namibia", flag: "🇳🇦" },
  { code: "SS", name: "South Sudan", flag: "🇸🇸" },
  { code: "SD", name: "Sudan", flag: "🇸🇩" },
  { code: "CD", name: "DR Congo", flag: "🇨🇩" },
  { code: "CG", name: "Congo", flag: "🇨🇬" },
  { code: "AO", name: "Angola", flag: "🇦🇴" },
  { code: "CI", name: "Côte d'Ivoire", flag: "🇨🇮" },
  { code: "SN", name: "Senegal", flag: "🇸🇳" },
  { code: "MA", name: "Morocco", flag: "🇲🇦" },
  { code: "LR", name: "Liberia", flag: "🇱🇷" },
  { code: "SL", name: "Sierra Leone", flag: "🇸🇱" },
  { code: "GM", name: "Gambia", flag: "🇬🇲" },
  { code: "BJ", name: "Benin", flag: "🇧🇯" },
  { code: "TG", name: "Togo", flag: "🇹🇬" },
  { code: "ML", name: "Mali", flag: "🇲🇱" },
  { code: "BF", name: "Burkina Faso", flag: "🇧🇫" },
  { code: "NE", name: "Niger", flag: "🇳🇪" },
  { code: "TD", name: "Chad", flag: "🇹🇩" },
  { code: "CF", name: "Central African Republic", flag: "🇨🇫" },
  { code: "BI", name: "Burundi", flag: "🇧🇮" },
  { code: "DJ", name: "Djibouti", flag: "🇩🇯" },
  { code: "ER", name: "Eritrea", flag: "🇪🇷" },
  { code: "SZ", name: "Eswatini", flag: "🇸🇿" },
  { code: "LS", name: "Lesotho", flag: "🇱🇸" },
  { code: "MG", name: "Madagascar", flag: "🇲🇬" },
  { code: "MU", name: "Mauritius", flag: "🇲🇺" },
  { code: "KM", name: "Comoros", flag: "🇰🇲" },
  { code: "ST", name: "São Tomé & Príncipe", flag: "🇸🇹" },
  { code: "GW", name: "Guinea-Bissau", flag: "🇬🇼" },
  { code: "GN", name: "Guinea", flag: "🇬🇳" },
  { code: "MR", name: "Mauritania", flag: "🇲🇷" },
  { code: "LY", name: "Libya", flag: "🇱🇾" },
  { code: "TN", name: "Tunisia", flag: "🇹🇳" },
  { code: "DZ", name: "Algeria", flag: "🇩🇿" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "AU", name: "Australia", flag: "🇦🇺" },
  { code: "IN", name: "India", flag: "🇮🇳" },
  { code: "CN", name: "China", flag: "🇨🇳" },
  { code: "JP", name: "Japan", flag: "🇯🇵" },
  { code: "KR", name: "South Korea", flag: "🇰🇷" },
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "ES", name: "Spain", flag: "🇪🇸" },
  { code: "IT", name: "Italy", flag: "🇮🇹" },
  { code: "PT", name: "Portugal", flag: "🇵🇹" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱" },
  { code: "BE", name: "Belgium", flag: "🇧🇪" },
  { code: "CH", name: "Switzerland", flag: "🇨🇭" },
  { code: "AT", name: "Austria", flag: "🇦🇹" },
  { code: "SE", name: "Sweden", flag: "🇸🇪" },
  { code: "NO", name: "Norway", flag: "🇳🇴" },
  { code: "DK", name: "Denmark", flag: "🇩🇰" },
  { code: "FI", name: "Finland", flag: "🇫🇮" },
  { code: "PL", name: "Poland", flag: "🇵🇱" },
  { code: "CZ", name: "Czech Republic", flag: "🇨🇿" },
  { code: "RU", name: "Russia", flag: "🇷🇺" },
  { code: "UA", name: "Ukraine", flag: "🇺🇦" },
  { code: "TR", name: "Turkey", flag: "🇹🇷" },
  { code: "GR", name: "Greece", flag: "🇬🇷" },
  { code: "IE", name: "Ireland", flag: "🇮🇪" },
  { code: "BR", name: "Brazil", flag: "🇧🇷" },
  { code: "AR", name: "Argentina", flag: "🇦🇷" },
  { code: "MX", name: "Mexico", flag: "🇲🇽" },
  { code: "CO", name: "Colombia", flag: "🇨🇴" },
  { code: "CL", name: "Chile", flag: "🇨🇱" },
  { code: "PE", name: "Peru", flag: "🇵🇪" },
  { code: "VE", name: "Venezuela", flag: "🇻🇪" },
  { code: "UY", name: "Uruguay", flag: "🇺🇾" },
  { code: "EC", name: "Ecuador", flag: "🇪🇨" },
  { code: "BO", name: "Bolivia", flag: "🇧🇴" },
  { code: "PY", name: "Paraguay", flag: "🇵🇾" },
  { code: "SG", name: "Singapore", flag: "🇸🇬" },
  { code: "MY", name: "Malaysia", flag: "🇲🇾" },
  { code: "TH", name: "Thailand", flag: "🇹🇭" },
  { code: "ID", name: "Indonesia", flag: "🇮🇩" },
  { code: "PH", name: "Philippines", flag: "🇵🇭" },
  { code: "VN", name: "Vietnam", flag: "🇻🇳" },
  { code: "PK", name: "Pakistan", flag: "🇵🇰" },
  { code: "BD", name: "Bangladesh", flag: "🇧🇩" },
  { code: "LK", name: "Sri Lanka", flag: "🇱🇰" },
  { code: "NP", name: "Nepal", flag: "🇳🇵" },
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪" },
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "QA", name: "Qatar", flag: "🇶🇦" },
  { code: "KW", name: "Kuwait", flag: "🇰🇼" },
  { code: "BH", name: "Bahrain", flag: "🇧🇭" },
  { code: "OM", name: "Oman", flag: "🇴🇲" },
  { code: "JO", name: "Jordan", flag: "🇯🇴" },
  { code: "LB", name: "Lebanon", flag: "🇱🇧" },
  { code: "IQ", name: "Iraq", flag: "🇮🇶" },
  { code: "IR", name: "Iran", flag: "🇮🇷" },
  { code: "IL", name: "Israel", flag: "🇮🇱" },
  { code: "NZ", name: "New Zealand", flag: "🇳🇿" },
  { code: "Other", name: "Other / Not Listed", flag: "🌍" },
];

const GENDER_OPTIONS = [
  { value: "male", label: "Male", icon: User, color: "text-blue-400" },
  { value: "female", label: "Female", icon: User, color: "text-pink-400" },
];

const ToggleRow = ({ label, description, value, onChange }: { label: string; description?: string; value: boolean; onChange: (v: boolean) => void }) => (
  <div className="flex items-center justify-between py-2.5">
    <div className="flex-1 pr-3"><p className="text-sm font-medium text-ccb-text">{label}</p>{description && <p className="text-xs text-ccb-muted mt-0.5">{description}</p>}</div>
    <button type="button" onClick={() => onChange(!value)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${value ? "bg-ccb-primary" : "bg-ccb-border"}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  </div>
);
const SectionCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="card p-4 space-y-4"><h3 className="font-bold text-base">{title}</h3>{children}</div>
);
const SaveButton = ({ onSave, saving, saved, error }: { onSave: () => void; saving: boolean; saved: boolean; error: string | null }) => (
  <div className="flex items-center gap-3 pt-1">
    <button onClick={onSave} disabled={saving} className="btn-primary"><Save className="w-4 h-4 mr-1" />{saving ? "Saving..." : "Save Changes"}</button>
    {saved && <span className="text-sm text-ccb-success">Saved!</span>}
    {error && <span className="text-sm text-ccb-danger">{error}</span>}
  </div>
);

// Push notifications — WhatsApp-style. Shows current state and lets the
// player toggle subscription for this device.
function NotificationsSection() {
  const [state, setState] = useState<"checking" | "unsupported" | "denied" | "off" | "on">("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { pushSupported, getPushState } = await import("@/lib/push/client");
        if (!pushSupported()) { setState("unsupported"); return; }
        setState(await getPushState());
      } catch { setState("unsupported"); }
    })();
  }, []);

  const toggle = async () => {
    setBusy(true);
    const { enablePush, disablePush, getPushState } = await import("@/lib/push/client");
    if (state === "on") {
      await disablePush();
    } else {
      await enablePush();
    }
    setState(await getPushState());
    setBusy(false);
  };

  return (
    <SectionCard title="Notifications">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Bell className="w-4 h-4 text-ccb-accent" />
          <div>
            <p className="text-sm">Push notifications</p>
            <p className="text-xs text-ccb-muted mt-0.5">
              {state === "checking" && "Checking…"}
              {state === "on" && "On — messages, turns & battles alert you"}
              {state === "off" && "Off — tap to turn on"}
              {state === "denied" && "Blocked — allow notifications for this site in your browser settings"}
              {state === "unsupported" && "Not supported here. iOS: install the app to your home screen first"}
            </p>
          </div>
        </div>
        <button
          onClick={toggle}
          disabled={busy || state === "checking" || state === "unsupported"}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border shrink-0 transition-colors disabled:opacity-50 ${
            state === "on"
              ? "bg-ccb-surface text-ccb-muted border-ccb-border"
              : "bg-ccb-primary text-white border-ccb-primary"
          }`}
        >
          {busy ? "…" : state === "on" ? "Turn off" : "Turn on"}
        </button>
      </div>
    </SectionCard>
  );
}

export default function SettingsClient({ profile, userId }: { profile: Profile | null; userId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const { formatWallet } = useCurrency();
  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [phone, setPhone] = useState(profile?.phone || profile?.phone_number || "");
  const [depositPhones, setDepositPhones] = useState<string[]>(profile?.deposit_phone_numbers || []);
  const [newDepositPhone, setNewDepositPhone] = useState("");
  const [depositPhoneErr, setDepositPhoneErr] = useState<string | null>(null);
  const [depositPhoneMsg, setDepositPhoneMsg] = useState<string | null>(null);
  const [depositPhoneSaving, setDepositPhoneSaving] = useState(false);
  const [gender, setGender] = useState(profile?.gender || "");
  const [country, setCountry] = useState(profile?.country || "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url || null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [identityVerified, setIdentityVerified] = useState(profile?.identity_verified || false);
  const [defaultTimeControl, setDefaultTimeControl] = useState("15+10");
  const [boardTheme, setBoardTheme] = useState<BoardTheme>(BOARD_THEMES[1]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [moveAnimations, setMoveAnimations] = useState(true);
  const [autoQueen, setAutoQueen] = useState(false);
  const [showCoordinates, setShowCoordinates] = useState(true);
  const [notifTournaments, setNotifTournaments] = useState(true);
  const [notifInvites, setNotifInvites] = useState(true);
  const [notifResults, setNotifResults] = useState(true);
  const [notifDigest, setNotifDigest] = useState(false);
  const [notifWhatsApp, setNotifWhatsApp] = useState(true);
  const [profileVisibility, setProfileVisibility] = useState("public");
  const [showRealName, setShowRealName] = useState(false);
  const [showOnlineStatus, setShowOnlineStatus] = useState(true);
  const [allowSpectators, setAllowSpectators] = useState(true);
  const [showRating, setShowRating] = useState(true);
  const [kycDocType, setKycDocType] = useState("national_id");
  const [kycDocNumber, setKycDocNumber] = useState("");
  const [kycDocFile, setKycDocFile] = useState<File | null>(null);
  const [kycSelfieFile, setKycSelfieFile] = useState<File | null>(null);
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [kycError, setKycError] = useState<string | null>(null);
  const [kycLatest, setKycLatest] = useState<any>(null);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  // Real KYC status from the server (PawaPay compliance upgrade 2026-09-15)
  useEffect(() => {
    fetch("/api/kyc/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d && !d.error) { setIdentityVerified(!!d.verified); setKycLatest(d.latest || null); } })
      .catch(() => {});
  }, []);
  const [newPassword, setNewPassword] = useState("");
  const [passwordUpdating, setPasswordUpdating] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefs = localStorage.getItem("ccb_prefs");
    if (prefs) {
      try {
        const p = JSON.parse(prefs);
        if (p.defaultTimeControl) setDefaultTimeControl(p.defaultTimeControl);
        // Board theme is stored separately in ccb-board-theme
        const stored = getStoredBoardTheme();
        setBoardTheme(stored);
        if (p.soundEnabled !== undefined) setSoundEnabled(p.soundEnabled);
        if (p.moveAnimations !== undefined) setMoveAnimations(p.moveAnimations);
        if (p.autoQueen !== undefined) setAutoQueen(p.autoQueen);
        if (p.showCoordinates !== undefined) setShowCoordinates(p.showCoordinates);
        if (p.notifTournaments !== undefined) setNotifTournaments(p.notifTournaments);
        if (p.notifInvites !== undefined) setNotifInvites(p.notifInvites);
        if (p.notifResults !== undefined) setNotifResults(p.notifResults);
        if (p.notifDigest !== undefined) setNotifDigest(p.notifDigest);
        if (p.notifWhatsApp !== undefined) setNotifWhatsApp(p.notifWhatsApp);
        if (p.profileVisibility) setProfileVisibility(p.profileVisibility);
        if (p.showRealName !== undefined) setShowRealName(p.showRealName);
        if (p.showOnlineStatus !== undefined) setShowOnlineStatus(p.showOnlineStatus);
        if (p.allowSpectators !== undefined) setAllowSpectators(p.allowSpectators);
        if (p.showRating !== undefined) setShowRating(p.showRating);
      } catch {}
    }
  }, []);

  const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let w = img.width, h = img.height; const max = 256;
          if (w > max || h > max) { if (w > h) { h = Math.round(h*max/w); w = max; } else { w = Math.round(w*max/h); h = max; } }
          const c = document.createElement("canvas"); c.width = w; c.height = h;
          const ctx = c.getContext("2d"); if (!ctx) { reject(new Error("ctx")); return; }
          ctx.drawImage(img, 0, 0, w, h);
          c.toBlob((b) => b ? resolve(b) : reject(new Error("blob")), "image/jpeg", 0.8);
        };
        img.onerror = () => reject(new Error("img"));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error("read"));
      reader.readAsDataURL(file);
    });
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setAvatarUploading(true); setAvatarError(null);
    try {
      const blob = await compressImage(file);
      const path = `${userId}/${Date.now()}.jpg`;
      const { error: ue } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
      if (ue) throw ue;
      const { data: ud } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: pe } = await supabase.from("profiles").update({ avatar_url: ud.publicUrl }).eq("id", userId);
      if (pe) throw pe;
      setAvatarUrl(ud.publicUrl); router.refresh();
    } catch (err: any) { setAvatarError(err.message || "Upload failed"); }
    finally { setAvatarUploading(false); if (e.target) e.target.value = ""; }
  };

  // Deposit phone numbers: max 3, used for deposits/mobile payments only.
  // Fully editable by the player (migration 091 unlocked the list);
  // deposits still only pay out to numbers on the list — the OTP-spam
  // guard lives in the payment routes, not the lock anymore.
  const addDepositPhone = async () => {
    const num = newDepositPhone.trim();
    setDepositPhoneErr(null); setDepositPhoneMsg(null);

    // Canonicalize for the player's country BEFORE saving — players paste
    // "+265 991 23 45 67", "265991234567", "991234567" etc.; the list now
    // stores one clean local form per country (09… for MW, 0… for ZM/KE),
    // so display, dedupe and the payment rails all see the same shape.
    const { phone: canonical, error: normErr } = normalizeDepositPhone(num, country);
    if (normErr || !canonical) { setDepositPhoneErr(normErr || "Enter a valid mobile number."); return; }

    if (depositPhones.length >= 3) { setDepositPhoneErr("You can save up to 3 deposit numbers — remove one first to add another."); return; }
    const last9 = (n: string) => n.replace(/\D/g, "").slice(-9);
    if (depositPhones.some((p) => last9(p) === last9(canonical))) { setDepositPhoneErr("That number is already in your list."); return; }
    const next = [...depositPhones, canonical];
    setDepositPhoneSaving(true);
    const { error } = await supabase.from("profiles").update({ deposit_phone_numbers: next }).eq("id", userId);
    setDepositPhoneSaving(false);
    if (error) {
      setDepositPhoneErr(error.message);
      return;
    }
    setDepositPhones(next);
    setNewDepositPhone("");
    setDepositPhoneMsg(`Saved ${canonical}.`);
  };

  const removeDepositPhone = async (num: string) => {
    const next = depositPhones.filter((p) => p !== num);
    setDepositPhoneErr(null); setDepositPhoneMsg(null);
    setDepositPhoneSaving(true);
    const { error } = await supabase.from("profiles").update({ deposit_phone_numbers: next }).eq("id", userId);
    setDepositPhoneSaving(false);
    if (error) { setDepositPhoneErr(error.message); return; }
    setDepositPhones(next);
    setDepositPhoneMsg("Removed.");
  };

  const handleSaveProfile = async () => {
    setSaving(true); setError(null);
    const updates: Record<string, any> = { display_name: displayName, bio, phone, country };
    if (gender && !profile?.gender) updates.gender = gender;
    const { error } = await supabase.from("profiles").update(updates).eq("id", userId);
    if (error) {
      const msg = error.message || "";
      if (msg.includes("COUNTRY_CHANGE_USED")) {
        setError("Country can only be changed once — contact support if you need to change it again.");
      } else if (msg.includes("COUNTRY_CHANGE_BLOCKED")) {
        setError("You have a withdrawal being processed — wait for it to complete before changing country.");
      } else if (msg.includes("COUNTRY_CHANGE_FX")) {
        setError("Currency conversion is temporarily unavailable — please try again shortly.");
      } else {
        setError(msg);
      }
    } else { setSaved(true); setTimeout(() => setSaved(false), 2000); router.refresh(); }
    setSaving(false);
  };

  const saveClientPrefs = () => {
    localStorage.setItem("ccb_prefs", JSON.stringify({
      defaultTimeControl, soundEnabled, moveAnimations, autoQueen, showCoordinates,
      notifTournaments, notifInvites, notifResults, notifDigest, notifWhatsApp,
      profileVisibility, showRealName, showOnlineStatus, allowSpectators, showRating,
    }));
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) { setPasswordError("Min 8 characters"); return; }
    setPasswordUpdating(true); setPasswordError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) setPasswordError(error.message); else { setPasswordSuccess(true); setNewPassword(""); setTimeout(() => setPasswordSuccess(false), 3000); }
    } catch (err: any) { setPasswordError(err.message); }
    finally { setPasswordUpdating(false); }
  };

  const handleLogout = async () => { await supabase.auth.signOut(); router.push("/"); router.refresh(); };

  const walletBalance = formatWallet(profile?.wallet_balance ?? 0);
  const winRate = profile?.games_played && profile.games_played > 0 ? Math.round(((profile.wins||0)/profile.games_played)*100) : 0;







  return (
    <div className="space-y-4 sm:space-y-6 pb-24 sm:pb-6 max-w-2xl">
      <div className="sticky top-0 z-10 -mx-4 px-4 sm:mx-0 sm:px-0 py-2 bg-ccb-dark/95 backdrop-blur-sm">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          {TABS.map((tab) => { const Icon = tab.icon; const isActive = activeTab === tab.id; return (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSaved(false); setError(null); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${isActive ? "bg-ccb-primary text-white" : "bg-ccb-surface text-ccb-muted hover:text-ccb-text border border-ccb-border"}`}>
              <Icon className="w-3.5 h-3.5" />{tab.label}
            </button>); })}
        </div>
      </div>

      {activeTab === "profile" && (
        <div className="space-y-4">
          <SectionCard title="Profile">
            <div className="space-y-2">
              <label className="text-sm font-medium block">Profile Picture</label>
              <div className="flex items-center gap-4">
                <div className="relative w-20 h-20 rounded-full overflow-hidden bg-ccb-surface border border-ccb-border flex items-center justify-center shrink-0">
                  {avatarUrl ? <img src={avatarUrl} alt="Avatar" className="w-20 h-20 rounded-full object-cover" /> : <User className="w-10 h-10 text-ccb-muted" />}
                  {avatarUploading && <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-xs text-white">Uploading...</div>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <input type="file" ref={fileInputRef} onChange={handleAvatarChange} accept="image/*" className="hidden" />
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={avatarUploading} className="btn-secondary text-xs flex items-center gap-1.5 px-3 py-2">
                    <Camera className="w-3.5 h-3.5" />{avatarUploading ? "Uploading..." : "Change Photo"}
                  </button>
                  {avatarError && <span className="text-xs text-ccb-danger">{avatarError}</span>}
                </div>
              </div>
            </div>
            <div><label className="text-sm font-medium block mb-1.5">Display Name</label><input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="input" placeholder="Your name" maxLength={30} /></div>
            <div>
              <label className="text-sm font-medium block mb-1.5">Country</label>
              <p className="text-xs text-ccb-muted mb-2">Used for division eligibility and regional competitions.</p>
              <div className="relative">
                <MapPin className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${profile?.country_change_used ? "text-ccb-muted/50" : "text-ccb-muted"}`} />
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  disabled={!!profile?.country_change_used}
                  className={`input pl-10 appearance-none ${profile?.country_change_used ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                >
                  <option value="">Select your country</option>
                  {COUNTRIES.map((c) => <option key={c.code+c.name} value={c.code}>{c.flag} {c.name}</option>)}
                </select>
              </div>
              <p className="text-xs text-ccb-muted mt-1.5">
                {profile?.country_change_used
                  ? "Your country is locked — you've used your one change. Contact support if you need to change it again."
                  : "You can change your country once — it locks permanently after that."}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium block mb-2">Gender Identity</label>
              <p className="text-xs text-ccb-muted mb-2.5">Part of your player profile.</p>
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl mb-2.5 text-xs font-medium ${identityVerified ? "bg-ccb-success/10 text-ccb-success border border-ccb-success/30" : "bg-ccb-surface text-ccb-muted border border-ccb-border"}`}>
                {identityVerified ? <><CheckCircle className="w-3.5 h-3.5" /> Identity verified</> : <><AlertCircle className="w-3.5 h-3.5" /> Not verified</>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {GENDER_OPTIONS.map((opt) => { const Icon = opt.icon; const sel = gender === opt.value; const locked = !!profile?.gender; return (
                  <button key={opt.value} type="button" disabled={locked} onClick={() => !locked && setGender(opt.value)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${locked ? "opacity-50 cursor-not-allowed" : ""} ${sel ? "border-ccb-primary bg-ccb-primary/10 text-ccb-primary" : "border-ccb-border bg-ccb-surface hover:border-ccb-primary/30"}`}>
                    <Icon className={`w-4 h-4 ${sel ? opt.color : "text-ccb-muted"}`} /><span className={sel ? "" : "text-ccb-text"}>{opt.label}</span>
                  </button>);})}
              </div>
              {profile?.gender && <p className="text-xs text-ccb-muted mt-2 flex items-center gap-1.5"><Lock className="w-3 h-3" /> Gender is locked. Contact an admin to change.</p>}
            </div>
            <div><label className="text-sm font-medium block mb-1.5">Bio</label><textarea value={bio} onChange={(e) => setBio(e.target.value)} className="input min-h-[80px] resize-none" placeholder="Tell players about yourself" maxLength={200} /></div>
            <div><label className="text-sm font-medium block mb-1.5">Phone (for withdrawals)</label><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="input" placeholder="+265 991 23 45 67" /><p className="text-xs text-ccb-muted mt-1">Withdrawals can go to any number — this is just a convenience default.</p></div>
            <div>
              <label className="text-sm font-medium block mb-1.5">Deposit phone numbers</label>
              <p className="text-xs text-ccb-muted mb-2">Deposits and mobile payments can only use these numbers. You can add or remove them anytime. Maximum 3.</p>
              <div className="flex items-start gap-2 px-3 py-2 mb-2 rounded-xl bg-ccb-surface border border-ccb-border text-xs text-ccb-muted">
                <Smartphone className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{depositPhoneFormatHint(country)}</span>
              </div>
              {depositPhones.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {depositPhones.map((dp) => (
                    <div key={dp} className="flex items-center justify-between px-3 py-2 rounded-xl bg-ccb-surface border border-ccb-border text-sm">
                      <span>{dp}</span>
                      <button type="button" onClick={() => removeDepositPhone(dp)} disabled={depositPhoneSaving} className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors">Remove</button>
                    </div>
                  ))}
                </div>
              )}
              {depositPhones.length < 3 && (
                <div className="flex gap-2">
                  <input type="tel" value={newDepositPhone} onChange={(e) => { setNewDepositPhone(e.target.value); setDepositPhoneErr(null); setDepositPhoneMsg(null); }} className="input flex-1" placeholder={depositPhonePlaceholder(country)} disabled={depositPhoneSaving} />
                  <button type="button" onClick={addDepositPhone} disabled={depositPhoneSaving || !newDepositPhone.trim()} className="shrink-0 px-4 py-2.5 rounded-xl bg-ccb-primary text-white text-sm font-semibold hover:bg-ccb-primary/90 disabled:opacity-50 transition-colors">{depositPhoneSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}</button>
                </div>
              )}
              {depositPhoneErr && <p className="text-xs text-red-500 mt-1.5">{depositPhoneErr}</p>}
              {depositPhoneMsg && <p className="text-xs text-ccb-success mt-1.5">{depositPhoneMsg}</p>}
            </div>
            <SaveButton onSave={handleSaveProfile} saving={saving} saved={saved} error={error} />
          </SectionCard>
          <SectionCard title="Account">
            <div className="space-y-3">
              <Link href={profile?.username ? `/profile/${profile.username}` : "/dashboard"} className="flex items-center justify-between hover:bg-ccb-surface -mx-2 px-2 py-2 rounded-lg transition-colors"><div className="flex items-center gap-2.5"><Trophy className="w-4 h-4 text-ccb-accent" /><span className="text-sm">Public Profile</span></div><ChevronRight className="w-4 h-4 text-ccb-muted" /></Link>
              <Link href="/wallet" className="flex items-center justify-between hover:bg-ccb-surface -mx-2 px-2 py-2 rounded-lg transition-colors"><div className="flex items-center gap-2.5"><Wallet className="w-4 h-4 text-ccb-accent" /><span className="text-sm">Wallet · {walletBalance}</span></div><ChevronRight className="w-4 h-4 text-ccb-muted" /></Link>
              <Link href="/history" className="flex items-center justify-between hover:bg-ccb-surface -mx-2 px-2 py-2 rounded-lg transition-colors"><div className="flex items-center gap-2.5"><Swords className="w-4 h-4 text-ccb-text" /><span className="text-sm">Game History</span></div><ChevronRight className="w-4 h-4 text-ccb-muted" /></Link>
              <Link href="/academy" className="flex items-center justify-between hover:bg-ccb-surface -mx-2 px-2 py-2 rounded-lg transition-colors"><div className="flex items-center gap-2.5"><GraduationCap className="w-4 h-4 text-ccb-accent" /><span className="text-sm">Chess Academy</span></div><ChevronRight className="w-4 h-4 text-ccb-muted" /></Link>
            </div>
          </SectionCard>
          <NotificationsSection />
        </div>
      )}

      {activeTab === "competitive" && (
        <div className="space-y-4">
          <SectionCard title="Competitive Profile">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-ccb-border bg-ccb-surface p-3"><p className="text-xs text-ccb-muted">Chess Rating</p><p className="text-2xl font-bold text-ccb-primary mt-1">{profile?.rating || 1500}</p></div>
              <div className="rounded-xl border border-ccb-border bg-ccb-surface p-3"><p className="text-xs text-ccb-muted">Games Played</p><p className="text-2xl font-bold text-ccb-text mt-1">{profile?.games_played || 0}</p></div>
              <div className="rounded-xl border border-ccb-border bg-ccb-surface p-3"><p className="text-xs text-ccb-muted">Win Rate</p><p className="text-2xl font-bold text-ccb-success mt-1">{winRate}%</p></div>
              <div className="rounded-xl border border-ccb-border bg-ccb-surface p-3"><p className="text-xs text-ccb-muted">Tournaments</p><p className="text-2xl font-bold text-ccb-accent mt-1">{profile?.tournaments_played || 0}</p></div>
            </div>
          </SectionCard>
          <SectionCard title="Chess.com Link">
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-medium">{profile?.chesscom_username || "Not linked"}</p><p className="text-xs text-ccb-muted mt-0.5">{profile?.chesscom_verified ? "Verified ✓" : "Link for rating verification"}</p></div>
              {profile?.chesscom_verified ? <span className="text-xs px-2.5 py-1 rounded-lg bg-ccb-success/10 text-ccb-success border border-ccb-success/30 font-medium">Verified</span> : <Link href="/signup?step=2" className="text-xs px-3 py-1.5 rounded-lg bg-ccb-primary/10 text-ccb-primary border border-ccb-primary/30 font-medium hover:bg-ccb-primary/20">Link</Link>}
            </div>
          </SectionCard>
        </div>
      )}

      {activeTab === "verification" && (
        <div className="space-y-4">
          <SectionCard title="Identity Verification">
            <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl mb-4 text-xs font-medium ${identityVerified ? "bg-ccb-success/10 text-ccb-success border border-ccb-success/30" : "bg-ccb-surface text-ccb-muted border border-ccb-border"}`}>
              {identityVerified ? <><CheckCircle className="w-4 h-4" /> Verified</> : <><AlertCircle className="w-4 h-4" /> Not verified</>}
            </div>
            <p className="text-sm text-ccb-muted mb-4">Verify your identity with a government document to unlock competitive tournaments and full wallet features. Documents are reviewed by admins and kept confidential.</p>

            {identityVerified ? (
              <div className="rounded-xl bg-ccb-success/5 border border-ccb-success/30 p-4 space-y-2">
                <p className="text-sm font-semibold text-ccb-success">Your identity is verified ✓</p>
                {profile?.identity_verified_at && <p className="text-xs text-ccb-muted">Verified on {new Date(profile.identity_verified_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>}
                <p className="text-xs text-ccb-muted">Competitive tournaments and wallet features are fully unlocked.</p>
              </div>
            ) : kycLatest && kycLatest.status === "pending" ? (
              <div className="rounded-xl bg-amber-500/5 border border-amber-500/30 p-4 space-y-2">
                <p className="text-sm font-semibold text-amber-500">Under review</p>
                <p className="text-xs text-ccb-muted">Your {kycLatest.doc_type === "national_id" ? "national ID" : kycLatest.doc_type === "passport" ? "passport" : "driver's licence"} (••••{String(kycLatest.doc_number || "").slice(-4)}) was submitted {kycLatest.created_at ? new Date(kycLatest.created_at).toLocaleDateString() : ""} and is being reviewed by an admin. You'll get a notification when it's done.</p>
              </div>
            ) : (
              <>
                {kycLatest && kycLatest.status === "rejected" && (
                  <div className="rounded-xl bg-destructive/5 border border-destructive/30 p-4 mb-4 space-y-1">
                    <p className="text-sm font-semibold text-destructive">Your last submission was rejected</p>
                    <p className="text-xs text-ccb-muted">{kycLatest.rejection_reason || "Please resubmit with clearer images."}</p>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5">Document type</label>
                      <select value={kycDocType} onChange={(e) => setKycDocType(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-ccb-surface border border-ccb-border text-sm">
                        <option value="national_id">National ID</option>
                        <option value="passport">Passport</option>
                        <option value="drivers_license">Driver&apos;s Licence</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5">Document number</label>
                      <input value={kycDocNumber} onChange={(e) => setKycDocNumber(e.target.value)} placeholder="e.g. ID number" className="w-full px-3 py-2.5 rounded-xl bg-ccb-surface border border-ccb-border text-sm" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2"><div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${kycDocFile ? "bg-ccb-success text-white" : "bg-ccb-surface border border-ccb-border text-ccb-muted"}`}>{kycDocFile ? "✓" : "1"}</div><p className="text-sm font-medium">Government ID</p></div>
                    <p className="text-xs text-ccb-muted pl-9">A clear photo of the front of your document</p>
                    <div className="pl-9"><label className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-ccb-border bg-ccb-surface/50 cursor-pointer hover:border-ccb-primary/30 text-xs text-ccb-muted hover:text-ccb-text transition-colors"><Upload className="w-3.5 h-3.5" />{kycDocFile ? kycDocFile.name : "Upload ID"}<input type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) { setKycDocFile(e.target.files[0]); setKycError(null); } }} /></label></div>
                  </div>

                  <div className="space-y-2 pt-2">
                    <div className="flex items-center gap-2"><div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${kycSelfieFile ? "bg-ccb-success text-white" : "bg-ccb-surface border border-ccb-border text-ccb-muted"}`}>{kycSelfieFile ? "✓" : "2"}</div><p className="text-sm font-medium">Selfie Verification</p></div>
                    <p className="text-xs text-ccb-muted pl-9">A clear selfie holding your ID</p>
                    <div className="pl-9"><label className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-ccb-border bg-ccb-surface/50 cursor-pointer hover:border-ccb-primary/30 text-xs text-ccb-muted hover:text-ccb-text transition-colors"><Camera className="w-3.5 h-3.5" />{kycSelfieFile ? kycSelfieFile.name : "Upload selfie"}<input type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) { setKycSelfieFile(e.target.files[0]); setKycError(null); } }} /></label></div>
                  </div>

                  {kycError && <p className="text-xs text-destructive">{kycError}</p>}

                  <button
                    onClick={async () => {
                      setKycError(null);
                      if (!kycDocNumber.trim()) { setKycError("Enter your document number."); return; }
                      if (!kycDocFile || !kycSelfieFile) { setKycError("Upload both your ID document and a selfie."); return; }
                      setKycSubmitting(true);
                      try {
                        const fd = new FormData();
                        fd.append("docType", kycDocType);
                        fd.append("docNumber", kycDocNumber.trim());
                        fd.append("docFile", kycDocFile);
                        fd.append("selfieFile", kycSelfieFile);
                        const res = await fetch("/api/kyc/submit", { method: "POST", body: fd });
                        const d = await res.json();
                        if (!res.ok) throw new Error(d.error || "Submission failed");
                        const st = await fetch("/api/kyc/status", { cache: "no-store" }).then((r) => r.json());
                        setKycLatest(st.latest || null);
                      } catch (err: any) {
                        setKycError(err.message || "Submission failed. Try again.");
                      } finally {
                        setKycSubmitting(false);
                      }
                    }}
                    disabled={kycSubmitting}
                    className="btn-primary w-full"
                  >
                    {kycSubmitting ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Submitting...</> : <><Shield className="w-4 h-4 mr-1" /> Submit for review</>}
                  </button>
                  <p className="text-xs text-ccb-muted text-center">An admin will review your documents. You&apos;ll be notified when complete.</p>
                </div>
              </>
            )}
          </SectionCard>
        </div>
      )}

            {activeTab === "preferences" && (
        <div className="space-y-4">
          <SectionCard title="Game Preferences">
            <div><label className="text-sm font-medium block mb-1.5">Default Time Control</label><select value={defaultTimeControl} onChange={(e) => setDefaultTimeControl(e.target.value)} className="input cursor-pointer"><option value="15+10">15+10 (Rapid)</option><option value="10+5">10+5 (Rapid)</option><option value="5+3">5+3 (Blitz)</option><option value="3+2">3+2 (Blitz)</option><option value="1+0">1+0 (Bullet)</option></select></div>
            <div>
              <label className="text-sm font-medium block mb-1.5">Board Theme</label>
              <BoardThemePicker
                inline
                onThemeChange={(theme) => { setBoardTheme(theme); storeBoardTheme(theme.id); }}
              />
            </div>
            <div className="divide-y divide-ccb-border">
              <ToggleRow label="Sound Effects" description="Move sounds, captures, check" value={soundEnabled} onChange={setSoundEnabled} />
              <ToggleRow label="Move Animations" description="Animate piece movements" value={moveAnimations} onChange={setMoveAnimations} />
              <ToggleRow label="Auto-Queen" description="Always promote to queen" value={autoQueen} onChange={setAutoQueen} />
              <ToggleRow label="Show Coordinates" description="Algebraic notation on edges" value={showCoordinates} onChange={setShowCoordinates} />
            </div>
          </SectionCard>
          <SaveButton onSave={saveClientPrefs} saving={saving} saved={saved} error={error} />
        </div>
      )}

      {activeTab === "notifications" && (
        <div className="space-y-4">
          <SectionCard title="Notifications">
            <div className="divide-y divide-ccb-border">
              <ToggleRow label="Tournament Reminders" description="Before tournaments start" value={notifTournaments} onChange={setNotifTournaments} />
              <ToggleRow label="Game Invitations" description="When someone challenges you" value={notifInvites} onChange={setNotifInvites} />
              <ToggleRow label="Match Results" description="Summary when games end" value={notifResults} onChange={setNotifResults} />
              <ToggleRow label="Weekly Digest" description="Email summary" value={notifDigest} onChange={setNotifDigest} />
              <ToggleRow label="WhatsApp Updates" description="Via WhatsApp group" value={notifWhatsApp} onChange={setNotifWhatsApp} />
            </div>
          </SectionCard>
          <SaveButton onSave={saveClientPrefs} saving={saving} saved={saved} error={error} />
        </div>
      )}

      {activeTab === "privacy" && (
        <div className="space-y-4">
          <SectionCard title="Privacy">
            <div><label className="text-sm font-medium block mb-1.5">Profile Visibility</label><select value={profileVisibility} onChange={(e) => setProfileVisibility(e.target.value)} className="input cursor-pointer"><option value="public">Public</option><option value="friends">Friends only</option><option value="private">Private</option></select></div>
            <div className="divide-y divide-ccb-border">
              <ToggleRow label="Show Real Name" description="On your profile" value={showRealName} onChange={setShowRealName} />
              <ToggleRow label="Online Status" description="Show when online" value={showOnlineStatus} onChange={setShowOnlineStatus} />
              <ToggleRow label="Allow Spectators" description="Watch your live games" value={allowSpectators} onChange={setAllowSpectators} />
              <ToggleRow label="Show Rating" description="To opponents in matchmaking" value={showRating} onChange={setShowRating} />
            </div>
          </SectionCard>
          <SaveButton onSave={saveClientPrefs} saving={saving} saved={saved} error={error} />
        </div>
      )}

      {activeTab === "security" && (
        <div className="space-y-4">
          <SectionCard title="Security">
            <div>
              <button onClick={() => setShowPasswordForm(!showPasswordForm)} className="flex items-center justify-between w-full text-sm font-medium hover:text-ccb-primary transition-colors"><span>Change Password</span><ChevronRight className={`w-4 h-4 text-ccb-muted transition-transform ${showPasswordForm ? "rotate-90" : ""}`} /></button>
              {showPasswordForm && <div className="mt-3 space-y-3"><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input" placeholder="New password (min 8 chars)" />{passwordError && <p className="text-xs text-ccb-danger">{passwordError}</p>}{passwordSuccess && <p className="text-xs text-ccb-success">Password updated!</p>}<button onClick={handleChangePassword} disabled={passwordUpdating} className="btn-primary text-sm">{passwordUpdating ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Updating...</> : "Update Password"}</button></div>}
            </div>
            <div className="divide-y divide-ccb-border pt-2"><div className="flex items-center justify-between py-2.5"><div className="flex items-center gap-2.5"><Smartphone className="w-4 h-4 text-ccb-muted" /><span className="text-sm">This Device</span></div><span className="text-xs text-ccb-muted">Current session</span></div></div>
          </SectionCard>
          <SectionCard title="Sign Out"><button onClick={handleLogout} className="flex items-center gap-2 text-sm text-ccb-danger hover:opacity-80"><LogOut className="w-4 h-4" /> Sign Out</button></SectionCard>
        </div>
      )}
    </div>
  );
}
