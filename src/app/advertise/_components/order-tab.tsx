"use client";

import { useState } from "react";
import { Loader2, ImagePlus, Upload, X, ArrowLeft, ArrowRight, Check } from "lucide-react";
import CreativeImage from "@/components/ads/creative-image";
import { adTiers, AD_TARGET_COUNTRIES, type AdWeeks } from "@/lib/ads/direct-pricing";
import { useCurrency } from "@/hooks/use-currency";
import { compressImage } from "@/components/chat/compress-image";
import { createClient } from "@/lib/supabase/client";
import { type AudienceStats, COUNTRY_LABELS, reachSentence, ratioLabel } from "./shared";

const STEPS = ["Creative", "Audience", "Checkout"] as const;

export default function OrderTab({
  audience,
  walletBalance,
  pricePerWeekMwk,
  onOrdered,
}: {
  audience: AudienceStats | null;
  walletBalance: number;
  pricePerWeekMwk: number;
  onOrdered: () => void;
}) {
  const { formatMoney } = useCurrency();
  const tiers = adTiers(pricePerWeekMwk || 5000);
  const [step, setStep] = useState(0);

  // form state
  const [businessName, setBusinessName] = useState("");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [targetUrl, setTargetUrl] = useState("");
  const [weeks, setWeeks] = useState<AdWeeks>(1);
  const [targetCountry, setTargetCountry] = useState<string>("");
  const [targetGender, setTargetGender] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const price = tiers.find((t) => t.weeks === weeks)?.priceMwk || 0;
  const insufficient = walletBalance < price;

  const stepValid =
    step === 0
      ? businessName.trim().length > 0 && headline.trim().length > 0
      : step === 1
        ? (() => {
            try {
              return new URL(targetUrl).protocol === "https:";
            } catch {
              return false;
            }
          })()
        : !insufficient;

  const inputCls =
    "mt-1 w-full rounded-md border border-ccb-border bg-ccb-bg px-3 py-2 text-sm text-ccb-text placeholder:text-ccb-muted/50 focus:border-ccb-primary outline-none";

  // Advertiser uploads their creative: validate -> compress (max 1280px
  // JPEG q0.8, same util as chat photos) -> upload to the public
  // 'ad-creatives' bucket -> use the public URL in the campaign.
  const pickImage = async (file: File) => {
    setError(null);
    if (!file.type.startsWith("image/") || file.type === "image/gif") {
      setError("Please pick a JPG, PNG or WebP image.");
      return;
    }
    setUploadingImage(true);
    try {
      const { blob, width, height } = await compressImage(file);
      const supabase = createClient();
      const path = `${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("ad-creatives")
        .upload(path, blob, { contentType: "image/jpeg" });
      if (upErr) throw new Error(upErr.message);
      const { data: pub } = supabase.storage.from("ad-creatives").getPublicUrl(path);
      setImageUrl(pub.publicUrl);
      setImageDims({ w: width, h: height });
      setShowUrlInput(false);
    } catch {
      setError("Couldn't upload that image. Try a smaller file (under 8MB).");
    } finally {
      setUploadingImage(false);
    }
  };

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/ads/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: businessName,
          headline,
          body: body || null,
          image_url: imageUrl || null,
          target_url: targetUrl,
          weeks,
          target_country: targetCountry || null,
          target_gender: targetGender || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "Couldn't create the campaign. Try again.");
        return;
      }
      // Reset + hand back to the shell (switches to My Campaigns + refreshes)
      setBusinessName("");
      setHeadline("");
      setBody("");
      setImageUrl("");
      setImageDims(null);
      setTargetUrl("");
      setWeeks(1);
      setTargetCountry("");
      setTargetGender("");
      setStep(0);
      onOrdered();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Stepper */}
      <div className="flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1.5 flex-1 last:flex-none">
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                i === step
                  ? "bg-ccb-primary text-white"
                  : i < step
                    ? "bg-ccb-primary/15 text-ccb-primary"
                    : "bg-ccb-border/40 text-ccb-muted"
              }`}
            >
              {i < step ? <Check className="w-3 h-3" /> : <span>{i + 1}</span>}
              <span className="hidden sm:inline">{s}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div className={`h-px flex-1 ${i < step ? "bg-ccb-primary/50" : "bg-ccb-border"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1 — Creative */}
      {step === 0 && (
        <div className="rounded-2xl border border-ccb-border bg-ccb-surface p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-ccb-muted">Business name *</label>
            <input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              maxLength={60}
              required
              placeholder="e.g. Chibondo Hardware"
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ccb-muted">Headline *</label>
            <input
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              maxLength={60}
              required
              placeholder="e.g. Quality building materials, wholesale prices"
              className={inputCls}
            />
            <p className="mt-0.5 text-[11px] text-ccb-muted">{headline.length}/60</p>
          </div>
          <div>
            <label className="text-xs font-medium text-ccb-muted">Body text (optional)</label>
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={120}
              placeholder="One short supporting line"
              className={inputCls}
            />
            <p className="mt-0.5 text-[11px] text-ccb-muted">{body.length}/120</p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-ccb-muted">
              Banner image (optional — shows your logo or promo graphic)
            </label>
            {!imageUrl ? (
              <label
                className={`flex items-center justify-center gap-2 rounded-md border border-dashed border-ccb-border bg-ccb-bg px-3 py-4 text-sm cursor-pointer hover:border-ccb-primary/50 ${
                  uploadingImage ? "opacity-60 pointer-events-none" : ""
                }`}
              >
                {uploadingImage ? (
                  <Loader2 className="w-4 h-4 animate-spin text-ccb-muted" />
                ) : (
                  <ImagePlus className="w-4 h-4 text-ccb-muted" />
                )}
                {uploadingImage ? "Uploading…" : "Upload an image (JPG, PNG or WebP) — 16:9 or 1:1 square"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) pickImage(f);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            ) : (
              <div className="rounded-md border border-ccb-border bg-ccb-bg px-3 py-2 flex items-center gap-2">
                <p className="text-xs text-ccb-muted flex-1 truncate">
                  Uploaded
                  {imageDims
                    ? ` — ${imageDims.w}×${imageDims.h} (${ratioLabel(imageDims.w, imageDims.h)})`
                    : ""}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setImageUrl("");
                    setImageDims(null);
                  }}
                  className="text-ccb-muted hover:text-red-500"
                  aria-label="Remove image"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {!showUrlInput ? (
              <button
                type="button"
                onClick={() => setShowUrlInput(true)}
                className="text-[11px] text-ccb-muted underline underline-offset-2"
              >
                Have an image link instead? Paste a URL
              </button>
            ) : (
              <input
                value={imageUrl}
                onChange={(e) => {
                  setImageUrl(e.target.value);
                  setImageDims(null);
                }}
                type="url"
                placeholder="https://…"
                className="w-full rounded-md border border-ccb-border bg-ccb-bg px-3 py-2 text-sm text-ccb-text placeholder:text-ccb-muted/50 focus:border-ccb-primary outline-none"
              />
            )}
          </div>

          {/* Live preview — exactly how the ad renders in the app */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-ccb-muted/60 mb-0.5 text-center">
              Sponsored
            </p>
            <div className="w-full overflow-hidden rounded-lg border border-ccb-border bg-ccb-surface">
              {imageUrl ? (
                <CreativeImage src={imageUrl} alt="Your banner" />
              ) : (
                <div className="w-full h-16 flex items-center justify-center bg-ccb-bg/60 text-[11px] text-ccb-muted">
                  Your banner image appears here
                </div>
              )}
              <div className="px-3 py-2 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-ccb-text truncate">
                    {headline || "Your headline appears here"}
                  </p>
                  {body ? <p className="text-[11px] text-ccb-muted truncate">{body}</p> : null}
                </div>
                <span className="shrink-0 text-[11px] font-bold text-ccb-primary">Visit →</span>
              </div>
            </div>
            <p className="mt-1 text-[11px] text-ccb-muted text-center">
              Live preview — exactly what players see.
            </p>
            {imageUrl && imageDims && (imageDims.w / imageDims.h < 0.8 || imageDims.w / imageDims.h > 2.4) && (
              <p className="mt-1 text-[11px] text-orange-400 text-center">
                Heads up: your image is {ratioLabel(imageDims.w, imageDims.h)} — ads look best at
                16:9 (e.g. 1200×675) or 1:1 square (e.g. 1080×1080) so it fits the slot without
                cropping or bars.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Step 2 — Audience */}
      {step === 1 && (
        <div className="rounded-2xl border border-ccb-border bg-ccb-surface p-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-ccb-muted">
              Destination link * (https only)
            </label>
            <input
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              type="url"
              required
              placeholder="https://your-site.com or a WhatsApp link"
              className={inputCls}
            />
            {targetUrl && !stepValid && (
              <p className="mt-0.5 text-[11px] text-red-500">
                Links must start with https://
              </p>
            )}
          </div>

          <div className="rounded-md border border-ccb-border bg-ccb-bg p-3 space-y-2">
            <label className="text-xs font-medium text-ccb-muted">
              Who should see your ad? (optional)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={targetCountry}
                onChange={(e) => setTargetCountry(e.target.value)}
                className="w-full rounded-md border border-ccb-border bg-ccb-surface px-2 py-2 text-sm text-ccb-text focus:border-ccb-primary outline-none"
              >
                <option value="">All countries</option>
                {AD_TARGET_COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {COUNTRY_LABELS[c] || c}
                  </option>
                ))}
              </select>
              <select
                value={targetGender}
                onChange={(e) => setTargetGender(e.target.value)}
                className="w-full rounded-md border border-ccb-border bg-ccb-surface px-2 py-2 text-sm text-ccb-text focus:border-ccb-primary outline-none"
              >
                <option value="">All genders</option>
                <option value="male">Men only</option>
                <option value="female">Women only</option>
              </select>
            </div>
            {audience && (
              <p className="text-[11px] text-ccb-muted leading-relaxed">
                {reachSentence(audience, targetCountry, targetGender)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Step 3 — Checkout */}
      {step === 2 && (
        <div className="rounded-2xl border border-ccb-border bg-ccb-surface p-4 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {tiers.map((t) => (
              <button
                key={t.weeks}
                type="button"
                onClick={() => setWeeks(t.weeks as AdWeeks)}
                className={`rounded-lg border p-3 text-center transition-colors ${
                  weeks === t.weeks
                    ? "border-ccb-primary bg-ccb-primary/10"
                    : "border-ccb-border bg-ccb-surface hover:border-ccb-muted/50"
                }`}
              >
                <p className="text-sm font-bold text-ccb-text">
                  {t.weeks} {t.weeks === 1 ? "week" : "weeks"}
                </p>
                <p className="text-xs text-ccb-muted">
                  {t.weeks === 1 ? "full price" : t.weeks === 2 ? "5% off" : "12.5% off"}
                </p>
                <p className="mt-1 text-base font-bold text-ccb-primary">
                  {formatMoney(t.priceMwk)}
                </p>
              </button>
            ))}
          </div>

          {/* Order summary */}
          <div className="rounded-lg border border-ccb-border bg-ccb-bg p-3 space-y-1.5 text-xs">
            <p className="text-[10px] uppercase tracking-widest text-ccb-muted/60 mb-1">
              Order summary
            </p>
            <div className="flex justify-between">
              <span className="text-ccb-muted">Business</span>
              <span className="font-semibold text-ccb-text truncate max-w-[60%]">{businessName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ccb-muted">Headline</span>
              <span className="font-semibold text-ccb-text truncate max-w-[60%]">{headline}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ccb-muted">Audience</span>
              <span className="font-semibold text-ccb-text">
                {targetCountry || targetGender
                  ? `${targetCountry ? COUNTRY_LABELS[targetCountry] || targetCountry : "All countries"}${targetGender ? ` · ${targetGender === "male" ? "men" : "women"}` : ""}`
                  : "Everyone"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ccb-muted">Duration</span>
              <span className="font-semibold text-ccb-text">
                {weeks} {weeks === 1 ? "week" : "weeks"}
              </span>
            </div>
            <div className="flex justify-between pt-1.5 border-t border-ccb-border">
              <span className="text-ccb-muted">Total</span>
              <span className="font-bold text-ccb-primary">{formatMoney(price)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ccb-muted">Wallet balance</span>
              <span className={`font-semibold ${insufficient ? "text-red-500" : "text-emerald-500"}`}>
                {formatMoney(walletBalance)}
              </span>
            </div>
          </div>

          {insufficient && (
            <p className="text-xs text-red-500">
              Not enough wallet balance — top up your wallet first, then come back. You&apos;ll be
              charged {formatMoney(price)} for this campaign.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-500 px-1">{error}</p>}

      {/* Nav */}
      <div className="flex items-center gap-2">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="rounded-lg border border-ccb-border px-4 py-2.5 text-sm font-semibold text-ccb-muted hover:text-ccb-text"
          >
            <span className="flex items-center gap-1.5">
              <ArrowLeft className="w-4 h-4" /> Back
            </span>
          </button>
        )}
        {step < 2 ? (
          <button
            type="button"
            onClick={() => stepValid && setStep(step + 1)}
            disabled={!stepValid}
            className="flex-1 rounded-lg bg-ccb-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40 flex items-center justify-center gap-2"
          >
            Continue <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={submitting || insufficient}
            className="flex-1 rounded-lg bg-ccb-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Buy {weeks} {weeks === 1 ? "week" : "weeks"} — {formatMoney(price)}
          </button>
        )}
      </div>
      <p className="text-[11px] text-ccb-muted text-center">
        Paid from your CCB wallet balance. Every campaign is reviewed before it goes live — usually
        same day.
      </p>
    </div>
  );
}
