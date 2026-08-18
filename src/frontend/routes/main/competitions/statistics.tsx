/**
 * Competition statistics route.
 *
 * @module
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { useOutletContext } from 'react-router-dom';
import { Constants, Eagers, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';

const MVP_MEDAL_SRC = 'resources://competitions/mvp.png';

type PlayerSort = 'rating' | 'kills' | 'deaths' | 'maps' | 'team';
type PlayerStatsRow = Awaited<ReturnType<typeof api.matches.globalPlayerStats>>['players'][number];
type TooltipPosition = {
  left: number;
  top: number;
};

const PageSize = 14;

const LINKED_PLAYOFF_TIER_BY_TIER: Partial<Record<Constants.TierSlug, Constants.TierSlug>> = {
  [Constants.TierSlug.LEAGUE_OPEN]: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
  [Constants.TierSlug.LEAGUE_INTERMEDIATE]: Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
  [Constants.TierSlug.LEAGUE_MAIN]: Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
  [Constants.TierSlug.LEAGUE_ADVANCED]: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
  [Constants.TierSlug.CCT_SERIES]: Constants.TierSlug.CCT_SERIES_PLAYOFFS,
  [Constants.TierSlug.CCT_OCE_SERIES]: Constants.TierSlug.CCT_OCE_PLAYOFFS,
  [Constants.TierSlug.ESL_CHALLENGER]: Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS,
};

enum Rating {
  LOW = 0.95,
  HIGH = 1.05,
}

function getRatingColorClass(rating: number) {
  if (rating <= Rating.LOW) {
    return 'text-error';
  }

  if (rating >= Rating.HIGH) {
    return 'text-success';
  }

  return 'text-inherit';
}

function getCompetitionTitle(competition: RouteContextCompetitions['competition']) {
  const year = competition.season ? 2025 + competition.season : null;
  const city = Util.getCompetitionHostingLocationCity(competition.location);

  if (Util.isMajorStageTier(competition.tier.slug)) {
    return [Util.getMajorEventDisplayName(competition.location, competition.organizer), year]
      .filter(Boolean)
      .join(' ');
  }

  if (competition.tier.slug === Constants.TierSlug.BLAST_FINALS) {
    return ['BLAST Finals', city, year].filter(Boolean).join(' ');
  }

  if (competition.tier.slug === Constants.TierSlug.IEM_COLOGNE_PLAYOFFS) {
    return ['IEM Cologne', year].filter(Boolean).join(' ');
  }

  if (competition.tier.slug === Constants.TierSlug.IEM_KRAKOW_PLAYOFFS) {
    return ['IEM Krakow', year].filter(Boolean).join(' ');
  }

  if (competition.tier.slug === Constants.TierSlug.LEAGUE_PRO_PLAYOFFS) {
    return ['ESL Pro League', city, year].filter(Boolean).join(' ');
  }

  return [
    Util.getCompetitionDisplayName(competition.tier.league.name, competition.tier.slug),
    city,
    year,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Exports this module.
 *
 * @exports
 */
export default function Statistics(): JSX.Element {
  const { competition } = useOutletContext<RouteContextCompetitions>();
  const [players, setPlayers] = React.useState<PlayerStatsRow[]>([]);
  const [numPlayers, setNumPlayers] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [sort, setSort] = React.useState<PlayerSort>('rating');
  const [loading, setLoading] = React.useState(false);
  const [competitionIds, setCompetitionIds] = React.useState<number[]>([competition.id]);
  const [mvpTooltipPosition, setMvpTooltipPosition] = React.useState<TooltipPosition | null>(null);
  const mvpTooltip = React.useMemo(
    () => `MVP winner at:\n${getCompetitionTitle(competition)}`,
    [competition],
  );

  React.useEffect(() => {
    setPage(1);
  }, [competition.id, search, sort]);

  React.useEffect(() => {
    const playoffTier = LINKED_PLAYOFF_TIER_BY_TIER[competition.tier.slug as Constants.TierSlug];

    setCompetitionIds([competition.id]);

    if (!playoffTier) {
      return;
    }

    let isCurrent = true;

    api.competitions
      .find({
        ...Eagers.competition,
        where: {
          federationId: competition.federationId,
          season: competition.season,
          tier: { slug: playoffTier },
        },
      })
      .then((playoffCompetition) => {
        if (isCurrent && playoffCompetition) {
          setCompetitionIds([competition.id, playoffCompetition.id]);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [competition.federationId, competition.id, competition.season, competition.tier.slug]);

  React.useEffect(() => {
    let isCurrent = true;

    setLoading(true);
    api.matches
      .globalPlayerStats({
        competitionId: competition.id,
        competitionIds,
        name: search || undefined,
        page,
        pageSize: PageSize,
        sort,
      })
      .then(({ players: resultPlayers, total }) => {
        if (!isCurrent) {
          return;
        }

        setPlayers(resultPlayers);
        setNumPlayers(total);
      })
      .finally(() => {
        if (isCurrent) {
          setLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [competition.id, competitionIds, page, search, sort]);

  const totalPages = Math.max(1, Math.ceil(numPlayers / PageSize));
  const showMvpTooltip = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const tooltipWidth = 280;
    const tooltipHeight = 56;
    const top =
      rect.bottom + 8 + tooltipHeight <= window.innerHeight
        ? rect.bottom + 8
        : Math.max(12, rect.top - tooltipHeight - 8);

    setMvpTooltipPosition({
      left: Math.max(12, Math.min(rect.left, window.innerWidth - tooltipWidth - 12)),
      top,
    });
  }, []);

  const renderPlayerName = (player: PlayerStatsRow) => {
    return (
      <button
        type="button"
        className="link link-hover min-w-0 text-left"
        onClick={() =>
          api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
            target: '/transfer',
            payload: player.id,
          })
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          {player.country?.code && <span className={cx('fp', player.country.code.toLowerCase())} />}
          <span className="truncate font-semibold">{player.name}</span>
          {player.mvp && (
            <span
              className="inline-flex shrink-0"
              aria-label={mvpTooltip}
              onMouseEnter={showMvpTooltip}
              onMouseLeave={() => setMvpTooltipPosition(null)}
            >
              <img src={MVP_MEDAL_SRC} className="size-5 object-contain" />
            </span>
          )}
        </span>
      </button>
    );
  };

  return (
    <section className="p-3">
      {mvpTooltipPosition &&
        createPortal(
          <div
            className="bg-neutral text-neutral-content pointer-events-none fixed z-[9999] max-w-[280px] rounded px-3 py-2 text-left text-xs leading-relaxed whitespace-pre-line shadow-lg"
            style={mvpTooltipPosition}
          >
            {mvpTooltip}
          </div>,
          document.body,
        )}
      <article className="border-base-content/10 flex min-h-[640px] flex-col border">
        <header className="border-base-content/10 grid grid-cols-1 gap-3 border-b p-3 lg:grid-cols-[1fr_180px]">
          <input
            type="text"
            placeholder="Search players"
            className="input input-sm input-bordered w-full rounded-none"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="select select-sm select-bordered w-full rounded-none"
            value={sort}
            onChange={(event) => setSort(event.target.value as PlayerSort)}
          >
            <option value="rating">Sort by rating</option>
            <option value="kills">Sort by kills</option>
            <option value="deaths">Sort by deaths</option>
            <option value="maps">Sort by maps</option>
            <option value="team">Sort by team</option>
          </select>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="table-pin-rows table-sm table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Team</th>
                <th className="text-center">Rating</th>
                <th className="text-center">Maps</th>
                <th className="text-center">K / D / A</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="py-12 text-center">
                    <span className="loading loading-bars loading-md" />
                  </td>
                </tr>
              )}
              {!loading &&
                players.map((player) => (
                  <tr key={player.id} data-interaction-hover-sound="none">
                    <td>{renderPlayerName(player)}</td>
                    <td>
                      {player.team ? (
                        <span className="inline-flex min-w-0 items-center gap-2">
                          {player.team.blazon && (
                            <img src={player.team.blazon} className="size-5 object-contain" />
                          )}
                          <span className="truncate">{player.team.name}</span>
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td
                      className={cx(
                        'text-center font-semibold',
                        getRatingColorClass(player.rating || 0),
                      )}
                    >
                      {(player.rating || 0).toFixed(2)}
                    </td>
                    <td className="text-center">{player.maps || 0}</td>
                    <td className="text-center">
                      {player.kills || 0} / {player.deaths || 0} / {player.assists || 0}
                    </td>
                  </tr>
                ))}
              {!loading && !players.length && (
                <tr>
                  <td colSpan={5} className="text-base-content/60 py-12 text-center text-sm">
                    No player statistics found for this tournament.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {players.length > 0 && (
          <footer className="border-base-content/10 flex items-center justify-end gap-2 border-t px-3 py-2">
            <button
              className="btn btn-ghost btn-xs rounded-none"
              disabled={page <= 1}
              onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
            >
              Prev
            </button>
            <span className="text-xs">
              Page {page} / {totalPages}
            </span>
            <button
              className="btn btn-ghost btn-xs rounded-none"
              disabled={page >= totalPages}
              onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
            >
              Next
            </button>
          </footer>
        )}
      </article>
    </section>
  );
}
