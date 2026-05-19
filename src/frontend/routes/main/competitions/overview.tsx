/**
 * Competition overview route.
 *
 * @module
 */
import React from 'react';
import { format } from 'date-fns';
import { groupBy } from 'lodash';
import { Link, useOutletContext } from 'react-router-dom';
import { Constants, Eagers, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { AppStateContext } from '@liga/frontend/redux';
import { useTranslation } from '@liga/frontend/hooks';
import { Standings, Image } from '@liga/frontend/components';
import { FaChartBar } from 'react-icons/fa';

/** @constant */
const NUM_PREVIOUS = 5;

/** @constant */
const NUM_RECENT_LOOKBACK = NUM_PREVIOUS * 2;

/** @constant */
const NUM_PRIZE_POOL_VISIBLE = 4;

/** @constant */
const WINNER_HISTORY_TIER_SLUGS = new Set<Constants.TierSlug>([
  Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
  Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
  Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
  Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
  Constants.TierSlug.ESEA_CASH_CUP,
  Constants.TierSlug.CCT_SERIES_PLAYOFFS,
  Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
  Constants.TierSlug.BLAST_FINALS,
  Constants.TierSlug.IEM_COLOGNE_PLAYOFFS,
  Constants.TierSlug.IEM_KRAKOW_PLAYOFFS,
  Constants.TierSlug.LEAGUE_PRO_PLAYOFFS,
  Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS,
  Constants.TierSlug.CCT_GLOBAL_FINALS,
]);

/**
 * @param match The match database record.
 * @function
 */
function hasOpponent(
  match: Awaited<ReturnType<typeof api.matches.all<typeof Eagers.match>>>[number],
) {
  return match.competitors.filter((competitor) => competitor.teamId != null).length > 1;
}

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const t = useTranslation('windows');
  const { state } = React.useContext(AppStateContext);
  const { competition } = useOutletContext<RouteContextCompetitions>();
  const [competitionDates, setCompetitionDates] = React.useState<
    Array<Awaited<ReturnType<typeof api.calendar.find>>>
  >([]);
  const [matches, setMatches] = React.useState<
    Awaited<ReturnType<typeof api.matches.all<typeof Eagers.match>>>
  >([]);
  const [winners, setWinners] = React.useState<
    Awaited<ReturnType<typeof api.competitions.winners>>
  >([]);
  const [showAllPrizePool, setShowAllPrizePool] = React.useState(false);
  const tierSlug = competition.tier.slug as Constants.TierSlug;
  const showWinnerHistory = WINNER_HISTORY_TIER_SLUGS.has(tierSlug);

  // fetch competition start and end
  // dates when the data comes in
  React.useEffect(() => {
    Promise.all([
      api.calendar.find({
        where: {
          type: Constants.CalendarEntry.COMPETITION_START,
          payload: String(competition.id),
        },
      }),
      api.calendar.find({
        where: {
          type: Constants.CalendarEntry.COMPETITION_END,
          payload: String(competition.id),
        },
      }),
    ]).then(setCompetitionDates);
  }, [competition]);

  // fetch recent match results
  React.useEffect(() => {
    if (!state.profile) {
      return;
    }

    api.matches
      .all({
        include: Eagers.match.include,
        take: NUM_RECENT_LOOKBACK,
        orderBy: {
          date: 'desc',
        },
        where: {
          status: Constants.MatchStatus.COMPLETED,
          competition: {
            id: competition.id,
          },
          date: {
            lte: state.profile.date.toISOString(),
          },
        },
      })
      .then((result) => setMatches(result.filter(hasOpponent).slice(0, NUM_PREVIOUS)));
  }, [competition, state.profile]);

  // fetch previous winners
  React.useEffect(() => {
    setWinners([]);

    if (!showWinnerHistory) {
      return;
    }

    let isCurrent = true;

    api.competitions.winners(competition.id).then((result) => {
      if (isCurrent) {
        setWinners(result);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [competition, showWinnerHistory]);

  // reset group selection when competition changes
  React.useEffect(() => {
    setShowAllPrizePool(false);
  }, [competition]);

  // group standings tables
  const groups = React.useMemo(
    () => groupBy(competition.competitors, 'group'),
    [competition.competitors],
  );
  const groupKeys = React.useMemo(() => Object.keys(groups), [groups]);
  const groupZones = React.useMemo(
    () =>
      competition.status === Constants.CompetitionStatus.STARTED &&
      competition.tier.groupSize &&
      Util.getTierZonesByGroup(
        tierSlug,
        competition.federation.slug as Constants.FederationSlug,
        groupKeys.length,
      ),
    [
      competition.status,
      competition.tier.groupSize,
      competition.federation.slug,
      groupKeys.length,
      tierSlug,
    ],
  );

  // filler for previous matches
  const previousFiller = React.useMemo(
    () => [...Array(Math.max(0, NUM_PREVIOUS - matches.length))],
    [matches.length],
  );

  // competition prize pool
  const prizePool = React.useMemo(() => Constants.PrizePool[tierSlug], [tierSlug]);
  const prizePoolRows = React.useMemo(
    () =>
      competition.competitors
        .filter(
          (competitor) =>
            Boolean(competitor.team) &&
            Boolean(prizePool?.distribution[(competitor.position || 1) - 1]),
        )
        .sort((a, b) => a.position - b.position)
        .map((competitor, idx) => ({
          competitor,
          placement: idx + 1,
          percentage: prizePool.distribution[idx],
        })),
    [competition.competitors, prizePool],
  );
  const visiblePrizePoolRows = showAllPrizePool
    ? prizePoolRows
    : prizePoolRows.slice(0, NUM_PRIZE_POOL_VISIBLE);
  const showPrizePool =
    competition.status === Constants.CompetitionStatus.COMPLETED &&
    Boolean(prizePool?.total) &&
    prizePoolRows.length > 0;
  const canExpandPrizePool = prizePoolRows.length > NUM_PRIZE_POOL_VISIBLE;
  const showWinners = showWinnerHistory && winners.length > 0;

  const isSwiss = Boolean(Constants.TierSwissConfig[tierSlug]);
  const isBracketStandings = !competition.tier.groupSize && !isSwiss;
  const hideSmallGroupPoints = Boolean(
    competition.tier.groupSize && competition.tier.groupSize <= 4,
  );

  return (
    <section className="divide-base-content/10 grid grid-cols-2 divide-x">
      <article>
        <header className="heading prose max-w-none border-t-0!">
          <h2>{t('shared.overview')}</h2>
        </header>
        <aside className="divide-base-content/10 flex divide-x">
          <figure className="center w-1/2 place-content-evenly!">
            <Image
              className="size-32"
              src={Util.getCompetitionLogo(competition.tier.slug, competition.federation.slug)}
            />
          </figure>
          <table className="table table-fixed">
            <thead>
              <tr>
                <th colSpan={2}>{t('shared.name')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={2}>
                  {`${Constants.IdiomaticTier[competition.tier.slug]} · ${competition.federation.name}`}
                </td>
              </tr>
            </tbody>
            <thead>
              <tr>
                <th>{t('main.competitions.startDate')}</th>
                <th>{t('main.competitions.endDate')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{competitionDates[0] ? format(competitionDates[0].date, 'PPP') : 'TBD'}</td>
                <td>{competitionDates[1] ? format(competitionDates[1].date, 'PPP') : '-'}</td>
              </tr>
            </tbody>
          </table>
        </aside>
        {(showWinners || showPrizePool) && (
          <table className="table table-fixed">
            {showWinners && (
              <>
                <thead>
                  <tr>
                    <th>{t('main.competitions.titleHolders')}</th>
                    <th>{t('shared.season')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <span className="inline-flex items-center gap-2">
                        <img
                          alt={`${winners[0].team.name} logo`}
                          src={winners[0].team.blazon}
                          className="size-4"
                        />
                        <Link to={`/teams?teamId=${winners[0].team.id}`} className="link-hover">
                          {winners[0].team.name}
                        </Link>
                      </span>
                    </td>
                    <td>
                      {t('shared.season')} {competition.season - 1}
                    </td>
                  </tr>
                </tbody>
              </>
            )}
            {showPrizePool && (
              <>
                <thead>
                  <tr>
                    <th>{t('main.competitions.prizePool')}</th>
                    <th>{t('shared.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePrizePoolRows.map(({ competitor, placement, percentage }) => {
                    return (
                      <tr key={competitor.id + '__prize_pool'}>
                        <td>
                          <span className="grid grid-cols-[3rem_1rem_minmax(0,1fr)] items-center gap-3">
                            <span>{Util.toOrdinalSuffix(placement)}</span>
                            {!!competitor.team.blazon && (
                              <img
                                alt={`${competitor.team.name} logo`}
                                src={competitor.team.blazon}
                                className="size-4"
                              />
                            )}
                            <Link
                              to={`/teams?teamId=${competitor.team.id}`}
                              className="link-hover truncate"
                              title={competitor.team.name}
                            >
                              {competitor.team.name}
                            </Link>
                          </span>
                        </td>
                        <td>{Util.formatCurrency(prizePool.total * (percentage / 100))}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {canExpandPrizePool && (
                  <tfoot>
                    <tr>
                      <td colSpan={2}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={() => setShowAllPrizePool((value) => !value)}
                        >
                          {showAllPrizePool
                            ? t('main.competitions.showLess')
                            : t('main.competitions.showAll')}
                        </button>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </>
            )}
          </table>
        )}
        <aside>
          <header
            className={cx(
              'heading prose max-w-none',
              !showWinners && !showPrizePool && 'border-t-0!',
            )}
          >
            <h2>{t('shared.recentMatchResults')}</h2>
          </header>
          <table className="table table-fixed">
            <thead>
              <tr>
                <th title="Match Details" className="w-1/12" />
                <th className="w-1/12 text-center">{t('shared.date')}</th>
                <th className="w-4/12 text-right">{t('shared.home')}</th>
                <th className="w-2/12 text-center">{t('shared.score')}</th>
                <th className="w-4/12">{t('shared.away')}</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((match) => {
                const [home, away] = match.competitors;
                const onClick =
                  match._count.events > 0
                    ? () =>
                        api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
                          target: '/postgame',
                          payload: match.id,
                        })
                    : null;
                return (
                  <tr
                    key={match.id + match.date.toDateString() + '__match'}
                    onClick={onClick}
                    className={cx(onClick && 'hover:bg-base-content/10 cursor-pointer')}
                  >
                    <td
                      className={cx(!onClick && 'text-muted')}
                      title={onClick ? t('shared.viewMatchDetails') : t('shared.noMatchDetails')}
                    >
                      <FaChartBar className="mx-auto" />
                    </td>
                    <td title={format(match.date, 'PPPP')} className="text-center">
                      {format(match.date, 'MM/dd')}
                    </td>
                    <td className="truncate text-right" title={home.team.name}>
                      <Link
                        to={`/teams?teamId=${home.team.id}`}
                        className="link-hover"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {home.team.name}
                      </Link>
                      <img src={home.team.blazon} className="ml-2 inline-block size-4" />
                    </td>
                    <td className="text-center">
                      {!away && '-'}
                      {!!away && (
                        <article className="stack-x justify-center">
                          <span className={Util.getResultTextColor(home.result)}>{home.score}</span>
                          <span>-</span>
                          <span className={Util.getResultTextColor(away.result)}>{away.score}</span>
                        </article>
                      )}
                    </td>
                    <td className="truncate" title={away?.team.name || 'BYE'}>
                      {!away && 'BYE'}
                      {!!away && (
                        <>
                          <img src={away.team.blazon} className="mr-2 inline-block size-4" />
                          <Link
                            to={`/teams?teamId=${away.team.id}`}
                            className="link-hover"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {away.team.name}
                          </Link>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {previousFiller.map((_, idx) => (
                <tr key={`${idx}__filler_match_previous`} className="text-muted">
                  <td className="w-1/12" />
                  <td className="w-1/12 text-center">-</td>
                  <td colSpan={3} className="w-10/12 text-center">
                    {t('shared.noRecentMatch')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </aside>
        {showWinners && (
          <aside>
            <header className="heading prose max-w-none">
              <h2>{t('main.competitions.pastWinners')}</h2>
            </header>
            <table className="table table-fixed">
              <thead>
                <tr>
                  <th>{t('shared.name')}</th>
                  <th>{t('shared.season')}</th>
                </tr>
              </thead>
              <tbody>
                {winners.map((winner, idx) => (
                  <tr key={winner.id + '__winner'}>
                    <td>
                      <span className="inline-flex items-center gap-2">
                        <img
                          alt={`${winner.team.name} logo`}
                          src={winner.team.blazon}
                          className="size-4"
                        />
                        <Link to={`/teams?teamId=${winner.team.id}`} className="link-hover">
                          {winner.team.name}
                        </Link>
                      </span>
                    </td>
                    <td>
                      {t('shared.season')} {competition.season - (idx + 1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </aside>
        )}
      </article>
      <article>
        <header className="heading prose max-w-none border-t-0!">
          <h2>{t('shared.standings')}</h2>
        </header>
        {!!competition.tier.groupSize &&
          groupKeys.map((groupKey) => (
            <Standings
              key={groupKey + '__overview_standings'}
              highlight={state.profile.teamId}
              hidePoints={hideSmallGroupPoints}
              competitors={groups[groupKey]}
              teamLink={(team) => `/teams?teamId=${team.id}`}
              title={
                competition.tier.league.slug === Constants.LeagueSlug.ESPORTS_LEAGUE
                  ? Constants.IdiomaticTier[tierSlug]
                  : `${t('shared.group')} ${Util.toAlpha(groupKey)}`
              }
              zones={groupZones}
            />
          ))}
        {!competition.tier.groupSize && (
          <Standings
            highlight={state.profile.teamId}
            competitors={competition.competitors}
            mode={isBracketStandings ? 'ranking' : isSwiss ? 'swiss' : undefined}
            teamLink={(team) => `/teams?teamId=${team.id}`}
          />
        )}
      </article>
    </section>
  );
}
