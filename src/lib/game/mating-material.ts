// FIDE rule 6.9 (and chess.com's identical behavior): if a player's flag
// falls but the opponent cannot checkmate the flagged player's king by
// ANY possible series of legal moves, the game is a draw — not a win.
//
// Can a side with the move-cooperation of both players deliver mate?
// Mate is impossible if the side's only material is: a bare king, a king
// + single bishop, or a king + single knight. Anything more (pawn,
// rook, queen, two knights, bishop+knight, ...) has at least one mating
// position, so a flag fall against it is a normal win.
export function canSideMate(
  fen: string | null | undefined,
  color: "white" | "black"
): boolean {
  if (!fen) return true; // unknown position — don't downgrade a win to a draw

  const board = fen.split(" ")[0] || "";
  const pieces: string[] = [];

  for (const ch of board) {
    if (!/[a-zA-Z]/.test(ch)) continue;
    const isWhite = ch === ch.toUpperCase();
    const type = ch.toUpperCase();
    if (type === "K") continue; // kings can't mate alone
    if ((color === "white") === isWhite) pieces.push(type);
  }

  if (pieces.length === 0) return false; // bare king
  if (pieces.includes("P") || pieces.includes("R") || pieces.includes("Q")) return true;
  if (pieces.length >= 2) return true; // B+N, N+N, B+B, minor+minor → mate exists
  return false; // lone bishop or lone knight cannot mate
}
