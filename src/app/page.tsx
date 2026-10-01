import Link from "next/link";
import Image from "next/image";
import {
  ArrowDownRight, ArrowRight, BarChart3, ChevronRight, CirclePlay,
  Crown, Gamepad2, Globe2, Radio, Trophy, Users, Clock3, Eye,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { detectCountry } from "@/lib/geo/country-detect";
import { headers } from "next/headers";
import HomeStats from "./home-stats";
import PublicHomeNav from "@/components/layout/public-home-nav";

export const dynamic = "force-dynamic";

import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Crazy Chess Battles — Play, Compete, Rise",
  description: "Play chess online, challenge real players, enter tournaments, and climb the rankings on Crazy Chess Battles.",
  path: "/",
});

const quickLinks = [
  { title: "Quick Match", description: "Find an opponent and get straight to the board.", href: "/explore/play", icon: Gamepad2, tone: "text-amber-300", glow: "from-amber-400/20" },
  { title: "Tournaments", description: "Enter a tournament and play for the title.", href: "/explore/tournaments", icon: Trophy, tone: "text-yellow-300", glow: "from-yellow-400/20" },
  { title: "Real Players", description: "Challenge players from around the world.", href: "/explore/battles", icon: Users, tone: "text-blue-300", glow: "from-blue-400/20" },
  { title: "Leaderboards", description: "See who is climbing the competitive ranks.", href: "/explore/leaderboards", icon: BarChart3, tone: "text-emerald-300", glow: "from-emerald-400/20" },
];

const glyphs: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

function ChessPreview({ fen }: { fen: string }) {
  const placement = fen?.split(" ")[0] ?? "";
  const rows = placement.split("/");
  const squares = rows.length === 8 ? rows.flatMap((row) => row.split("").flatMap((char) => /[1-8]/.test(char) ? Array(Number(char)).fill("") : [char])) : [];
  const board = squares.length === 64 ? squares : Array(64).fill("");
  return (
    <div className="grid aspect-square grid-cols-8 overflow-hidden rounded-md border border-amber-100/20 shadow-[0_12px_32px_rgba(0,0,0,.4)]" aria-label="Current game board position">
      {board.map((piece, index) => {
        const light = (Math.floor(index / 8) + index % 8) % 2 === 0;
        return <div key={index} className={`flex items-center justify-center ${light ? "bg-[#dfb87d]" : "bg-[#80502e]"}`}>
          {piece && <span className={`font-serif text-[clamp(17px,2.15vw,29px)] leading-none drop-shadow-[0_1px_1px_rgba(0,0,0,.45)] ${piece === piece.toUpperCase() ? "text-[#fff7de]" : "text-[#17120f]"}`}>{glyphs[piece] ?? ""}</span>}
        </div>;
      })}
    </div>
  );
}

function formatClock(ms?: number | null, minutes?: number | null) {
  const remaining = typeof ms === "number" ? Math.max(0, ms) : Math.max(0, (minutes ?? 3) * 60_000);
  return `${Math.floor(remaining / 60_000).toString().padStart(2, "0")}:${Math.floor((remaining % 60_000) / 1000).toString().padStart(2, "0")}`;
}

function displayName(profile: any) {
  return profile?.display_name || profile?.username || "Player";
}

function countryFlag(country?: string | null) {
  if (!country || !/^[a-z]{2}$/i.test(country)) return "🌐";
  return String.fromCodePoint(...country.toUpperCase().split("").map((letter) => 127397 + letter.charCodeAt(0)));
}

function formatStart(startAt: string) {
  const start = new Date(startAt).getTime();
  const delta = start - Date.now();
  if (delta <= 0) return "Starting soon";
  const hours = Math.floor(delta / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `Starts in ${days}d`;
  if (hours > 0) return `Starts in ${hours}h`;
  return `Starts in ${Math.max(1, Math.floor(delta / 60_000))}m`;
}

function MiniGameRow({ game }: { game: any }) {
  return <Link href={`/game/${game.id}`} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2 border-t border-slate-800/90 py-2.5 first:border-t-0">
    <div className="flex min-w-0 items-center gap-2"><Avatar src={game.white?.avatar_url} name={displayName(game.white)} /><div className="min-w-0"><div className="truncate text-xs font-semibold text-slate-100">{displayName(game.white)}</div><div className="text-[10px] text-slate-500">{game.white?.rating ?? "—"}</div></div></div>
    <span className="text-[10px] font-bold text-slate-600">VS</span>
    <div className="flex min-w-0 items-center gap-2"><Avatar src={game.black?.avatar_url} name={displayName(game.black)} /><div className="min-w-0"><div className="truncate text-xs font-semibold text-slate-100">{displayName(game.black)}</div><div className="text-[10px] text-slate-500">{game.black?.rating ?? "—"}</div></div></div>
    <span className="rounded bg-red-500/15 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-red-300">Live</span>
  </Link>;
}

function HeroLiveCard({ game }: { game: any | null }) {
  if (!game) {
    return <div className="flex h-full min-h-[360px] flex-col items-center justify-center rounded-xl border border-slate-600/70 bg-[#07131f]/90 p-6 text-center shadow-2xl backdrop-blur-md">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300"><Radio className="h-6 w-6" /></span>
      <h2 className="text-base font-extrabold uppercase text-white">Live arena</h2>
      <p className="mt-2 max-w-xs text-sm text-slate-400">No public games are featured right now. Check the arena for the latest matches.</p>
        <Link href="/explore/battles" className="mt-5 inline-flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2.5 text-sm font-bold text-white transition hover:border-emerald-300">Browse live games <ArrowRight className="h-4 w-4" /></Link>
    </div>;
  }

  const white = game.white;
  const black = game.black;
  return (
    <div className="rounded-xl border border-slate-500/70 bg-[#06111ceF] p-3 shadow-[0_24px_70px_rgba(0,0,0,.55)] backdrop-blur-xl sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-white sm:text-sm"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,.85)]" /> Live battle</h2>
        <Link href="/explore/battles" className="text-[10px] font-semibold text-cyan-300 hover:text-cyan-100 sm:text-xs">Watch live <ArrowRight className="ml-1 inline h-3 w-3" /></Link>
      </div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar src={white?.avatar_url} name={displayName(white)} />
          <div className="min-w-0"><div className="max-w-[92px] truncate text-[11px] font-bold text-white sm:max-w-[120px] sm:text-xs">{displayName(white)}</div><div className="text-[10px] text-slate-400">{countryFlag(white?.country)} {white?.rating ?? "—"}</div></div>
        </div>
        <div className="rounded-md bg-emerald-400/10 px-2 py-1 font-mono text-sm font-black text-emerald-300">{formatClock(game.white_clock_ms, game.initial_minutes)}</div>
        <span className="text-[10px] font-bold text-slate-500">VS</span>
        <div className="rounded-md bg-slate-800 px-2 py-1 font-mono text-sm font-black text-slate-200">{formatClock(game.black_clock_ms, game.initial_minutes)}</div>
        <div className="flex min-w-0 items-center gap-2 text-right">
          <div className="min-w-0"><div className="max-w-[92px] truncate text-[11px] font-bold text-white sm:max-w-[120px] sm:text-xs">{displayName(black)}</div><div className="text-[10px] text-slate-400">{black?.rating ?? "—"} {countryFlag(black?.country)}</div></div>
          <Avatar src={black?.avatar_url} name={displayName(black)} />
        </div>
      </div>
      <ChessPreview fen={game.fen} />
      <Link href={`/game/${game.id}`} className="mt-2 flex items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-900/80 py-2 text-xs font-bold text-white transition hover:border-emerald-300/60 hover:text-emerald-200">Watch this game <Eye className="h-3.5 w-3.5" /></Link>
    </div>
  );
}

function Avatar({ src, name }: { src?: string | null; name: string }) {
  return src ? <img src={src} alt="" className="h-8 w-8 shrink-0 rounded-full border border-amber-300/60 object-cover sm:h-9 sm:w-9" /> : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-300/60 bg-slate-800 text-xs font-black text-amber-200 sm:h-9 sm:w-9">{name.slice(0, 1).toUpperCase()}</span>;
}

function SectionHeading({ icon: Icon, title, href, action = "View all" }: { icon: typeof Radio; title: string; href: string; action?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-white sm:text-base">
        <Icon className="h-4 w-4 text-amber-300" /> {title}
      </h2>
      <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-300 transition hover:text-emerald-200">
        {action}<ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  const headersList = await headers();
  const req = new Request("https://ccb.mw", { headers: Object.fromEntries(headersList.entries()) });
  const market = await detectCountry(req as any);

  const signupParams = new URLSearchParams();
  signupParams.set("country", market.countryCode);
  if (ref) signupParams.set("ref", ref);
  const signupUrl = `/signup?${signupParams.toString()}`;

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user && !ref) redirect("/dashboard");

  const [gamesResult, tournamentsResult, leadersResult] = await Promise.all([
    supabase.from("games").select(`
      id, fen, status, broadcast, tournament_id, initial_minutes, white_clock_ms, black_clock_ms, last_move_at,
      white:profiles!games_white_player_id_fkey(username, display_name, rating, avatar_url, country),
      black:profiles!games_black_player_id_fkey(username, display_name, rating, avatar_url, country)
    `).eq("status", "playing").order("last_move_at", { ascending: false }).limit(30),
    supabase.from("tournaments").select("id, name, status, starts_at, time_control")
      .eq("status", "upcoming").gte("starts_at", new Date().toISOString()).order("starts_at", { ascending: true }).limit(3),
    supabase.from("leaderboard").select("rating, wins, tournament_wins, profiles!inner(username, display_name, avatar_url, country)")
      .order("rating", { ascending: false }).limit(5),
  ]);

  const candidateGames = gamesResult.data ?? [];
  const candidateIds = candidateGames.map((game: any) => game.id);
  const { data: battles } = candidateIds.length
    ? await supabase.from("battles").select("game_id, armageddon_game_id, stake").in("game_id", candidateIds)
    : { data: [] as any[] };
  const stakedGameIds = new Set((battles ?? []).filter((battle: any) => (battle.stake ?? 0) > 0).flatMap((battle: any) => [battle.game_id, battle.armageddon_game_id]).filter(Boolean));
  const publicGames = candidateGames.filter((game: any) => game.broadcast || game.tournament_id || stakedGameIds.has(game.id));
  const featuredGame = publicGames[0] ?? null;
  const upcomingTournaments = tournamentsResult.data ?? [];
  const topPlayers = leadersResult.data ?? [];

  return (
    <main className="min-h-screen overflow-hidden bg-[#050d15] text-slate-100">
      <PublicHomeNav signupUrl={signupUrl} />

      <section className="relative isolate min-h-[565px] overflow-hidden border-b border-slate-700/60 sm:min-h-[680px] lg:min-h-[620px] xl:min-h-[660px]">
        <Image
          src="/chess-arena-hero-v2.png"
          alt="A dramatic chess arena at sunset"
          fill
          priority
          sizes="100vw"
          className="-z-20 object-cover object-[43%_center] lg:object-[55%_center]"
        />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(2,8,14,.92)_0%,rgba(2,8,14,.8)_30%,rgba(2,8,14,.3)_60%,rgba(2,8,14,.36)_100%),linear-gradient(0deg,#050d15_0%,transparent_32%,rgba(3,10,17,.1)_100%)]" />
        <div className="mx-auto grid min-h-[565px] max-w-[1400px] items-center gap-8 px-4 pb-8 pt-8 sm:min-h-[680px] sm:px-8 lg:min-h-[620px] lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,.72fr)] lg:gap-10 lg:px-10 xl:min-h-[660px] xl:grid-cols-[minmax(0,1.4fr)_minmax(370px,.72fr)]">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-slate-950/50 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[.17em] text-emerald-200 backdrop-blur sm:mb-5 sm:text-xs sm:tracking-[.2em]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> The global chess arena
            </div>
            <h1 className="max-w-[720px] text-[2rem] font-black uppercase leading-[.98] tracking-[-.045em] text-white drop-shadow-[0_3px_18px_rgba(0,0,0,.45)] sm:text-6xl lg:text-[4.25rem] xl:text-[4.8rem]">
              The chess arena<br />
              <span className="bg-gradient-to-r from-amber-200 via-yellow-400 to-orange-300 bg-clip-text text-transparent">where every move</span><br />
              starts a <span className="bg-gradient-to-r from-emerald-300 to-emerald-500 bg-clip-text text-transparent">battle</span>
            </h1>
            <p className="mt-4 max-w-lg text-xs leading-relaxed text-slate-200 sm:mt-6 sm:text-lg">
              Fast games. Real players. Global tournaments.<br className="hidden sm:block" /> Join a chess world that never stops.
            </p>
            <div className="mt-5 flex flex-col gap-2.5 sm:mt-8 sm:flex-row sm:gap-3">
              <Link href={signupUrl} className="group inline-flex min-h-12 items-center justify-center gap-3 rounded-lg bg-gradient-to-r from-emerald-400 to-emerald-500 px-7 text-sm font-black uppercase tracking-wide text-slate-950 shadow-[0_0_28px_rgba(16,230,143,.34)] transition hover:brightness-110">
                Play now <ChevronRight className="h-5 w-5 transition group-hover:translate-x-1" />
              </Link>
              <Link href="/explore/battles" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-400/60 bg-slate-950/55 px-6 text-sm font-bold uppercase tracking-wide text-white backdrop-blur transition hover:border-emerald-300 hover:bg-slate-900/80">
                <CirclePlay className="h-5 w-5 fill-white text-slate-950" /> Watch live
              </Link>
            </div>
            <div className="mt-6 border-t border-white/20 pt-3 sm:mt-10 sm:pt-5">
              <HomeStats />
            </div>
          </div>
          <div className="hidden lg:block"><HeroLiveCard game={featuredGame} /></div>
        </div>
        <a href="#explore" aria-label="Scroll to explore" className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 text-white/60 transition hover:text-white sm:block"><ArrowDownRight className="h-5 w-5 rotate-45" /></a>
      </section>

      <section id="explore" className="mx-auto max-w-[1320px] px-4 py-7 sm:px-8 sm:py-10 lg:px-10">
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-xl border border-slate-700/70 bg-slate-950/70 p-4 sm:p-5">
            <SectionHeading icon={Radio} title="Live battles" href="/explore/battles" />
            {publicGames.length > 0 ? publicGames.slice(0, 3).map((game: any) => <MiniGameRow key={game.id} game={game} />) : <div className="flex min-h-[130px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-900/40 px-5 text-center"><Radio className="mb-2 h-5 w-5 text-red-400" /><p className="text-sm font-bold text-white">No live games to show</p><p className="mt-1 text-xs text-slate-400">Check back soon or browse the arena.</p></div>}
      <Link href="/explore/battles" className="mt-3 flex items-center justify-center gap-1 border-t border-slate-800 pt-3 text-xs font-semibold text-cyan-300">Browse all battles <ArrowRight className="h-3.5 w-3.5" /></Link>
          </section>

          <section className="rounded-xl border border-slate-700/70 bg-slate-950/70 p-4 sm:p-5">
            <SectionHeading icon={Trophy} title="Upcoming tournaments" href="/explore/tournaments" />
            {upcomingTournaments.length > 0 ? upcomingTournaments.map((tournament: any, index: number) => <Link key={tournament.id} href="/explore/tournaments" className="flex items-center gap-3 border-t border-slate-800/90 py-2.5 first:border-t-0">
              <span className={`flex h-10 w-12 shrink-0 items-center justify-center rounded-md border border-white/10 ${index === 1 ? "bg-blue-900/50 text-blue-200" : "bg-amber-900/40 text-amber-200"}`}><Trophy className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-white">{tournament.name}</span><span className="mt-1 flex items-center gap-1 text-[10px] text-slate-400"><Clock3 className="h-3 w-3" /> {formatStart(tournament.starts_at)} · {tournament.time_control}</span></span>
              <span className="rounded-md border border-slate-600 px-2.5 py-1.5 text-[10px] font-bold text-white">Join</span>
            </Link>) : <div className="flex min-h-[130px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-900/40 px-5 text-center"><Trophy className="mb-2 h-5 w-5 text-amber-300" /><p className="text-sm font-bold text-white">No upcoming tournaments</p><p className="mt-1 text-xs text-slate-400">New events will appear here.</p></div>}
            <Link href="/explore/tournaments" className="mt-3 flex items-center justify-center gap-1 border-t border-slate-800 pt-3 text-xs font-semibold text-cyan-300">Explore tournaments <ArrowRight className="h-3.5 w-3.5" /></Link>
          </section>

          <section className="rounded-xl border border-slate-700/70 bg-slate-950/70 p-4 sm:p-5">
            <SectionHeading icon={Crown} title="Top players" href="/explore/leaderboards" action="Leaderboards" />
            {topPlayers.length > 0 ? topPlayers.map((row: any, index: number) => <div key={row.profiles?.username ?? index} className="flex items-center gap-2.5 border-t border-slate-800/90 py-2 first:border-t-0">
              <span className={`w-5 text-center text-xs font-black ${index === 0 ? "text-amber-300" : index === 1 ? "text-slate-300" : index === 2 ? "text-orange-300" : "text-slate-500"}`}>{index + 1}</span>
              <Avatar src={row.profiles?.avatar_url} name={displayName(row.profiles)} />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white">{displayName(row.profiles)}</span>
              <span className="text-[10px] text-slate-400">{row.rating} rating</span>
              <span className="hidden text-[10px] font-bold text-amber-300 xl:block">{row.tournament_wins ?? 0} wins</span>
            </div>) : <div className="flex min-h-[130px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-900/40 px-5 text-center"><Crown className="mb-2 h-5 w-5 text-amber-300" /><p className="text-sm font-bold text-white">Rankings are warming up</p><p className="mt-1 text-xs text-slate-400">Play games to join the leaderboard.</p></div>}
            <Link href="/explore/leaderboards" className="mt-3 flex items-center justify-center gap-1 border-t border-slate-800 pt-3 text-xs font-semibold text-cyan-300">View leaderboards <ArrowRight className="h-3.5 w-3.5" /></Link>
          </section>
        </div>

        <div className="mt-5 grid gap-3 border-y border-slate-700/60 py-4 sm:grid-cols-2 lg:grid-cols-4">
          {quickLinks.map(({ title, description, href, icon: Icon, tone }) => (
            <Link key={title} href={href} className="group flex items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-white/[.035]">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-current/30 bg-slate-950/60 ${tone}`}><Icon className="h-5 w-5" /></div>
              <div className="min-w-0"><h2 className="text-xs font-extrabold uppercase text-white">{title}</h2><p className="mt-0.5 text-[10px] text-slate-400">{description}</p></div>
            </Link>
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden border-y border-slate-700/60 bg-[linear-gradient(110deg,rgba(4,12,20,.92),rgba(8,33,39,.72)),url('/chess-arena-hero-v2.png')] bg-cover bg-[center_65%] px-5 py-12 text-center sm:py-16">
        <div className="relative mx-auto max-w-3xl">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-300/10 text-emerald-300"><Globe2 className="h-6 w-6" /></div>
          <h2 className="text-2xl font-black uppercase tracking-tight text-white sm:text-4xl">Ready to enter the arena?</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-300 sm:text-base">Create your account and start battling real players from around the world.</p>
          <Link href={signupUrl} className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-400 to-emerald-500 px-7 text-sm font-black uppercase tracking-wide text-slate-950 shadow-[0_0_24px_rgba(16,230,143,.25)] transition hover:brightness-110">Join the battle <ChevronRight className="h-5 w-5" /></Link>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 px-5 py-6 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
        <Link href="/" className="flex items-center gap-2 text-slate-200"><Image src="/logo-badge.png" alt="" width={28} height={28} className="h-7 w-7" /><span className="font-bold">Crazy Chess Battles</span></Link>
        <nav className="flex flex-wrap gap-x-5 gap-y-2"><Link className="hover:text-white" href="/about">About</Link><Link className="hover:text-white" href="/faq">FAQ</Link><Link className="hover:text-white" href="/terms">Terms</Link><Link className="hover:text-white" href="/privacy">Privacy</Link></nav>
        <span>© {new Date().getFullYear()} Crazy Chess Battles</span>
      </footer>
    </main>
  );
}
