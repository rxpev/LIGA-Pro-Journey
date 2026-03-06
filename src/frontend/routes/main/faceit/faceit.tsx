import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import MatchRoom from "./matchroom";
import { AppStateContext } from "@liga/frontend/redux";
import {faceitRoomSet,faceitRoomClear,faceitQueueSet,faceitQueueClear,faceitQueueResolving,} from "@liga/frontend/redux/actions";
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
import rank1 from "../../../assets/faceit/rank1.png";
import rank2 from "../../../assets/faceit/rank2.png";
import rank3 from "../../../assets/faceit/rank3.png";
import rank4 from "../../../assets/faceit/rank4.png";
import rank5 from "../../../assets/faceit/rank5.png";
import rank6 from "../../../assets/faceit/rank6.png";
import rank7 from "../../../assets/faceit/rank7.png";
import rank8 from "../../../assets/faceit/rank8.png";
import rank9 from "../../../assets/faceit/rank9.png";
import rank10 from "../../../assets/faceit/rank10.png";
import killsIcon from "../../../assets/faceit/kills.png";
import deathsIcon from "../../../assets/faceit/deaths.png";
import headshotIcon from "../../../assets/faceit/headshot.png";
import { Image } from "@liga/frontend/components";
import { Constants, Util } from "@liga/shared";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { FaChevronDown, FaUserFriends, FaUserPlus, FaUsers } from "react-icons/fa";

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

export const RANK_IMAGES = [
  null,
  rank1,
  rank2,
  rank3,
  rank4,
  rank5,
  rank6,
  rank7,
  rank8,
  rank9,
  rank10,
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
  date?: string | Date | null;
};

type MatchPlayer = {
  id: number;
  name: string;
  elo: number;
  level?: number;
  countryId: number;
  teamId?: number | null;
  teamCountryId?: number | null;
  userControlled?: boolean;
  queueId?: string;
  queueType?: "COUNTRY" | "TEAM" | "BOTH";
  role?: "RIFLER" | "AWPER" | "IGL" | string;
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

export type LeaderboardPlayer = {
  rank: number;
  playerId: number;
  nickname: string;
  countryCode?: string | null;
  faceitElo: number;
  faceitLevel: number;
};

type DailyState = {
  playedToday: number;
  maxToday: number;
  hasPendingUserMatchday: boolean;
  date: string;
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

const isAwperRole = (role?: string | null) => {
  if (!role) return false;
  const normalized = String(role).toUpperCase();
  return normalized === "AWPER" || normalized === "SNIPER";
};

// ---------------------------------------------------------------------------
// MAIN COMPONENT
// ---------------------------------------------------------------------------

export default function Faceit(): JSX.Element {
  const { state, dispatch } = React.useContext(AppStateContext);

  const activeMatch = state.faceitMatchRoom;
  const matchCompleted = state.faceitMatchCompleted;

  const [showMatchRoom, setShowMatchRoom] = useState(false);
  const [daily, setDaily] = useState<DailyState | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [currentSaveId, setCurrentSaveId] = useState<number | null>(() => {
    try {
      const cached = Number(localStorage.getItem("liga-active-save-id") || 0);
      return Number.isFinite(cached) && cached > 0 ? cached : null;
    } catch {
      return null;
    }
  });

  // PROFILE + STATS
  const [elo, setElo] = useState(0);
  const [level, setLevel] = useState(0);
  const [recent, setRecent] = useState<RecentMatch[]>([]);
  const [lifetime, setLifetime] = useState<any | null>(null);
  const [last20, setLast20] = useState<any | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardPlayer[]>([]);

  const [loading, setLoading] = useState(true);

  // QUEUE
  const [queueTimer, setQueueTimer] = useState(0);
  const faceitQueue = state.faceitQueue;
  const queueing = faceitQueue.status === "QUEUEING" || faceitQueue.status === "RESOLVING";
  const queueStartedAt = faceitQueue.startedAt;
  const queueTargetSec = faceitQueue.targetSec;
  const queueIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishingRef = useRef(false);
  const canQueue = React.useMemo(() => {
    if (activeMatch) return false;
    if (queueing) return false;
    if (!daily) return true;
    return daily.playedToday < daily.maxToday;
  }, [activeMatch, queueing, daily]);

  const queueBlockMessage = React.useMemo(() => {
    if (!daily) return null;
    if (daily.playedToday < daily.maxToday) return null;

    if (daily.hasPendingUserMatchday) {
      return "Matchday scheduled today. FACEIT is limited to 2 matches to avoid skipping it.";
    }
    return "Daily FACEIT limit reached.";
  }, [daily]);

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
    const sortedRecent = [...enrichedRecent].sort((a, b) => {
      const aTime = a.date ? new Date(a.date).getTime() : 0;
      const bTime = b.date ? new Date(b.date).getTime() : 0;

      // Primary: newest match date first. Secondary fallback: higher id first.
      if (bTime !== aTime) return bTime - aTime;
      return b.id - a.id;
    });

    setRecent(sortedRecent);
    setLifetime(profileData.lifetime || null);
    setLeaderboard(profileData.leaderboard || []);
    if (last20Stats) setLast20(last20Stats);
    setDaily(profileData.daily ?? null);
    setQueueError(null);
  };

  // Auto-remove match room ONLY if already closed
  useEffect(() => {
    if (state.faceitMatchCompleted && !showMatchRoom) {
      dispatch(faceitRoomClear());
    }
  }, [state.faceitMatchCompleted, showMatchRoom, dispatch]);

  // Refresh profile once we leave the match room
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

  const settingsAll = React.useMemo(() => {
    if (!state.profile) return Constants.Settings;
    return Util.loadSettings(state.profile.settings);
  }, [state.profile]);

  const gameSlug = settingsAll.general.game;

  const leaderboardRegionTitle = React.useMemo(() => {
    const userCountryId = state.profile?.player?.countryId;
    if (!userCountryId) return "REGIONAL RANKINGS";

    const continent = (state.continents as any[]).find((entry) =>
      (entry.countries || []).some((country: any) => country.id === userCountryId)
    );

    const code = String(continent?.code || "").toUpperCase();
    if (code === "EU") return "EU RANKINGS";
    if (code === "AS") return "ASIA RANKINGS";
    if (code === "OC") return "OCE RANKINGS";
    if (code === "NA" || code === "SA") return "AMERICAS RANKINGS";

    return "REGIONAL RANKINGS";
  }, [state.profile, state.continents]);

  useEffect(() => {
    (async () => {
      try {
        await refreshProfile();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    api.database
      .current()
      .then((id) => {
        const normalized = Number.isFinite(id) && id > 0 ? id : null;
        setCurrentSaveId(normalized);
        if (normalized) {
          localStorage.setItem("liga-active-save-id", String(normalized));
        }
      })
      .catch(() => setCurrentSaveId(null));
  }, [state.profile?.name, state.profile?.updatedAt]);

  useEffect(() => {
    if (!viewMatchId) return;
    setLoadingScoreboard(true);

    api.faceit
      .getMatchData(viewMatchId)
      .then((res) => setScoreboardData(res))
      .finally(() => setLoadingScoreboard(false));
  }, [viewMatchId]);

  useEffect(() => {
    if (activeMatch) {
      clearQueueInterval();
      setQueueTimer(0);
      return;
    }
    if (faceitQueue.status !== "QUEUEING" || !queueStartedAt || !queueTargetSec) {
      clearQueueInterval();
      if (!queueing) setQueueTimer(0);
      return;
    }
    const tick = () => {
      const elapsed = Math.floor((Date.now() - queueStartedAt) / 1000);
      setQueueTimer(elapsed);

      if (elapsed >= queueTargetSec) {
        clearQueueInterval();
        finishQueue();
      }
    };
    tick();
    clearQueueInterval();
    queueIntervalRef.current = setInterval(tick, 250);

    return () => clearQueueInterval();
  }, [faceitQueue.status, queueStartedAt, queueTargetSec, activeMatch]);

  // ---------------------------------------------------------------------------
  // QUEUE SYSTEM
  // ---------------------------------------------------------------------------

  function randIntInclusive(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function clearQueueInterval() {
    if (queueIntervalRef.current) {
      clearInterval(queueIntervalRef.current);
      queueIntervalRef.current = null;
    }
  }

  const startQueue = () => {
    if (!canQueue) return;

    const startedAt = Date.now();
    const targetSec = randIntInclusive(8, 12);
    dispatch(faceitQueueSet(startedAt, targetSec));
  };

  const cancelQueue = () => {
    clearQueueInterval();
    finishingRef.current = false;

    dispatch(faceitQueueClear());
    setQueueTimer(0);
  };

  const finishQueue = async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    dispatch(faceitQueueResolving());

    try {
      let res;
      try {
        const cachedSaveId = Number(localStorage.getItem("liga-active-save-id") || 0);
        const resolvedSaveId = currentSaveId ?? (Number.isFinite(cachedSaveId) && cachedSaveId > 0 ? cachedSaveId : null);
        const saveScopedKey = resolvedSaveId ? `faceit-save-${resolvedSaveId}:party-members` : null;

        const storedParty =
          (saveScopedKey ? localStorage.getItem(saveScopedKey) : null) ||
          localStorage.getItem("faceit-party-members");

        let queueElo = elo;
        let maxPartyEloDelta = 0;
        if (storedParty) {
          const parsedParty = JSON.parse(storedParty);
          if (Array.isArray(parsedParty) && parsedParty.length > 0) {
            const partyElos = parsedParty
              .map((member: any) => Number(member?.elo))
              .filter((memberElo: number) => Number.isFinite(memberElo) && memberElo > 0);

            if (partyElos.length > 0) {
              const totalElo = elo + partyElos.reduce((sum: number, memberElo: number) => sum + memberElo, 0);
              queueElo = Math.round(totalElo / (partyElos.length + 1));
              const highestPartyElo = Math.max(...partyElos);
              maxPartyEloDelta = Math.max(0, Math.round(highestPartyElo - elo));
            }
          }
        }

        res = await api.faceit.queue({ queueElo, maxPartyEloDelta });
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (msg.includes("FACEIT_BLOCKED_MATCHDAY_USER_TODAY")) {
          setQueueError(
            "Matchday scheduled today. You can only play 2 FACEIT matches to warm up."
          );
        } else if (msg.includes("FACEIT_BLOCKED_DAILY_LIMIT")) {
          setQueueError("Daily FACEIT limit reached.");
        } else if (msg.includes("FACEIT_NOT_ENOUGH_SIMILAR_SKILL_PLAYERS")) {
          setQueueError("Not enough similarly skilled players in your region right now.");
        } else {
          setQueueError("Unable to queue FACEIT match.");
        }
        refreshProfile();
        return;
      }
      const applyPartyToTeams = (room: any) => {
        try {
          const cachedSaveId = Number(localStorage.getItem("liga-active-save-id") || 0);
          const resolvedSaveId = currentSaveId ?? (Number.isFinite(cachedSaveId) && cachedSaveId > 0 ? cachedSaveId : null);
          const saveScopedKey = resolvedSaveId ? `faceit-save-${resolvedSaveId}:party-members` : null;

          const storedParty =
            (saveScopedKey ? localStorage.getItem(saveScopedKey) : null) ||
            localStorage.getItem("faceit-party-members");
          if (!storedParty) return room;

          const parsed = JSON.parse(storedParty);
          if (!Array.isArray(parsed) || parsed.length === 0) return room;

          const userId = state.profile?.playerId ?? state.profile?.player?.id;

          const userOnTeamAById = userId
            ? room.teamA.findIndex((player: MatchPlayer) => player.id === userId)
            : -1;
          const userOnTeamBById = userId
            ? room.teamB.findIndex((player: MatchPlayer) => player.id === userId)
            : -1;

          const userOnTeamAByFlag = room.teamA.findIndex((player: MatchPlayer) => player.userControlled);
          const userOnTeamBByFlag = room.teamB.findIndex((player: MatchPlayer) => player.userControlled);

          const isUserTeamA = userOnTeamAById !== -1 || userOnTeamAByFlag !== -1;
          const isUserTeamB = userOnTeamBById !== -1 || userOnTeamBByFlag !== -1;

          if (!isUserTeamA && !isUserTeamB) return room;

          const teamKey = isUserTeamA ? "teamA" : "teamB";
          const enemyKey = isUserTeamA ? "teamB" : "teamA";

          const userTeam = [...room[teamKey]] as MatchPlayer[];
          const enemyTeam = [...room[enemyKey]] as MatchPlayer[];

          const userIdx = userTeam.findIndex(
            (player: MatchPlayer) => player.id === userId || player.userControlled
          );
          if (userIdx === -1) return room;

          const normalizedParty = parsed
            .filter((member: any) => member && member.name)
            .slice(0, 4)
            .map((member: any) => {
              const existing = [...userTeam, ...enemyTeam].find(
                (player) =>
                  player.id === member.id ||
                  player.name.toLowerCase() === String(member.name).toLowerCase()
              );
              return {
                ...(existing ?? {}),
                ...member,
              } as MatchPlayer;
            });

          if (!normalizedParty.length) return room;

          const partyIdSet = new Set(normalizedParty.map((member) => member.id));
          const partyNameSet = new Set(normalizedParty.map((member) => member.name.toLowerCase()));

          const playerInParty = (player: MatchPlayer) =>
            partyIdSet.has(player.id) || partyNameSet.has(player.name.toLowerCase());

          const basePool = [...userTeam, ...enemyTeam].filter(
            (player) => !(player.id === userId || player.userControlled) && !playerInParty(player)
          );

          const partyQueueId = `PARTY-${userTeam[userIdx].id}-${normalizedParty
            .map((member) => member.id)
            .join("-")}`;

          const lockedUser = {
            ...userTeam[userIdx],
            queueId: partyQueueId,
            queueType: "TEAM" as const,
          };

          const maxPartyInUserTeam = Math.min(normalizedParty.length, userTeam.length - 1);
          const selectedParty = normalizedParty.slice(0, maxPartyInUserTeam).map((member) => ({
            ...member,
            queueId: partyQueueId,
            queueType: "TEAM" as const,
          }));

          const rebuiltUserTeam: MatchPlayer[] = [lockedUser, ...selectedParty];
          while (rebuiltUserTeam.length < userTeam.length && basePool.length > 0) {
            const next = basePool.shift();
            if (next) rebuiltUserTeam.push(next);
          }

          const rebuiltEnemyTeam: MatchPlayer[] = [];
          while (rebuiltEnemyTeam.length < enemyTeam.length && basePool.length > 0) {
            const next = basePool.shift();
            if (next) rebuiltEnemyTeam.push(next);
          }

          if (rebuiltUserTeam.length !== userTeam.length || rebuiltEnemyTeam.length !== enemyTeam.length) {
            return room;
          }

          return { ...room, [teamKey]: rebuiltUserTeam, [enemyKey]: rebuiltEnemyTeam };
        } catch {
          return room;
        }
      };

      const shuffledTeamA = shuffle(res.teamA);
      const shuffledTeamB = shuffle(res.teamB);
      const partyAdjusted = applyPartyToTeams({ ...res, teamA: shuffledTeamA, teamB: shuffledTeamB });
      dispatch(
        faceitRoomSet(
          partyAdjusted,
          null
        )
      );
      setShowMatchRoom(true);
    } finally {
      clearQueueInterval();
      dispatch(faceitQueueClear());
      setQueueTimer(0);
      finishingRef.current = false;
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
          <FaceitHeader
            elo={elo}
            level={level}
            pct={pct}
            low={low}
            high={high}
            activeMatch={activeMatch}
            currentPlayerId={state.profile?.playerId ?? state.profile?.player?.id ?? null}
            profileTeammates={(state.profile?.team?.players ?? []).map((player: any) => ({
              id: player.id,
              name: player.name,
              countryId: player.countryId ?? player.country?.id ?? 0,
              elo: player.elo ?? 1000,
              level: player.level,
              role: player.role,
              teamId: player.teamId ?? state.profile?.teamId ?? null,
              teamCountryId: player.team?.countryId ?? state.profile?.team?.countryId ?? null,
            }))}
            currentPlayerRole={state.profile?.player?.role ?? null}
            currentSaveId={currentSaveId}
            currentTeamId={state.profile?.teamId ?? null}
            currentPlayerCountryId={state.profile?.player?.countryId ?? null}
            currentTeamCountryId={state.profile?.team?.countryId ?? null}
            countryRegionById={Object.fromEntries(
              (state.continents as any[]).flatMap((continent: any) =>
                (continent.countries ?? []).map((country: any) => [country.id, continent.id])
              )
            )}
            currentDate={state.profile?.date ?? new Date()}
          />

          <NormalFaceitBody
            recent={recent}
            lifetime={lifetime}
            last20={last20}
            leaderboard={leaderboard}
            leaderboardRegionTitle={leaderboardRegionTitle}
            onOpenRecent={(id) => setViewMatchId(id)}
            startQueue={startQueue}
            cancelQueue={cancelQueue}
            queueing={queueing}
            queueTimer={queueTimer}
            activeMatch={activeMatch}
            reopenMatchRoom={() => setShowMatchRoom(true)}
            gameSlug={gameSlug}

            daily={daily}
            canQueue={canQueue}
            queueBlockMessage={queueBlockMessage}
            queueError={queueError}

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
  activeMatch: MatchRoomData | null;
  currentPlayerId: number | null;
  profileTeammates: MatchPlayer[];
  currentPlayerRole: string | null;
  currentSaveId: number | null;
  currentTeamId: number | null;
  currentPlayerCountryId: number | null;
  currentTeamCountryId: number | null;
  countryRegionById: Record<number, number>;
  currentDate: Date | string | number | null;
}

export function FaceitHeader({
  elo,
  level,
  pct,
  low,
  high,
  activeMatch,
  currentPlayerId,
  profileTeammates,
  currentPlayerRole,
  currentSaveId,
  currentTeamId,
  currentPlayerCountryId,
  currentTeamCountryId,
  countryRegionById,
  currentDate,
}: FaceitHeaderProps) {
  const displayPct = level === 10 ? 100 : pct;
  const [friendsDropdownOpen, setFriendsDropdownOpen] = useState(false);
  const [partyDropdownOpen, setPartyDropdownOpen] = useState(false);
  const [friends, setFriends] = useState<MatchPlayer[]>([]);
  const [pendingRequests, setPendingRequests] = useState<number[]>([]);
  const [friendsTab, setFriendsTab] = useState<"suggestions">("suggestions");
  const friendsButtonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [friendsHydrated, setFriendsHydrated] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 320,
  });
  const partyButtonRef = useRef<HTMLButtonElement | null>(null);
  const partyDropdownRef = useRef<HTMLDivElement | null>(null);
  const [partyPos, setPartyPos] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 340,
  });
  const [partyMembers, setPartyMembers] = useState<MatchPlayer[]>([]);
  const [partyHydrated, setPartyHydrated] = useState(false);
  const [dailyFriendStatus, setDailyFriendStatus] = useState<Record<number, { online: boolean; accepts: boolean }>>({});
  const [partyLeaveCountdown, setPartyLeaveCountdown] = useState<Record<number, number>>({});
  const [declinedSuggestionIds, setDeclinedSuggestionIds] = useState<number[]>([]);
  const previousActiveMatchIdRef = useRef<string | null>(null);
  const previousDayKeyRef = useRef<string | null>(null);
  const [lastPugTeammates, setLastPugTeammates] = useState<MatchPlayer[]>([]);
  const [latestTrackedPugId, setLatestTrackedPugId] = useState<string | null>(null);
  const safeCurrentDate = React.useMemo(() => {
    const parsed = currentDate ? new Date(currentDate) : new Date();
    if (Number.isNaN(parsed.getTime())) {
      return new Date();
    }
    return parsed;
  }, [currentDate]);
  const dayKey = safeCurrentDate.toISOString().slice(0, 10);
  const partyLocked = !!activeMatch;
  const storagePrefix = React.useMemo(() => `faceit-save-${currentSaveId ?? "default"}`, [currentSaveId]);
  const storageKey = React.useCallback((suffix: string) => `${storagePrefix}:${suffix}`, [storagePrefix]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey("friends"));
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setFriends(parsed);
      }
    } catch {
      setFriends([]);
    } finally {
      setFriendsHydrated(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!friendsHydrated) return;
    localStorage.setItem(storageKey("friends"), JSON.stringify(friends));
  }, [friends, friendsHydrated, storageKey]);

  useEffect(() => {
    try {
      const storedParty = localStorage.getItem(storageKey("party-members"));
      if (storedParty) {
        const parsed = JSON.parse(storedParty);
        if (Array.isArray(parsed)) {
          setPartyMembers(parsed);
        }
      }

      const storedCountdown = localStorage.getItem(storageKey("party-leave-countdown"));
      if (storedCountdown) {
        const parsedCountdown = JSON.parse(storedCountdown);
        if (parsedCountdown && typeof parsedCountdown === "object") {
          setPartyLeaveCountdown(parsedCountdown);
        }
      }

      const storedPartyDayKey = localStorage.getItem(storageKey("party-day-key"));
      if (storedPartyDayKey && storedPartyDayKey !== dayKey) {
        setPartyMembers([]);
        setPartyLeaveCountdown({});
      }
    } catch {
      setPartyMembers([]);
      setPartyLeaveCountdown({});
    } finally {
      setPartyHydrated(true);
    }
  }, [dayKey, storageKey]);

  useEffect(() => {
    if (!partyHydrated) return;
    localStorage.setItem(storageKey("party-members"), JSON.stringify(partyMembers));
  }, [partyMembers, partyHydrated, storageKey]);

  useEffect(() => {
    if (!partyHydrated) return;
    localStorage.setItem(storageKey("party-leave-countdown"), JSON.stringify(partyLeaveCountdown));
  }, [partyLeaveCountdown, partyHydrated, storageKey]);

  useEffect(() => {
    try {
      const storedDeclined = localStorage.getItem(storageKey("declined-suggestions"));
      if (!storedDeclined) return;
      const parsed = JSON.parse(storedDeclined);
      if (Array.isArray(parsed)) {
        setDeclinedSuggestionIds(parsed);
      }
    } catch {
      setDeclinedSuggestionIds([]);
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey("last-pug-teammates"));
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setLastPugTeammates(parsed);
      }
    } catch {
      setLastPugTeammates([]);
    }

    try {
      const storedPugId = localStorage.getItem(storageKey("last-pug-id"));
      setLatestTrackedPugId(storedPugId || null);
    } catch {
      setLatestTrackedPugId(null);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!activeMatch || !currentPlayerId) return;

    const inTeamA = activeMatch.teamA.some((player) => player.id === currentPlayerId);
    const inTeamB = activeMatch.teamB.some((player) => player.id === currentPlayerId);
    if (!inTeamA && !inTeamB) return;

    if (latestTrackedPugId === activeMatch.fakeRoomId) return;

    const yourTeam = inTeamA ? activeMatch.teamA : activeMatch.teamB;
    const teammates = yourTeam.filter((player) => player.id !== currentPlayerId);

    setLastPugTeammates(teammates);
    setLatestTrackedPugId(activeMatch.fakeRoomId);
    setDeclinedSuggestionIds([]);
    localStorage.setItem(storageKey("last-pug-teammates"), JSON.stringify(teammates));
    localStorage.setItem(storageKey("last-pug-id"), activeMatch.fakeRoomId);
  }, [activeMatch, currentPlayerId, latestTrackedPugId, storageKey]);

  useEffect(() => {
    const statusKey = storageKey(`friends-status-${dayKey}`);
    let existing: Record<number, { online: boolean; accepts: boolean }> = {};

    try {
      const storedStatus = localStorage.getItem(statusKey);
      if (storedStatus) {
        existing = JSON.parse(storedStatus) || {};
      }
    } catch {
      existing = {};
    }

    const merged = { ...existing };
    for (const friend of friends) {
      if (!merged[friend.id]) {
        merged[friend.id] = {
          online: Math.random() >= 0.5,
          accepts: Math.random() >= 0.35,
        };
      }
    }

    setDailyFriendStatus(merged);
    localStorage.setItem(statusKey, JSON.stringify(merged));
  }, [dayKey, friends, storageKey]);

  useEffect(() => {
    if (!partyLocked) return;
    setPartyDropdownOpen(false);
    setFriendsDropdownOpen(false);
  }, [partyLocked]);

  useEffect(() => {
    if (!friendsHydrated) return;
    localStorage.setItem(storageKey(`friends-status-${dayKey}`), JSON.stringify(dailyFriendStatus));
  }, [dayKey, dailyFriendStatus, friendsHydrated, storageKey]);

  useEffect(() => {
    localStorage.setItem(storageKey("declined-suggestions"), JSON.stringify(declinedSuggestionIds));
  }, [declinedSuggestionIds, storageKey]);

  useEffect(() => {
    if (!friendsDropdownOpen && !partyDropdownOpen) return;

    const syncDropdownPosition = () => {
      if (friendsDropdownOpen && friendsButtonRef.current) {
        const rect = friendsButtonRef.current.getBoundingClientRect();
        setDropdownPos({
          top: rect.bottom + 8,
          left: rect.right - 320,
          width: 320,
        });
      }

      if (partyDropdownOpen && partyButtonRef.current) {
        const rect = partyButtonRef.current.getBoundingClientRect();
        setPartyPos({
          top: rect.bottom + 8,
          left: rect.left,
          width: 340,
        });
      }
    };

    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node;

      const clickedFriendsButton = friendsButtonRef.current?.contains(target);
      const clickedFriendsDropdown = dropdownRef.current?.contains(target);
      if (!clickedFriendsButton && !clickedFriendsDropdown) {
        setFriendsDropdownOpen(false);
      }

      const clickedPartyButton = partyButtonRef.current?.contains(target);
      const clickedPartyDropdown = partyDropdownRef.current?.contains(target);
      if (!clickedPartyButton && !clickedPartyDropdown) {
        setPartyDropdownOpen(false);
      }
    };

    syncDropdownPosition();
    window.addEventListener("resize", syncDropdownPosition);
    window.addEventListener("scroll", syncDropdownPosition, true);
    document.addEventListener("mousedown", onDocumentClick);

    return () => {
      window.removeEventListener("resize", syncDropdownPosition);
      window.removeEventListener("scroll", syncDropdownPosition, true);
      document.removeEventListener("mousedown", onDocumentClick);
    };
  }, [friendsDropdownOpen, partyDropdownOpen]);

  const randomLeaveAfterMatches = () => 1 + Math.floor(Math.random() * 3);

  useEffect(() => {
    if (!partyHydrated) return;

    const previousDayKey = previousDayKeyRef.current;
    if (previousDayKey && previousDayKey !== dayKey) {
      setPartyMembers([]);
      setPartyLeaveCountdown({});
      setPartyDropdownOpen(false);
    }

    previousDayKeyRef.current = dayKey;
    localStorage.setItem(storageKey("party-day-key"), dayKey);
  }, [dayKey, partyHydrated, storageKey]);

  useEffect(() => {
    if (!partyHydrated) return;

    setPartyLeaveCountdown((prev) => {
      const next = { ...prev };
      let changed = false;

      for (const member of partyMembers) {
        if (!next[member.id]) {
          next[member.id] = randomLeaveAfterMatches();
          changed = true;
        }
      }

      for (const memberId of Object.keys(next)) {
        if (!partyMembers.some((member) => member.id === Number(memberId))) {
          delete next[Number(memberId)];
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [partyMembers, partyHydrated]);

  useEffect(() => {
    const previousActiveMatchId = previousActiveMatchIdRef.current;
    const currentActiveMatchId = activeMatch?.fakeRoomId ?? null;

    if (previousActiveMatchId && !currentActiveMatchId && partyMembers.length > 0) {
      const leavingIds: number[] = [];
      const nextCountdown = { ...partyLeaveCountdown };

      for (const member of partyMembers) {
        const remaining = (nextCountdown[member.id] ?? randomLeaveAfterMatches()) - 1;
        if (remaining <= 0) {
          leavingIds.push(member.id);
          delete nextCountdown[member.id];
        } else {
          nextCountdown[member.id] = remaining;
        }
      }

      if (leavingIds.length > 0) {
        setPartyMembers((prev) => prev.filter((member) => !leavingIds.includes(member.id)));
        setDailyFriendStatus((prev) => {
          const next = { ...prev };
          for (const id of leavingIds) {
            next[id] = { online: false, accepts: false };
          }
          return next;
        });

        for (const id of leavingIds) {
          const member = partyMembers.find((player) => player.id === id);
          if (member) {
            toast(`${member.name} left your party and went offline for today.`);
          }
        }
      }

      setPartyLeaveCountdown(nextCountdown);
    }

    previousActiveMatchIdRef.current = currentActiveMatchId;
  }, [activeMatch, partyMembers, partyLeaveCountdown]);

  const resolvePlayerLevel = (player: Pick<MatchPlayer, "level" | "elo">) => {
    if (player.level >= 1 && player.level <= 10) return player.level;

    const eloValue = Number(player.elo || 0);
    const derived = Object.entries(LEVEL_RANGES).find(([, [lowRange, highRange]]) => {
      return eloValue >= lowRange && eloValue <= highRange;
    });

    if (derived) return Number(derived[0]);
    return eloValue > LEVEL_RANGES[10][0] ? 10 : 1;
  };

  const suggestions = React.useMemo(() => {
    const completedPugTeammates = activeMatch ? [] : lastPugTeammates;
    const combined = [...profileTeammates, ...completedPugTeammates];
    const deduped = combined.filter(
      (teammate, index, arr) => arr.findIndex((candidate) => candidate.id === teammate.id) === index
    );

    return deduped.filter(
      (teammate) =>
        teammate.id !== currentPlayerId &&
        !friends.some((friend) => friend.id === teammate.id) &&
        !declinedSuggestionIds.includes(teammate.id)
    );
  }, [profileTeammates, activeMatch, lastPugTeammates, currentPlayerId, friends, declinedSuggestionIds]);


  const knownPlayersById = React.useMemo(() => {
    const all = [
      ...profileTeammates,
      ...lastPugTeammates,
      ...(activeMatch?.teamA ?? []),
      ...(activeMatch?.teamB ?? []),
      ...friends,
    ];

    const map = new Map<number, MatchPlayer>();
    for (const player of all) {
      if (!player?.id) continue;
      const existing = map.get(player.id);
      if (!existing) {
        map.set(player.id, player);
        continue;
      }

      map.set(player.id, {
        ...existing,
        ...player,
        teamId: player.teamId ?? existing.teamId,
        teamCountryId: player.teamCountryId ?? existing.teamCountryId,
      });
    }
    return map;
  }, [profileTeammates, lastPugTeammates, activeMatch, friends]);

  useEffect(() => {
    setFriends((prev) => {
      let changed = false;
      const next = prev.map((friend) => {
        const enriched = knownPlayersById.get(friend.id);
        if (!enriched) return friend;

        const teamId = enriched.teamId ?? friend.teamId;
        const teamCountryId = enriched.teamCountryId ?? friend.teamCountryId;
        if (teamId === friend.teamId && teamCountryId === friend.teamCountryId) {
          return friend;
        }

        changed = true;
        return {
          ...friend,
          teamId,
          teamCountryId,
        };
      });

      return changed ? next : prev;
    });
  }, [knownPlayersById]);


  const resolveRegionId = React.useCallback(
    (player: Pick<MatchPlayer, "teamId" | "teamCountryId" | "countryId">) => {
      // Team assignment takes precedence over nationality.
      if (player.teamId) {
        if (!player.teamCountryId) return null;
        return countryRegionById[player.teamCountryId] ?? null;
      }

      return countryRegionById[player.countryId] ?? null;
    },
    [countryRegionById]
  );

  const userRegionId = React.useMemo(() => {
    const effectiveCountryId = currentTeamCountryId ?? currentPlayerCountryId;
    if (!effectiveCountryId) return null;
    return countryRegionById[effectiveCountryId] ?? null;
  }, [currentTeamCountryId, currentPlayerCountryId, countryRegionById]);

  const userIsAwper = isAwperRole(currentPlayerRole);
  const partyHasAwper = partyMembers.some((member) => isAwperRole(member.role));
  const lobbyHasBotAwper = React.useMemo(() => {
    if (!activeMatch || !currentPlayerId) return false;

    const onTeamA = activeMatch.teamA.some((player) => player.id === currentPlayerId);
    const onTeamB = activeMatch.teamB.some((player) => player.id === currentPlayerId);
    if (!onTeamA && !onTeamB) return false;

    const yourTeam = onTeamA ? activeMatch.teamA : activeMatch.teamB;
    return yourTeam.some((player) => isAwperRole(player.role) && !player.userControlled);
  }, [activeMatch, currentPlayerId]);

  const awperSlotTaken = userIsAwper || partyHasAwper || lobbyHasBotAwper;

  const hydrateFriendRegionInfo = async (friend: MatchPlayer): Promise<MatchPlayer> => {
    try {
      const full = await api.players.find({
        where: { id: friend.id },
        include: {
          team: { include: { country: { include: { continent: true } } } },
          country: { include: { continent: true } },
        },
      } as any);

      if (!full) return friend;

      return {
        ...friend,
        teamId: full.teamId ?? friend.teamId ?? null,
        teamCountryId: full.team?.countryId ?? friend.teamCountryId ?? null,
        countryId: full.countryId ?? friend.countryId,
      };
    } catch {
      return friend;
    }
  };

  const removeFriend = (friendId: number) => {
    if (partyLocked) return;
    setFriends((prev) => prev.filter((friend) => friend.id !== friendId));
    setPartyMembers((prev) => prev.filter((member) => member.id !== friendId));
    setPartyLeaveCountdown((prev) => {
      if (!prev[friendId]) return prev;
      const next = { ...prev };
      delete next[friendId];
      return next;
    });
  };

  const inviteFriendToParty = async (friend: MatchPlayer) => {
    if (partyLocked) {
      toast.error("Party changes are locked during an active match.");
      return;
    }

    const status = dailyFriendStatus[friend.id];
    const resolvedFriend = await hydrateFriendRegionInfo(friend);

    setFriends((prev) =>
      prev.map((entry) => (entry.id === resolvedFriend.id ? { ...entry, ...resolvedFriend } : entry))
    );

    if (isAwperRole(resolvedFriend.role) && awperSlotTaken) {
      toast.error("AWPer slot is already taken in your party/lobby.");
      return;
    }

    const friendRegionId = resolveRegionId(resolvedFriend);
    if (userRegionId && friendRegionId && friendRegionId !== userRegionId) {
      toast.error("Cannot invite player - player isn't located in your region.");
      return;
    }

    if (!status?.online) {
      toast.error(`${resolvedFriend.name} is offline today.`);
      return;
    }

    if (!status.accepts) {
      toast.error(`${resolvedFriend.name} declined your party invite today.`);
      return;
    }

    setPartyMembers((prev) => {
      if (prev.some((member) => member.id === resolvedFriend.id)) return prev;
      if (prev.length >= 4) {
        toast.error("Party is full (you + 4 friends max).");
        return prev;
      }
      toast.success(`${resolvedFriend.name} joined your party.`);
      setPartyLeaveCountdown((counts) => {
        if (counts[resolvedFriend.id]) return counts;
        return { ...counts, [resolvedFriend.id]: randomLeaveAfterMatches() };
      });
      return [...prev, resolvedFriend];
    });
  };

  const removeFromParty = (friendId: number) => {
    if (partyLocked) return;
    setPartyMembers((prev) => prev.filter((member) => member.id !== friendId));
    setPartyLeaveCountdown((prev) => {
      if (!prev[friendId]) return prev;
      const next = { ...prev };
      delete next[friendId];
      return next;
    });
  };

  const sendFriendRequest = (teammate: MatchPlayer) => {
    if (partyLocked) return;
    if (pendingRequests.includes(teammate.id)) return;
    if (friends.length >= 30) {
      toast.error("Friend list is full (30 max).");
      return;
    }

    setPendingRequests((prev) => [...prev, teammate.id]);
    toast(`Sent friend request to ${teammate.name}`);

    window.setTimeout(() => {
      setPendingRequests((prev) => prev.filter((id) => id !== teammate.id));

      const isCurrentLeagueTeammate = Boolean(currentTeamId && teammate.teamId === currentTeamId);
      const declined = isCurrentLeagueTeammate ? false : Math.random() < 0.6;
      if (declined) {
        toast.error(`${teammate.name} declined your friend request.`);
        setDeclinedSuggestionIds((prev) => (prev.includes(teammate.id) ? prev : [...prev, teammate.id]));
        return;
      }

      let accepted = false;
      setFriends((prev) => {
        if (prev.some((friend) => friend.id === teammate.id) || prev.length >= 30) return prev;
        accepted = true;
        return [...prev, teammate];
      });
      if (accepted) {
        toast.success(`${teammate.name} accepted your request!`);
      }
    }, 1500 + Math.round(Math.random() * 1500));
  };

  return (
    <div className="w-full bg-[#0f0f0f] border-b border-[#ff7300]/60 py-4 shadow-lg flex items-center justify-between">
      <img src={faceitLogo} className="h-10 ml-4 select-none" />

      <div className="relative isolate flex items-center gap-3 mr-6 px-4 py-2 rounded-md bg-[#0b0b0b]/70 border border-[#ffffff15] shadow-lg shadow-black/40 backdrop-blur-sm">
        {partyMembers.length === 0 ? (
          <button
            ref={partyButtonRef}
            type="button"
            onClick={() => {
              setPartyDropdownOpen((open) => !open);
              setFriendsDropdownOpen(false);
            }}
            disabled={partyLocked}
            className="h-10 px-3 rounded border border-[#ffffff25] bg-[#111] hover:bg-[#1a1a1a] disabled:opacity-40 text-sm uppercase tracking-wide font-semibold flex items-center gap-2"
          >
            <FaUsers className="text-[#d4d4d4]" />
            Create Party
          </button>
        ) : (
          <button
            ref={partyButtonRef}
            type="button"
            onClick={() => {
              setPartyDropdownOpen((open) => !open);
              setFriendsDropdownOpen(false);
            }}
            disabled={partyLocked}
            className="h-10 px-2 rounded border border-[#ffffff25] bg-[#111] hover:bg-[#1a1a1a] disabled:opacity-40 flex items-center gap-1"
            title="Open party"
          >
            <div className="w-6 h-6 rounded bg-[#1a1a1a] border border-[#ffffff20] flex items-center justify-center text-[#ff7300] text-xs font-bold">
              P
            </div>
            {[0, 1, 2, 3].map((slot) => {
              const member = partyMembers[slot];
              return (
                <React.Fragment key={`party-slot-bar-${slot}`}>
                  <div className="w-6 h-6 rounded bg-[#101010] border border-[#ffffff15] text-neutral-500 flex items-center justify-center text-xs">
                    {member ? member.name.slice(0, 1).toUpperCase() : "+"}
                  </div>
                </React.Fragment>
              );
            })}
          </button>
        )}

        <div className="relative">
          <button
            ref={friendsButtonRef}
            type="button"
            onClick={() => {
              if (partyLocked) return;
              setFriendsDropdownOpen((open) => !open);
              setPartyDropdownOpen(false);
            }}
            disabled={partyLocked}
            className="h-10 px-3 rounded border border-[#ffffff25] bg-[#111] hover:bg-[#1a1a1a] disabled:opacity-40 text-sm uppercase tracking-wide font-semibold flex items-center gap-2"
          >
            <FaUserFriends className="text-[#d4d4d4]" />
            Friends
            <span className="text-[#7cd75c]">{friends.length}</span>
            <FaChevronDown className="text-xs opacity-70" />
          </button>


        </div>

        {friendsDropdownOpen &&
          createPortal(
            <div
              ref={dropdownRef}
              style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
              className="fixed rounded-md border border-[#ffffff30] bg-[#090909] p-3 shadow-2xl z-[9999]"
            >
              <div className="text-sm font-semibold mb-2">Friends</div>

              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {friends.length === 0 ? (
                  <div className="text-xs text-neutral-400">No friends yet.</div>
                ) : (
                  friends.map((friend) => (
                    <div
                      key={friend.id}
                      className="flex items-center justify-between rounded border border-[#ffffff15] px-2 py-1 text-sm"
                    >
                      <span>{friend.name}</span>
                      <div className="flex items-center gap-2">
                        <img
                          src={LEVEL_IMAGES[resolvePlayerLevel(friend)]}
                          className="h-5 w-5"
                          alt={`Level ${resolvePlayerLevel(friend)}`}
                        />
                        <button
                          type="button"
                          onClick={() => removeFriend(friend.id)}
                          disabled={partyLocked}
                          className="text-[10px] uppercase tracking-wide text-neutral-400 hover:text-white disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-3 border-t border-[#ffffff10] pt-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setFriendsTab("suggestions")}
                    className={`text-xs uppercase px-2 py-1 rounded border ${
                      friendsTab === "suggestions"
                        ? "border-[#ff7300] text-[#ff7300]"
                        : "border-[#ffffff20] text-neutral-400"
                    }`}
                  >
                    Suggestions
                  </button>
                  <span className="text-[10px] text-neutral-500">{friends.length}/30</span>
                </div>

                {friendsTab === "suggestions" && (
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {suggestions.length === 0 ? (
                      <div className="text-xs text-neutral-500">No teammate suggestions right now.</div>
                    ) : (
                      suggestions.map((teammate) => {
                        const requestPending = pendingRequests.includes(teammate.id);
                        const atLimit = friends.length >= 30;
                        return (
                          <div
                            key={teammate.id}
                            className="flex items-center justify-between rounded border border-[#ffffff15] px-2 py-1"
                          >
                            <div>
                              <div className="text-sm">{teammate.name}</div>
                              <div className="mt-1 flex items-center">
                                <img
                                  src={LEVEL_IMAGES[resolvePlayerLevel(teammate)]}
                                  className="h-5 w-5"
                                  alt={`Level ${resolvePlayerLevel(teammate)}`}
                                />
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => sendFriendRequest(teammate)}
                              disabled={requestPending || atLimit || partyLocked}
                              className="text-xs rounded px-2 py-1 border border-[#ffffff20] disabled:opacity-40 flex items-center gap-1"
                            >
                              <FaUserPlus />
                              {requestPending ? "Pending" : atLimit ? "Full" : "Add"}
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>,
            document.body,
          )}

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

        {partyDropdownOpen &&
          createPortal(
            <div
              ref={partyDropdownRef}
              style={{ top: partyPos.top, left: partyPos.left, width: partyPos.width }}
              className="fixed rounded-md border border-[#ffffff30] bg-[#090909] p-3 shadow-2xl z-[9999]"
            >
              <div className="text-sm font-semibold mb-2">Party</div>

              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded bg-[#1a1a1a] border border-[#ffffff20] flex items-center justify-center text-[#ff7300]">P</div>
                {[0, 1, 2, 3].map((slot) => {
                  const member = partyMembers[slot];
                  return member ? (
                    <button
                      key={member.id}
                      type="button"
                      title={`Remove ${member.name}`}
                      onClick={() => removeFromParty(member.id)}
                      disabled={partyLocked}
                      className="w-8 h-8 rounded bg-[#1a1a1a] border border-[#ffffff20] text-xs disabled:opacity-40"
                    >
                      {member.name.slice(0, 1).toUpperCase()}
                    </button>
                  ) : (
                    <div
                      key={`empty-${slot}`}
                      className="w-8 h-8 rounded bg-[#101010] border border-[#ffffff15] text-neutral-500 flex items-center justify-center"
                    >
                      +
                    </div>
                  );
                })}
              </div>

              <div className="text-xs text-neutral-400 mb-2">Invite friends ({partyMembers.length}/4)</div>
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {friends.length === 0 ? (
                  <div className="text-xs text-neutral-500">Add friends first to build a party.</div>
                ) : (
                  friends.map((friend) => {
                    const status = dailyFriendStatus[friend.id];
                    const inParty = partyMembers.some((member) => member.id === friend.id);
                    const partyFull = partyMembers.length >= 4;
                    const awperBlocked = isAwperRole(friend.role) && awperSlotTaken;
                    const canInvite = Boolean(status?.online) && !inParty && !partyFull && !awperBlocked;
                    return (
                      <div
                        key={`party-invite-${friend.id}`}
                        className="flex items-center justify-between rounded border border-[#ffffff15] px-2 py-1"
                      >
                        <div className="flex items-center gap-2">
                          <img
                            src={LEVEL_IMAGES[resolvePlayerLevel(friend)]}
                            className="h-5 w-5"
                            alt={`Level ${resolvePlayerLevel(friend)}`}
                          />
                          <div className="text-sm">{friend.name}</div>
                        </div>

                        <button
                          type="button"
                          onClick={() => inviteFriendToParty(friend)}
                          disabled={!canInvite || partyLocked}
                          className="text-xs rounded px-2 py-1 border border-[#ffffff20] disabled:opacity-40"
                        >
                          {inParty ? "In party" : awperBlocked ? "AWPer blocked" : status?.online ? "Invite" : "Offline"}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>,
            document.body,
          )}
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
  leaderboard: LeaderboardPlayer[];
  leaderboardRegionTitle: string;
  onOpenRecent: (id: number) => void;

  startQueue: () => void;
  cancelQueue: () => void;
  queueing: boolean;
  queueTimer: number;

  activeMatch: MatchRoomData | null;
  reopenMatchRoom: () => void;

  gameSlug: string;

  daily: DailyState | null;
  canQueue: boolean;
  queueBlockMessage: string | null;
  queueError: string | null;
}

function NormalFaceitBody({
  recent,
  lifetime,
  last20,
  leaderboard,
  leaderboardRegionTitle,
  onOpenRecent,
  startQueue,
  cancelQueue,
  queueing,
  queueTimer,
  activeMatch,
  reopenMatchRoom,
  gameSlug,
  daily,
  canQueue,
  queueBlockMessage,
  queueError,
}: NormalFaceitBodyProps) {
  const navigate = useNavigate();
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
  const lastAverageKills =
    last20 && last20.matchesPlayed > 0 ? Math.floor(last20.kills / last20.matchesPlayed) : "—";

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

          {/* AVERAGE KILLS */}
          <div className="bg-neutral-900/40 rounded-lg flex flex-col items-center justify-center p-3 h-28">
            <div className="text-xl font-bold">{lastAverageKills}</div>
            <div className="text-xs opacity-60 mt-1">Avg Kills</div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* MATCHMAKING BUTTON */}
      {/* ------------------------------------------------------------------- */}
      <div className="bg-[#0f0f0f] rounded-lg border border-[#ffffff15] flex flex-col overflow-hidden">
        <div className="w-full bg-[#0c0c0c] py-3 flex justify-center items-center border-b border-[#ff7300]/40">
          <h2 className="text-lg font-bold">MATCHMAKING</h2>
        </div>

        <div className="flex flex-col gap-4 p-5">
          <div className="relative flex flex-col items-center pt-6 pb-1">
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
                  disabled={!canQueue && !queueing}
                  onClick={!queueing && canQueue ? startQueue : undefined}
                  className={`
        w-56 py-5 text-xl rounded text-white shadow-lg transition-all text-center
        ${queueing ? "bg-orange-600 cursor-default" : ""}
        ${!queueing && canQueue ? "bg-orange-600 hover:bg-orange-700" : ""}
        ${!queueing && !canQueue ? "bg-neutral-600 cursor-not-allowed opacity-70" : ""}
      `}
                >
                  {queueing
                    ? `SEARCHING... ${queueTimer}s`
                    : !canQueue
                      ? "LIMIT REACHED"
                      : "FIND MATCH"}
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
                {daily && (
                  <div className="mt-3 text-center text-xs opacity-70">
                    Matches today: {daily.playedToday}/{daily.maxToday}
                  </div>
                )}
                {queueError ? (
                  <div className="mt-2 text-center text-xs text-red-400 px-6">
                    {queueError}
                  </div>
                ) : queueBlockMessage ? (
                  <div className="mt-2 text-center text-xs text-neutral-300 px-6">
                    {queueBlockMessage}
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="bg-neutral-900/40 rounded-lg border border-[#ffffff10] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#ffffff10] bg-[#0c0c0c]/60">
              <h3 className="text-sm font-bold tracking-wide text-center">{leaderboardRegionTitle}</h3>
            </div>

            <div className="max-h-[460px] overflow-y-auto">
              {leaderboard.length === 0 ? (
                <div className="px-4 py-4 text-sm opacity-60">No leaderboard data available.</div>
              ) : (
                <div className="divide-y divide-[#ffffff10]">
                  {leaderboard.slice(0, 5).map((player) => (
                    <div
                      key={player.playerId}
                      className="flex items-center justify-between px-4 py-1.5 bg-neutral-900/20"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs text-neutral-300 w-6">#{player.rank}</span>
                        <img
                          src={LEVEL_IMAGES[player.faceitLevel] || LEVEL_IMAGES[1]}
                          className="w-6 h-6"
                        />
                        {player.countryCode ? (
                          <span className={`fp ${player.countryCode}`} />
                        ) : (
                          <span className="w-4" />
                        )}
                        <span className="text-sm font-semibold truncate">{player.nickname}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <img
                          src={RANK_IMAGES[Math.min(10, Math.max(1, player.rank))] || RANK_IMAGES[10]}
                          className="w-17 h-11"
                        />
                        <span className="text-sm font-bold text-white">{player.faceitElo}</span>
                      </div>
                    </div>
                  ))}

                  <div className="px-4 py-3 bg-neutral-900/20">
                      <button
                        onClick={() =>
                          navigate("/faceit/rankings", {
                            state: {
                              fromFaceitRankingsButton: true,
                              leaderboardRegionTitle,
                            },
                          })
                        }
                        className="relative w-full flex items-center justify-center rounded-md border border-[#ffffff20] px-3 py-2 text-sm font-semibold hover:border-[#ff7300]/70 hover:bg-neutral-800/70 transition"
                      >
                        <span className="text-white">
                          OPEN FULL RANKINGS
                        </span>
                        <span className="absolute right-3 text-neutral-300">
                          →
                        </span>
                      </button>
                  </div>
                </div>
              )}
            </div>
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
