import React, { useEffect, useMemo, useState } from "react";
import { LEVEL_IMAGES } from "./faceit";
import { Image } from "@liga/frontend/components";
import { FaceitHeader } from "./faceit";
import Scoreboard from "./scoreboard";
import { levelFromElo } from "@liga/backend/lib/levels";
import { Constants, Util } from "@liga/shared";
import { AppStateContext } from "@liga/frontend/redux";
import {
  faceitMatchCompleted,
  faceitRoomSet,
  faceitVetoSet,
  faceitVetoClear,
} from "@liga/frontend/redux/actions";

// ------------------------------
// TYPES
// ------------------------------

export type MatchPlayer = {
  id: number;
  name: string;
  elo: number;
  level: number;
  role?: string | null;
  countryId: number;

  // From backend handler MatchPlayer
  userControlled?: boolean;
  personality?: string | null;
};

export interface MatchRoomData {
  fakeRoomId: string;
  teamA: MatchPlayer[];
  teamB: MatchPlayer[];
  expectedWinA: number;
  expectedWinB: number;
  eloGain: number;
  eloLoss: number;
}

export interface MatchRoomProps {
  room: MatchRoomData;
  onClose: () => void;
  onEloUpdate?: () => void;
  countryMap: Map<number, string>;
  elo: number;
  level: number;
  pct: number;
  low: number;
  high: number;
}

// Map pool entry from api.mapPool.find
type MapPoolEntry = {
  gameMap: {
    name: string;
  };
};

// Local veto action type (matches Redux)
type VetoAction = {
  map: string;
  by: "TEAM_A" | "TEAM_B" | "SYSTEM";
  kind: "BAN" | "DECIDER";
};

// ------------------------------
// HELPERS
// ------------------------------

function getTeamName(team: MatchPlayer[], fallback: string): string {
  return team.length > 0 ? `Team_${team[0].name}` : fallback;
}

function getTeamAvgElo(team: MatchPlayer[]): number {
  if (team.length === 0) return 0;
  return Math.round(team.reduce((sum, p) => sum + p.elo, 0) / team.length);
}

function getTeamAvgLevel(team: MatchPlayer[]): number {
  return levelFromElo(getTeamAvgElo(team));
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

// ------------------------------
// COMPONENT
// ------------------------------

export default function MatchRoom({
  room,
  onClose,
  onEloUpdate,
  countryMap,
  elo,
  level,
  pct,
  low,
  high,
}: MatchRoomProps): JSX.Element {
  const { state, dispatch } = React.useContext(AppStateContext);

  const {
    fakeRoomId,
    teamA,
    teamB,
    expectedWinA,
    eloGain,
    eloLoss,
  } = room;

  // Randomize team lineups once per mount
  const [shuffledTeamA] = useState<MatchPlayer[]>(() => shuffle(teamA));
  const [shuffledTeamB] = useState<MatchPlayer[]>(() => shuffle(teamB));

  // Captains = first player in each team (after shuffle)
  const captainA = shuffledTeamA[0];
  const captainB = shuffledTeamB[0];

  // Determine if the user is the captain of Team A
  // The backend marks the user with `userControlled: true`.
  const userIsCaptainA = !!captainA?.userControlled;

  // UI tabs
  const [tab, setTab] = useState<"room" | "scoreboard">("room");

  // Score values for after match completion
  const [finalScoreA, setFinalScoreA] = useState<number | null>(null);
  const [finalScoreB, setFinalScoreB] = useState<number | null>(null);

  // Persisted backend match ID
  const storedMatchId = state.faceitMatchId;

  // ------------------------------
  // SETTINGS / MAP POOL FOR VETO
  // ------------------------------

  const settingsAll = useMemo(() => {
    if (!state.profile) return Constants.Settings;
    return Util.loadSettings(state.profile.settings);
  }, [state.profile]);

  const [mapPool, setMapPool] = useState<MapPoolEntry[]>([]);
  const [cpuThinking, setCpuThinking] = useState(false);

  // Load map pool once profile/settings exist
  useEffect(() => {
    if (!state.profile) return;

    api.mapPool
      .find({
        where: {
          gameVersion: {
            slug: settingsAll.general.game,
          },
          position: {
            not: null,
          },
        },
      })
      .then((result: MapPoolEntry[]) => setMapPool(result))
      .catch((err: unknown) => {
        console.error("FACEIT veto: failed to load map pool", err);
        setMapPool([]);
      });
  }, [state.profile, settingsAll]);

  // ------------------------------
  // VETO STATE FROM REDUX
  // ------------------------------

  const vetoState = state.faceitVeto || {
    history: [],
    completed: false,
    deciderMap: null as string | null,
  };

  const vetoHistory = vetoState.history as VetoAction[];
  const vetoComplete = vetoState.completed;
  const deciderMap = vetoState.deciderMap;

  // Remaining maps = not banned/decided yet
  const remainingMaps = useMemo(
    () =>
      mapPool.filter(
        (m) => !vetoHistory.some((v) => v.map === m.gameMap.name)
      ),
    [mapPool, vetoHistory]
  );

  const bansCount = useMemo(
    () => vetoHistory.filter((v) => v.kind === "BAN").length,
    [vetoHistory]
  );

  // Whose turn is it to BAN?
  const currentTurn: "TEAM_A" | "TEAM_B" | null = useMemo(() => {
    if (vetoComplete) return null;
    if (remainingMaps.length <= 1) return null; // decider will be auto
    return bansCount % 2 === 0 ? "TEAM_A" : "TEAM_B";
  }, [vetoComplete, remainingMaps.length, bansCount]);

  // Helper to write veto state into Redux
  const updateVeto = (
    history: VetoAction[],
    deciderOverride: string | null = deciderMap
  ) => {
    dispatch(
      faceitVetoSet(
        history,
        !!deciderOverride,
        deciderOverride
      )
    );
  };

  // ------------------------------
  // USER BAN HANDLER (TEAM A, only if user is captain)
  // ------------------------------

  const handleUserBan = (mapName: string) => {
    if (vetoComplete) return;
    if (currentTurn !== "TEAM_A") return;
    if (!userIsCaptainA) return;
    if (!remainingMaps.some((m) => m.gameMap.name === mapName)) return;

    const newHistory: VetoAction[] = [
      ...vetoHistory,
      { map: mapName, by: "TEAM_A", kind: "BAN" },
    ];

    updateVeto(newHistory);
  };

  // ------------------------------
  // CPU BAN HANDLER (TEAM B)
  // ------------------------------

  useEffect(() => {
    if (vetoComplete) return;
    if (!mapPool.length) return;
    if (remainingMaps.length <= 1) return;
    if (currentTurn !== "TEAM_B") return;

    setCpuThinking(true);

    const timeout = setTimeout(() => {
      const choices = remainingMaps.map((m) => m.gameMap.name);
      if (choices.length === 0) {
        setCpuThinking(false);
        return;
      }

      const mapName =
        choices[Math.floor(Math.random() * choices.length)];

      const newHistory: VetoAction[] = [
        ...vetoHistory,
        { map: mapName, by: "TEAM_B", kind: "BAN" },
      ];

      updateVeto(newHistory);
      setCpuThinking(false);
    }, 800 + Math.random() * 2200);

    return () => clearTimeout(timeout);
  }, [
    currentTurn,
    vetoComplete,
    mapPool,
    remainingMaps,
    vetoHistory,
    updateVeto,
  ]);

  // ------------------------------
  // CPU BAN HANDLER (TEAM A when user is NOT captain)
  // ------------------------------

  useEffect(() => {
    if (vetoComplete) return;
    if (!mapPool.length) return;
    if (remainingMaps.length <= 1) return;

    // Only trigger CPU ban for Team A if it's their turn
    // AND the user is not the captain of Team A.
    if (currentTurn !== "TEAM_A") return;
    if (userIsCaptainA) return;

    setCpuThinking(true);

    const timeout = setTimeout(() => {
      const choices = remainingMaps.map((m) => m.gameMap.name);
      if (choices.length === 0) {
        setCpuThinking(false);
        return;
      }

      const mapName =
        choices[Math.floor(Math.random() * choices.length)];

      const newHistory: VetoAction[] = [
        ...vetoHistory,
        { map: mapName, by: "TEAM_A", kind: "BAN" },
      ];

      updateVeto(newHistory);
      setCpuThinking(false);
    }, 800 + Math.random() * 2200);

    return () => clearTimeout(timeout);
  }, [
    currentTurn,
    vetoComplete,
    mapPool,
    remainingMaps,
    vetoHistory,
    updateVeto,
    userIsCaptainA,
  ]);

  // ------------------------------
  // AUTO-DECIDER WHEN 1 MAP LEFT
  // ------------------------------

  useEffect(() => {
    if (!mapPool.length) return;
    if (vetoComplete) return;
    if (remainingMaps.length !== 1) return;

    const mapName = remainingMaps[0].gameMap.name;

    if (vetoHistory.some((v) => v.kind === "DECIDER")) return;

    const newHistory: VetoAction[] = [
      ...vetoHistory,
      { map: mapName, by: "SYSTEM", kind: "DECIDER" },
    ];

    updateVeto(newHistory, mapName);
  }, [
    mapPool.length,
    remainingMaps,
    vetoComplete,
    vetoHistory,
    updateVeto,
  ]);

  // ------------------------------
  // START MATCH
  // ------------------------------

  const handleStartMatch = async () => {
    if (!deciderMap) return;

    const result: { matchId: number } = await api.faceit.startMatch({
      ...room,
      selectedMap: deciderMap,
      // Make sure to send *shuffled* teams to backend so they match what we display.
      teamA: shuffledTeamA,
      teamB: shuffledTeamB,
    } as any);

    dispatch(faceitRoomSet(room, result.matchId));

    if (onEloUpdate) {
      await onEloUpdate();
    }

    setTab("scoreboard");
  };

  // ------------------------------
  // POLL BACKEND FOR STATUS
  // ------------------------------

  useEffect(() => {
    if (!storedMatchId) return;

    const checkStatus = async () => {
      const data = await api.faceit.getMatchData(storedMatchId);
      const competitors: { teamId: number; score: number }[] =
        (data.match?.competitors as { teamId: number; score: number }[]) ??
        [];

      if (
        data.match &&
        data.match.status === Constants.MatchStatus.COMPLETED
      ) {
        const scoreA =
          competitors.find((c) => c.teamId === 1)?.score ?? 0;
        const scoreB =
          competitors.find((c) => c.teamId === 2)?.score ?? 0;

        setFinalScoreA(scoreA);
        setFinalScoreB(scoreB);

        dispatch(faceitMatchCompleted());
      }
    };

    const interval = setInterval(checkStatus, 1500);
    return () => clearInterval(interval);
  }, [storedMatchId, dispatch]);

  // Auto-switch to scoreboard when match is done
  useEffect(() => {
    if (state.faceitMatchCompleted) {
      setTab("scoreboard");
    }
  }, [state.faceitMatchCompleted]);

  // ------------------------------
  // RENDER HELPERS
  // ------------------------------

  const scoreHigherA =
    finalScoreA !== null &&
    finalScoreB !== null &&
    finalScoreA > finalScoreB;
  const scoreHigherB =
    finalScoreA !== null &&
    finalScoreB !== null &&
    finalScoreB > finalScoreA;

  // ------------------------------
  // RENDER
  // ------------------------------

  return (
    <div className="w-full min-h-screen bg-[#0b0b0b] text-white flex flex-col">
      <FaceitHeader elo={elo} level={level} pct={pct} low={low} high={high} />

      <div className="p-6 overflow-y-auto">
        {/* TOP BAR */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">
            {tab === "room" ? "MATCH ROOM" : "SCOREBOARD"}
          </h1>

          <button
            onClick={() => {
              if (state.faceitMatchCompleted) {
                dispatch(faceitVetoClear());
              }
              onClose();
            }}
            className="px-4 py-2 bg-neutral-700 rounded hover:bg-neutral-600"
          >
            Back
          </button>
        </div>

        {/* TABS */}
        <div className="flex gap-8 border-b border-neutral-700 mb-6 pb-2">
          <button
            className={`pb-1 ${tab === "room"
                ? "text-white border-b-2 border-orange-500"
                : "text-neutral-500 hover:text-neutral-300"
              }`}
            onClick={() => setTab("room")}
          >
            MATCH ROOM
          </button>

          <button
            disabled={!storedMatchId}
            className={`pb-1 ${tab === "scoreboard"
                ? "text-white border-b-2 border-orange-500"
                : storedMatchId
                  ? "text-neutral-500 hover:text-neutral-300"
                  : "text-neutral-700 cursor-not-allowed"
              }`}
            onClick={() => setTab("scoreboard")}
          >
            SCOREBOARD
          </button>
        </div>

        {/* MATCH ROOM TAB */}
        {tab === "room" && (
          <>
            <div className="text-center mb-4 opacity-70">
              Match ID: {fakeRoomId}
            </div>

            <div className="grid grid-cols-3 gap-4">
              {/* TEAM A */}
              <div className="bg-[#0f0f0f] p-4 rounded border border-[#222]">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-xl font-bold">
                    {getTeamName(shuffledTeamA, "Team A")}
                  </h2>

                  <div className="flex items-center gap-2">
                    <span className="opacity-80 text-sm">
                      Average ELO {getTeamAvgElo(shuffledTeamA)}
                    </span>
                    <img
                      src={LEVEL_IMAGES[getTeamAvgLevel(shuffledTeamA)]}
                      className="w-7 h-7"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  {shuffledTeamA.map((p) => (
                    <div
                      key={p.id}
                      className="bg-neutral-800 p-3 rounded flex justify-between items-center"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`fp ${countryMap.get(p.countryId)}`} />
                        <span>
                          {p.name}
                          {p.id === captainA?.id && (
                            <span className="ml-1 text-xs text-blue-400">
                              [C]
                            </span>
                          )}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="opacity-70">{p.elo}</span>
                        <img
                          src={LEVEL_IMAGES[p.level]}
                          className="w-8 h-8"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* MIDDLE COLUMN: VETO + MATCH INFO */}
              <div className="bg-[#0f0f0f] p-4 rounded border border-[#222] flex flex-col items-center">
                {/* MAP VETO BEFORE GAME START */}
                {!state.faceitMatchCompleted && (
                  <>
                    <h2 className="text-xl font-bold mb-3">MAP VETO</h2>

                    <div className="text-sm text-center mb-3 opacity-80">
                      {mapPool.length === 0 && (
                        <span>Loading map pool…</span>
                      )}

                      {mapPool.length > 0 && !vetoComplete && (
                        <>
                          {currentTurn === "TEAM_A" && (
                            <>
                              {userIsCaptainA ? (
                                <span>
                                  Click a map to ban.
                                </span>
                              ) : (
                                <span>
                                  Waiting for your captain{" "}
                                  <strong>{captainA?.name}</strong> to ban a map…
                                </span>
                              )}
                            </>
                          )}
                          {currentTurn === "TEAM_B" && (
                            <span>
                              Waiting for enemy captain{" "}
                              <strong>{captainB?.name}</strong> to ban a map…
                            </span>
                          )}
                        </>
                      )}

                      {vetoComplete && deciderMap && (
                        <span>
                          Veto complete. Final map:{" "}
                          <strong>{deciderMap}</strong>
                        </span>
                      )}
                    </div>

                    {/* FACEIT-STYLE MAP LIST*/}
                    <div className="grid grid-cols-1 gap-2 w-full mb-4">
                      {mapPool
                        .filter((entry) => {
                          if (!vetoComplete) return true;
                          return entry.gameMap.name === deciderMap;
                        })
                        .map((entry) => {
                          const mapName = entry.gameMap.name;
                          const picked = vetoHistory.find(
                            (v) => v.map === mapName
                          );

                          const isRemaining = !picked;
                          const isClickable =
                            isRemaining &&
                            !vetoComplete &&
                            currentTurn === "TEAM_A" &&
                            userIsCaptainA &&
                            !cpuThinking;

                          const label = Util.convertMapPool(
                            mapName,
                            settingsAll.general.game
                          );

                          const imgSrc = Util.convertMapPool(
                            mapName,
                            settingsAll.general.game,
                            true
                          );

                          return (
                            <button
                              key={mapName}
                              type="button"
                              onClick={() =>
                                isClickable && handleUserBan(mapName)
                              }
                              className={[
                                "px-3 py-2 rounded text-sm text-left border transition flex gap-3",
                                isClickable
                                  ? "cursor-pointer hover:border-orange-500 hover:bg-neutral-800"
                                  : "cursor-default",
                                picked?.kind === "BAN" &&
                                !vetoComplete &&
                                "border-red-600 bg-red-600/10",
                                picked?.kind === "DECIDER" &&
                                "border-orange-500 bg-orange-500/10",
                                !picked &&
                                !vetoComplete &&
                                "border-neutral-700 bg-neutral-900/60",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              <Image
                                src={imgSrc}
                                className="w-20 h-12 object-cover rounded"
                              />

                              <div className="flex flex-col">
                                <span className="font-semibold">{label}</span>
                                {picked && picked.by !== "SYSTEM" && (
                                  <span className="text-xs opacity-70">
                                    {picked.kind === "BAN"
                                      ? "BANNED"
                                      : "DECIDER"}
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                    </div>

                    {/* MATCH INFO + CONNECT BUTTON (AFTER VETO DONE) */}
                    <div className="mt-auto pt-2 text-center">
                      <div>Win Chance: {(expectedWinA * 100).toFixed(1)}%</div>
                      <div className="mt-1 opacity-70">
                        Elo Gain: +{eloGain} / Loss: -{eloLoss}
                      </div>

                      <button
                        className={`mt-4 px-8 py-3 rounded text-lg ${vetoComplete
                            ? "bg-orange-600 hover:bg-orange-700"
                            : "bg-neutral-700 cursor-not-allowed opacity-60"
                          }`}
                        disabled={!vetoComplete}
                        onClick={handleStartMatch}
                      >
                        {vetoComplete
                          ? "CONNECT TO SERVER"
                          : "Complete veto to start"}
                      </button>
                    </div>
                  </>
                )}

                {/* AFTER GAME FINISHED – SHOW FINAL SCORE */}
                {state.faceitMatchCompleted &&
                  finalScoreA !== null &&
                  finalScoreB !== null && (
                    <>
                      <h2 className="text-xl font-bold mb-4">FINAL SCORE</h2>

                      <div className="text-5xl font-extrabold flex items-center gap-4">
                        <span
                          className={
                            scoreHigherA ? "text-green-400" : "text-gray-300"
                          }
                        >
                          {finalScoreA}
                        </span>

                        <span className="text-gray-400">–</span>

                        <span
                          className={
                            scoreHigherB ? "text-green-400" : "text-gray-300"
                          }
                        >
                          {finalScoreB}
                        </span>
                      </div>

                      <div className="mt-4 text-green-400 text-lg">
                        Match Completed
                      </div>
                    </>
                  )}
              </div>

              {/* TEAM B */}
              <div className="bg-[#0f0f0f] p-4 rounded border border-[#222]">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-xl font-bold">
                    {getTeamName(shuffledTeamB, "Team B")}
                  </h2>

                  <div className="flex items-center gap-2">
                    <span className="opacity-80 text-sm">
                      Average ELO {getTeamAvgElo(shuffledTeamB)}
                    </span>
                    <img
                      src={LEVEL_IMAGES[getTeamAvgLevel(shuffledTeamB)]}
                      className="w-7 h-7"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  {shuffledTeamB.map((p) => (
                    <div
                      key={p.id}
                      className="bg-neutral-800 p-3 rounded flex justify-between items-center"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`fp ${countryMap.get(p.countryId)}`} />
                        <span>
                          {p.name}
                          {p.id === captainB?.id && (
                            <span className="ml-1 text-xs text-blue-400">
                              [C]
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="opacity-70">{p.elo}</span>
                        <img
                          src={LEVEL_IMAGES[p.level]}
                          className="w-8 h-8"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* SCOREBOARD TAB */}
        {tab === "scoreboard" && storedMatchId && (
          <div className="mt-6">
            <Scoreboard matchId={storedMatchId} />
          </div>
        )}
      </div>
    </div>
  );
}
