"use client";

import { useEffect, useState } from "react";
import { Loader2, ImagePlus, X, Save } from "lucide-react";
import { AD_TARGET_COUNTRIES } from "@/lib/ads/direct-pricing";
import { compressImage } from "@/components/chat/compress-image";
import { createClient } from "@/lib/supabase/client";
import { type Campaign, COUNTRY_LABELS, ratioLabel } from "./shared";

/**
 * Modal for editing an existing campaign — full creative swap allowed
 * (upload a new image, paste a URL, or remove it), plus copy and
 * targeting. Saving sends it back for review if it was live or rejected.
 */
export default function EditCampaignModal({
  campaign,
  onClose,
  onSaved,
}: {
  campaign: Campaign;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [businessName, setBusinessName] = useState(campaign.business_name);
  const [headline, setHeadline] = useState(campaign.headline);
  const [body, setBody] = useState(campaign.body || "");
  const [imageUrl, setImageUrl] = useState(campaign.image_url || "");
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [targetUrl, setTargetUrl] = useState(campaign.target_url);
  const [targetCountry, setTargetCountry] = useState(campaign.target_country || "");
  const [targetGender, setTargetGender] = useState(campaign.target_gender || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wasLive = campaign.status === "active" || campaign.status === "paused";

  useEffect(() => {
    // close on Escape
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

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

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/ads/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: businessName,
          headline,
          body: body || null,
          image_url: imageUrl || null,
          target_url: targetUrl,
          target_country: targetCountry || null,
          target_gender: targetGender || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "Couldn't save changes. Try again.");
        return;
      }
      onSaved(
        d.resubmitted
          ? "Changes saved — your campaign is back in the review queue (usually same day)."
          : "Changes saved."
      );
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "mt-1 w-full rounded-md border border-ccb-border bg-ccb-bg px-3 py-2 text-sm text-ccb-text placeholder:text-ccb-muted/50 focus:border-ccb-primary outline-none";
  const valid =
    businessName.trim().length > 0 &&
    headline.trim().length > 0 &&
    (() => {
      try {
        return new URL(targetUrl).protocol === "https:";
      } catch {
        return false;
      }
    })();

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-ccb-border bg-ccb-bg p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-ccb-text">Edit campaign</h2>
          <button onClick={onClose} className="text-ccb-muted hover:text-ccb-text" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {wasLive && (
          <p className="text-[11px] text-orange-500 bg-orange-500/10 rounded-md px-2.5 py-2">
            This campaign is live — editing it takes it down for a quick re-review (usually same
            day) so we can check the new content before it serves again.
          </p>
        )}
        {campaign.status === "rejected" && (
          <p className="text-[11px] text-emerald-500 bg-emerald-500/10 rounded-md px-2.5 py-2">
            Saving resubmits this campaign for review.
          </p>
        )}

        <div>
          <label className="text-xs font-medium text-ccb-muted">Business name *</label>
          <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} maxLength={60} className={inputCls} />
        </div>
        <div>
          <label className="text-xs font-medium text-ccb-muted">Headline *</label>
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={60} className={inputCls} />
          <p className="mt-0.5 text-[11px] text-ccb-muted">{headline.length}/60</p>
        </div>
        <div>
          <label className="text-xs font-medium text-ccb-muted">Body text (optional)</label>
          <input value={body} onChange={(e) => setBody(e.target.value)} maxLength={120} className={inputCls} />
          <p className="mt-0.5 text-[11px] text-ccb-muted">{body.length}/120</p>
        </div>

        {/* Creative */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-ccb-muted">Banner image</label>
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
              {uploadingImage ? "Uploading…" : "Upload a new image (JPG, PNG or WebP)"}
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
                {imageDims
                  ? `New upload — ${imageDims.w}×${imageDims.h} (${ratioLabel(imageDims.w, imageDims.h)})`
                  : "Current image"}
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
              Swap to an image link instead
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

          {/* Live preview */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-ccb-muted/60 mb-0.5 text-center">
              Sponsored
            </p>
            <div className="w-full overflow-hidden rounded-lg border border-ccb-border bg-ccb-surface">
              {imageUrl ? (
                <div className="w-full flex justify-center bg-ccb-bg/60">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl} alt="Your banner" className="w-full max-h-28 object-contain" />
                </div>
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
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-ccb-muted">Destination link * (https only)</label>
          <input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} type="url" className={inputCls} />
        </div>

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

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-lg border border-ccb-border px-4 py-2.5 text-sm font-semibold text-ccb-muted hover:text-ccb-text"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !valid}
            className="flex-1 rounded-lg bg-ccb-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
