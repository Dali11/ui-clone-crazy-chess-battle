/**
 * Chess puzzles organized as 10 progressive levels.
 * Players must complete a level to unlock the next one.
 * Each level has 5 puzzles of increasing difficulty.
 */

export interface ChessPuzzle {
  id: string;
  fen: string;
  solution: string[];
  turn: "white" | "black";
  rating: number;
  themes: string[];
  lastMove?: string;
}

export interface PuzzleLevel {
  level: number;
  name: string;
  description: string;
  ratingRange: string;
  puzzles: ChessPuzzle[];
}

export const puzzleLevels: PuzzleLevel[] = [
  {
    level: 1,
    name: "First Moves",
    description: "Basic checkmates and simple tactics",
    ratingRange: "600-800",
    puzzles: [
      { id: "l1-1", fen: "4k3/8/4K3/8/8/8/8/4Q3 w - - 0 1", solution: ["Qe7#"], turn: "white", rating: 600, themes: ["mate", "endgame"] },
      { id: "l1-2", fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1", solution: ["Qxf7#"], turn: "white", rating: 800, themes: ["mate", "queen"], lastMove: "e5" },
      { id: "l1-3", fen: "r1bqkbnr/pppp1Qpp/2n5/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 1", solution: ["Ke7"], turn: "black", rating: 700, themes: ["escape"], lastMove: "Qxf7+" },
      { id: "l1-4", fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1", solution: ["Re8#", "Rxe8+"], turn: "white", rating: 750, themes: ["mate", "endgame"] },
      { id: "l1-5", fen: "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1", solution: ["Nd5"], turn: "white", rating: 850, themes: ["fork"], lastMove: "Bc5" },
    ],
  },
  {
    level: 2,
    name: "Opening Tactics",
    description: "Forks, pins, and early attacks",
    ratingRange: "800-950",
    puzzles: [
      { id: "l2-1", fen: "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1", solution: ["Bxf7+"], turn: "white", rating: 820, themes: ["sacrifice", "fork"], lastMove: "Bc5" },
      { id: "l2-2", fen: "2r3k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1", solution: ["Rxc8+", "Re8#"], turn: "white", rating: 880, themes: ["mate", "skewer"] },
      { id: "l2-3", fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1", solution: ["Ng5"], turn: "white", rating: 900, themes: ["fork", "attack"], lastMove: "Nf6" },
      { id: "l2-4", fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1", solution: ["Re8#"], turn: "white", rating: 900, themes: ["back-rank", "mate"] },
      { id: "l2-5", fen: "6k1/5pp1p/6p1/8/8/8/5PPP/4R1K1 w - - 0 1", solution: ["Re8+", "Kg7", "Re7"], turn: "white", rating: 950, themes: ["mate", "endgame"] },
    ],
  },
  {
    level: 3,
    name: "Back Rank Mastery",
    description: "Recognize and deliver back rank mates",
    ratingRange: "950-1050",
    puzzles: [
      { id: "l3-1", fen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1", solution: ["Rd8#"], turn: "white", rating: 920, themes: ["back-rank", "mate"] },
      { id: "l3-2", fen: "4r1k1/5ppp/8/8/8/8/5PPP/4R1K1 b - - 0 1", solution: ["Re1+", "Rxe1", "Rxe1#"], turn: "black", rating: 950, themes: ["back-rank", "mate"] },
      { id: "l3-3", fen: "6rk/6pp/8/8/8/8/8/4R1K1 w - - 0 1", solution: ["Re8+", "Rxe8", "Rxe8#"], turn: "white", rating: 1000, themes: ["back-rank", "mate"] },
      { id: "l3-4", fen: "2r3k1/5ppp/8/8/8/8/5PPP/4R1K1 b - - 0 1", solution: ["Rc1+", "Rxc1", "Rxc1#"], turn: "black", rating: 1000, themes: ["back-rank", "mate"] },
      { id: "l3-5", fen: "6k1/5ppp/8/8/8/8/5PPP/2R3K1 w - - 0 1", solution: ["Rc8+", "Rxc8", "Rxc8#"], turn: "white", rating: 980, themes: ["back-rank", "mate"] },
    ],
  },
  {
    level: 4,
    name: "Pattern Mates",
    description: "Smothered mates and mating patterns",
    ratingRange: "1050-1200",
    puzzles: [
      { id: "l4-1", fen: "r5rk/5Npp/8/8/8/8/8/6K1 w - - 0 1", solution: ["Nh6#"], turn: "white", rating: 1100, themes: ["smothered", "mate"] },
      { id: "l4-2", fen: "r5rk/6pp/7N/8/8/8/8/6K1 w - - 0 1", solution: ["Nf7+"], turn: "white", rating: 1200, themes: ["smothered", "mate"] },
      { id: "l4-3", fen: "3r2k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1", solution: ["Rxd8+", "Rxd8", "Re8#"], turn: "white", rating: 1120, themes: ["mate", "skewer"] },
      { id: "l4-4", fen: "r1bq1rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPP2PPP/R1BQ1RK1 b - - 0 1", solution: ["Nd4", "Nxd4", "cxd4"], turn: "black", rating: 1100, themes: ["fork", "knight"] },
      { id: "l4-5", fen: "r1bq1rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPP2PPP/R1BQR1K1 b - - 0 1", solution: ["Rc8", "Rxc8", "Rxc8", "Qxc8"], turn: "black", rating: 1150, themes: ["skewer", "combo"] },
    ],
  },
  {
    level: 5,
    name: "Intermediate Combinations",
    description: "Pins, discovered attacks, and two-move combos",
    ratingRange: "1180-1300",
    puzzles: [
      { id: "l5-1", fen: "r1bq1rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPP2PPP/R1BQ1RK1 w - - 0 1", solution: ["Ne5", "Nxe5", "dxe5"], turn: "white", rating: 1180, themes: ["discovered", "attack"] },
      { id: "l5-2", fen: "r3k2r/ppp2ppp/2n5/3p4/3P4/2N2N2/PPPQ1PPP/R3K2R w KQkq - 0 1", solution: ["O-O-O", "dxc4"], turn: "white", rating: 1180, themes: ["castle", "tactics"] },
      { id: "l5-3", fen: "r1b2rk1/ppp2ppp/2n1bn2/3p4/3P4/2N1BN2/PPPQ1PPP/R1B2RK1 w - - 0 1", solution: ["Bxc5", "dxc5", "Qxd5"], turn: "white", rating: 1200, themes: ["pin", "discovered"] },
      { id: "l5-4", fen: "r4rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPP2PPP/R1BQR1K1 b - - 0 1", solution: ["Nd4", "Nxd4", "cxd4"], turn: "black", rating: 1250, themes: ["fork", "knight"] },
      { id: "l5-5", fen: "2r3rk1/1pq2ppp/8/3p4/3P4/2N2N2/1PQ2PPP/2R3RK1 w - - 0 1", solution: ["Nxd5", "cxd5", "Qxc8"], turn: "white", rating: 1280, themes: ["fork", "pin"] },
    ],
  },
  {
    level: 6,
    name: "Sharp Tactics",
    description: "Discovered attacks and sacrifices",
    ratingRange: "1300-1400",
    puzzles: [
      { id: "l6-1", fen: "r2q1rk1/ppp2ppp/2n5/3bp3/3P4/2N2N2/PPP2PPP/R1BQ1RK1 w - - 0 1", solution: ["Nxd5", "Nxd5", "Bxh7+"], turn: "white", rating: 1300, themes: ["sacrifice", "attack"], lastMove: "Bd5" },
      { id: "l6-2", fen: "r1bq1rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPP2PPP/R1BQ1RK1 b - - 0 1", solution: ["Nb4", "Nxd5"], turn: "black", rating: 1320, themes: ["fork", "attack"] },
      { id: "l6-3", fen: "r4rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPP2PPP/R1BQR1K1 b - - 0 1", solution: ["Rxc3", "Qxc3", "Nxd4"], turn: "black", rating: 1380, themes: ["sacrifice", "combo"] },
      { id: "l6-4", fen: "r1b1k2r/pppp1ppp/2n5/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1", solution: ["Bxf7+"], turn: "white", rating: 1400, themes: ["sacrifice", "fork"], lastMove: "Bc5" },
      { id: "l6-5", fen: "r1bq1rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPP2PPP/R1BQ1RK1 w - - 0 1", solution: ["d5", "Nb4", "d6"], turn: "white", rating: 1350, themes: ["attack", "advanced"] },
    ],
  },
  {
    level: 7,
    name: "Advanced Combinations",
    description: "Multi-move combinations and deep calculation",
    ratingRange: "1550-1650",
    puzzles: [
      { id: "l7-1", fen: "r2q1rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPPQ1PPP/R1B2RK1 w - - 0 1", solution: ["Nxd5", "Nxd5", "Bxh7+", "Kxh7", "Qg6+"], turn: "white", rating: 1600, themes: ["sacrifice", "combination"] },
      { id: "l7-2", fen: "r4rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPP2PPP/R1BQR1K1 w - - 0 1", solution: ["Ng5", "h6", "Nxf7"], turn: "white", rating: 1620, themes: ["sacrifice", "attack"] },
      { id: "l7-3", fen: "r1bq1rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPP2PPP/R1BQ1RK1 w - - 0 1", solution: ["d5", "Nb4", "d6"], turn: "white", rating: 1580, themes: ["attack", "advanced"] },
      { id: "l7-4", fen: "r3k2r/ppp2ppp/2n5/3p4/3P4/2N2N2/PPPQ1PPP/R3K2R w KQkq - 0 1", solution: ["Rxd5", "Nxd5", "Nf6+"], turn: "white", rating: 1650, themes: ["sacrifice", "fork"] },
      { id: "l7-5", fen: "r2q1rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPPQ1PPP/R1B2RK1 b - - 0 1", solution: ["Rxc3", "Qxc3", "Nxd4"], turn: "black", rating: 1550, themes: ["sacrifice", "combination"] },
    ],
  },
  {
    level: 8,
    name: "Sacrificial Attacks",
    description: "Deep sacrifices and king hunts",
    ratingRange: "1680-1800",
    puzzles: [
      { id: "l8-1", fen: "r1b1k1nr/pppp1ppp/2n5/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1", solution: ["Bxf7+"], turn: "white", rating: 1700, themes: ["sacrifice", "attack"], lastMove: "Bc5" },
      { id: "l8-2", fen: "r1b1k1nr/pppp1ppp/2n5/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R b KQkq - 0 1", solution: ["Nxe4", "Nxe4", "Bxf2+"], turn: "black", rating: 1750, themes: ["sacrifice", "pin"], lastMove: "Nd2" },
      { id: "l8-3", fen: "r1b1k1nr/pppp1ppp/2n5/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1", solution: ["Bxf7+", "Kxf7", "Ng5+", "Kg8", "Qh5"], turn: "white", rating: 1780, themes: ["sacrifice", "combination"], lastMove: "Bc5" },
      { id: "l8-4", fen: "r4rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPP2PPP/R1BQR1K1 w - - 0 1", solution: ["Ng5", "h6", "Nxf7", "Kxf7", "Qf3+"], turn: "white", rating: 1800, themes: ["sacrifice", "attack", "combination"] },
      { id: "l8-5", fen: "r1b1k1nr/pppp1ppp/2n5/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R b KQkq - 0 1", solution: ["Nxe4", "Nxe4", "Bxf2+", "Kxf2", "Qh4+"], turn: "black", rating: 1680, themes: ["sacrifice", "combination"], lastMove: "Nd2" },
    ],
  },
  {
    level: 9,
    name: "Master Combinations",
    description: "Grandmaster-level tactics and deep combinations",
    ratingRange: "1950-2050",
    puzzles: [
      { id: "l9-1", fen: "r3k2r/ppp2ppp/2n5/3p4/3P4/2N2N2/PPPQ1PPP/R3K2R w KQkq - 0 1", solution: ["Nxd5", "Nxd5", "Nf6+", "Kf8", "Qh5"], turn: "white", rating: 1950, themes: ["sacrifice", "fork", "attack"] },
      { id: "l9-2", fen: "r4rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPP2PPP/R1BQR1K1 w - - 0 1", solution: ["Ng5", "h6", "Nxf7", "Kxf7", "Qf3+"], turn: "white", rating: 1980, themes: ["sacrifice", "attack", "combination"] },
      { id: "l9-3", fen: "r2q1rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPPQ1PPP/R1B2RK1 w - - 0 1", solution: ["Nxd5", "Nxd5", "Bxh7+", "Kxh7", "Qg6+", "Kg8", "Qh7#"], turn: "white", rating: 2000, themes: ["sacrifice", "combination", "mate"] },
      { id: "l9-4", fen: "r2q1rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPPQ1PPP/R1B2RK1 b - - 0 1", solution: ["Rxc3", "Qxc3", "Nxd4", "Qxd4", "Bxc3"], turn: "black", rating: 2050, themes: ["sacrifice", "combination"] },
      { id: "l9-5", fen: "r1b1k1nr/pppp1ppp/2n5/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R b KQkq - 0 1", solution: ["Nxe4", "Nxe4", "Bxf2+", "Kxf2", "Qh4+"], turn: "black", rating: 2000, themes: ["sacrifice", "combination"], lastMove: "Nd2" },
    ],
  },
  {
    level: 10,
    name: "Grandmaster Tactics",
    description: "Only for the brave - elite-level combinations",
    ratingRange: "2100-2200",
    puzzles: [
      { id: "l10-1", fen: "r1b1k1nr/pppp1ppp/2n5/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1", solution: ["Bxf7+", "Kxf7", "Ng5+", "Kg8", "Qh5", "Kf8", "Qh7+"], turn: "white", rating: 2100, themes: ["sacrifice", "combination"], lastMove: "Bc5" },
      { id: "l10-2", fen: "r1b1k1nr/pppp1ppp/2n5/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R b KQkq - 0 1", solution: ["Nxe4", "Nxe4", "Bxf2+", "Kxf2", "Qh4+", "g3", "Qe4"], turn: "black", rating: 2200, themes: ["sacrifice", "combination"], lastMove: "Nd2" },
      { id: "l10-3", fen: "r3k2r/ppp2ppp/2n5/3p4/3P4/2N2N2/PPPQ1PPP/R3K2R w KQkq - 0 1", solution: ["Nxd5", "Nxd5", "Nf6+", "Kf8", "Qh5", "Ke7", "Nd5+"], turn: "white", rating: 2150, themes: ["sacrifice", "fork", "attack"] },
      { id: "l10-4", fen: "r2q1rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPPQ1PPP/R1B2RK1 w - - 0 1", solution: ["Nxd5", "Nxd5", "Bxh7+", "Kxh7", "Qg6+", "Kg8", "Qh7#", "Kf8"], turn: "white", rating: 2180, themes: ["sacrifice", "combination", "mate"] },
      { id: "l10-5", fen: "r4rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPP2PPP/R1BQR1K1 w - - 0 1", solution: ["Ng5", "h6", "Nxf7", "Kxf7", "Qf3+", "Ke7", "Ne5+"], turn: "white", rating: 2120, themes: ["sacrifice", "attack", "combination"] },
    ],
  },
];

export const allPuzzles: ChessPuzzle[] = puzzleLevels.flatMap((l) => l.puzzles);
export const totalPuzzles = allPuzzles.length;
