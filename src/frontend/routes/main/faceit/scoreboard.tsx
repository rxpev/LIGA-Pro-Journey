import React, { useEffect, useState } from "react";
import { Constants } from "@liga/shared";

export interface ScoreboardProps {
  matchId: number;
}

export interface PlayerRow {
  id: number;
  name: string;
}

export interface ScorebotEvent {
  id: number;
  type: string;
  payload: unknown;
  attackerId: number | null;
  victimId: number | null;
  assistId: number | null;
  headshot: boolean;
}

export interface MatchRecord {
  id: number;
  status: number;
  payload?: string | null;
  faceitTeammates?: string | null;
  faceitOpponents?: string | null;
  competitors?: {
    id: number;
    teamId: number;
    score: number;
  }[];
}

export default function Scoreboard({ matchId }: ScoreboardProps) {
  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<MatchRecord | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [events, setEvents] = useState<ScorebotEvent[]>([]);

  useEffect(() => {
    if (!matchId) return;
    load();
  }, [matchId]);

  async function load() {
    try {
      const data = await api.faceit.getMatchData(matchId);

      setMatch(data.match as MatchRecord);
      setPlayers(data.players as PlayerRow[]);
      setEvents(data.events as ScorebotEvent[]);
      setLoading(false);
    } catch (err) {
      console.error("Scoreboard load error:", err);
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="text-gray-400">Loading…</div>;
  }

  if (!match) {
    return (
      <div className="text-red-500 text-xl text-center mt-6">
        Match not found.
      </div>
    );
  }

  if (match.status !== Constants.MatchStatus.COMPLETED) {
    return (
      <div className="text-gray-400 text-xl font-semibold mt-8 text-center">
        Match is still in progress…
      </div>
    );
  }

  // ------------------------------
  // EXTRACT TEAM SCORES
  // ------------------------------

  const scoreTeam1 =
    match.competitors?.find((c) => c.teamId === 1)?.score ?? 0;
  const scoreTeam2 =
    match.competitors?.find((c) => c.teamId === 2)?.score ?? 0;

  const payload = match.payload ? JSON.parse(match.payload) : {};
  const teamA = payload.teamA || [];
  const userId = teamA.length > 0 ? teamA[0].id : null;

  const teammatesRaw = match.faceitTeammates
    ? JSON.parse(match.faceitTeammates)
    : [];
  const opponentsRaw = match.faceitOpponents
    ? JSON.parse(match.faceitOpponents)
    : [];

  const isUserTeam1 = teammatesRaw.some((p: any) => p.id === userId);

  const userScore = isUserTeam1 ? scoreTeam1 : scoreTeam2;
  const oppScore = isUserTeam1 ? scoreTeam2 : scoreTeam1;

  const userWon = userScore > oppScore;
  const oppWon = oppScore > userScore;

  // ------------------------------
  // BUILD FACEIT TEAM SPLIT
  // ------------------------------

  let teamAIds = new Set<number>();
  let teamBIds = new Set<number>();

  try {
    if (match.faceitTeammates) {
      const teammates = JSON.parse(match.faceitTeammates) as PlayerRow[];
      teamAIds = new Set(teammates.map((p) => p.id));
    }

    if (match.faceitOpponents) {
      const opponents = JSON.parse(match.faceitOpponents) as PlayerRow[];
      teamBIds = new Set(opponents.map((p) => p.id));
    }
  } catch (err) {
    console.warn("Failed to parse FACEIT JSON:", err);
  }

  // ------------------------------
  // BUILD PLAYER STATS
  // ------------------------------

  const stats = players.map((p) => {
    const kills = events.filter((e) => e.type === "playerkilled" && e.attackerId === p.id).length;
    const deaths = events.filter((e) => e.type === "playerkilled" && e.victimId === p.id).length;
    const assists = events.filter((e) => e.type === "playerassisted" && e.assistId === p.id).length;

    const headshots = events.filter(
      (e) => e.type === "playerkilled" && e.attackerId === p.id && e.headshot
    ).length;

    const hsPercent = kills > 0 ? Math.round((headshots / kills) * 100) : 0;
    const kdRatio = deaths > 0 ? kills / deaths : kills;

    return {
      id: p.id,
      name: p.name,
      kills,
      deaths,
      assists,
      hs: hsPercent,
      kdRatio,
    };
  });

  // ------------------------------
  // SPLIT TEAMS
  // ------------------------------

  const rawTeamAStats =
    teamAIds.size > 0 ? stats.filter((s) => teamAIds.has(s.id)) : [];
  const rawTeamBStats =
    teamBIds.size > 0 ? stats.filter((s) => teamBIds.has(s.id)) : [];

  const finalA =
    rawTeamAStats.length > 0
      ? rawTeamAStats
      : stats.slice(0, Math.ceil(stats.length / 2));

  const finalB =
    rawTeamBStats.length > 0
      ? rawTeamBStats
      : stats.slice(Math.ceil(stats.length / 2));

  const userTeamStats = isUserTeam1 ? finalA : finalB;
  const oppTeamStats = isUserTeam1 ? finalB : finalA;

  // ------------------------------
  // SORTING
  // ------------------------------

  const sortPlayers = (arr: typeof finalA) =>
    [...arr].sort((a, b) => {
      if (b.kills !== a.kills) return b.kills - a.kills;
      return b.kdRatio - a.kdRatio;
    });

  const sortedUserTeam = sortPlayers(userTeamStats);
  const sortedOppTeam = sortPlayers(oppTeamStats);

  const teamAName =
    teammatesRaw.length > 0
      ? `Team_${teammatesRaw[0]?.name ?? "A"}`
      : "Team A";

  const teamBName =
    opponentsRaw.length > 0
      ? `Team_${opponentsRaw[0]?.name ?? "B"}`
      : "Team B";

  const leftName = isUserTeam1 ? teamAName : teamBName;
  const rightName = isUserTeam1 ? teamBName : teamAName;

  return (
    <div className="p-6 flex flex-col gap-8">
      <h2 className="text-3xl font-bold text-center mb-2">Scoreboard</h2>

      {/* BIG FINAL SCORE */}
      <div className="flex justify-center items-center text-center mb-6">
        <span
          className={`text-5xl font-extrabold mx-4 ${userWon ? "text-green-400" : "text-gray-300"
            }`}
        >
          {userScore}
        </span>

        <span className="text-4xl font-bold text-gray-400">–</span>

        <span
          className={`text-5xl font-extrabold mx-4 ${oppWon ? "text-green-400" : "text-gray-300"
            }`}
        >
          {oppScore}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-8">
        <TeamTable name={leftName} stats={sortedUserTeam} />
        <TeamTable name={rightName} stats={sortedOppTeam} />
      </div>
    </div>
  );
}

interface TeamTableProps {
  name: string;
  stats: {
    id: number;
    name: string;
    kills: number;
    deaths: number;
    assists: number;
    hs: number;
    kdRatio: number;
  }[];
}

function TeamTable({ name, stats }: TeamTableProps) {
  return (
    <div className="faceit-scoreboard">
      <h3 className="text-xl font-semibold mb-4 text-center">{name}</h3>

      <table className="w-full">
        <thead className="bg-[#ff7300]/90 text-black!">
          <tr className="text-sm uppercase">
            <th className="px-2 py-1 text-left">Name</th>
            <th className="px-2 py-1 text-center w-12">K</th>
            <th className="px-2 py-1 text-center w-12">D</th>
            <th className="px-2 py-1 text-center w-12">A</th>
            <th className="px-2 py-1 text-center w-16">HS%</th>
            <th className="px-2 py-1 text-center w-16">K/D</th>
          </tr>
        </thead>

        <tbody>
          {stats.map((p) => (
            <tr key={p.id} className="border-t border-gray-800">
              <td className="py-2 text-left">{p.name}</td>
              <td className="py-2 text-center">{p.kills}</td>
              <td className="py-2 text-center">{p.deaths}</td>
              <td className="py-2 text-center">{p.assists}</td>
              <td className="py-2 text-center">{p.hs}%</td>
              <td className="py-2 text-center">
                {p.deaths === 0
                  ? p.kills.toFixed(2)
                  : (p.kills / p.deaths).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
