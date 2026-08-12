/**
 * Dedicated modal for player team history.
 *
 * Transfer offer tabs have been replaced with a compact team history view.
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { FaChartBar, FaNewspaper, FaStar } from 'react-icons/fa';
import { levelFromElo } from '@liga/backend/lib/levels';
import { Bot, Constants, Eagers, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { Image } from '@liga/frontend/components';
import { XPBar } from '@liga/frontend/components/player-card';
import { AppStateContext } from '@liga/frontend/redux';
import faceitLogo from '../../assets/faceit/icon.png';
import faceitLevel1 from '../../assets/faceit/1.png';
import faceitLevel2 from '../../assets/faceit/2.png';
import faceitLevel3 from '../../assets/faceit/3.png';
import faceitLevel4 from '../../assets/faceit/4.png';
import faceitLevel5 from '../../assets/faceit/5.png';
import faceitLevel6 from '../../assets/faceit/6.png';
import faceitLevel7 from '../../assets/faceit/7.png';
import faceitLevel8 from '../../assets/faceit/8.png';
import faceitLevel9 from '../../assets/faceit/9.png';
import faceitLevel10 from '../../assets/faceit/10.png';

/** @type {Player} */
type Player =
  | (NonNullable<Awaited<ReturnType<typeof api.players.find<typeof Eagers.player>>>> & {
      profile?: {
        faceitElo: number;
      } | null;
      careerStints?: Array<{
        id: number;
        teamId: number | null;
        starter: boolean;
        startedAt: Date;
        endedAt: Date | null;
        team?: {
          id: number;
          name: string;
          blazon: string;
        } | null;
      }>;
    })
  | null;

type HonorOccurrence = {
  key: string;
  teamId: number;
  season: number;
  date: Date;
  tierSlug: string;
  federationSlug: string;
  location: string | null;
  organizer: string | null;
};

type MvpOccurrence = {
  id: number;
  key: string;
  teamId: number | null;
  season: number | null;
  date: Date;
  title: string;
  tierSlug: string;
};

type HonorGroup = {
  key: string;
  count: number;
  seasons: number[];
  tierSlug: string;
  federationSlug: string;
  location: string | null;
  organizer: string | null;
};

type RatingSummary = {
  maps: number;
  rating: number;
};

type RatingGame = {
  date: Date | string;
  teamIds: number[];
  rating: number;
};

type TooltipPosition = {
  left: number;
  top: number;
};

const FACEIT_LEVEL_IMAGES: Record<number, string> = {
  1: faceitLevel1,
  2: faceitLevel2,
  3: faceitLevel3,
  4: faceitLevel4,
  5: faceitLevel5,
  6: faceitLevel6,
  7: faceitLevel7,
  8: faceitLevel8,
  9: faceitLevel9,
  10: faceitLevel10,
};

const MVP_MEDAL_SRC = 'resources://competitions/mvp.png';

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

function formatStintDate(input: Date | string) {
  const date = new Date(input);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

function isWithinStint(date: Date, startedAt: Date | string, endedAt: Date | string | null) {
  const start = new Date(startedAt);
  start.setHours(0, 0, 0, 0);

  const end = endedAt ? new Date(endedAt) : null;
  if (end) end.setHours(23, 59, 59, 999);

  return start <= date && (!end || end >= date);
}

function getRatingSummary(
  games: RatingGame[],
  predicate: (game: RatingGame) => boolean = () => true,
): RatingSummary | null {
  const ratings = games.filter(predicate).map((game) => game.rating);

  if (!ratings.length) {
    return null;
  }

  return {
    maps: ratings.length,
    rating: ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length,
  };
}

function MajorHonorBadge() {
  return (
    <span className="absolute right-0 bottom-0 grid size-5 translate-x-1/4 translate-y-1/4 place-items-center rounded-full border border-yellow-300/70 bg-yellow-600/80 text-[10px] text-yellow-100 shadow-sm">
      <FaStar />
    </span>
  );
}

function getCompetitionTitle(
  competition: Awaited<ReturnType<typeof api.competitions.mvps>>[number]['competition'],
) {
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

export default function TransferModal() {
  const location = useLocation();
  const { state } = React.useContext(AppStateContext);
  const [player, setPlayer] = React.useState<Player>();
  const [honors, setHonors] = React.useState<HonorOccurrence[]>([]);
  const [mvps, setMvps] = React.useState<MvpOccurrence[]>([]);
  const [mvpTooltipPosition, setMvpTooltipPosition] = React.useState<TooltipPosition | null>(null);
  const [ratingGames, setRatingGames] = React.useState<RatingGame[]>([]);

  React.useEffect(() => {
    if (!location.state) return;

    const playerId = location.state as number;

    api.players
      .find({
        include: {
          ...Eagers.player.include,
          profile: true,
          careerStints: {
            include: {
              team: true,
            },
          },
        },
        where: { id: playerId },
      })
      .then((foundPlayer) => setPlayer(foundPlayer ?? undefined));
  }, []);

  React.useEffect(() => {
    setRatingGames([]);

    if (!state.profile?.simulateNpcMatchStats || !player) {
      return;
    }

    api.matches.playerRatingGames(player.id).then(setRatingGames);
  }, [player, state.profile?.simulateNpcMatchStats]);

  const teamHistory = React.useMemo(() => {
    const stints = player?.careerStints ?? [];
    return [...stints].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
  }, [player?.careerStints]);

  React.useEffect(() => {
    if (!player) return;

    api.competitions.mvps({ playerId: player.id }).then((awards) => {
      setMvps(
        awards.map((award) => {
          const title = getCompetitionTitle(award.competition);

          return {
            id: award.id,
            key: `${award.competitionId}:${award.playerId}`,
            teamId: award.teamId,
            season: award.competition.season,
            date: new Date(award.createdAt),
            title,
            tierSlug: award.competition.tier.slug,
          };
        }),
      );
    });

    const championAwards = [
      ...Constants.Awards.filter((award) => award.type === Constants.AwardType.CHAMPION).map(
        (award) => award.target,
      ),
      Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
    ];

    api.competitions
      .all<{
        include: {
          competitors: true;
          federation: true;
          tier: {
            include: {
              league: true;
            };
          };
          matches: {
            include: {
              competitors: true;
            };
          };
        };
      }>({
        where: {
          status: Constants.CompetitionStatus.COMPLETED,
          tier: {
            slug: { in: championAwards },
          },
        },
        include: {
          competitors: true,
          federation: true,
          tier: {
            include: {
              league: true,
            },
          },
          matches: {
            include: {
              competitors: true,
            },
          },
        },
        orderBy: { season: 'desc' },
      })
      .then((competitions) => {
        const stints = player.careerStints ?? [];

        const occurrences = competitions.reduce<HonorOccurrence[]>((acc, competition) => {
          const championshipMatch = competition.matches.reduce<
            (typeof competition.matches)[number] | null
          >(
            (
              latest: (typeof competition.matches)[number] | null,
              match: (typeof competition.matches)[number],
            ) => {
              if (!latest || match.date > latest.date) return match;
              return latest;
            },
            null,
          );

          if (!championshipMatch) return acc;

          let winnerTeamId = competition.competitors.find((c) => c.position === 1)?.teamId;
          if (!winnerTeamId && championshipMatch.competitors.length >= 2) {
            const ordered = [...championshipMatch.competitors].sort(
              (a, b) => (b.score ?? 0) - (a.score ?? 0),
            );
            winnerTeamId = ordered[0]?.teamId;
          }

          if (!winnerTeamId) return acc;

          const championshipDate = new Date(championshipMatch.date);
          const wonTitle = stints.some(
            (stint) =>
              stint.teamId === winnerTeamId &&
              stint.starter &&
              isWithinStint(championshipDate, stint.startedAt, stint.endedAt),
          );

          if (!wonTitle) return acc;

          const isMajor = Util.isMajorStageTier(competition.tier.slug);
          const key = isMajor
            ? [
                competition.tier.slug,
                competition.federation.slug,
                competition.organizer,
                competition.location,
              ].join('__')
            : `${competition.tier.slug}__${competition.federation.slug}`;

          acc.push({
            key,
            teamId: winnerTeamId,
            season: competition.season,
            date: championshipDate,
            tierSlug: competition.tier.slug,
            federationSlug: competition.federation.slug,
            location: competition.location,
            organizer: competition.organizer,
          });

          return acc;
        }, []);

        setHonors(occurrences);
      });
  }, [player]);

  const honorGroups = React.useMemo(() => {
    return honors.reduce<Record<string, HonorGroup>>((acc, honor) => {
      if (!acc[honor.key]) {
        acc[honor.key] = {
          key: honor.key,
          count: 0,
          seasons: [],
          tierSlug: honor.tierSlug,
          federationSlug: honor.federationSlug,
          location: honor.location,
          organizer: honor.organizer,
        };
      }

      acc[honor.key].count += 1;
      acc[honor.key].seasons.push(honor.season);
      return acc;
    }, {});
  }, [honors]);

  const majorWinCount = React.useMemo(
    () =>
      honors.filter((honor) => honor.tierSlug === Constants.TierSlug.MAJOR_CHAMPIONS_STAGE).length,
    [honors],
  );
  const majorMvpCount = React.useMemo(
    () => mvps.filter((mvp) => mvp.tierSlug === Constants.TierSlug.MAJOR_CHAMPIONS_STAGE).length,
    [mvps],
  );
  const mvpTooltip = React.useMemo(() => {
    if (!mvps.length) {
      return '';
    }

    return ['MVP winner at:', ...mvps.map((mvp) => mvp.title)].join('\n');
  }, [mvps]);
  const showMvpTooltip = React.useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const tooltipWidth = 280;
      const tooltipHeight = Math.min(320, 32 + mvpTooltip.split('\n').length * 20);
      const top =
        rect.bottom + 8 + tooltipHeight <= window.innerHeight
          ? rect.bottom + 8
          : Math.max(12, rect.top - tooltipHeight - 8);

      setMvpTooltipPosition({
        left: Math.max(12, Math.min(rect.left, window.innerWidth - tooltipWidth - 12)),
        top,
      });
    },
    [mvpTooltip],
  );
  const faceitElo = player?.profile?.faceitElo ?? player?.elo ?? null;
  const faceitLevel = typeof faceitElo === 'number' ? levelFromElo(faceitElo) : null;
  const playerRating = player ? getRatingSummary(ratingGames) : null;
  const openPlayerStatistics = React.useCallback(() => {
    if (!player) return;

    api.window.send<ModalRequest<{ tab: 'GLOBAL_PLAYERS'; playerId: number }>>(
      Constants.WindowIdentifier.Main,
      {
        target: '/stats',
        payload: {
          tab: 'GLOBAL_PLAYERS',
          playerId: player.id,
        },
      },
      0,
    );
    api.window.close(Constants.WindowIdentifier.Modal);
  }, [player]);
  const openNewsPlaceholder = React.useCallback(() => {
    api.window.send<ModalRequest>(
      Constants.WindowIdentifier.Main,
      {
        target: '/news',
      },
      0,
    );
    api.window.close(Constants.WindowIdentifier.Modal);
  }, []);

  if (!player) {
    return (
      <main className="h-screen w-screen">
        <section className="center h-full">
          <span className="loading loading-bars" />
        </section>
      </main>
    );
  }

  return (
    <main className="divide-base-content/10 flex h-screen w-screen flex-col divide-y">
      {/* PLAYER CARD */}
      <section className="flex">
        <figure className="border-base-content/10 flex h-[246px] w-1/5 items-end justify-center overflow-hidden border-b p-0">
          <Image
            src={player.avatar || 'resources://avatars/empty.png'}
            className="mt-auto h-[390px] w-auto max-w-none object-contain"
          />
        </figure>

        <table className="table table-fixed">
          <thead>
            <tr>
              <th>Name</th>
              <th>Country</th>
              <th>Team</th>
              <th>Age</th>
            </tr>
          </thead>

          <tbody>
            <tr className="border-base-content/10 border-l">
              <td className="truncate">{player.name}</td>
              <td>
                <span className={cx('fp', 'mr-2', player.country.code.toLowerCase())} />
                {player.country.name}
              </td>
              <td className="truncate">
                {player.team ? (
                  <>
                    <img src={player.team.blazon} className="inline-block size-6" />
                    <span className="inline-flex items-baseline gap-1">
                      {player.team.name}
                      {!player.starter && (
                        <span className="text-[8px] text-red-400 uppercase">(BENCHED)</span>
                      )}
                    </span>
                  </>
                ) : (
                  'Free Agent'
                )}
              </td>
              <td>{player.age ? `${player.age} years` : 'N/A'}</td>
            </tr>
          </tbody>

          <thead>
            <tr>
              <th colSpan={2} className="py-2">
                Stats
              </th>
              <th colSpan={2} className="py-2 text-right">
                <span className="inline-flex flex-nowrap justify-end gap-2 whitespace-nowrap">
                  {majorWinCount > 0 && (
                    <span className="badge border-yellow-300 bg-yellow-500/20 px-3 py-2 font-semibold text-yellow-200">
                      {majorWinCount}x Major winner
                    </span>
                  )}
                  {majorMvpCount > 0 && (
                    <span className="badge border-slate-300 bg-slate-500/30 px-3 py-2 font-semibold text-slate-100">
                      {majorMvpCount}x Major MVP
                    </span>
                  )}
                </span>
              </th>
            </tr>
          </thead>

          <tbody>
            <tr>
              <td colSpan={4} className="px-4 py-2">
                <div className="flex items-end gap-4">
                  <div className="flex-1">
                    {state.profile?.simulateNpcMatchStats ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-base-200/40 stack-y gap-2 p-3">
                          <p className="text-xs">Rating</p>
                          <p
                            className={cx(
                              'text-3xl font-black tabular-nums',
                              playerRating
                                ? getRatingColorClass(playerRating.rating)
                                : 'text-muted',
                            )}
                          >
                            {playerRating ? playerRating.rating.toFixed(2) : '-'}
                          </p>
                        </div>
                        <div className="bg-base-200/40 stack-y gap-2 p-3">
                          <p className="text-xs">Maps Played</p>
                          <p className="text-3xl font-black tabular-nums">
                            {playerRating ? playerRating.maps : 0}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <XPBar
                        className="w-full"
                        title="Total XP"
                        value={Bot.Exp.getTotalXP(player.xp)}
                        max={100}
                      />
                    )}
                  </div>
                  <span className="h-5 w-px bg-white/20" />
                  <div className="relative mb-0.5 flex items-center gap-2">
                    {state.profile?.simulateNpcMatchStats && (
                      <div className="absolute bottom-9 left-1/2 flex -translate-x-1/2 items-center justify-center gap-2">
                        <button
                          type="button"
                          className="btn btn-square border-base-content/20 bg-base-200/80 hover:bg-primary hover:text-primary-content size-8 min-h-0"
                          title="View detailed player statistics"
                          aria-label="View detailed player statistics"
                          data-interaction-sound="click"
                          onClick={openPlayerStatistics}
                        >
                          <FaChartBar className="size-4" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-square border-base-content/20 bg-base-200/80 hover:bg-primary hover:text-primary-content size-8 min-h-0"
                          title="View related news"
                          aria-label="View related news"
                          data-interaction-sound="click"
                          onClick={openNewsPlaceholder}
                        >
                          <FaNewspaper className="size-4" />
                        </button>
                      </div>
                    )}
                    <img src={faceitLogo} className="h-5 w-5 object-contain" />
                    <img
                      src={FACEIT_LEVEL_IMAGES[faceitLevel ?? 1] || FACEIT_LEVEL_IMAGES[1]}
                      className="h-5 w-5 object-contain"
                    />
                    <span className="text-sm font-semibold tabular-nums">
                      {typeof faceitElo === 'number' ? faceitElo : 'N/A'}
                    </span>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="border-base-content/10 flex min-h-12 items-center gap-4 border-t px-4 py-2">
        {mvps.length === 0 && Object.keys(honorGroups).length === 0 && (
          <span className="text-sm opacity-60">No honors yet.</span>
        )}
        {mvps.length > 0 && (
          <div
            className="flex items-center gap-2"
            aria-label={mvpTooltip}
            onMouseEnter={showMvpTooltip}
            onMouseLeave={() => setMvpTooltipPosition(null)}
          >
            <Image className="h-9 w-9 object-contain" src={MVP_MEDAL_SRC} />
            {mvps.length > 1 && <span className="text-base font-bold">x{mvps.length}</span>}
          </div>
        )}
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
        {Object.values(honorGroups).map((honor) => {
          const seasonsList = [...honor.seasons]
            .sort((a, b) => a - b)
            .map((season) => `Season ${season}`)
            .join(', ');
          const isMajor = Util.isMajorStageTier(honor.tierSlug);

          return (
            <div key={honor.key} className="tooltip flex items-center gap-2" data-tip={seasonsList}>
              <span className="relative inline-flex">
                <Image
                  className="h-12 w-12 object-contain"
                  src={Util.getCompetitionLogo(honor.tierSlug, honor.federationSlug, {
                    location: honor.location,
                    organizer: honor.organizer,
                  })}
                />
                {isMajor && <MajorHonorBadge />}
              </span>
              {honor.count > 1 && <span className="text-base font-bold">x{honor.count}</span>}
            </div>
          );
        })}
      </section>

      <section className="flex-1 overflow-y-auto">
        <table className="table-pin-rows table table-fixed">
          <thead>
            <tr>
              <th className="w-3/12">Time period</th>
              <th className="w-4/12">Team</th>
              {state.profile?.simulateNpcMatchStats && (
                <th className="w-2/12 text-right">Rating</th>
              )}
              <th className="w-3/12">Honors</th>
            </tr>
          </thead>

          <tbody>
            {teamHistory.length === 0 && (
              <tr>
                <td
                  colSpan={state.profile?.simulateNpcMatchStats ? 4 : 3}
                  className="py-8 text-center opacity-60"
                >
                  No team history available.
                </td>
              </tr>
            )}

            {teamHistory.map((stint) => {
              const stintHonors = honors.filter(
                (honor) =>
                  honor.teamId === stint.teamId &&
                  isWithinStint(honor.date, stint.startedAt, stint.endedAt),
              );
              const stintRating =
                state.profile?.simulateNpcMatchStats && stint.teamId
                  ? getRatingSummary(
                      ratingGames,
                      (game) =>
                        isWithinStint(new Date(game.date), stint.startedAt, stint.endedAt) &&
                        game.teamIds.includes(stint.teamId),
                    )
                  : null;

              return (
                <tr key={stint.id}>
                  <td className="truncate">
                    {formatStintDate(stint.startedAt)} -{' '}
                    {stint.endedAt ? formatStintDate(stint.endedAt) : 'Present'}
                  </td>
                  <td>
                    {stint.team ? (
                      <div className="flex items-center gap-2">
                        <img src={stint.team.blazon} className="inline-block size-6" />
                        <span className="inline-flex items-baseline gap-1">
                          {stint.team.name}
                          {!stint.starter && (
                            <span className="text-[8px] text-red-400 uppercase">(BENCHED)</span>
                          )}
                        </span>
                      </div>
                    ) : (
                      <span className="opacity-70">Free Agent</span>
                    )}
                  </td>

                  {state.profile?.simulateNpcMatchStats && (
                    <td
                      className={cx(
                        'text-right font-semibold tabular-nums',
                        stintRating ? getRatingColorClass(stintRating.rating) : 'text-muted',
                      )}
                    >
                      {stintRating ? stintRating.rating.toFixed(2) : '—'}
                    </td>
                  )}

                  <td>
                    {stintHonors.length === 0 ? (
                      <span className="opacity-60">—</span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1">
                        {stintHonors.map((honor, idx) => (
                          <div
                            key={`${stint.id}-${honor.key}-${honor.season}-${idx}`}
                            className="tooltip"
                            data-tip={`Season ${honor.season}`}
                          >
                            <span className="relative inline-flex">
                              <Image
                                className="h-9 w-9 object-contain"
                                src={Util.getCompetitionLogo(honor.tierSlug, honor.federationSlug, {
                                  location: honor.location,
                                  organizer: honor.organizer,
                                })}
                              />
                              {Util.isMajorStageTier(honor.tierSlug) && <MajorHonorBadge />}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}
