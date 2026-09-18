/**
 * Dedicated modal for player team history.
 *
 * Transfer offer tabs have been replaced with a compact team history view.
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import {
  FaArrowLeft,
  FaArrowRight,
  FaChartBar,
  FaChartLine,
  FaNewspaper,
  FaStar,
  FaTrophy,
  FaUsers,
  FaMap,
} from 'react-icons/fa';
import { levelFromElo } from '@liga/backend/lib/levels';
import { Bot, Constants, Eagers, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { Image } from '@liga/frontend/components';
import { XPBar } from '@liga/frontend/components/player-card';
import { useFormatAppDate } from '@liga/frontend/hooks/use-FormatAppDate';
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
import faceitUnranked from '../../assets/faceit/unranked.png';

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
  competitionId: number;
  teamId: number;
  season: number;
  date: Date;
  title: string;
  tierSlug: string;
  federationSlug: string;
  location: string | null;
  organizer: string | null;
};

type MvpOccurrence = {
  id: number;
  competitionId: number;
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
  competitionIds: number[];
  seasons: number[];
  titles: string[];
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

type ActiveTooltip = TooltipPosition & {
  content: string;
};

type Top20Appearance = {
  articleId: number;
  rank: number;
  year: number;
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

  const displayName = Util.getCompetitionDisplayName(
    competition.tier.league.name,
    competition.tier.slug,
  ).replace(/\s+Playoffs$/i, '');
  const federationSlug = competition.federation.slug;
  const region =
    federationSlug === Constants.FederationSlug.ESPORTS_OCE
      ? 'Oceania'
      : federationSlug === Constants.FederationSlug.ESPORTS_ASIA
        ? 'Asia'
        : federationSlug === Constants.FederationSlug.ESPORTS_AMERICAS
          ? 'Americas'
          : federationSlug === Constants.FederationSlug.ESPORTS_EUROPA
            ? 'Europe'
            : city;

  return [displayName, region, year].filter(Boolean).join(' ');
}

function parseNewsPayload(payload?: string | null) {
  if (!payload) {
    return {};
  }

  try {
    return JSON.parse(payload) as Record<string, unknown>;
  } catch (_) {
    return {};
  }
}

function getTop20Year(
  item: Awaited<ReturnType<typeof api.news.all>>[number],
  payload: Record<string, unknown>,
) {
  if (Number.isFinite(Number(payload.year))) {
    return Number(payload.year);
  }

  const headlineYear = item.headline.match(/\b(20\d{2})\b/)?.[1];
  if (headlineYear) {
    return Number(headlineYear);
  }

  return new Date(item.publishedAt).getFullYear();
}

export default function TransferModal() {
  const location = useLocation();
  const { state } = React.useContext(AppStateContext);
  const formatAppDate = useFormatAppDate();
  const [player, setPlayer] = React.useState<Player>();
  const [honors, setHonors] = React.useState<HonorOccurrence[]>([]);
  const [mvps, setMvps] = React.useState<MvpOccurrence[]>([]);
  const [activeTooltip, setActiveTooltip] = React.useState<ActiveTooltip | null>(null);
  const [ratingGames, setRatingGames] = React.useState<RatingGame[]>([]);
  const [top20Appearances, setTop20Appearances] = React.useState<Top20Appearance[]>([]);
  const top20Ref = React.useRef<HTMLDivElement>(null);
  const [top20Page, setTop20Page] = React.useState(0);
  const [top20PageSize, setTop20PageSize] = React.useState(1);
  React.useEffect(() => {
    const node = top20Ref.current;
    if (!node) return;
    const update = () => setTop20PageSize(Math.max(1, Math.floor(node.clientWidth / 64)));
    const observer = new ResizeObserver(update);
    observer.observe(node);
    update();
    return () => observer.disconnect();
  }, [top20Appearances]);
  React.useEffect(() => {
    setTop20Page((page) =>
      Math.min(page, Math.max(0, Math.ceil(top20Appearances.length / top20PageSize) - 1)),
    );
  }, [top20Appearances, top20PageSize]);

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
            competitionId: award.competitionId,
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
            orderBy: { date: 'desc' };
            take: 1;
            select: {
              date: true;
              competitors: {
                select: { score: true; teamId: true };
              };
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
            orderBy: { date: 'desc' },
            take: 1,
            select: {
              date: true,
              competitors: {
                select: { score: true, teamId: true },
              },
            },
          },
        },
        orderBy: { season: 'desc' },
      })
      .then((competitions) => {
        const stints = player.careerStints ?? [];

        const occurrences = competitions.reduce<HonorOccurrence[]>((acc, competition) => {
          const championshipMatch = competition.matches[0];

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
            competitionId: competition.id,
            teamId: winnerTeamId,
            season: competition.season,
            date: championshipDate,
            title: getCompetitionTitle(competition),
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

  React.useEffect(() => {
    setTop20Appearances([]);

    if (!player) {
      return;
    }

    api.news
      .all({
        orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
        where: {
          topic: 'RANKINGS',
          type: 'ARTICLE',
        },
      })
      .then((items) => {
        const appearances = items
          .map((item): Top20Appearance | null => {
            const payload = parseNewsPayload(item.payload);
            const ranking = Array.isArray(payload.ranking) ? payload.ranking : [];
            const entry = ranking.find(
              (row) =>
                row &&
                typeof row === 'object' &&
                Number((row as Record<string, unknown>).playerId) === player.id,
            ) as Record<string, unknown> | undefined;
            const rank = Number(entry?.rank);

            if (!entry || !Number.isFinite(rank)) {
              return null;
            }

            return {
              articleId: item.id,
              rank,
              year: getTop20Year(item, payload),
            };
          })
          .filter((item): item is Top20Appearance => Boolean(item));

        setTop20Appearances(appearances);
      });
  }, [player]);

  const honorGroups = React.useMemo(() => {
    return honors.reduce<Record<string, HonorGroup>>((acc, honor) => {
      if (!acc[honor.key]) {
        acc[honor.key] = {
          key: honor.key,
          count: 0,
          competitionIds: [],
          seasons: [],
          titles: [],
          tierSlug: honor.tierSlug,
          federationSlug: honor.federationSlug,
          location: honor.location,
          organizer: honor.organizer,
        };
      }

      acc[honor.key].count += 1;
      acc[honor.key].competitionIds.push(honor.competitionId);
      acc[honor.key].seasons.push(honor.season);
      if (!acc[honor.key].titles.includes(honor.title)) {
        acc[honor.key].titles.push(honor.title);
      }
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
  const showTooltip = React.useCallback((event: React.MouseEvent<HTMLElement>, content: string) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const tooltipWidth = 280;
    const tooltipHeight = Math.min(320, 32 + content.split('\n').length * 20);
    const top =
      rect.bottom + 8 + tooltipHeight <= window.innerHeight
        ? rect.bottom + 8
        : Math.max(12, rect.top - tooltipHeight - 8);

    setActiveTooltip({
      content,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - tooltipWidth - 12)),
      top,
    });
  }, []);
  const faceitElo = player?.profile?.faceitElo ?? player?.elo ?? null;
  const faceitLevel =
    typeof faceitElo === 'number' && faceitElo > 0 ? levelFromElo(faceitElo) : null;
  const playerRating = player ? getRatingSummary(ratingGames) : null;
  const hasTop20Appearances = top20Appearances.length > 0;
  const hasHonors = mvps.length > 0 || Object.keys(honorGroups).length > 0;
  const hasRankingOrMajor = hasTop20Appearances || majorWinCount > 0 || majorMvpCount > 0;
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
    api.window.close(Constants.WindowIdentifier.Modal, true);
  }, [player]);
  const openNewsPlaceholder = React.useCallback(() => {
    api.window.send<ModalRequest>(
      Constants.WindowIdentifier.Main,
      {
        target: '/news',
      },
      0,
    );
    api.window.close(Constants.WindowIdentifier.Modal, true);
  }, []);
  const openTop20Article = React.useCallback((articleId: number) => {
    api.window.send<ModalRequest<{ articleId: number }>>(
      Constants.WindowIdentifier.Main,
      {
        target: '/news',
        payload: { articleId },
      },
      0,
    );
    api.window.close(Constants.WindowIdentifier.Modal, true);
  }, []);
  const openMainPage = React.useCallback((target: string) => {
    api.window.send<ModalRequest>(Constants.WindowIdentifier.Main, { target }, 0);
    api.window.close(Constants.WindowIdentifier.Modal, true);
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
    <main className="player-profile text-base-content h-screen w-screen overflow-hidden">
      <div className="player-profile-shell flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="player-profile-top grid shrink-0 grid-cols-[220px_minmax(0,1fr)]">
            <figure
              className={cx(
                'player-profile-portrait relative m-0 flex items-end overflow-hidden',
                hasRankingOrMajor ? 'min-h-[270px]' : 'min-h-[235px]',
              )}
            >
              {player.team?.blazon && (
                <img
                  src={player.team.blazon}
                  className="pointer-events-none absolute top-1/2 left-1/2 size-64 -translate-x-1/2 -translate-y-1/2 object-contain opacity-20"
                  alt=""
                  aria-hidden="true"
                />
              )}
              <Image
                src={player.avatar || 'resources://avatars/empty.png'}
                className={cx(
                  'relative z-10 mx-auto w-auto max-w-none translate-y-6 object-contain',
                  hasRankingOrMajor ? 'h-[275px]' : 'h-[240px]',
                )}
              />
            </figure>
            <div className="flex min-w-0 flex-col p-4">
              <div className="border-base-content/10 flex items-center justify-between gap-3 border-b pr-12 pb-2">
                <div className="flex min-w-0 items-center gap-3">
                  <h1 className="truncate text-3xl font-black tracking-tight">{player.name}</h1>
                  <button
                    type="button"
                    className="player-profile-action shrink-0"
                    data-interaction-sound="click"
                    onClick={openPlayerStatistics}
                  >
                    <FaChartBar /> Statistics
                  </button>
                  <button
                    type="button"
                    className="player-profile-action shrink-0"
                    data-interaction-sound="click"
                    onClick={openNewsPlaceholder}
                  >
                    <FaNewspaper /> News
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 py-3">
                <div>
                  <p className="player-profile-label">Country</p>
                  <div className="flex items-center gap-2">
                    <span className={cx('fp', player.country.code.toLowerCase())} />
                    {player.country.name}
                  </div>
                </div>
                <div className="border-base-content/10 border-l pl-4">
                  <p className="player-profile-label">Team</p>
                  <div className="flex items-center gap-2 truncate">
                    {player.retiredAt ? (
                      <span>
                        Retired{' '}
                        <span
                          className="text-base-content/50 inline-flex cursor-help"
                          aria-label={`Retired on ${formatAppDate(player.retiredAt)}`}
                          onMouseEnter={(event) =>
                            showTooltip(event, `Retired on ${formatAppDate(player.retiredAt)}`)
                          }
                          onMouseLeave={() => setActiveTooltip(null)}
                        >
                          (?)
                        </span>
                      </span>
                    ) : player.team ? (
                      <button
                        type="button"
                        className="hover:text-primary flex min-w-0 items-center gap-2 text-left"
                        title={`Open ${player.team.name} team page`}
                        data-interaction-sound="click"
                        onClick={() => openMainPage(`/teams?teamId=${player.team!.id}`)}
                      >
                        <img src={player.team.blazon} className="size-6 object-contain" alt="" />{' '}
                        <span className="truncate">
                          {player.team.name}
                          {!player.starter && (
                            <small className="ml-1 text-red-400">(BENCHED)</small>
                          )}
                        </span>
                      </button>
                    ) : (
                      'Free Agent'
                    )}
                  </div>
                </div>
                <div className="border-base-content/10 border-l pl-4">
                  <p className="player-profile-label">Age</p>
                  <div>{player.age ? `${player.age} years` : 'N/A'}</div>
                </div>
              </div>
              {hasRankingOrMajor && (
                <div className="player-profile-panel mb-2 flex min-w-0 items-center gap-3 p-2">
                  {hasTop20Appearances && (
                    <>
                      <span className="text-base-content/60 shrink-0 text-xs font-bold uppercase">
                        Top 20
                      </span>
                      <button
                        type="button"
                        className={cx('player-profile-arrow', top20Page === 0 && 'invisible')}
                        aria-label="Previous Top 20 entries"
                        disabled={top20Page === 0}
                        onClick={() => setTop20Page((page) => page - 1)}
                      >
                        <FaArrowLeft />
                      </button>
                      <div
                        ref={top20Ref}
                        className="player-profile-rankings flex min-w-0 flex-1 overflow-hidden whitespace-nowrap"
                      >
                        {top20Appearances
                          .slice(top20Page * top20PageSize, (top20Page + 1) * top20PageSize)
                          .map((appearance) => (
                            <button
                              key={`${appearance.articleId}-${appearance.rank}-${appearance.year}`}
                              type="button"
                              className="text-base-content/70 hover:text-primary w-[64px] shrink-0 text-center text-xs font-bold"
                              title={`Open Top 20 players of ${appearance.year}`}
                              data-interaction-sound="click"
                              onClick={() => openTop20Article(appearance.articleId)}
                            >
                              #{appearance.rank} ('{String(appearance.year).slice(-2)})
                            </button>
                          ))}
                      </div>
                      <button
                        type="button"
                        className={cx(
                          'player-profile-arrow',
                          (top20Page + 1) * top20PageSize >= top20Appearances.length && 'invisible',
                        )}
                        aria-label="Next Top 20 entries"
                        disabled={(top20Page + 1) * top20PageSize >= top20Appearances.length}
                        onClick={() => setTop20Page((page) => page + 1)}
                      >
                        <FaArrowRight />
                      </button>
                    </>
                  )}
                  {(majorWinCount > 0 || majorMvpCount > 0) && (
                    <div
                      className={cx(
                        'ml-auto flex shrink-0 gap-2 text-xs',
                        hasTop20Appearances && 'border-base-content/10 border-l pl-3',
                      )}
                    >
                      {majorWinCount > 0 && (
                        <span className="player-profile-major-badge">
                          <FaTrophy /> {majorWinCount}x Major winner
                        </span>
                      )}
                      {majorMvpCount > 0 && (
                        <span className="player-profile-mvp-badge">
                          <FaStar /> {majorMvpCount}x Major MVP
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className="grid flex-1 grid-cols-3 gap-3">
                <div
                  className={cx(
                    'player-profile-stat',
                    !state.profile?.simulateNpcMatchStats && 'col-span-2',
                  )}
                >
                  <span className="player-profile-label">
                    <FaChartBar /> {state.profile?.simulateNpcMatchStats ? 'Rating' : 'Total XP'}
                  </span>
                  {state.profile?.simulateNpcMatchStats ? (
                    <strong
                      className={cx(
                        playerRating
                          ? getRatingColorClass(playerRating.rating)
                          : 'text-base-content/40',
                      )}
                    >
                      {playerRating ? playerRating.rating.toFixed(2) : '—'}
                    </strong>
                  ) : (
                    <XPBar className="w-full" value={Bot.Exp.getTotalXP(player.xp)} max={100} />
                  )}
                </div>
                {state.profile?.simulateNpcMatchStats && (
                  <div className="player-profile-stat">
                    <span className="player-profile-label">
                      <FaMap /> Maps Played
                    </span>
                    <strong>{playerRating?.maps ?? 0}</strong>
                  </div>
                )}
                <div className="player-profile-stat">
                  <span className="player-profile-label">
                    <FaChartLine /> FACEIT ELO
                  </span>
                  <strong className="flex items-center gap-2 text-2xl">
                    <img src={faceitLogo} className="size-5 object-contain" alt="" />
                    <img
                      src={faceitElo === 0 ? faceitUnranked : FACEIT_LEVEL_IMAGES[faceitLevel ?? 1]}
                      className="size-5 object-contain"
                      alt=""
                    />
                    {faceitElo === 0
                      ? 'Unranked'
                      : typeof faceitElo === 'number'
                        ? faceitElo.toLocaleString()
                        : 'N/A'}
                  </strong>
                </div>
              </div>
            </div>
          </div>
          {hasHonors && (
            <section className="player-profile-panel mx-3 mb-2 shrink-0 overflow-hidden">
              <div className="player-profile-section-heading">
                <h2>
                  <FaTrophy /> Career Trophies
                </h2>
                <span>{honors.length} trophies</span>
              </div>
              <div className="player-profile-honors flex min-h-[65px] items-center gap-4 overflow-x-auto px-4 py-1">
                {mvps.length > 0 && (
                  <button
                    type="button"
                    className="player-profile-honor"
                    aria-label={mvpTooltip}
                    title="Open latest MVP tournament"
                    data-interaction-sound="click"
                    onClick={() =>
                      openMainPage(
                        `/competitions?competitionId=${
                          mvps.reduce((latest, award) =>
                            award.date > latest.date ? award : latest,
                          ).competitionId
                        }`,
                      )
                    }
                    onMouseEnter={(event) => showTooltip(event, mvpTooltip)}
                    onMouseLeave={() => setActiveTooltip(null)}
                  >
                    <div className="flex items-center gap-2">
                      <Image className="size-11 object-contain" src={MVP_MEDAL_SRC} />
                      <b>x{mvps.length}</b>
                    </div>
                  </button>
                )}
                {Object.values(honorGroups).map((honor) => (
                  <button
                    type="button"
                    key={honor.key}
                    className="player-profile-honor"
                    title={`Open ${honor.titles[0]} tournament`}
                    data-interaction-sound="click"
                    onClick={() =>
                      openMainPage(`/competitions?competitionId=${honor.competitionIds[0]}`)
                    }
                    onMouseEnter={(event) =>
                      showTooltip(
                        event,
                        honor.titles.length === 1
                          ? honor.titles[0]
                          : ['Tournament wins at:', ...honor.titles].join('\n'),
                      )
                    }
                    onMouseLeave={() => setActiveTooltip(null)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="relative">
                        <Image
                          className="size-11 object-contain"
                          src={
                            Util.getCompetitionHonorThumbnail(honor) ||
                            Util.getCompetitionLogo(honor.tierSlug, honor.federationSlug, {
                              location: honor.location,
                              organizer: honor.organizer,
                            })
                          }
                        />
                        {Util.isMajorStageTier(honor.tierSlug) && <MajorHonorBadge />}
                      </span>
                      <b>x{honor.count}</b>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
          <section className="player-profile-panel mx-3 mb-3 flex min-h-[180px] flex-1 flex-col overflow-hidden">
            <div className="player-profile-section-heading">
              <h2>
                <FaUsers /> Team History
              </h2>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="player-profile-history w-full table-fixed text-left text-sm">
                <thead>
                  <tr>
                    <th className="w-[24%]">Time period</th>
                    <th className="w-[32%]">Team</th>
                    {state.profile?.simulateNpcMatchStats && <th className="w-[12%]">Rating</th>}
                    <th>Trophies</th>
                  </tr>
                </thead>
                <tbody>
                  {teamHistory.length === 0 && (
                    <tr>
                      <td
                        colSpan={state.profile?.simulateNpcMatchStats ? 4 : 3}
                        className="text-base-content/50 py-8 text-center"
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
                        <td>
                          {formatStintDate(stint.startedAt)} -{' '}
                          {stint.endedAt ? formatStintDate(stint.endedAt) : 'Present'}
                        </td>
                        <td>
                          {stint.team ? (
                            <button
                              type="button"
                              className="hover:text-primary flex items-center gap-2 text-left"
                              title={`Open ${stint.team.name} team page`}
                              data-interaction-sound="click"
                              onClick={() => openMainPage(`/teams?teamId=${stint.team!.id}`)}
                            >
                              <img
                                src={stint.team.blazon}
                                className="size-7 object-contain"
                                alt=""
                              />
                              <span className="truncate">
                                {stint.team.name}
                                {!stint.starter && (
                                  <small className="ml-1 text-red-400">(BENCHED)</small>
                                )}
                              </span>
                            </button>
                          ) : (
                            <span className="text-base-content/50">Free Agent</span>
                          )}
                        </td>
                        {state.profile?.simulateNpcMatchStats && (
                          <td
                            className={cx(
                              'font-semibold tabular-nums',
                              stintRating
                                ? getRatingColorClass(stintRating.rating)
                                : 'text-base-content/50',
                            )}
                          >
                            {stintRating ? stintRating.rating.toFixed(2) : '—'}
                          </td>
                        )}
                        <td>
                          {stintHonors.length ? (
                            <div className="flex h-12 max-w-full items-center gap-2 overflow-x-auto overflow-y-hidden">
                              {stintHonors.map((honor, idx) => (
                                <button
                                  type="button"
                                  key={`${stint.id}-${honor.key}-${idx}`}
                                  className="relative shrink-0 cursor-pointer"
                                  title={`Open ${honor.title} tournament`}
                                  data-interaction-sound="click"
                                  onClick={() =>
                                    openMainPage(
                                      `/competitions?competitionId=${honor.competitionId}`,
                                    )
                                  }
                                  onMouseEnter={(event) => showTooltip(event, honor.title)}
                                  onMouseLeave={() => setActiveTooltip(null)}
                                >
                                  <Image
                                    className="size-8 object-contain"
                                    src={
                                      Util.getCompetitionHonorThumbnail(honor) ||
                                      Util.getCompetitionLogo(
                                        honor.tierSlug,
                                        honor.federationSlug,
                                        { location: honor.location, organizer: honor.organizer },
                                      )
                                    }
                                  />
                                  {Util.isMajorStageTier(honor.tierSlug) && <MajorHonorBadge />}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="text-base-content/50">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
      {activeTooltip &&
        createPortal(
          <div
            className="bg-neutral text-neutral-content pointer-events-none fixed z-[9999] max-w-[280px] rounded px-3 py-2 text-left text-xs leading-relaxed whitespace-pre-line shadow-lg"
            style={activeTooltip}
          >
            {activeTooltip.content}
          </div>,
          document.body,
        )}
    </main>
  );
}
