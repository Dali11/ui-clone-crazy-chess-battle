import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET  /api/admin/kyc?filter=pending|all  — list submissions (admins only).
 *        Doc/selfie are returned as 1-hour signed URLs from the private
 *        kyc-documents bucket (RLS blocks all reads; service role only).
 *
 *        NOTE (2026-09-24 fix): this used to embed `profiles!inner(...)` in
 *        the select, but kyc_submissions.user_id has NO foreign key to
 *        profiles (it points at auth.users), so PostgREST answered
 *        PGRST200 on EVERY fetch and admins saw an empty queue — real
 *        players' ID documents sat unreviewed. Profiles are now fetched
 *        separately and merged in JS.
 *
 * POST /api/admin/kyc  { submissionId, decision: "approve"|"reject", reason? }
 *        approve → kyc_submissions.status=approved + profiles.identity_verified=true
 *        reject  → status=rejected + reason; player can resubmit.
 *        Player gets a notification either way.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: me } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!me?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const filter = new URL(req.url).searchParams.get("filter") || "pending";
    let q = admin
      .from("kyc_submissions")
      .select("id, user_id, doc_type, doc_number, doc_path, selfie_path, status, rejection_reason, reviewed_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (filter === "pending") q = q.eq("status", "pending");

    const { data: rows, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Merge player profiles in a second query (no FK kyc_submissions → profiles exists)
    const userIds = [...new Set((rows ?? []).map((r: any) => r.user_id).filter(Boolean))];
    const playersById = new Map<string, any>();
    if (userIds.length > 0) {
      const { data: players } = await admin
        .from("profiles")
        .select("id, username, display_name, email, avatar_url, country, phone, full_name")
        .in("id", userIds);
      for (const p of players ?? []) playersById.set(p.id, p);
    }

    const withUrls = [];
    for (const r of rows ?? []) {
      const { doc_path, selfie_path, ...rest } = r as any;
      const [docUrl, selfieUrl] = await Promise.all([
        doc_path ? admin.storage.from("kyc-documents").createSignedUrl(doc_path, 3600) : Promise.resolve({ data: null }),
        selfie_path ? admin.storage.from("kyc-documents").createSignedUrl(selfie_path, 3600) : Promise.resolve({ data: null }),
      ]);
      withUrls.push({
        ...rest,
        player: playersById.get(r.user_id) ?? null,
        docUrl: docUrl.data?.signedUrl ?? null,
        selfieUrl: selfieUrl.data?.signedUrl ?? null,
      });
    }

    return NextResponse.json({ submissions: withUrls });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch submissions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: me } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!me?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { submissionId, decision, reason } = await req.json();
    if (!submissionId || !["approve", "reject"].includes(decision)) {
      return NextResponse.json({ error: "Invalid review" }, { status: 400 });
    }

    const { data: sub } = await admin.from("kyc_submissions").select("*").eq("id", submissionId).single();
    if (!sub) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    if (sub.status !== "pending") return NextResponse.json({ error: "Already reviewed" }, { status: 409 });

    const approved = decision === "approve";
    const { error: upErr } = await admin
      .from("kyc_submissions")
      .update({
        status: approved ? "approved" : "rejected",
        rejection_reason: approved ? null : reason || "Document didn't match your profile details",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", submissionId);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    if (approved) {
      const { error: pErr } = await admin
        .from("profiles")
        .update({ identity_verified: true, identity_verified_at: new Date().toISOString() })
        .eq("id", sub.user_id);
      if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    }

    // Audit trail — KYC reviews were previously invisible in admin_logs.
    try {
      await admin.from("admin_logs").insert({
        admin_id: user.id,
        action: "kyc_review",
        target_type: "profile",
        target_id: sub.user_id,
        details: {
          decision,
          reason: reason || null,
          submissionId,
          docType: sub.doc_type || null,
        },
      });
    } catch {}

    await admin.from("notifications").insert({
      user_id: sub.user_id,
      type: "kyc",
      title: approved ? "Identity verified ✓" : "Identity document rejected",
      body: approved
        ? "Your identity is now verified — competitive tournaments and wallet features are fully unlocked."
        : `${reason || "Your document didn't match your profile details."} You can resubmit with clearer images from Settings → Verification.`,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Review failed" }, { status: 500 });
  }
}
