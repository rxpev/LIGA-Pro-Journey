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

  const participants = React.useMemo(() => {
    const teamMap = new Map<number, (typeof competition.competitors)[number]['team']>();

    competition.competitors.forEach((competitor) => {
      teamMap.set(competitor.team.id, competitor.team);
    });

    return Array.from(teamMap.values()).sort((a, b) => a.name.localeCompare(b.name));
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

  /**
   * When lineups are visible, eager-load all starters to prevent “pop-in” while browsing.
   */
  React.useEffect(() => {
    if (!isLineupsVisible) return;
    participants.forEach((team) => fetchStarters(team.id));
  }, [isLineupsVisible, participants, fetchStarters]);

  const onToggleLineups = React.useCallback(() => {
    setIsLineupsVisible((prev) => !prev);
  }, []);

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
              }}
              onMouseLeave={() => setHoveredTeamId(null)}
            >
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

              <span className="link link-hover mt-3 block truncate text-center font-semibold">
                {team.name}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
