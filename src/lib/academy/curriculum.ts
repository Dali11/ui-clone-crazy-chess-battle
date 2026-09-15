/**
 * Chess Academy curriculum — member-only training content.
 *
 * Lessons live in code (versioned with the app). Each lesson is a tight,
 * readable unit: 3–6 sections, optional board diagrams (FEN), and key
 * takeaways. Progress is stored in academy_progress per player.
 *
 * Content tone: practical, ranked-play oriented. Most lessons end with
 * how the idea plays out under clock pressure in battles/arenas.
 */

export interface LessonDiagram {
  fen: string;
  caption: string;
}

export interface LessonSection {
  heading: string;
  paragraphs: string[];
}

export interface Lesson {
  id: string;
  title: string;
  minutes: number;
  summary: string;
  sections: LessonSection[];
  diagrams?: LessonDiagram[];
  takeaways: string[];
}

export interface Track {
  id: string;
  title: string;
  subtitle: string;
  lessons: Lesson[];
}

export const TRACKS: Track[] = [
  {
    id: "foundations",
    title: "Foundations",
    subtitle: "Openings, safety and the habits that stop free-piece blunders.",
    lessons: [
      {
        id: "opening-principles",
        title: "Opening principles that actually matter",
        minutes: 6,
        summary: "Center, development, king safety — why these three rules beat memorized lines.",
        diagrams: [
          {
            fen: "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 3 3",
            caption: "The Ruy Lopez: every white move does something — center pawn, knight out, bishop to a useful square.",
          },
        ],
        sections: [
          {
            heading: "Fight for the center",
            paragraphs: [
              "The four central squares (d4, d5, e4, e5) are the high ground of the board. A piece posted there controls more space, and every opening worth playing either occupies the center with a pawn or attacks it. Your first move should almost always be e4, d4, c4 or Nf3 — moves that stake a claim in the middle.",
              "Don't push flank pawns early (h3, a6, g6) just because they feel safe. Every tempo you spend on the side of the board is a tempo your opponent spends in the center. If they control the middle while you walk pawns on the rim, they'll be attacking before your pieces are out.",
            ],
          },
          {
            heading: "Develop with purpose",
            paragraphs: [
              "A piece is developed when it's off the back rank and doing something. Knights before bishops is a decent rule of thumb — knights have short range and need to get closer to the action early; bishops can wait a move or two and often have a better choice of diagonal once you see where the pawns settle.",
              "Never move the same piece twice in the opening unless there's a concrete reason (a capture to win, a threat to stop). And never bring your queen out early — she becomes a target the opponent develops toward with tempo.",
            ],
          },
          {
            heading: "Castle early",
            paragraphs: [
              "Castling does three things at once: gets your king away from the center files (where attacks crash through), activates a rook, and is often the safest single move in the position. Aim to castle within the first 8–10 moves.",
              "In rapid and arena play, an uncastled king is the single most common reason a 'lost' game ends in 20 moves. Under time pressure you can't spend five minutes reorganizing your king — don't create the problem at all.",
            ],
          },
        ],
        takeaways: [
          "Move 1: fight for the center. Moves 2–5: every move brings a new piece out or castles.",
          "Don't move the same piece twice, and don't bring the queen out early.",
          "Castle inside the first ten moves unless the position forces otherwise.",
        ],
      },
      {
        id: "piece-value-trades",
        title: "Material values and when to trade",
        minutes: 5,
        summary: "The arithmetic of exchanges — and how simplification is a weapon when you're winning.",
        sections: [
          {
            heading: "The numbers",
            paragraphs: [
              "The standard scale: pawn = 1, knight = 3, bishop = 3 (slightly more in practice), rook = 5, queen = 9. A knight for a knight is even; a rook for a knight is 'losing the exchange' (2 points of value). These numbers are a language, not a law — but you need the language before you can break the law.",
              "Before every capture, run the whole exchange, not just the first pair: if I take with the pawn, what recaptures, and is the final tally in my favor? Most rating-point leaks at club level are exchanges miscounted by one move deep.",
            ],
          },
          {
            heading: "Trade when you're ahead",
            paragraphs: [
              "When you're up material, trades help you: every exchange makes your remaining advantage relatively bigger. Up a knight in a full army of 32 pieces, the knight is 3% of the board; up a knight with four pieces aside, it's decisive. Simplify toward the endgame where your extra piece converts.",
              "When you're behind, avoid trades — you need complexity and attacking chances to compensate for the deficit. And never trade your last defender of a weak square just because the exchange is technically even.",
            ],
          },
          {
            heading: "The bishop pair",
            paragraphs: [
              "Two bishops cover both colors and complement each other forever; that's why giving one up 'for free' costs a little more than the 3 points. In open positions (few central pawns) the pair is a genuine half-asset; in closed positions knights can be worth more than bishops — a knight doesn't care about pawn walls.",
            ],
          },
        ],
        takeaways: [
          "Count exchanges to the end of the line, not just the first capture.",
          "When ahead: trade pieces, keep pawns. When behind: keep pieces, complicate.",
          "Bishops love open positions, knights love closed ones.",
        ],
      },
      {
        id: "checkmate-patterns",
        title: "Checkmate patterns you'll see every week",
        minutes: 6,
        summary: "Back-rank mates, ladder mates, and smothered patterns — pattern recognition wins games.",
        diagrams: [
          {
            fen: "3R2k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1",
            caption: "Rd8# — the back-rank mate. The pawns that shelter the king also seal his escape.",
          },
        ],
        sections: [
          {
            heading: "The back-rank mate",
            paragraphs: [
              "The most common mating pattern in amateur rapid chess. A castled king with f2/g2/h2 (or f7/g7/h7) pawns untouched is trapped by his own shield: a heavy piece landing on the first rank delivers mate because there's no escape square.",
              "Two cheap defenses: make a luft — push a pawn to h3/g3 (or h6/g6) to give the king air — and keep an eye on the back rank whenever your rooks leave home. If you have zero defenders on rank 1, assume the opponent is looking there.",
            ],
          },
          {
            heading: "The ladder mate",
            paragraphs: [
              "Queen and king, or two rooks, walk a lone king to the edge: rook on one rank cuts escape, the other rank steps the king down. With Q+K vs K, remember the technique: queen a knight's-move away from the king, king walks up, repeat. You'll need this in time trouble — practice it once against the computer until it's automatic.",
            ],
          },
          {
            heading: "Recognizing the setup before the move",
            paragraphs: [
              "The skill isn't finding the mating move — it's noticing you're two moves from a position where one exists. Signals: king stuck on the back rank with no luft, heavy pieces pointed at that rank, an opponent's pieces all on the other side of the board. When you see those three, hunt for a sacrifice to smash the rank: even giving a rook for a pawn is worth it if the back rank collapses.",
            ],
          },
        ],
        takeaways: [
          "Make luft early — one pawn move removes the classic mate.",
          "Watch your own back rank the moment your rooks leave it.",
          "Signals first, moves second: trapped king + heavy pieces = hunt for the smash.",
        ],
      },
      {
        id: "king-safety-attack-defense",
        title: "King safety: attack with structure, defend by count",
        minutes: 6,
        summary: "How to build a real attack, and the counting rule that tells you when to defend.",
        sections: [
          {
            heading: "Attackers vs defenders",
            paragraphs: [
              "The universal defensive rule: if the attacker brings more attackers than you have defenders to a square near your king, you're in danger. Conversely, to attack successfully you generally need more attackers than defenders — usually 3 v 2 with a sacrifice to open lines, or an existing open file.",
              "When your opponent's attack looks scary, count. One more defender than attacker near your king means you're probably fine — defend, don't panic. When they have three pieces aimed at your kingside and you have one defender, don't calculate individual moves: get defenders there now, even at material cost.",
            ],
          },
          {
            heading: "Pawn storms: when they work",
            paragraphs: [
              "Throwing pawns at a castled king works when the pawns are supported by pieces behind them and the opponent's counterplay is far away. A lone pawn storm with no pieces behind it just makes holes for the defender's pieces. Before you push the h- and g-pawns, ask: do my rooks sit behind them, and what is my opponent attacking on the other wing?",
              "Castled on opposite sides (you kingside, opponent queenside), pawn storms are the main event — race tempo, count who's faster. Castled on the same side, storms usually need a piece sacrifice first; otherwise you break your own king open as much as theirs.",
            ],
          },
          {
            heading: "Defending under clock pressure",
            paragraphs: [
              "In battles, attackers gamble on you blundering while defending. The practical rule: make the move that creates no new weaknesses — block with a piece rather than opening a file, keep your pieces on defendable squares, and don't grab material with your king under fire. Many lost attacks just need one or two solid moves; attackers overextend and their clock drains.",
            ],
          },
        ],
        takeaways: [
          "Count attackers vs defenders around the king before deciding.",
          "Pawn storms need pieces behind them — otherwise they're self-harm.",
          "When defending in bad positions: solid moves, no new weaknesses, let their clock bleed.",
        ],
      },
      {
        id: "opening-traps",
        title: "Five opening traps (and how to smell them)",
        minutes: 5,
        summary: "The traps that catch players weekly — and the principle that defuses all of them.",
        diagrams: [
          {
            fen: "rn1q1bnr/ppp1kB1p/3p2p1/3N4/4P3/2N5/PPPP1PPP/R1BbK2R b - - 0 7",
            caption: "The Légal trap concludes: black grabbed the queen on d1 — and got mated by two knights and a bishop.",
          },
        ],
        sections: [
          {
            heading: "Free pieces are rarely free",
            paragraphs: [
              "Almost every opening trap follows one shape: an undefended pawn or piece looks grabbable, and taking it opens a line, removes a defender, or costs time that turns into an attack on your king. The queen grab in the Légal trap (diagram) is the classic — a full queen won, checkmate delivered anyway.",
              "Before taking anything in the first ten moves, ask two questions: what does this move undefend on my side, and what line does it open? If you can't answer both in five seconds, the capture can wait one move.",
            ],
          },
          {
            heading: "The usual suspects",
            paragraphs: [
              "Watch for: the f7/f2 square early (before castling) — every piece that points there is a threat; a knight or bishop that would be trapped by a simple pawn push (Bg5 hits by h6-g5 happens at every rating level); and the greedy e5 or d5 grabs in lines where the defender gets a strong center and open files as payment.",
              "On the other side of the board: learn to recognize when an opponent's pawn is poison — defended by tactics you haven't spotted yet. If a pawn can't be defended by a piece, assume the owner wants you to take it.",
            ],
          },
          {
            heading: "If you get trapped",
            paragraphs: [
              "Down material early? Stop attacking instantly. Trade queens if possible, castle, get all pieces defended, and look for the one tactic that gets your material back. Most trapped-piece games are lost not to the trap but to the panic that follows it.",
            ],
          },
        ],
        takeaways: [
          "Before any capture in the opening: what does it undefend, what line does it open?",
          "f2/f7 is a target until castling — check it on every move.",
          "After falling into a trap: queens off, castle, defend — then untangle.",
        ],
      },
    ],
  },
  {
    id: "tactics",
    title: "Tactics Arsenal",
    subtitle: "Forks, pins, discovered attacks — the machinery that wins material.",
    lessons: [
      {
        id: "forks",
        title: "Forks: two targets, one piece",
        minutes: 5,
        summary: "Knight forks, pawn forks and family forks — the workhorse tactic of rated play.",
        diagrams: [
          {
            fen: "3q2kr/5N2/8/8/8/8/8/6K1 w - - 0 1",
            caption: "A family fork: the knight on f7 hits king, queen and rook in every direction at once.",
          },
        ],
        sections: [
          {
            heading: "Why knights fork best",
            paragraphs: [
              "A knight attacks in a shape no piece defends along — so when it hits two targets, often neither can be defended by the other. Knight forks land most often on squares a knight's-move from the king: with the enemy king on g8, squares like f7, h6, e6 and d7 are fork squares. Park them in your memory during every attack.",
              "Pawn forks are quieter but constant: a single pawn push attacking two pieces (c2-c3 hitting a bishop on b4 and a knight on d4) wins material up to master level. Scan for pawns that attack two of your pieces before you commit a move.",
            ],
          },
          {
            heading: "Hunting the fork",
            paragraphs: [
              "Forks rarely appear as gifts — you build them. The recipe: put your opponent's pieces on the same color squares your knight can reach, then find the jump. Look for enemy queen and king on squares a knight's-move apart, or queen and rook, after forcing sequences: a check that moves their king is the classic pre-forcing move.",
              "On defense: never let two valuable pieces sit on squares a knight's-move apart while an enemy knight is within two jumps. It sounds paranoid; it's actually the single most profitable scanning habit in chess.",
            ],
          },
          {
            heading: "Fork awareness in battles",
            paragraphs: [
              "Under a 10-minute clock you can't scan exhaustively. Instead, scan knight squares only when: an enemy knight exists near your pieces, or you're moving into a new square. Cheap insurance, once per move, catches most forks.",
            ],
          },
        ],
        takeaways: [
          "Knight forks cluster around the king — memorize the fork squares near g8/g1.",
          "Before moving a piece, check enemy pawns and knights attacking two of yours.",
          "A check that herds the king often sets up the fork — forcing moves first.",
        ],
      },
      {
        id: "pins-skewers",
        title: "Pins and skewers: pieces in a line",
        minutes: 5,
        summary: "Line tactics — when a piece can't (or won't dare) move.",
        diagrams: [
          {
            fen: "rnbqk2r/pppp1ppp/5n2/6B1/8/8/PPPP1PPP/RNBQK2R w KQkq - 4 4",
            caption: "The g5 bishop pins the f6 knight to the uncastled king — the knight is stuck until the pin is resolved.",
          },
        ],
        sections: [
          {
            heading: "Absolute vs relative pins",
            paragraphs: [
              "An absolute pin is against the king: the pinned piece legally cannot move. A relative pin is against a queen or rook: it can move, but it will lose the piece behind unless tactics justify it. Absolute pins are the more valuable pattern — the pinned piece is a frozen defender you can attack with everything.",
              "The standard exploitation: pile on the pinned piece. A knight pinned by a bishop can be attacked by a pawn (breaking the pin is not possible), and it just sits there. Attack pinned pieces with your least valuable attacker first.",
            ],
          },
          {
            heading: "Skewers",
            paragraphs: [
              "A skewer is a pin reversed: the more valuable piece is in front. Bishop on b1 hits a king on h7 with a rook behind on h8? The king must move and the rook falls. Scan diagonal and rank lines from your bishops and rooks toward their king — anything valuable behind the king is a skewer waiting for a check.",
              "The defensive habit: don't align your king with your heavy pieces on open lines. Off-angle castling positions (king on g8, rook on f8, an open f-file) are a classic skewer/pin farm.",
            ],
          },
          {
            heading: "Breaking pins",
            paragraphs: [
              "Pinned yourself? Three tools: break the line with a piece between the pinner and the pinned (blocking), attack the pinning piece with a gain of tempo (e.g. h6-hitting a g5 bishop), or counter-tactic that makes moving away (or allowing the take) worthwhile. In rapid play, the block is usually the soundest — it costs one tempo, not material.",
            ],
          },
        ],
        takeaways: [
          "Absolute pins freeze defenders — attack pinned pieces with cheap attackers.",
          "Skewer scan: lines from your bishops/rooks through their king to their back rank.",
          "Keep your king off the same lines as your queen and rooks.",
        ],
      },
      {
        id: "discovered-attacks",
        title: "Discovered attacks and double checks",
        minutes: 5,
        summary: "The strongest move in chess moves two pieces at once.",
        sections: [
          {
            heading: "The mechanism",
            paragraphs: [
              "A discovered attack: a piece sits in front of a rook or bishop's line; when it moves away, the line opens onto a target — and the moving piece attacks something else. The defender has to answer two threats created by one move, which is why discovered attacks win material so reliably.",
              "The double check — both the moving piece AND the behind piece give check — is the most forcing move type in chess: the king must move, no capture or block solves it. Double checks end many kingside attacks; when you have a line piece aimed near the king and a knight that could jump with check, look for a mating combination first.",
            ],
          },
          {
            heading: "Building them",
            paragraphs: [
              "Discovered attacks are why line pieces behind your own knights/bishops matter. Keep rooks on open files and bishops on long diagonals — those are loaded weapons. The trigger to scan: any enemy piece undefended on a line where one of your pieces could step away with tempo.",
              "On defense, the mirror habit: before leaving a piece undefended, check whether an enemy line piece sits behind one of their pieces aimed at it. Discovered attacks punish loose pieces more than any other tactic.",
            ],
          },
          {
            heading: "Time-pressure reality",
            paragraphs: [
              "In battle play, discovered attacks decide whole games because they're easy to miss in a fast scan: nothing on the board looks attacked until the piece moves. Cheap check: on every enemy move, note where their rooks and bishops point — and what of yours sits on those lines.",
            ],
          },
        ],
        takeaways: [
          "Discovered attacks = one move, two threats — strongest practical tactic.",
          "Double check forces the king to move; look for it first in attacks.",
          "Know where enemy line pieces point; keep nothing loose on those lines.",
        ],
      },
      {
        id: "combination-thinking",
        title: "Thinking in combinations",
        minutes: 6,
        summary: "Checks, captures, threats — the forcing-move routine that finds tactics.",
        sections: [
          {
            heading: "Forcing moves first",
            paragraphs: [
              "In any position with potential tactics, calculate in this order: all checks, then all captures, then all threats (moves that create a new, immediate danger). Forcing moves constrain the opponent's replies, so lines stay short and concrete. Most missed tactics are quiet moves — but you find those only after exhausting the forcing ones.",
              "This isn't a beginner-only routine. It's literally how titled players calculate: forced variation first, then positional judgment. The difference is speed.",
            ],
          },
          {
            heading: "The three-move habit",
            paragraphs: [
              "On your move: what are my checks, captures, threats? On their reply, same scan. When both scans come back quiet for two consecutive moves, you can afford a positional move (improve your worst piece). When a scan lights up, stop and calculate the forcing line to the end — most tactical mistakes are lines abandoned one move early.",
              "A complete line ends in a position you can evaluate at a glance: material count, king safety, who's better. If you can't evaluate the final position, the line isn't finished.",
            ],
          },
          {
            heading: "When to calculate hard",
            paragraphs: [
              "Under clock pressure, hard calculation is a resource — spend it where the position says so: the moment either king gets exposed, whenever material is loose on both sides, or when a sacrifice appears. Routine positions don't earn deep calculation time. In battles, budget: 80% of moves are two-second scans, 20% are the moments you spend your reserve on.",
            ],
          },
        ],
        takeaways: [
          "Scan order: checks → captures → threats. Every move, both sides.",
          "Calculate forcing lines to an evaluable end position, or don't start them.",
          "Spend clock only when kings or loose material make the position tactical.",
        ],
      },
      {
        id: "tactical-defense",
        title: "Tactical defense: seeing their ideas",
        minutes: 5,
        summary: "Defense is 90% offense-recognition — scanning the opponent's moves like your own.",
        sections: [
          {
            heading: "The opponent's checks-captures-threats",
            paragraphs: [
              "You know to scan your own forcing moves. The defensive twin is scanning theirs: after their move (before yours), run their checks, captures and threats. Most blunders aren't missing your own tactic — they're walking into one that was visibly there.",
              "Concretely: after their move, ask 'what does this piece attack now?', 'what did this move unblock?', 'what did moving there undefend?'. Three questions, under five seconds each. This is the single highest-return habit for cutting blunders under time pressure.",
            ],
          },
          {
            heading: "The premove trap",
            paragraphs: [
              "Premoves win clock time and lose games when the opponent's reply doesn't cooperate. Rule for battle play: premove only when the position is fully forced (recaptures on a closed front) — never 'expecting' a natural reply. A premove against a check or a zwischenzug (in-between move) hands the game over.",
              "If you rely on premoves, run the three defensive questions first. If nothing in the position can possibly check, capture or threaten you — premove away.",
            ],
          },
          {
            heading: "Defending the hanging pieces",
            paragraphs: [
              "When something of yours is attacked: the order of consideration is defend > trade > move — attacking elsewhere is last, and only with a threat the opponent must answer. A defended piece keeps the position intact; a panic trade loses the exchange; a counter-attack that's slower than their capture loses material outright.",
            ],
          },
        ],
        takeaways: [
          "After their move: what's attacked, what's unblocked, what's undefended?",
          "Premoves only in fully forced positions.",
          "Attacked piece: defend > trade > move > counter-attack.",
        ],
      },
    ],
  },
  {
    id: "winning-technique",
    title: "Winning Technique",
    subtitle: "Endgames, strategy and clock craft — converting advantages into points.",
    lessons: [
      {
        id: "endgame-basics",
        title: "Endgame first principles",
        minutes: 6,
        summary: "King activity, rook activity, and the two endings you'll actually reach.",
        sections: [
          {
            heading: "Activate the king",
            paragraphs: [
              "The endgame's biggest mental shift: the king becomes a fighting piece worth roughly a minor piece in activity. In the middlegame you hid him; in the endgame he walks toward the action. Most pawn endgames are decided by king position — the king that reaches the key squares first wins the passer race.",
              "Passed pawns and king activity are the two currencies. Push passed pawns to force the opponent's pieces into permanent guard duty, then attack with your king and active rooks elsewhere.",
            ],
          },
          {
            heading: "Rook endgames: activity over material",
            paragraphs: [
              "Half your endgames will be rook endgames. The rules: rooks belong active — behind passed pawns (yours or theirs) or on the seventh rank harassing pawns; rooks belong outside your own pawn chain, not buried behind it; and cutting the enemy king off by a file wins more endgames than any amount of material arithmetic.",
              "Philidor and Lucina positions (the fundamental R+P vs R endings) are worth one study session each — but even without them, remember: an active rook compensates for a pawn or two of material. Passive rook = losing rook.",
            ],
          },
          {
            heading: "Converting under a clock",
            paragraphs: [
              "In battles you'll reach endgames with minutes left. Simplify early: queens off when your structure is healthier, trade into a pawn endgame only if you can count it as winning (king closer to the key squares). The easiest conversion in rapid chess is the pawn-up, all-pawns-on-one-side rook endgame — boring and nearly unlosable. Take boring wins over brilliant complications.",
            ],
          },
        ],
        takeaways: [
          "King becomes a fighting piece in the endgame — walk him forward.",
          "Rooks: active, behind passers, outside the pawn chain, cutting the king.",
          "In time trouble, choose the boring technical win over the flashy one.",
        ],
      },
      {
        id: "pawn-endgames",
        title: "Pawn endgames: the square and the opposition",
        minutes: 5,
        summary: "Two tools that decide nearly every pure pawn ending.",
        diagrams: [
          {
            fen: "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1",
            caption: "King and pawn: with kings in direct opposition, the defender holds — a single tempo changes the result.",
          },
        ],
        sections: [
          {
            heading: "The square rule",
            paragraphs: [
              "A passed pawn promotes alone if the defending king can't step inside its 'square': draw the square whose side is the distance from the pawn to the promotion rank. If the enemy king can enter that square on his turn (diagonal steps count!), the pawn dies — otherwise it queens. You use this constantly to decide races instantly: count once, no calculation.",
              "Two caveats: the pawn's square shrinks each time it advances (a pawn on the 5th rank has a two-rank square), and a defending piece can block a key square — but as a first-pass verdict, the square is gospel.",
            ],
          },
          {
            heading: "Opposition",
            paragraphs: [
              "When kings face each other with one square between, whoever must move gives ground — that's the opposition. In king-and-pawn endings, the attacker with the opposition usually wins; the defender with it draws. When your king steps forward, try to arrive with the move already conceded: watch the tempo of the whole king dance, not just your pawn.",
              "Corresponding squares rule wider positions: your king matches their king's geometry (same-color diagonal opposition, etc.). If you feel your king chase is 'losing a step everywhere', that's the position telling you the drawing method exists — count carefully before pushing.",
            ],
          },
          {
            heading: "Passed pawn geometry",
            paragraphs: [
              "Outside passed pawns (far from the kings) win endgames by luring the enemy king away from the real fight — the classic distraction. Protected passed pawns tie down a defender permanently. When you trade into a pawn endgame, count these two shapes first: an outside passer or protected passer plus a healthy king usually means the game is already decided.",
            ],
          },
        ],
        takeaways: [
          "Square rule: instant verdict on whether a passer queens.",
          "Opposition decides king-and-pawn endings — steal the tempo, win the game.",
          "Trade into pawn endgames only after counting squares and opposition.",
        ],
      },
      {
        id: "piece-activity",
        title: "Positional play: activity is the real material",
        minutes: 6,
        summary: "Outposts, open files, and improving your worst piece.",
        sections: [
          {
            heading: "Piece activity beats material illusions",
            paragraphs: [
              "A knight on the rim, a bishop blocked by its own pawns, a rook behind its own pawn chain — these pieces are worth their points on paper and nothing on the board. When you're 'down material' but every one of your pieces is active while theirs sit passive, you're often playing for a win — activity converts to material attacks via tactics.",
              "The practical positional question each move: which of my pieces is worst, and can this move improve it? That single question prevents drifting positions where you make thirty 'safe' moves and your position quietly dies.",
            ],
          },
          {
            heading: "Outposts and weak squares",
            paragraphs: [
              "A square your opponent can never attack with a pawn (because the pawns have moved past it) is an outpost. A knight planted on an outpost near their king can be worth a rook. When you see an outpost in enemy territory, route a knight there; when your position has one, expect their pieces to find it.",
              "The flip side: never create outposts for the opponent without need. Every pawn move leaves weak squares behind it — the c-pawn push that opens the d3 hole, the g3-h3 luft that weakens the kingside diagonals. Play pawn moves that gain something, because each costs something permanently.",
            ],
          },
          {
            heading: "Open files and the seventh rank",
            paragraphs: [
              "Rooks earn their keep on open files — doubled rooks on an open file toward the enemy king are a permanent attack engine. In the middlegame, contest the file your opponent wants, or take a different one that points at their king. A rook that infiltrates to the seventh rank attacks pawns from behind and eats tempo — the seventh-rank rook is the classic 'two points of material' rook.",
            ],
          },
        ],
        takeaways: [
          "Every move: find your worst piece and improve it.",
          "Outposts: square pawns can't attack — plant knights, deny theirs.",
          "Open files for rooks; the seventh rank is worth more than it looks.",
        ],
      },
      {
        id: "clock-management",
        title: "Clock craft for battles and arenas",
        minutes: 5,
        summary: "Time is a piece too — budgeting, premoves, and tilt control.",
        sections: [
          {
            heading: "The opening budget",
            paragraphs: [
              "In 10+5 play, spend less than 60 seconds on the first ten moves: theory you know should be instant, and principles cover what you don't. The clock you save in the opening buys you the critical moments later. If you reach move 10 with 9:30 on the clock, you've already out-played most of the field positionally.",
              "Choose a small, reliable opening repertoire (one white system, two black defenses — e.g. one vs e4, one vs d4). In arena chess, repetition beats variety: you play the same structures weekly and know their plans cold, which means your moves come faster every week.",
            ],
          },
          {
            heading: "Speed discipline",
            paragraphs: [
              "Three gears: instant (recaptures, forced replies — under two seconds), fast (clearly safe moves after the standard scan — ten seconds), and slow (critical positions — a minute or more). Losing players run everything in the fast gear. Your slow-gear moments should come two to four times a game; take them fully.",
              "Never move instantly because your opponent did. Their speed is a tempo weapon against you only if you let it change your discipline.",
            ],
          },
          {
            heading: "When you're behind on the clock",
            paragraphs: [
              "Down to the last minute: switch to forcing-move chess — checks, captures, and simple threats keep your options narrow and your clock cost low; avoid quiet positional moves you can't instantly evaluate. Flagging exists: keep positions with legal moves available and don't simplify into a drawn ending with three seconds left — play on in complicated positions when the clock says so.",
            ],
          },
        ],
        takeaways: [
          "Opening budget: 60 seconds for ten moves. Small repertoire, played weekly.",
          "Three gears — and take the slow gear when the position earns it.",
          "Last-minute chess = forcing moves only.",
        ],
      },
      {
        id: "arena-strategy",
        title: "Arena strategy: maximizing points per session",
        minutes: 5,
        summary: "Arena scoring rewards wins over safety — adapt your chess to the format.",
        sections: [
          {
            heading: "Play for the win, not the half-point",
            paragraphs: [
              "In this arena, a win scores 3 and a draw only 1 — and consecutive wins add a streak bonus. A draw is barely better than a loss by points-per-game, so solid-draw chess is a losing strategy in this format. In equal positions, keep the game alive: unbalanced structures, opposite-side castling, and avoided mass trades all raise your decisive-game percentage.",
              "Against stronger opponents, this changes: your best 'win' against a much higher-rated player might come from pressing in a slightly worse but complicated position — their rating points mean they usually expect to win, and complications punish that assumption.",
            ],
          },
          {
            heading: "Streak economics",
            paragraphs: [
              "The streak bonus means your first game after two wins is worth more than usual — protect the streak with extra opening care and a touch more solid repertoire. After a streak breaks, reset mentally: one tilt-loss cascades into a bad hour. Take the 30-second reset between games, especially after a loss.",
              "Pairing logic: arenas pair you against players at your score level, meaning your opposition toughens exactly when your streak is active. Play the opponent, not just the board — aggressive players give chances, solid players give stalemates you must actively convert.",
            ],
          },
          {
            heading: "Session strategy",
            paragraphs: [
              "Points-per-hour beats points-per-game in arena play. A session's rhythm: open with your sharpest prep while fresh, take short breaks after two consecutive losses, and end before fatigue blunder-creep sets in. Volume with discipline — two focused hours beats five tilted ones on the leaderboard.",
            ],
          },
        ],
        takeaways: [
          "Win = 3, draw = 1: press equal positions; keep games decisive.",
          "Protect streaks with solid prep; reset for 30 seconds after any loss.",
          "Leaderboards are won by points-per-hour: focused sessions, real breaks.",
        ],
      },
    ],
  },
];

export const TOTAL_LESSONS = TRACKS.reduce((n, t) => n + t.lessons.length, 0);

export function getLesson(lessonId: string): Lesson | undefined {
  for (const t of TRACKS) {
    const l = t.lessons.find((x) => x.id === lessonId);
    if (l) return l;
  }
  return undefined;
}

export function getTrackOf(lessonId: string): Track | undefined {
  return TRACKS.find((t) => t.lessons.some((l) => l.id === lessonId));
}
