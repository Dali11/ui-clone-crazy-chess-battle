import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Image from "next/image";


export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username, bio, rating, games_played, wins, avatar_url")
    .eq("username", username)
    .single();

  if (!profile) {
    return {
      title: "Player Not Found",
      robots: { index: false, follow: false },
    };
  }

  const name = profile.display_name || profile.username;
  return {
    title: `${name} — Chess Profile`,
    description: profile.bio
      ? `${name} (rating ${profile.rating}) — ${profile.bio}`
      : `View ${name}'s chess profile: rating ${profile.rating}, ${profile.games_played} games played, ${profile.wins} wins. See game history and stats.`,
    openGraph: {
      title: `${name} — Crazy Chess Battles Profile`,
      description: `Rating ${profile.rating} · ${profile.games_played} games · ${profile.wins} wins`,
      images: profile.avatar_url ? [{ url: profile.avatar_url }] : undefined,
    },
    alternates: { canonical: `https://crazychessbattles.live/profile/${username}` },
  };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .single();

  if (!profile) notFound();

  // Recent games
  const { data: games } = await supabase
    .from("games")
    .select("id, status, winner, time_control, white_player_id, black_player_id, created_at")
    .or(`white_player_id.eq.${profile.id},black_player_id.eq.${profile.id}`)
    .order("created_at", { ascending: false })
    .limit(10);

  const winRate = profile.games_played
    ? Math.round((profile.wins / profile.games_played) * 100)
    : 0;

  const getTier = (rating: number) => {
    if (rating >= 2200) return { label: "Master", color: "text-purple-400" };
    if (rating >= 1900) return { label: "Diamond", color: "text-cyan-400" };
    if (rating >= 1600) return { label: "Platinum", color: "text-emerald-400" };
    if (rating >= 1300) return { label: "Gold", color: "text-ccb-accent" };
    if (rating >= 1000) return { label: "Silver", color: "text-ccb-silver" };
    return { label: "Bronze", color: "text-ccb-bronze" };
  };

  const tier = getTier(profile.rating);

  return (
    <div className="space-y-6 pb-20 sm:pb-0">
      {/* Profile header */}
      <div className="card">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center overflow-hidden shrink-0">
            {profile.avatar_url ? (
              <Image src={profile.avatar_url} alt={profile.display_name || profile.username} width={64} height={64} className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-bold text-ccb-primary">
                {(profile.display_name || profile.username).charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{profile.display_name || profile.username}</h1>
            <p className="text-sm text-ccb-muted">@{profile.username}</p>
            <div className="flex items-center gap-3 mt-2">
              <span className={`text-lg font-bold ${tier.color}`}>{profile.rating}</span>
              <span className={`badge bg-ccb-surface ${tier.color}`}>{tier.label}</span>
            </div>
          </div>
        </div>

        {profile.bio && (
          <p className="text-sm text-ccb-muted mt-4">{profile.bio}</p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="text-xs text-ccb-muted mb-1">Games</div>
          <div className="text-2xl font-bold">{profile.games_played}</div>
        </div>
        <div className="card">
          <div className="text-xs text-ccb-muted mb-1">Wins</div>
          <div className="text-2xl font-bold text-ccb-success">{profile.wins}</div>
        </div>
        <div className="card">
          <div className="text-xs text-ccb-muted mb-1">Win Rate</div>
          <div className="text-2xl font-bold">{winRate}%</div>
        </div>
        <div className="card">
          <div className="text-xs text-ccb-muted mb-1">Tournaments Won</div>
          <div className="text-2xl font-bold text-ccb-accent">{profile.tournaments_won}</div>
        </div>
      </div>

      {/* Game history */}
      <div className="card">
        <h3 className="font-bold mb-4">Game History</h3>
        {games && games.length > 0 ? (
          <div className="space-y-2">
            {games.map((game) => {
              const isWhite = game.white_player_id === profile.id;
              const won = game.winner === (isWhite ? "white" : "black");
              const drew = game.status === "draw";
              const result = won ? "W" : drew ? "D" : "L";
              const resultColor = won ? "text-ccb-success" : drew ? "text-ccb-silver" : "text-ccb-danger";

              return (
                <div
                  key={game.id}
                  className="flex items-center justify-between rounded-lg bg-ccb-surface px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-bold w-6 ${resultColor}`}>{result}</span>
                    <span className="text-sm capitalize">{game.time_control}</span>
                  </div>
                  <span className="text-xs text-ccb-muted">
                    {new Date(game.created_at).toLocaleDateString()}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-ccb-muted">No games played yet.</p>
        )}
      </div>
    </div>
  );
}
