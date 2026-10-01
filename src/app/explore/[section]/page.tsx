import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BarChart3, Clock3, Crown, Gamepad2, Radio, Swords, Trophy, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import PublicHomeNav from "@/components/layout/public-home-nav";
import { pageMetadata } from "@/lib/seo/metadata";

export const dynamic = "force-dynamic";

const pages = {
  play: {
    label: "Play chess",
    title: "Choose your next game",
    description: "Find a quick match, practice against the computer, or challenge a friend. Create an account to take your seat at the board.",
    icon: Gamepad2,
  },
  battles: {
    label: "Battles",
    title: "The arena is always moving",
    description: "Follow featured games and discover the players taking on the arena. Sign up to join a battle of your own.",
    icon: Radio,
  },
  tournaments: {
    label: "Tournaments",
    title: "Find your next tournament",
    description: "Browse upcoming events, check the time control, and get ready to compete for the title.",
    icon: Trophy,
  },
  leaderboards: {
    label: "Leaderboards",
    title: "See who is climbing the ranks",
    description: "Meet top-rated players and start building a record of your own across Crazy Chess Battles.",
    icon: BarChart3,
  },
} as const;

type Section = keyof typeof pages;

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const content = pages[section as Section];
  if (!content) return pageMetadata({ title: "Explore Crazy Chess Battles", description: "Discover chess games, battles, tournaments, and player rankings.", path: "/explore" });
  return pageMetadata({
    title: `${content.label} — Crazy Chess Battles`,
    description: content.description,
    path: `/explore/${section}`,
  });
}

function Avatar({ src, name }: { src?: string | null; name: string }) {
  return src
    ? <img src={src} alt="" className="h-9 w-9 shrink-0 rounded-full border border-amber-300/50 object-cover" />
    : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-300/50 bg-slate-800 text-xs font-black text-amber-200">{name.slice(0, 1).toUpperCase()}</span>;
}

function nameOf(profile: any) {
  return profile?.display_name || profile?.username || "Player";
}

function flagOf(country?: string | null) {
  if (!country || !/^[a-z]{2}$/i.test(country)) return "";
  return String.fromCodePoint(...country.toUpperCase().split("").map((letter) => 127397 + letter.charCodeAt(0)));
}

function startsIn(dateValue: string) {
  const delta = new Date(dateValue).getTime() - Date.now();
  if (delta <= 0) return "Starting soon";
  const hours = Math.floor(delta / 3_600_000);
  if (hours >= 24) return `Starts in ${Math.floor(hours / 24)}d`;
  if (hours > 0) return `Starts in ${hours}h`;
  return `Starts in ${Math.max(1, Math.floor(delta / 60_000))}m`;
}

function signupHref(section: Section, ref?: string) {
  const params = new URLSearchParams({ redirect: section === "play" ? "/play" : section === "battles" ? "/battles" : section === "tournaments" ? "/tournaments" : "/league" });
  if (ref) params.set("ref", ref);
  return `/signup?${params.toString()}`;
}

async function getFeaturedGames() {
  const supabase = await createClient();
  const { data } = await supabase.from("games").select(`
    id, broadcast, tournament_id, initial_minutes, last_move_at,
    white:profiles!games_white_player_id_fkey(username, display_name, rating, avatar_url, country),
    black:profiles!games_black_player_id_fkey(username, display_name, rating, avatar_url, country)
  `).eq("status", "playing").order("last_move_at", { ascending: false }).limit(20);
  const games = data ?? [];
  const ids = games.map((game: any) => game.id);
  const { data: battles } = ids.length
    ? await supabase.from("battles").select("game_id, armageddon_game_id, stake").in("game_id", ids)
    : { data: [] as any[] };
  const staked = new Set((battles ?? []).filter((battle: any) => (battle.stake ?? 0) > 0).flatMap((battle: any) => [battle.game_id, battle.armageddon_game_id]).filter(Boolean));
  return games.filter((game: any) => game.white && game.black && (game.broadcast || game.tournament_id || staked.has(game.id))).slice(0, 8);
}

export default async function ExplorePage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const [{ section }, { ref }] = await Promise.all([params, searchParams]);
  if (!(section in pages)) notFound();
  const key = section as Section;
  const content = pages[key];
  const Icon = content.icon;
  const supabase = await createClient();
  const signupUrl = signupHref(key, ref);

  let games: any[] = [];
  let tournaments: any[] = [];
  let leaders: any[] = [];

  if (key === "battles") games = await getFeaturedGames();
  if (key === "tournaments") {
    const { data } = await supabase.from("tournaments").select("id, name, status, starts_at, time_control")
      .in("status", ["upcoming", "active"]).order("starts_at", { ascending: true }).limit(12);
    tournaments = data ?? [];
  }
  if (key === "leaderboards") {
    const { data } = await supabase.from("leaderboard").select("rating, wins, tournament_wins, profiles!inner(username, display_name, avatar_url, country)")
      .order("rating", { ascending: false }).limit(12);
    leaders = data ?? [];
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#050d15] text-slate-100">
      <PublicHomeNav signupUrl={signupUrl} />
      <section className="relative isolate overflow-hidden border-b border-slate-700/60">
        <Image src="/chess-arena-hero-v2.png" alt="" fill sizes="100vw" className="-z-20 object-cover object-center" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(2,8,14,.96),rgba(2,8,14,.78)_55%,rgba(2,8,14,.7)),linear-gradient(0deg,#050d15,transparent_80%)]" />
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-8 sm:py-16 lg:px-10 lg:py-20">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-slate-950/50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.18em] text-emerald-200 sm:text-xs"><Icon className="h-4 w-4" /> {content.label}</div>
            <h1 className="text-3xl font-black uppercase leading-[1.02] tracking-tight text-white sm:text-5xl lg:text-6xl">{content.title}</h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-200 sm:mt-5 sm:text-lg">{content.description}</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href={signupUrl} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-400 to-emerald-500 px-6 text-sm font-black uppercase text-slate-950 shadow-[0_0_24px_rgba(16,230,143,.28)] transition hover:brightness-110">Join the battle <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/login" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-slate-500 bg-slate-950/45 px-6 text-sm font-bold text-white transition hover:border-slate-300">Log in</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10 lg:px-10">
        {key === "play" && <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: Swords, title: "Quick match", body: "Choose a time control and get paired for a rated chess game." },
            { icon: Users, title: "Challenge a player", body: "Invite a friend or find opponents from the global community." },
            { icon: Gamepad2, title: "Practice", body: "Play against the computer and build your confidence at the board." },
          ].map(({ icon: CardIcon, title, body }) => <article key={title} className="rounded-xl border border-slate-700 bg-slate-950/75 p-5"><CardIcon className="mb-4 h-6 w-6 text-amber-300" /><h2 className="font-extrabold text-white">{title}</h2><p className="mt-2 text-sm leading-relaxed text-slate-400">{body}</p></article>)}
        </div>}

        {key === "battles" && <div className="grid gap-4 md:grid-cols-2">
          {games.length ? games.map((game: any) => <article key={game.id} className="rounded-xl border border-slate-700 bg-slate-950/75 p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-red-300"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Live match <span className="ml-auto text-slate-500">{game.initial_minutes ?? 3} min</span></div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
              <div className="flex min-w-0 items-center gap-2.5"><Avatar src={game.white?.avatar_url} name={nameOf(game.white)} /><div className="min-w-0"><div className="truncate text-sm font-bold text-white">{nameOf(game.white)}</div><div className="text-xs text-slate-400">{flagOf(game.white?.country)} {game.white?.rating ?? "—"}</div></div></div>
              <span className="text-[10px] font-black text-slate-600">VS</span>
              <div className="flex min-w-0 flex-row-reverse items-center gap-2.5 text-right"><Avatar src={game.black?.avatar_url} name={nameOf(game.black)} /><div className="min-w-0"><div className="truncate text-sm font-bold text-white">{nameOf(game.black)}</div><div className="text-xs text-slate-400">{game.black?.rating ?? "—"} {flagOf(game.black?.country)}</div></div></div>
            </div>
            <Link href={signupUrl} className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 py-2.5 text-xs font-bold text-slate-200 hover:border-emerald-300/60">Create an account to play <ArrowRight className="h-3.5 w-3.5" /></Link>
          </article>) : <EmptyState icon={Radio} title="No featured battles right now" body="Live games will appear here when players broadcast a match." />}
        </div>}

        {key === "tournaments" && <div className="grid gap-3 md:grid-cols-2">
          {tournaments.length ? tournaments.map((tournament: any) => <article key={tournament.id} className="flex items-center gap-4 rounded-xl border border-slate-700 bg-slate-950/75 p-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-amber-300/20 bg-amber-300/10 text-amber-300"><Trophy className="h-6 w-6" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate font-bold text-white">{tournament.name}</span><span className="mt-1 flex items-center gap-1.5 text-xs text-slate-400"><Clock3 className="h-3.5 w-3.5" />{tournament.status === "active" ? "In progress" : startsIn(tournament.starts_at)} · {tournament.time_control}</span></span>
            <Link href={signupUrl} className="rounded-md border border-slate-600 px-3 py-2 text-xs font-bold text-white hover:border-emerald-300">Join</Link>
          </article>) : <EmptyState icon={Trophy} title="No upcoming tournaments" body="New events will appear here as soon as they are scheduled." />}
        </div>}

        {key === "leaderboards" && <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950/80">
          <div className="grid grid-cols-[2rem_minmax(0,1fr)_5rem_5rem] gap-3 border-b border-slate-700 px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:grid-cols-[3rem_minmax(0,1fr)_7rem_7rem] sm:px-6"><span>Rank</span><span>Player</span><span className="text-right">Rating</span><span className="text-right">Wins</span></div>
          {leaders.length ? leaders.map((row: any, index: number) => <div key={row.profiles?.username ?? index} className="grid grid-cols-[2rem_minmax(0,1fr)_5rem_5rem] items-center gap-3 border-b border-slate-800 px-4 py-3 last:border-0 sm:grid-cols-[3rem_minmax(0,1fr)_7rem_7rem] sm:px-6">
            <span className={`text-sm font-black ${index === 0 ? "text-amber-300" : index < 3 ? "text-slate-300" : "text-slate-500"}`}>{index + 1}</span>
            <span className="flex min-w-0 items-center gap-2.5"><Avatar src={row.profiles?.avatar_url} name={nameOf(row.profiles)} /><span className="truncate text-sm font-bold text-white">{nameOf(row.profiles)} <span className="ml-1 text-xs font-normal text-slate-500">{flagOf(row.profiles?.country)}</span></span></span>
            <span className="text-right text-sm font-semibold text-slate-200">{row.rating}</span><span className="text-right text-sm text-slate-400">{row.wins ?? 0}</span>
          </div>) : <div className="p-8 text-center text-sm text-slate-400">Rankings will appear here when player data is available.</div>}
        </div>}
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col gap-4 border-t border-slate-800 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
        <Link href="/" className="flex items-center gap-2 text-slate-200"><Image src="/logo-badge.png" alt="" width={26} height={26} /><span className="font-bold">Crazy Chess Battles</span></Link>
        <span>Play. Compete. Rise.</span>
      </footer>
    </main>
  );
}

function EmptyState({ icon: Icon, title, body }: { icon: typeof Radio; title: string; body: string }) {
  return <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-950/65 px-5 text-center md:col-span-2"><Icon className="mb-3 h-6 w-6 text-amber-300" /><h2 className="font-bold text-white">{title}</h2><p className="mt-1 text-sm text-slate-400">{body}</p></div>;
}
