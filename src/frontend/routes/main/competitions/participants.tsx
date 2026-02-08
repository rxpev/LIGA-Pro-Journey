/**
 * Competition participants route.
 *
 * @module
 */
import React from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Constants, Eagers } from '@liga/shared';
import { cx } from '@liga/frontend/lib';

/**
 * Maximum starters shown per team card.
 *
 * @constant
 */
const STARTERS_PREVIEW_LIMIT = 5;

/**
 * Slot height for the card header area (logo/lineup). Must be fixed to avoid layout shift.
 *
 * @constant
 */
const CARD_SLOT_HEIGHT_CLASS = 'h-32';

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const { competition } = useOutletContext<RouteContextCompetitions>();

  const [hoveredTeamId, setHoveredTeamId] = React.useState<number | null>(null);
  const [isLineupsVisible, setIsLineupsVisible] = React.useState(false);

  const [startersByTeamId, setStartersByTeamId] = React.useState<
    Record<number, Awaited<ReturnType<typeof api.players.all<typeof Eagers.player>>>>
  >({});
  const [loadingByTeamId, setLoadingByTeamId] = React.useState<Record<number, boolean>>({});

  const [worldRankingByTeamId, setWorldRankingByTeamId] = React.useState<Record<number, number>>(
    {},
  );
  const [worldRankingLoadingByTeamId, setWorldRankingLoadingByTeamId] = React.useState<
    Record<number, boolean>
  >({});

  const baseParticipants = React.useMemo(() => {
    const teamMap = new Map<number, (typeof competition.competitors)[number]['team']>();

    competition.competitors.forEach((competitor) => {
      teamMap.set(competitor.team.id, competitor.team);
    });

    return Array.from(teamMap.values());
  }, [competition.competitors]);

  const fetchStarters = React.useCallback(
    (teamId: number) => {
      if (startersByTeamId[teamId] || loadingByTeamId[teamId]) {
        return;
      }

      setLoadingByTeamId((prev) => ({ ...prev, [teamId]: true }));

      api.players
        .all<typeof Eagers.player>({
          ...Eagers.player,
          where: {
            teamId,
            starter: true,
          },
          take: Constants.GameSettings.SQUAD_STARTERS_NUM,
          orderBy: {
            name: 'asc',
          },
        })
        .then((players) => setStartersByTeamId((prev) => ({ ...prev, [teamId]: players })))
        .finally(() => setLoadingByTeamId((prev) => ({ ...prev, [teamId]: false })));
    },
    [startersByTeamId, loadingByTeamId],
  );

  const fetchWorldRanking = React.useCallback(
    (teamId: number) => {
      if (worldRankingByTeamId[teamId] != null || worldRankingLoadingByTeamId[teamId]) {
        return;
      }

      setWorldRankingLoadingByTeamId((prev) => ({ ...prev, [teamId]: true }));

      api.team
        .worldRanking(teamId)
        .then((rank) => setWorldRankingByTeamId((prev) => ({ ...prev, [teamId]: rank })))
        .finally(() =>
          setWorldRankingLoadingByTeamId((prev) => ({ ...prev, [teamId]: false })),
        );
    },
    [worldRankingByTeamId, worldRankingLoadingByTeamId],
  );

  /**
   * When lineups are visible, eager-load all starters to prevent “pop-in” while browsing.
   */
  React.useEffect(() => {
    if (!isLineupsVisible) return;
    baseParticipants.forEach((team) => fetchStarters(team.id));
  }, [isLineupsVisible, baseParticipants, fetchStarters]);

  /**
   * Eager-load world ranking for all teams so the grid can be ordered by ranking.
   */
  React.useEffect(() => {
    baseParticipants.forEach((team) => fetchWorldRanking(team.id));
  }, [baseParticipants, fetchWorldRanking]);

  const onToggleLineups = React.useCallback(() => {
    setIsLineupsVisible((prev) => !prev);
  }, []);

  const participants = React.useMemo(() => {
    const getRankKey = (teamId: number) => {
      const rank = worldRankingByTeamId[teamId];

      // Treat missing/invalid ranks as "unranked" and push them to the bottom.
      if (rank == null || !Number.isFinite(rank) || rank <= 0) {
        return Number.POSITIVE_INFINITY;
      }

      return rank;
    };

    return [...baseParticipants].sort((a, b) => {
      const aRank = getRankKey(a.id);
      const bRank = getRankKey(b.id);

      if (aRank !== bRank) {
        return aRank - bRank; // lower rank number = better, goes first
      }

      // Stable fallback ordering.
      return a.name.localeCompare(b.name);
    });
  }, [baseParticipants, worldRankingByTeamId]);

  return (
    <section>
      <header className="heading prose max-w-none border-t-0! flex items-center justify-between">
        <h2>Participants</h2>
        <button type="button" className="btn btn-sm btn-primary" onClick={onToggleLineups}>
          {isLineupsVisible ? 'Hide lineups' : 'Show lineups'}
        </button>
      </header>

      <div className="grid grid-cols-2 gap-4 p-4 xl:grid-cols-4">
        {participants.map((team) => {
          const isExpanded = isLineupsVisible || hoveredTeamId === team.id;
          const isLoading = loadingByTeamId[team.id] === true;
          const starters = startersByTeamId[team.id] || [];

          const ranking = worldRankingByTeamId[team.id];
          const rankingLoading = worldRankingLoadingByTeamId[team.id] === true;

          const showTopLeftRanking = !isExpanded;
          const showBottomLeftRanking = isExpanded;

          return (
            <Link
              key={team.id}
              to={`/teams?teamId=${team.id}`}
              className={cx(
                'card relative flex flex-col rounded-2xl p-4 shadow-sm transition-colors',
                'bg-base-200/40 hover:bg-base-200/70',
              )}
              onMouseEnter={() => {
                setHoveredTeamId(team.id);

                // When lineups are not globally shown, we prefetch on hover for responsiveness.
                if (!isLineupsVisible) {
                  fetchStarters(team.id);
                }

                // If a ranking hasn't been loaded yet (rare), fetch it on-demand.
                fetchWorldRanking(team.id);
              }}
              onMouseLeave={() => setHoveredTeamId(null)}
            >
              {showTopLeftRanking && (rankingLoading || ranking != null) && (
                <span className="badge badge-sm absolute left-3 top-3 border-base-content/10 bg-base-300/70">
                  {rankingLoading ? '…' : `#${ranking}`}
                </span>
              )}

              <div className={cx('flex w-full items-center justify-center', CARD_SLOT_HEIGHT_CLASS)}>
                {!isExpanded && (
                  <figure className="flex h-16 w-16 items-center justify-center">
                    <img
                      alt={`${team.name} logo`}
                      src={team.blazon}
                      className="max-h-16 max-w-16 object-contain"
                    />
                  </figure>
                )}

                {isExpanded && (
                  <div className="flex h-full w-full flex-col justify-center overflow-hidden">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-base-content/60">
                        Starters
                      </p>
                      <img
                        alt=""
                        src={team.blazon}
                        className="h-5 w-5 opacity-70"
                        aria-hidden="true"
                      />
                    </div>

                    {isLoading && (
                      <p className="mt-2 text-sm leading-tight text-base-content/60">Loading…</p>
                    )}

                    {!isLoading && (
                      <ul className="mt-2 space-y-1 text-sm leading-tight">
                        {starters.slice(0, STARTERS_PREVIEW_LIMIT).map((player) => (
                          <li key={player.id} className="flex items-center gap-2">
                            <span className={`fp ${player.country.code.toLowerCase()}`} />
                            <span className="truncate">{player.name}</span>
                          </li>
                        ))}
                        {!starters.length && (
                          <li className="text-base-content/60">No starters listed.</li>
                        )}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center justify-center">
                <span className="link link-hover block truncate text-center font-semibold">
                  {team.name}
                </span>
              </div>

              {showBottomLeftRanking && (rankingLoading || ranking != null) && (
                <span className="badge badge-sm absolute bottom-3 left-3 border-base-content/10 bg-base-300/70">
                  {rankingLoading ? '…' : `#${ranking}`}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
