import { Chess, type Square } from "chess.js";
import { getPremoveDestinations } from "./premove-moves";

/**
 * Stacked premove queue — chess.com-style.
 *
 * Players can queue MULTIPLE premoves (one per own move), mixed across
 * pieces: the first plays when our turn arrives, the rest stay queued for
 * subsequent turns as the opponent replies. Two rules make the queue feel
 * right:
 *
 *  1. STACKING — a new premove APPENDS to the queue. It only replaces
 *     existing hops when the grabbed piece already has hops queued: the
 *     player is re-aiming that piece, so its whole downstream chain is
 *     replaced from its next queued hop.
 *  2. QUEUE-TIME VALIDATION — a premove is only accepted if its target is
 *     reachable by the piece from its PROJECTED position (the board state
 *     that will exist when this hop executes). Illegal directions are
 *     rejected immediately (the drag snaps back), instead of silently
 *     cancelling when the turn arrives.
 *
 * Both taps and drags go through queuePremove(), so the tap path, the
 * drag path and the re-aim path can never disagree about what a premove
 * means. The ghost layer (getPremoveGhosts) shows the same projection.
 */

export interface Premove {
  from: string;
  to: string;
}

export interface PremoveGrab {
  /** False when `from` holds none of our pieces on the real board or any
   *  projected state — the grab is invalid (nothing to premove). */
  ok: boolean;
  /** Candidate destinations for the piece at `from`, computed on the
   *  board state that will exist when this hop executes. */
  targets: string[];
  /** Insert point: queued hops from this index are replaced by the new
   *  hop. Equal to queue.length when the hop appends at the end. */
  at: number;
}

const FAIL = { ok: false, targets: [], at: 0 } as PremoveGrab;

/**
 * Resolve a grab of square `from` against the current queue.
 *
 * Covers all three grab kinds:
 *  - a piece on its REAL square with no hops queued  → append at the end
 *  - a piece on its REAL square with hops queued     → re-aim: replace
 *    from its first queued hop
 *  - a GHOST piece (projected mid-chain)             → the hop is FROM
 *    the projected square; replace from its next hop, if any
 */
export function resolvePremoveGrab(
  queue: Premove[],
  fen: string,
  isWhite: boolean,
  from: string
): PremoveGrab {
  if (!from || from.length !== 2) return FAIL;
  let g: Chess;
  try {
    g = new Chess(fen);
  } catch {
    return FAIL;
  }
  const myColor = isWhite ? "w" : "b";

  const mine = (sq: string): boolean => {
    try {
      const p = g.get(sq as Square);
      return !!p && p.color === myColor;
    } catch {
      return false;
    }
  };

  // Replay one hop on the simulation board. False when the chain is
  // broken at this hop (tolerated — later hops dangle, the executor
  // cancels the queue when reality disagrees).
  const hop = (h: Premove): boolean => {
    try {
      const p = g.get(h.from as Square);
      if (!p || p.color !== myColor) return false;
      g.remove(h.from as Square);
      g.put({ type: p.type, color: p.color } as any, h.to as Square);
      return true;
    } catch {
      return false;
    }
  };

  // 1) Real square — the piece physically sits on `from` in the base
  //    position. Its first queued hop (if any) starts at `from`.
  if (mine(from)) {
    let at = queue.findIndex((h) => h.from === from);
    if (at === -1) at = queue.length;
    for (let i = 0; i < at; i++) hop(queue[i]);
    return { ok: true, targets: getPremoveDestinations(g.fen(), isWhite, from), at };
  }

  // 2) Projected square — replay the queue; the first state where one of
  //    our pieces lands on `from` is the state this hop executes in.
  for (let i = 0; i < queue.length; i++) {
    if (!hop(queue[i])) continue;
    if (mine(from)) {
      let at = -1;
      for (let j = i + 1; j < queue.length; j++) {
        if (queue[j].from === from) {
          at = j;
          break;
        }
      }
      if (at === -1) at = queue.length;
      return { ok: true, targets: getPremoveDestinations(g.fen(), isWhite, from), at };
    }
  }

  return FAIL;
}

/**
 * Queue a premove hop `from → to`.
 *
 * Returns ok:false (queue untouched) when the grab is invalid or `to` is
 * not a candidate destination of the piece from its projected position —
 * the caller shows immediate feedback (drag snaps back) instead of
 * letting an impossible move cancel silently at turn arrival.
 *
 * Returns ok:true with the new queue: hops from the grab's insert point
 * are replaced by the single new hop (re-aim), or the hop appends at the
 * end (stack).
 */
export function queuePremove(
  queue: Premove[],
  fen: string,
  isWhite: boolean,
  from: string,
  to: string
): { ok: boolean; queue: Premove[] } {
  if (!from || !to || from === to) return { ok: false, queue };
  const grab = resolvePremoveGrab(queue, fen, isWhite, from);
  if (!grab.ok || !grab.targets.includes(to)) return { ok: false, queue };
  return { ok: true, queue: [...queue.slice(0, grab.at), { from, to }] };
}
