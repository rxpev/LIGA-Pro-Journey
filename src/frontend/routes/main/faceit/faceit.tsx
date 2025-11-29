import React, { useEffect, useState } from "react";
import MatchRoom from "./matchroom";
import { AppStateContext } from "@liga/frontend/redux";
import { faceitRoomSet, faceitRoomClear } from "@liga/frontend/redux/actions";
import { shuffle } from "lodash";

import Scoreboard from "./scoreboard";

import faceitLogo from "../../../assets/faceit/faceit.png";
import level1 from "../../../assets/faceit/1.png";
import level2 from "../../../assets/faceit/2.png";
import level3 from "../../../assets/faceit/3.png";
import level4 from "../../../assets/faceit/4.png";
import level5 from "../../../assets/faceit/5.png";
import level6 from "../../../assets/faceit/6.png";
import level7 from "../../../assets/faceit/7.png";
import level8 from "../../../assets/faceit/8.png";
import level9 from "../../../assets/faceit/9.png";
import level10 from "../../../assets/faceit/10.png";
import killsIcon from "../../../assets/faceit/kills.png";
import deathsIcon from "../../../assets/faceit/deaths.png";
import headshotIcon from "../../../assets/faceit/headshot.png";
import { Image } from "@liga/frontend/components";
import { Constants, Util } from "@liga/shared";

export const LEVEL_IMAGES = [
  null,
  level1,
  level2,
  level3,
  level4,
  level5,
  level6,
  level7,
  level8,
  level9,
  level10,
];

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

type RecentMatch = {
  id: number;
  map: string;
  yourTeamWon: boolean;
  eloDelta?: number | null;
  scoreA: number | null;
  scoreB: number | null;
};

type MatchPlayer = {
  id: number;
  name: string;
  elo: number;
  level: number;
  countryId: number;
};

type MatchRoomData = {
  fakeRoomId: string;
  teamA: MatchPlayer[];
  teamB: MatchPlayer[];
  expectedWinA: number;
  expectedWinB: number;
  eloGain: number;
  eloLoss: number;
};

const LEVEL_RANGES: Record<number, [number, number]> = {
  1: [100, 800],
  2: [801, 950],
  3: [951, 1100],
  4: [1101, 1250],
  5: [1251, 1400],
  6: [1401, 1550],
  7: [1551, 1700],
  8: [1701, 1850],
  9: [1851, 2000],
  10: [2001, 10000],
};

// ---------------------------------------------------------------------------
// MAIN COMPONENT
// ---------------------------------------------------------------------------

export default function Faceit(): JSX.Element {
  const { state, dispatch } = React.useContext(AppStateContext);

  const activeMatch = state.faceitMatchRoom;
  const matchCompleted = state.faceitMatchCompleted;

  const [showMatchRoom, setShowMatchRoom] = useState(false);

  // PROFILE + STATS
  const [elo, setElo] = useState(0);
  const [level, setLevel] = useState(0);
  const [recent, setRecent] = useState<RecentMatch[]>([]);
  const [lifetime, setLifetime] = useState<any | null>(null);
  const [last20, setLast20] = useState<any | null>(null);

  const [loading, setLoading] = useState(true);

  // QUEUE
  const [queueing, setQueueing] = useState(false);
  const [queueTimer, setQueueTimer] = useState(0);
  const [queueInterval, setQueueInterval] = useState<any>(null);

  // SCOREBOARD OVERLAY
  const [viewMatchId, setViewMatchId] = useState<number | null>(null);
  const [scoreboardData, setScoreboardData] = useState<any | null>(null);
  const [loadingScoreboard, setLoadingScoreboard] = useState(false);

  // -------------------------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------------------------

  const refreshProfile = async () => {
    const [profileData, last20Stats] = await Promise.all([
      api.faceit.profile(),
      api.faceit.last20Stats?.(),
    ]);

    const enrichedRecent: RecentMatch[] = [];

    // Fetch scoreboard info for each recent match
    for (const rm of profileData.recent || []) {
      const md = await api.faceit.getMatchData(rm.id);

      let scoreA: number | null = null;
      let scoreB: number | null = null;

      if (md?.match?.competitors) {
        const comp = md.match.competitors as { teamId: number; score: number }[];

        scoreA = comp.find((c) => c.teamId === 1)?.score ?? null;
        scoreB = comp.find((c) => c.teamId === 2)?.score ?? null;
      }

      enrichedRecent.push({
        ...rm,
        scoreA,
        scoreB,
      });
    }

    setElo(profileData.faceitElo);
    setLevel(profileData.faceitLevel);
    setRecent(enrichedRecent); // <---- now includes scores
    setLifetime(profileData.lifetime || null);

    if (last20Stats) setLast20(last20Stats);
  };

  // Auto-remove match room ONLY if already closed
  useEffect(() => {
    if (state.faceitMatchCompleted && !showMatchRoom) {
      dispatch(faceitRoomClear());
    }
  }, [state.faceitMatchCompleted, showMatchRoom, dispatch]);

  // Refresh profile (elo + recent matches) once we leave the match room
  useEffect(() => {
    if (state.faceitMatchCompleted && !showMatchRoom) {
      refreshProfile();
    }
  }, [state.faceitMatchCompleted, showMatchRoom]);

  // COUNTRY MAP
  const COUNTRY_BY_ID = React.useMemo(() => {
    const map = new Map<number, string>();
    for (const continent of state.continents as any[]) {
      for (const country of continent.countries as any[]) {
        map.set(country.id, country.code.toLowerCase());
      }
    }
    return map;
  }, [state.continents]);

  // SETTINGS (for map labels + images)
  const settingsAll = React.useMemo(() => {
    if (!state.profile) return Constants.Settings;
    return Util.loadSettings(state.profile.settings);
  }, [state.profile]);

  const gameSlug = settingsAll.general.game;

  // Load profile + stats initially
  useEffect(() => {
    (async () => {
      try {
        await refreshProfile();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load SCOREBOARD (overlay)
  useEffect(() => {
    if (!viewMatchId) return;
    setLoadingScoreboard(true);

    api.faceit
      .getMatchData(viewMatchId)
      .then((res) => setScoreboardData(res))
      .finally(() => setLoadingScoreboard(false));
  }, [viewMatchId]);

  // ---------------------------------------------------------------------------
  // QUEUE SYSTEM
  // ---------------------------------------------------------------------------

  const startQueue = () => {
    if (queueing || activeMatch) return;
    setQueueing(true);
    setQueueTimer(0);

    const interval = setInterval(() => {
      setQueueTimer((t) => {
        if (t >= 12) {
          clearInterval(interval);
          finishQueue();
        }
        return t + 1;
      });
    }, 1000);

    setQueueInterval(interval);
  };

  const cancelQueue = () => {
    if (queueInterval) clearInterval(queueInterval);
    setQueueInterval(null);
    setQueueing(false);
    setQueueTimer(0);
  };

  const finishQueue = async () => {
    try {
      const res = await api.faceit.queue();

      const shuffledTeamA = shuffle(res.teamA);
      const shuffledTeamB = shuffle(res.teamB);

      dispatch(
        faceitRoomSet(
          {
            ...res,
            teamA: shuffledTeamA,
            teamB: shuffledTeamB,
          },
          null
        )
      );

      setShowMatchRoom(true);
    } finally {
      setQueueing(false);
      setQueueTimer(0);
      if (queueInterval) clearInterval(queueInterval);
      setQueueInterval(null);
    }
  };

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  if (loading) return <div>Loading FACEIT…</div>;

  const [low, high] = LEVEL_RANGES[level] ?? [0, 100];
  const pct = level === 10 ? 100 : ((elo - low) / (high - low)) * 100;

  const currentMatch = showMatchRoom && activeMatch ? activeMatch : null;

  return (
    <div className="w-full h-full bg-[#0b0b0b] text-white relative">
      {/* SCOREBOARD OVERLAY */}
      {viewMatchId && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50 p-8">
          <div className="bg-[#0f0f0f] w-full h-full rounded-lg border border-[#ffffff20] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Match #{viewMatchId}</h2>

              <button
                className="px-3 py-1 rounded bg-neutral-700 hover:bg-neutral-600"
                onClick={() => setViewMatchId(null)}
              >
                Close
              </button>
            </div>

            {loadingScoreboard ? (
              <div>Loading scoreboard…</div>
            ) : scoreboardData ? (
              <Scoreboard matchId={viewMatchId} />
            ) : (
              <div>Match not found.</div>
            )}
          </div>
        </div>
      )}

      {/* MAIN */}
      {currentMatch ? (
        <MatchRoom
          room={currentMatch}
          countryMap={COUNTRY_BY_ID}
          onClose={() => setShowMatchRoom(false)}
          onEloUpdate={refreshProfile}
          elo={elo}
          level={level}
          pct={pct}
          low={low}
          high={high}
        />
      ) : (
        <>
          <FaceitHeader elo={elo} level={level} pct={pct} low={low} high={high} />

          <NormalFaceitBody
            recent={recent}
            lifetime={lifetime}
            last20={last20}
            onOpenRecent={(id) => setViewMatchId(id)}
            startQueue={startQueue}
            cancelQueue={cancelQueue}
            queueing={queueing}
            queueTimer={queueTimer}
            activeMatch={activeMatch}
            reopenMatchRoom={() => setShowMatchRoom(true)}
            gameSlug={gameSlug}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HEADER BAR
// ---------------------------------------------------------------------------

interface FaceitHeaderProps {
  elo: number;
  level: number;
  pct: number;
  low: number;
  high: number;
}

export function FaceitHeader({ elo, level, pct, low, high }: FaceitHeaderProps) {
  const displayPct = level === 10 ? 100 : pct;

  return (
    <div className="w-full bg-[#0f0f0f] border-b border-[#ff7300]/60 py-4 shadow-lg flex items-center justify-between">
      <img src={faceitLogo} className="h-10 ml-4 select-none" />

      <div className="flex items-center gap-3 mr-6 px-4 py-2 rounded-md bg-[#0b0b0b]/70 border border-[#ffffff15] shadow-lg shadow-black/40 backdrop-blur-sm">
        <img src={LEVEL_IMAGES[level]} className="h-10 w-10" />

        <div className="flex flex-col w-56">
          <div className="text-xl font-bold">{elo}</div>

          <div className="w-full h-2 bg-neutral-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#ff7300]"
              style={{ width: `${Math.min(100, Math.max(0, displayPct))}%` }}
            />
          </div>

          <div className="flex justify-between text-xs opacity-80 mt-1">
            <span>{low}</span>
            <span className="text-center w-full">
              {level === 10 ? "MAX LEVEL" : `-${elo - low}/+${high - elo}`}
            </span>
            <span>{level === 10 ? "∞" : high}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAIN BODY
// ---------------------------------------------------------------------------

interface NormalFaceitBodyProps {
  recent: RecentMatch[];
  lifetime: any | null;
  last20: any | null;
  onOpenRecent: (id: number) => void;

  startQueue: () => void;
  cancelQueue: () => void;
  queueing: boolean;
  queueTimer: number;

  activeMatch: MatchRoomData | null;
  reopenMatchRoom: () => void;

  gameSlug: string;
}

function NormalFaceitBody({
  recent,
  lifetime,
  last20,
  onOpenRecent,
  startQueue,
  cancelQueue,
  queueing,
  queueTimer,
  activeMatch,
  reopenMatchRoom,
  gameSlug,
}: NormalFaceitBodyProps) {
  // ALL-TIME
  const kills = lifetime ? lifetime.kills : 0;
  const deaths = lifetime ? lifetime.deaths : 0;
  const hsPercent = lifetime ? Math.round(lifetime.hsPercent) : 0;
  const kdRatio = lifetime ? lifetime.kdRatio.toFixed(2) : "—";
  const winRate = lifetime ? Math.round(lifetime.winRate) : "—";
  const matchesPlayed = lifetime ? lifetime.matchesPlayed : "—";
  const gameEnum = gameSlug as Constants.Game;

  // LAST 20 GAMES
  const lastKills = last20 ? last20.kills : 0;
  const lastDeaths = last20 ? last20.deaths : 0;
  const lastHsPercent = last20 ? Math.round(last20.hsPercent) : 0;
  const lastKdRatio = last20 ? last20.kdRatio.toFixed(2) : "—";
  const lastWinRate = last20 ? Math.round(last20.winRate) : "—";
  const lastMatchesPlayed = last20 ? last20.matchesPlayed : "—";

  return (
    <div className="grid grid-cols-3 gap-6 p-6 h-[calc(100vh-160px)]">
      {/* ------------------------------------------------------------------- */}
      {/* STATISTICS */}
      {/* ------------------------------------------------------------------- */}
      <div className="bg-[#0f0f0f] rounded-lg border border-[#ffffff15] flex flex-col overflow-y-auto">
        {/* TOP HEADER — STATISTICS */}
        <div className="bg-[#0c0c0c] py-3 flex justify-center items-center border-b border-[#ff7300]/40">
          <h2 className="text-lg font-bold">STATISTICS</h2>
        </div>

        {/* ALL TIME CARD */}
        <div className="mx-6 mt-4 mb-2 bg-neutral-900/40 rounded-lg p-4 text-center border border-[#ffffff10]">
          <h1 className="text-lg font-bold tracking-wide">ALL TIME</h1>
        </div>

        {/* GRID ALL-TIME */}
        <div className="grid grid-cols-3 grid-rows-2 gap-4 px-4 pb-4">
          {/* KILLS */}
          <div className="bg-neutral-900/40 rounded-lg flex flex-col items-center justify-center p-3 h-28">
            <img src={killsIcon} className="w-10 h-10 mb-2 opacity-90" />
            <div className="text-lg font-bold">{kills}</div>
            <div className="text-xs opacity-60 mt-1">Kills</div>
          </div>

          {/* DEATHS */}
          <div className="bg-neutral-900/40 rounded-lg flex flex-col items-center justify-center p-3 h-28">
            <img src={deathsIcon} className="w-10 h-10 mb-2 opacity-90" />
            <div className="text-lg font-bold">{deaths}</div>
            <div className="text-xs opacity-60 mt-1">Deaths</div>
          </div>

          {/* HS% */}
          <div className="bg-neutral-900/40 rounded-lg flex flex-col items-center justify-center p-3 h-28">
            <img src={headshotIcon} className="w-10 h-10 mb-2 opacity-90" />
            <div className="text-lg font-bold">{hsPercent}%</div>
            <div className="text-xs opacity-60 mt-1">HS%</div>
          </div>

          {/* K/D */}
          <div className="bg-neutral-900/40 rounded-lg flex flex-col items-center justify-center p-3 h-28">
            <div className="text-xl font-bold">{kdRatio}</div>
            <div className="text-xs opacity-60 mt-1">K/D</div>
          </div>

          {/* WIN RATE */}
          <div className="bg-neutral-900/40 rounded-lg flex flex-col items-center justify-center p-3 h-28">
            <div className="text-xl font-bold">{winRate}%</div>
            <div className="text-xs opacity-60 mt-1">Win Rate</div>
          </div>

          {/* MATCHES PLAYED */}
          <div className="bg-neutral-900/40 rounded-lg flex flex-col items-center justify-center p-3 h-28">
            <div className="text-xl font-bold">{matchesPlayed}</div>
            <div className="text-xs opacity-60 mt-1">Matches</div>
          </div>
        </div>

        {/* LAST 20 GAMES HEADER */}
        <div className="mx-6 mt-2 mb-2 bg-neutral-900/40 rounded-lg p-4 text-center border border-[#ffffff10]">
          <h1 className="text-lg font-bold tracking-wide">LAST 20 GAMES</h1>
        </div>

        {/* GRID LAST 20 */}
        <div className="grid grid-cols-3 grid-rows-2 gap-4 px-4 pb-6">
          {/* KILLS */}
          <div className="bg-neutral-900/40 rounded-lg flex flex-col items-center justify-center p-3 h-28">
            <img src={killsIcon} className="w-10 h-10 mb-2 opacity-90" />
            <div className="text-lg font-bold">{lastKills}</div>
            <div className="text-xs opacity-60 mt-1">Kills</div>
          </div>

          {/* DEATHS */}
          <div className="bg-neutral-900/40 rounded-lg flex flex-col items-center justify-center p-3 h-28">
            <img src={deathsIcon} className="w-10 h-10 mb-2 opacity-90" />
            <div className="text-lg font-bold">{lastDeaths}</div>
            <div className="text-xs opacity-60 mt-1">Deaths</div>
          </div>

          {/* HS% */}
          <div className="bg-neutral-900/40 rounded-lg flex flex-col items-center justify-center p-3 h-28">
            <img src={headshotIcon} className="w-10 h-10 mb-2 opacity-90" />
            <div className="text-lg font-bold">{lastHsPercent}%</div>
            <div className="text-xs opacity-60 mt-1">HS%</div>
          </div>

          {/* K/D */}
          <div className="bg-neutral-900/40 rounded-lg flex flex-col items-center justify-center p-3 h-28">
            <div className="text-xl font-bold">{lastKdRatio}</div>
            <div className="text-xs opacity-60 mt-1">K/D</div>
          </div>

          {/* WIN RATE */}
          <div className="bg-neutral-900/40 rounded-lg flex flex-col items-center justify-center p-3 h-28">
            <div className="text-xl font-bold">{lastWinRate}%</div>
            <div className="text-xs opacity-60 mt-1">Win Rate</div>
          </div>

          {/* MATCHES PLAYED */}
          <div className="bg-neutral-900/40 rounded-lg flex flex-col items-center justify-center p-3 h-28">
            <div className="text-xl font-bold">{lastMatchesPlayed}</div>
            <div className="text-xs opacity-60 mt-1">Matches</div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* MATCHMAKING BUTTON */}
      {/* ------------------------------------------------------------------- */}
      {/* MATCHMAKING BUTTON */}
      <div className="bg-[#0f0f0f] rounded-lg border border-[#ffffff15] flex flex-col">
        <div className="w-full bg-[#0c0c0c] py-3 flex justify-center items-center border-b border-[#ff7300]/40">
          <h2 className="text-lg font-bold">MATCHMAKING</h2>
        </div>

        {/* Move button up using items-start + pt-20 */}
        <div className="flex-1 flex items-start justify-center pt-20">
          <div className="relative">
            {activeMatch ? (
              <button
                onClick={reopenMatchRoom}
                className="w-56 py-5 text-xl rounded text-white shadow-lg bg-orange-600 hover:bg-orange-700 text-center"
              >
                GO TO MATCH
              </button>
            ) : (
              <>
                <button
                  onClick={!queueing ? startQueue : undefined}
                  className={`
              w-56 py-5 text-xl rounded text-white shadow-lg transition-all text-center
              ${queueing ? "bg-orange-600 cursor-default" : "bg-orange-600 hover:bg-orange-700"}
            `}
                >
                  {!queueing ? "FIND MATCH" : `SEARCHING... ${queueTimer}s`}
                </button>

                {queueing && (
                  <button
                    onClick={cancelQueue}
                    className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center
                  rounded-full bg-red-600 hover:bg-red-700 text-white text-sm shadow-md"
                  >
                    ×
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* RECENT MATCHES */}
      {/* ------------------------------------------------------------------- */}
      <div className="bg-[#0f0f0f] rounded-lg border border-[#ffffff15] flex flex-col overflow-hidden">
        <div className="w-full bg-[#0c0c0c] py-3 flex justify-center items-center border-b border-[#ff7300]/40">
          <h2 className="text-lg font-bold">RECENT MATCHES</h2>
        </div>

        <div className="p-6 overflow-y-auto">
          {recent.length === 0 && (
            <div className="opacity-50">No matches yet.</div>
          )}

          <div className="space-y-3 mt-2">
            {recent.map((m) => {
              const label = Util.convertMapPool(m.map, gameEnum);
              const imgSrc = Util.convertMapPool(m.map, gameEnum, true);

              const eloClass =
                m.eloDelta == null
                  ? "text-neutral-200"
                  : m.eloDelta > 0
                    ? "text-green-400"
                    : m.eloDelta < 0
                      ? "text-red-400"
                      : "text-neutral-200";

              const resultLabel =
                m.yourTeamWon === null
                  ? "N/A"
                  : m.yourTeamWon
                    ? "WIN"
                    : "LOSS";

              const resultClass =
                m.yourTeamWon === null
                  ? "bg-neutral-600/30 text-neutral-200"
                  : m.yourTeamWon
                    ? "bg-green-500/15 text-green-400"
                    : "bg-red-500/15 text-red-400";

              return (
                <button
                  key={m.id}
                  onClick={() => onOpenRecent(m.id)}
                  className="w-full text-left"
                >
                  <div className="flex bg-neutral-900/40 rounded-lg border border-[#ffffff15] overflow-hidden hover:border-[#ff7300]/60 hover:bg-neutral-800/60 transition h-20">
                    {/* MAP IMAGE */}
                    <div className="w-28 h-full shrink-0">
                      {imgSrc && (
                        <Image
                          src={imgSrc}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>

                    {/* TEXT CONTENT */}
                    <div className="flex-1 px-3 py-2 flex items-center justify-between gap-3">
                      <div className="flex flex-col">
                        <span
                          className={`
                            font-bold 
                            text-lg 
                            ${m.yourTeamWon === true ? "text-green-400" : ""}
                            ${m.yourTeamWon === false ? "text-red-400" : ""}
                            ${m.yourTeamWon === null ? "text-neutral-200" : ""}
                          `}
                        >
                          {m.scoreA != null && m.scoreB != null
                            ? `${m.scoreA} - ${m.scoreB}`
                            : (label || m.map)}
                        </span>

                        <span className="text-xs opacity-70">{m.map}</span>

                        {m.eloDelta != null && (
                          <span className={`text-xs mt-1 ${eloClass}`}>
                            Elo: {m.eloDelta > 0 ? "+" : ""}
                            {m.eloDelta}
                          </span>
                        )}
                      </div>


                      {/* RESULT PILL */}
                      <div className="flex items-center">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold ${resultClass}`}
                        >
                          {resultLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
