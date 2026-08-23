/**
 * Curated chess puzzles organized by difficulty sets.
 * Each puzzle has:
 * - fen: the position before the player needs to move
 * - solution: array of correct moves in sequence (SAN notation)
 * - turn: whose turn it is ('white' or 'black')
 * - rating: approximate difficulty
 * - themes: tactical motifs
 */

export interface ChessPuzzle {
  id: string;
  fen: string;
  solution: string[];
  turn: "white" | "black";
  rating: number;
  themes: string[];
  lastMove?: string; // opponent's last move for highlight
}

export interface PuzzleSet {
  id: string;
  name: string;
  slug: string;
  description: string;
  difficulty: "easy" | "normal" | "hard" | "expert";
  icon: string;
  color: string;
  puzzles: ChessPuzzle[];
}

export const puzzleSets: PuzzleSet[] = [
  {
    id: "set-easy",
    name: "Beginner Tactics",
    slug: "beginner",
    description: "Learn the basics — forks, pins, and simple mates",
    difficulty: "easy",
    icon: "🌱",
    color: "#4ade80",
    puzzles: [
      {
        id: "e1",
        fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1",
        solution: ["Qxf7#"],
        turn: "white",
        rating: 800,
        themes: ["mate", "queen"],
        lastMove: "e5",
      },
      {
        id: "e2",
        fen: "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1",
        solution: ["Nd5"],
        turn: "white",
        rating: 850,
        themes: ["fork"],
        lastMove: "Bc5",
      },
      {
        id: "e3",
        fen: "r1bqkbnr/pppp1Qpp/2n5/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 1",
        solution: ["Ke7"],
        turn: "black",
        rating: 700,
        themes: ["escape"],
        lastMove: "Qxf7+",
      },
      {
        id: "e4",
        fen: "4k3/8/4K3/8/8/8/8/4Q3 w - - 0 1",
        solution: ["Qe7#"],
        turn: "white",
        rating: 600,
        themes: ["mate", "endgame"],
      },
      {
        id: "e5",
        fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1",
        solution: ["Ng5"],
        turn: "white",
        rating: 900,
        themes: ["fork", "attack"],
        lastMove: "Nf6",
      },
      {
        id: "e6",
        fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
        solution: ["Re8#", "Rxe8+"],
        turn: "white",
        rating: 750,
        themes: ["mate", "endgame"],
      },
      {
        id: "e7",
        fen: "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1",
        solution: ["Bxf7+"],
        turn: "white",
        rating: 820,
        themes: ["sacrifice", "fork"],
        lastMove: "Bc5",
      },
      {
        id: "e8",
        fen: "2r3k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
        solution: ["Rxc8+", "Re8#"],
        turn: "white",
        rating: 880,
        themes: ["mate", "skewer"],
      },
    ],
  },
  {
    id: "set-normal",
    name: "Intermediate Puzzles",
    slug: "intermediate",
    description: "Sharp tactics — combinations, pins, and discovered attacks",
    difficulty: "normal",
    icon: "⚔️",
    color: "#a78bfa",
    puzzles: [
      {
        id: "n1",
        fen: "r1b2rk1/ppp2ppp/2n1bn2/3p4/3P4/2N1BN2/PPPQ1PPP/R1B2RK1 w - - 0 1",
        solution: ["Bxc5", "dxc5", "Qxd5"],
        turn: "white",
        rating: 1200,
        themes: ["pin", "discovered"],
      },
      {
        id: "n2",
        fen: "r2q1rk1/ppp2ppp/2n5/3bp3/3P4/2N2N2/PPP2PPP/R1BQ1RK1 w - - 0 1",
        solution: ["Nxd5", "Nxd5", "Bxh7+"],
        turn: "white",
        rating: 1300,
        themes: ["sacrifice", "attack"],
        lastMove: "Bd5",
      },
      {
        id: "n3",
        fen: "r4rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPP2PPP/R1BQR1K1 b - - 0 1",
        solution: ["Nd4", "Nxd4", "cxd4"],
        turn: "black",
        rating: 1250,
        themes: ["fork", "knight"],
      },
      {
        id: "n4",
        fen: "2r3rk1/1pq2ppp/8/3p4/3P4/2N2N2/1PQ2PPP/2R3RK1 w - - 0 1",
        solution: ["Nxd5", "cxd5", "Qxc8"],
        turn: "white",
        rating: 1280,
        themes: ["fork", "pin"],
      },
      {
        id: "n5",
        fen: "r1bq1rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPP2PPP/R1BQ1RK1 w - - 0 1",
        solution: ["Ne5", "Nxe5", "dxe5"],
        turn: "white",
        rating: 1350,
        themes: ["discovered", "attack"],
      },
      {
        id: "n6",
        fen: "r1b1k2r/pppp1ppp/2n5/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1",
        solution: ["Bxf7+"],
        turn: "white",
        rating: 1400,
        themes: ["sacrifice", "fork"],
        lastMove: "Bc5",
      },
      {
        id: "n7",
        fen: "r3k2r/ppp2ppp/2n5/3p4/3P4/2N2N2/PPPQ1PPP/R3K2R w KQkq - 0 1",
        solution: ["O-O-O", "dxc4"],
        turn: "white",
        rating: 1180,
        themes: ["castle", "tactics"],
      },
      {
        id: "n8",
        fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 b - - 0 1",
        solution: ["Rf8+", "Re8", "Rf8"],
        turn: "black",
        rating: 1100,
        themes: ["endgame", "check"],
      },
      {
        id: "n9",
        fen: "r1bq1rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPP2PPP/R1BQ1RK1 b - - 0 1",
        solution: ["Nb4", "Nxd5"],
        turn: "black",
        rating: 1320,
        themes: ["fork", "attack"],
      },
      {
        id: "n10",
        fen: "r4rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPP2PPP/R1BQR1K1 b - - 0 1",
        solution: ["Rxc3", "Qxc3", "Nxd4"],
        turn: "black",
        rating: 1380,
        themes: ["sacrifice", "combo"],
      },
    ],
  },
  {
    id: "set-hard",
    name: "Advanced Combinations",
    slug: "advanced",
    description: "Deep calculations — multi-move combinations and sacrifices",
    difficulty: "hard",
    icon: "🔥",
    color: "#f87171",
    puzzles: [
      {
        id: "h1",
        fen: "r2q1rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPPQ1PPP/R1B2RK1 w - - 0 1",
        solution: ["Nxd5", "Nxd5", "Bxh7+", "Kxh7", "Qg6+"],
        turn: "white",
        rating: 1600,
        themes: ["sacrifice", "combination"],
      },
      {
        id: "h2",
        fen: "r1b1k1nr/pppp1ppp/2n5/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1",
        solution: ["Bxf7+"],
        turn: "white",
        rating: 1700,
        themes: ["sacrifice", "attack"],
        lastMove: "Bc5",
      },
      {
        id: "h3",
        fen: "r1bq1rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPP2PPP/R1BQ1RK1 b - - 0 1",
        solution: ["Rc8", "Rxc8", "Rxc8", "Qxc8"],
        turn: "black",
        rating: 1550,
        themes: ["skewer", "combo"],
      },
      {
        id: "h4",
        fen: "r3k2r/ppp2ppp/2n5/3p4/3P4/2N2N2/PPPQ1PPP/R3K2R w KQkq - 0 1",
        solution: ["Rxd5", "Nxd5", "Nf6+"],
        turn: "white",
        rating: 1650,
        themes: ["sacrifice", "fork"],
      },
      {
        id: "h5",
        fen: "r1b1k1nr/pppp1ppp/2n5/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R b KQkq - 0 1",
        solution: ["Nxe4", "Nxe4", "Bxf2+"],
        turn: "black",
        rating: 1750,
        themes: ["sacrifice", "pin"],
        lastMove: "Nd2",
      },
      {
        id: "h6",
        fen: "r4rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPP2PPP/R1BQR1K1 w - - 0 1",
        solution: ["Ng5", "h6", "Nxf7"],
        turn: "white",
        rating: 1620,
        themes: ["sacrifice", "attack"],
      },
      {
        id: "h7",
        fen: "r1bq1rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPP2PPP/R1BQ1RK1 w - - 0 1",
        solution: ["d5", "Nb4", "d6"],
        turn: "white",
        rating: 1580,
        themes: ["attack", "advanced"],
      },
      {
        id: "h8",
        fen: "r2q1rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPPQ1PPP/R1B2RK1 b - - 0 1",
        solution: ["Rxc3", "Qxc3", "Nxd4"],
        turn: "black",
        rating: 1680,
        themes: ["sacrifice", "combination"],
      },
    ],
  },
  {
    id: "set-mate",
    name: "Checkmate Patterns",
    slug: "mates",
    description: "Recognize and deliver checkmate — back rank, smothered, and more",
    difficulty: "normal",
    icon: "♚",
    color: "#fbbf24",
    puzzles: [
      {
        id: "m1",
        fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
        solution: ["Re8#"],
        turn: "white",
        rating: 900,
        themes: ["back-rank", "mate"],
      },
      {
        id: "m2",
        fen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1",
        solution: ["Rd8#"],
        turn: "white",
        rating: 920,
        themes: ["back-rank", "mate"],
      },
      {
        id: "m3",
        fen: "r5rk/5Npp/8/8/8/8/8/6K1 w - - 0 1",
        solution: ["Nh6#"],
        turn: "white",
        rating: 1100,
        themes: ["smothered", "mate"],
      },
      {
        id: "m4",
        fen: "6rk/6pp/8/8/8/8/8/4R1K1 w - - 0 1",
        solution: ["Re8+", "Rxe8", "Rxe8#"],
        turn: "white",
        rating: 1050,
        themes: ["back-rank", "mate"],
      },
      {
        id: "m5",
        fen: "4r1k1/5ppp/8/8/8/8/5PPP/4R1K1 b - - 0 1",
        solution: ["Re1+", "Rxe1", "Rxe1#"],
        turn: "black",
        rating: 950,
        themes: ["back-rank", "mate"],
      },
      {
        id: "m6",
        fen: "6k1/5p1p/6p1/8/8/8/5PPP/4R1K1 w - - 0 1",
        solution: ["Re8+", "Kg7", "Re7"],
        turn: "white",
        rating: 1150,
        themes: ["mate", "endgame"],
      },
      {
        id: "m7",
        fen: "r5rk/6pp/7N/8/8/8/8/6K1 w - - 0 1",
        solution: ["Nf7+"],
        turn: "white",
        rating: 1200,
        themes: ["smothered", "mate"],
      },
      {
        id: "m8",
        fen: "2r3k1/5ppp/8/8/8/8/5PPP/4R1K1 b - - 0 1",
        solution: ["Rc1+", "Rxc1", "Rxc1#"],
        turn: "black",
        rating: 1000,
        themes: ["back-rank", "mate"],
      },
      {
        id: "m9",
        fen: "6k1/5ppp/8/8/8/8/5PPP/2R3K1 w - - 0 1",
        solution: ["Rc8+", "Rxc8", "Rxc8#"],
        turn: "white",
        rating: 980,
        themes: ["back-rank", "mate"],
      },
      {
        id: "m10",
        fen: "3r2k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
        solution: ["Rxd8+", "Rxd8", "Re8#"],
        turn: "white",
        rating: 1120,
        themes: ["back-rank", "mate"],
      },
    ],
  },
  {
    id: "set-expert",
    name: "Master Tactics",
    slug: "master",
    description: "Grandmaster-level combinations — only for the brave",
    difficulty: "expert",
    icon: "👑",
    color: "#f0abfc",
    puzzles: [
      {
        id: "x1",
        fen: "r2q1rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPPQ1PPP/R1B2RK1 w - - 0 1",
        solution: ["Nxd5", "Nxd5", "Bxh7+", "Kxh7", "Qg6+", "Kg8", "Qh7#"],
        turn: "white",
        rating: 2000,
        themes: ["sacrifice", "combination", "mate"],
      },
      {
        id: "x2",
        fen: "r1b1k1nr/pppp1ppp/2n5/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1",
        solution: ["Bxf7+", "Kxf7", "Ng5+", "Kg8", "Qh5"],
        turn: "white",
        rating: 2100,
        themes: ["sacrifice", "combination"],
        lastMove: "Bc5",
      },
      {
        id: "x3",
        fen: "r3k2r/ppp2ppp/2n5/3p4/3P4/2N2N2/PPPQ1PPP/R3K2R w KQkq - 0 1",
        solution: ["Nxd5", "Nxd5", "Nf6+", "Kf8", "Qh5"],
        turn: "white",
        rating: 1950,
        themes: ["sacrifice", "fork", "attack"],
      },
      {
        id: "x4",
        fen: "r1b1k1nr/pppp1ppp/2n5/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R b KQkq - 0 1",
        solution: ["Nxe4", "Nxe4", "Bxf2+", "Kxf2", "Qh4+"],
        turn: "black",
        rating: 2200,
        themes: ["sacrifice", "combination"],
        lastMove: "Nd2",
      },
      {
        id: "x5",
        fen: "r2q1rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPPQ1PPP/R1B2RK1 b - - 0 1",
        solution: ["Rxc3", "Qxc3", "Nxd4", "Qxd4", "Bxc3"],
        turn: "black",
        rating: 2050,
        themes: ["sacrifice", "combination"],
      },
      {
        id: "x6",
        fen: "r4rk1/ppp2ppp/2n5/3p4/3P4/2N2N2/PPP2PPP/R1BQR1K1 w - - 0 1",
        solution: ["Ng5", "h6", "Nxf7", "Kxf7", "Qf3+"],
        turn: "white",
        rating: 1980,
        themes: ["sacrifice", "attack", "combination"],
      },
    ],
  },
];

export function getPuzzleSet(slug: string): PuzzleSet | undefined {
  return puzzleSets.find((s) => s.slug === slug);
}

export function getAllPuzzles(): ChessPuzzle[] {
  return puzzleSets.flatMap((s) => s.puzzles);
}

export function getPuzzleById(id: string): ChessPuzzle | undefined {
  return getAllPuzzles().find((p) => p.id === id);
}

export function getTotalPuzzleCount(): number {
  return puzzleSets.reduce((sum, s) => sum + s.puzzles.length, 0);
}
