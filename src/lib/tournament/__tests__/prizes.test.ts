import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({}) }));

// Simulated deposits table state:
//   existingRefs  — committed rows visible to the SELECT fast path.
//   conflictRefs  — rows committed by a racing transaction between our
//                   SELECT and our INSERT (mid-race: select sees nothing,
//                   insert hits the unique index).
let existingRefs: Record<string, true> = {};
let conflictRefs: Record<string, true> = {};
const insertCalls: any[] = [];
const rpcCalls: any[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "deposits") {
        return {
          // select().eq("reference", ref).eq("user_id", uid).maybeSingle()
          select: (_cols: string) => {
            let ref: string | null = null;
            return {
              eq: (col: string, val: any) => {
                if (col === "reference") ref = val;
                return {
                  eq: () => ({
                    maybeSingle: async () => (ref && existingRefs[ref] ? { data: { id: "row" } } : { data: null }),
                  }),
                };
              },
            };
          },
          insert: (row: any) => {
            insertCalls.push(row);
            if (conflictRefs[row.reference]) {
              // migration-055 unique index rejects the duplicate claim
              return Promise.resolve({ error: { code: "23505", message: "duplicate key" } });
            }
            existingRefs[row.reference] = true;
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === "tournaments") {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { name: "Test Cup" } }) }) }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { email: "w@x.co", display_name: "W", username: "w" } }) }) }),
        };
      }
      return {} as any;
    },
    rpc: (fn: string, args: any) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ error: null });
    },
  }),
}));

import { distributePrizes } from "@/lib/tournament/prizes";

const PLAYERS = [
  { player_id: "u1", final_rank: 1, score: 9 },
  { player_id: "u2", final_rank: 2, score: 6 },
];
const FLAT = { type: "flat" as const, payouts: [{ rank: 1, amount: 6000 }] };

describe("distributePrizes — exactly-once wallet credit", () => {
  beforeEach(() => {
    existingRefs = {};
    conflictRefs = {};
    insertCalls.length = 0;
    rpcCalls.length = 0;
  });

  it("claims via the audit row and credits the wallet only after a successful claim", async () => {
    const payouts = await distributePrizes("t-1", PLAYERS, 10000, FLAT);

    expect(payouts).toHaveLength(1);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].reference).toBe("tournament:t-1:rank:1");
    expect(insertCalls[0].method).toBe("tournament_payout");
    expect(insertCalls[0].amount).toBe(6000);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].args).toEqual({ p_user_id: "u1", p_amount: 6000 });
  });

  it("never credits the wallet when the claim hits the unique index (race with another finish call)", async () => {
    // Another finishTournament call inserted the audit row for rank 1
    // moments ago — our SELECT ran before it committed (sees nothing),
    // but the INSERT now hits the unique index.
    conflictRefs["tournament:t-2:rank:1"] = true;

    const payouts = await distributePrizes("t-2", PLAYERS, 10000, FLAT);

    expect(payouts).toHaveLength(1); // still reported for bookkeeping
    expect(insertCalls).toHaveLength(1); // the losing claim attempt
    expect(rpcCalls).toHaveLength(0); // wallet NOT credited
  });

  it("skips payouts already recorded (idempotent re-run)", async () => {
    // Fast path: the existing select finds the committed payout row.
    existingRefs["tournament:t-3:rank:1"] = true;

    const payouts = await distributePrizes("t-3", PLAYERS, 10000, FLAT);

    expect(payouts).toHaveLength(1);
    expect(insertCalls).toHaveLength(0); // no claim attempt
    expect(rpcCalls).toHaveLength(0); // no credit
  });
});
