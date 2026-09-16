import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runReconciliation, type ReconExceptionDraft, type ReconInternalRow, type ReconProviderRow } from "@/lib/finance/phase2";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/commandcentre/reconciliation
 *
 * Runs the reconciliation engine: CrazyChess Ledger ↔ pawaPay
 * Transactions. Matching is by provider reference (pawapay_ref on
 * deposits/withdrawals; paychangu refs as fallback). Produces:
 *   - summary: provider totals, matched / unmatched / pending / failed /
 *     amount mismatches / duplicates
 *   - live exception drafts, upserted into reconciliation_exceptions
 *   - resolved history for the audit view
 *
 * The webhook store went live with migration 087 (deploy date). Rows
 * created before that are not flagged as missing_provider_record.
 *
 * POST /api/admin/commandcentre/reconciliation — resolve an exception.
 *   { id, action: "confirm_match" | "adjust" | "dismiss", note,
 *     adjustAmountMwk? }  (adjust = signed correction, MWK)
 * Controlled + auditable: the resolution and any correction are written
 * to financial_audit_log; wallet balances are never edited directly —
 * corrections go through apply_financial_adjustment (ledger row + wallet
 * RPC + audit entry, service-role only).
 */

/** Date the provider_transactions store went live (migration 087). */
const STORE_LIVE_AT = "2026-09-17T00:00:00.000Z";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // ── Fetch internal + provider rows (windowed to the last 365 days) ──
    const since = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();

    const { data: deposits } = await admin
      .from("deposits")
      .select("id, amount, amount_local, currency, country, status, created_at, pawapay_ref, paychangu_ref, charge_id")
      .gte("created_at", since)
      .not("pawapay_ref", "is", null)
      .limit(5000);
    const { data: withdrawals } = await admin
      .from("withdrawals")
      .select("id, amount, amount_local, currency, country, status, created_at, pawapay_ref")
      .gte("created_at", since)
      .limit(5000);
    const { data: providerTxsRaw } = await admin
      .from("provider_transactions")
      .select("provider, provider_ref, direction, provider_status, amount_local, currency, country, received_at")
      .gte("received_at", since)
      .limit(10000);
    const providerTxs: ReconProviderRow[] = (providerTxsRaw || []).map((t: any) => ({
      provider: t.provider,
      providerRef: t.provider_ref,
      direction: t.direction,
      providerStatus: t.provider_status,
      amountLocal: t.amount_local != null ? Number(t.amount_local) : null,
      currency: t.currency,
      country: t.country,
      receivedAt: t.received_at,
    }));

    // Internal rows: every withdrawal (stuck-pending check needs them all),
    // every deposit that carries a provider reference, PLUS recent
    // pending deposits regardless of ref.
    const { data: pendingDeposits } = await admin
      .from("deposits")
      .select("id, amount, amount_local, currency, country, status, created_at, pawapay_ref, paychangu_ref, charge_id")
      .in("status", ["pending", "processing"])
      .gte("created_at", since)
      .limit(5000);

    const depositMap = new Map<string, any>();
    for (const d of [...(deposits || []), ...(pendingDeposits || [])]) depositMap.set(d.id, d);

    const toInternal = (r: any): ReconInternalRow => ({
      id: r.id,
      providerRef: r.pawapay_ref || null,
      fallbackRef: r.paychangu_ref || r.charge_id || null,
      amountLocal: r.amount_local != null ? Number(r.amount_local) : null,
      currency: r.currency || null,
      country: r.country || null,
      internalStatus: r.status,
      createdAt: r.created_at,
    });

    const engine = runReconciliation({
      deposits: [...depositMap.values()].map(toInternal),
      withdrawals: (withdrawals || []).map(toInternal),
      providerTxs,
      storeLiveAt: STORE_LIVE_AT,
    });

    // ── Upsert exceptions (service role) ───────────────────────────────
    // Load current unresolved exceptions, diff by logical key.
    const { data: live } = await admin
      .from("reconciliation_exceptions")
      .select("id, kind, entity_type, entity_id, provider_ref, resolved")
      .eq("resolved", false)
      .limit(5000);
    const liveByKey = new Map<string, string>();
    for (const e of live || []) {
      liveByKey.set(exceptionKey(e as any), e.id);
    }

    const draftKeys = new Set<string>();
    let inserted = 0;
    for (const draft of engine.exceptions) {
      const key = draftKeyKey(draft);
      draftKeys.add(key);
      if (liveByKey.has(key)) continue;
      const { error } = await admin.from("reconciliation_exceptions").insert({
        kind: draft.kind,
        provider: draft.provider,
        provider_ref: draft.providerRef,
        entity_type: draft.entityType,
        entity_id: draft.entityId,
        country: draft.country,
        currency: draft.currency,
        provider_amount: draft.providerAmount,
        internal_amount: draft.internalAmount,
        difference: draft.difference,
        provider_status: draft.providerStatus,
        internal_status: draft.internalStatus,
        severity: draft.severity,
      });
      if (!error) inserted += 1;
    }

    // Auto-resolve exceptions no longer detected.
    let autoResolved = 0;
    for (const [key, eid] of liveByKey.entries()) {
      if (!draftKeys.has(key)) {
        const { error } = await admin
          .from("reconciliation_exceptions")
          .update({
            resolved: true,
            resolved_at: new Date().toISOString(),
            resolution_action: "auto_resolved",
            resolution_note: "No longer detected by the reconciliation engine",
          })
          .eq("id", eid)
          .eq("resolved", false);
        if (!error) autoResolved += 1;
      }
    }

    // ── Return current exceptions (live + recent history) ───────────────
    const { data: exceptions } = await admin
      .from("reconciliation_exceptions")
      .select("*, resolved_by_profile:profiles!reconciliation_exceptions_resolved_by_fkey(username, display_name)")
      .or("resolved.eq.false")
      .order("detected_at", { ascending: false })
      .limit(500);

    const { data: resolvedRecent } = await admin
      .from("reconciliation_exceptions")
      .select("*, resolved_by_profile:profiles!reconciliation_exceptions_resolved_by_fkey(username, display_name)")
      .eq("resolved", true)
      .order("resolved_at", { ascending: false, nullsFirst: false })
      .limit(50);

    return NextResponse.json({
      summary: engine.summary,
      exceptions: exceptions || [],
      resolvedRecent: resolvedRecent || [],
      sync: { inserted, autoResolved },
    });
  } catch (e: any) {
    console.error("Reconciliation error:", e);
    return NextResponse.json({ error: "Reconciliation run failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { id, action, note } = body as { id: string; action: string; note?: string };
    const adjustAmountMwk = Number(body.adjustAmountMwk);

    if (!id || !action) return NextResponse.json({ error: "id and action are required" }, { status: 400 });
    if (!["confirm_match", "adjust", "dismiss"].includes(action)) {
      return NextResponse.json({ error: "action must be confirm_match, adjust or dismiss" }, { status: 400 });
    }
    if (!note || String(note).trim().length < 5) {
      return NextResponse.json({ error: "A resolution note of at least 5 characters is required" }, { status: 400 });
    }

    // Atomic claim: only an unresolved exception can be resolved.
    const now = new Date().toISOString();
    const { data: claimed, error: claimErr } = await admin
      .from("reconciliation_exceptions")
      .update({ resolved: true, resolved_by: user.id, resolved_at: now, resolution_action: action, resolution_note: note })
      .eq("id", id)
      .eq("resolved", false)
      .select("*");
    if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 });
    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ error: "Exception already resolved" }, { status: 409 });
    }
    const exception = claimed[0];

    // Optional corrective adjustment — through the sanctioned RPC only.
    let adjustmentId: string | null = null;
    if (action === "adjust") {
      if (!Number.isFinite(adjustAmountMwk) || adjustAmountMwk === 0) {
        return NextResponse.json({ error: "adjustAmountMwk (signed, non-zero) is required for adjust" }, { status: 400 });
      }
      if (!exception.entity_id || exception.entity_type === "none") {
        return NextResponse.json({ error: "This exception has no internal entity to adjust" }, { status: 400 });
      }
      const table = exception.entity_type === "withdrawal" ? "withdrawals" : "deposits";
      const { data: entity } = await admin
        .from(table)
        .select("id, user_id, amount, status")
        .eq("id", exception.entity_id)
        .single();
      if (!entity) return NextResponse.json({ error: "Underlying entity not found" }, { status: 404 });

      const { data: rpc, error: rpcErr } = await admin.rpc("apply_financial_adjustment", {
        p_admin_id: user.id,
        p_player_id: entity.user_id,
        p_amount_mwk: Math.round(adjustAmountMwk),
        p_reason: `Reconciliation exception ${exception.kind} (${exception.provider_ref || exception.entity_id}): ${note}`,
      });
      if (rpcErr) return NextResponse.json({ error: `Adjustment failed: ${rpcErr.message}` }, { status: 500 });
      adjustmentId = rpc;
    }

    // Immutable audit entry for the resolution itself.
    await admin.from("financial_audit_log").insert({
      admin_id: user.id,
      action: `reconcile.${action}`,
      entity_type: "exception",
      entity_id: exception.id,
      transaction_ref: exception.provider_ref,
      previous_state: {
        kind: exception.kind,
        entity_type: exception.entity_type,
        entity_id: exception.entity_id,
        provider_amount: exception.provider_amount,
        internal_amount: exception.internal_amount,
        difference: exception.difference,
        provider_status: exception.provider_status,
        internal_status: exception.internal_status,
        resolved: false,
      },
      new_state: {
        resolved: true,
        resolution_action: action,
        adjustment_ledger_row: adjustmentId,
        adjust_amount_mwk: action === "adjust" ? Math.round(adjustAmountMwk) : null,
      },
      reason: note,
    });

    return NextResponse.json({ ok: true, exceptionId: exception.id, adjustmentId });
  } catch (e: any) {
    console.error("Reconciliation resolve error:", e);
    return NextResponse.json({ error: "Failed to resolve exception" }, { status: 500 });
  }
}

// ── Exception logical keys (must match the DB unique-index shape) ─────────

const NULL_UUID = "00000000-0000-0000-0000-000000000000";

function exceptionKey(e: { kind: string; entity_type: string; entity_id: string | null; provider_ref: string | null }): string {
  return `${e.kind}|${e.entity_type}|${e.entity_id || NULL_UUID}|${e.provider_ref || ""}`;
}

function draftKeyKey(d: ReconExceptionDraft): string {
  return `${d.kind}|${d.entityType}|${d.entityId || NULL_UUID}|${d.providerRef || ""}`;
}
