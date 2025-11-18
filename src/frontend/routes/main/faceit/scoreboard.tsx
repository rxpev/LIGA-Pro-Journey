import React, { useEffect, useState } from "react";
import { Constants } from "@liga/shared";

// ---- Types --------------------------------------------------------

type PlayerRow = {
  id: number;
  name: string;
};

type ScorebotEvent = {
  id: number;
  type: string;
  payload: any;
  attackerId: number | null;
  victimId: number | null;
  assistId: number | null;
  headshot: boolean;
};

interface ScoreboardProps {
  matchId: number | string;
}

// ---- Component -----------------------------------------------------

export default function Scoreboard({ matchId }: ScoreboardProps) {
  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<any>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [events, setEvents] = useState<ScorebotEvent[]>([]);

  useEffect(() => {
    if (matchId == null) return;
    load();
  }, [matchId]);

  async function load() {
    try {
      const numericId =
        typeof matchId === "string" ? Number(matchId) : matchId;

      if (!numericId || Number.isNaN(numericId)) {
        setMatch(null);
        setPlayers([]);
        setEvents([]);
        setLoading(false);
        return;
      }

      const data = await api.faceit.getMatchData(numericId);

      setMatch(data.match);
      setPlayers(data.players);
      setEvents(data.events);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="text-gray-400">Loading…</div>;
  }

  if (!match || match.status !== Constants.MatchStatus.COMPLETED) {
    return (
      <div className="text-gray-400 text-xl font-semibold mt-8 text-center">
        Match is still in progress…
      </div>
    );
  }

  // ================================================================
  // FACEIT TEAM SPLIT
  // ================================================================

  let teamAIds = new Set<number>();
  let teamBIds = new Set<number>();

  try {
    const teammates = match?.faceitTeammates
      ? JSON.parse(match.faceitTeammates)
      : [];
    const opponents = match?.faceitOpponents
      ? JSON.parse(match.faceitOpponents)
      : [];

    teamAIds = new Set(teammates.map((p: PlayerRow) => p.id));
    teamBIds = new Set(opponents.map((p: PlayerRow) => p.id));
  } catch (e) {
    console.warn("Failed to parse FACEIT team JSON:", e);
  }

  // ================================================================
  // BUILD STATS PER PLAYER
  // ================================================================

  const stats = players.map((p: PlayerRow) => {
    const kills = events.filter((e: ScorebotEvent) => e.attackerId === p.id).length;
    const deaths = events.filter((e: ScorebotEvent) => e.victimId === p.id).length;
    const assists = events.filter((e: ScorebotEvent) => e.assistId === p.id).length;

    const headshots = events.filter(
      (e: ScorebotEvent) => e.attackerId === p.id && e.headshot
    ).length;

    const hs = kills > 0 ? Math.round((headshots / kills) * 100) : 0;

    const kdRatio = deaths > 0 ? kills / deaths : kills; // for sorting

    return {
      id: p.id,
      name: p.name,
      kills,
      deaths,
      assists,
      hs,
      kdRatio,
    };
  });

  // ================================================================
  // TEAM SPLIT + SORTING
  // ================================================================

  const teamA =
    teamAIds.size > 0
      ? stats.filter((s) => teamAIds.has(s.id))
      : [];

  const teamB =
    teamBIds.size > 0
      ? stats.filter((s) => teamBIds.has(s.id))
      : [];

  // Fallback (no JSON)
  const finalA =
    teamA.length || teamB.length
      ? teamA
      : stats.slice(0, Math.ceil(stats.length / 2));

  const finalB =
    teamA.length || teamB.length
      ? teamB
      : stats.slice(Math.ceil(stats.length / 2));

  // ---- SORTING ----
  const sortPlayers = (arr: typeof stats) =>
    [...arr].sort((a, b) => {
      if (b.kills !== a.kills) return b.kills - a.kills; // primary
      return b.kdRatio - a.kdRatio; // secondary
    });

  const sortedA = sortPlayers(finalA);
  const sortedB = sortPlayers(finalB);

  // ================================================================
  // RENDER
  // ================================================================

  return (
    <div className="p-6 flex flex-col gap-8">
      <h2 className="text-3xl font-bold text-center">Scoreboard</h2>

      <div className="grid grid-cols-2 gap-8">
        <TeamTable
          name={
            sortedA.length > 0
              ? `Team_${sortedA[0].name}`
              : "Team A"
          }
          stats={sortedA}
        />

        <TeamTable
          name={
            sortedB.length > 0
              ? `Team_${sortedB[0].name}`
              : "Team B"
          }
          stats={sortedB}
        />
      </div>
    </div>
  );
}

// ---- Team Table ----------------------------------------------------

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
    <div className="bg-[#111] rounded-lg p-4 shadow-md border border-[#ff7300]/40">
      <h3 className="text-xl font-semibold mb-4 text-center">{name}</h3>

      <table className="w-full">
        <thead className="!bg-[#ff7300]/90 text-black">
          <tr className="text-sm uppercase">
            <th className="px-2 py-1 text-left">Name</th>

            {/* STAT COLUMNS GROUP RIGHT, BUT TEXT CENTERED */}
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

              {/* REAL K/D RATIO */}
              <td className="py-2 text-center">
                {p.deaths === 0 ? p.kills.toFixed(2) : (p.kills / p.deaths).toFixed(2)}
              </td>

            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

