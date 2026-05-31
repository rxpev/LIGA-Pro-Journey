/**
 * Calendar route.
 *
 * @module
 */
import React from 'react';
import { Link } from 'react-router-dom';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getDay,
  isSameDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { Constants, Eagers, Util } from '@liga/shared';
import { AppStateContext } from '@liga/frontend/redux';
import { cx } from '@liga/frontend/lib';
import { useTranslation } from '@liga/frontend/hooks';
import { Image } from '@liga/frontend/components';
import { getTeamsRoundLabel } from './teams/labels';
import { FaArrowCircleLeft, FaArrowCircleRight, FaCalendarDay } from 'react-icons/fa';

/** @type {MatchesResponse} */
type MatchesResponse = Awaited<ReturnType<typeof api.matches.all<typeof Eagers.match>>>;
type CalendarMode = 'mine' | 'global';
type CalendarMatch = MatchesResponse[number];

/** @constant */
const DAYS_PER_WEEK = 7;

/** @constant */
const WEEKS_PER_MONTH = 6;

const TOURNAMENT_COLORS: Partial<Record<Constants.LeagueSlug | string, string>> = {
  [Constants.LeagueSlug.ESPORTS_LEAGUE]: '#8fc37d',
  [Constants.LeagueSlug.ESPORTS_MAJOR]: '#dd1f24',
  [Constants.LeagueSlug.ESPORTS_CCT]: '#f6cf5b',
  [Constants.LeagueSlug.ESPORTS_CCT_GLOBAL]: '#f1c232',
  [Constants.LeagueSlug.ESPORTS_BLAST]: '#a897cb',
  [Constants.LeagueSlug.ESPORTS_IEM_COLOGNE]: '#6797df',
  [Constants.LeagueSlug.ESPORTS_IEM_COLOGNE_QUALIFIER]: '#9db9e7',
  [Constants.LeagueSlug.ESPORTS_IEM_KRAKOW]: '#79aab2',
  [Constants.LeagueSlug.ESPORTS_IEM_KRAKOW_QUALIFIER]: '#a7cdd1',
  [Constants.LeagueSlug.ESPORTS_PRO_LEAGUE]: '#65a64b',
  [Constants.LeagueSlug.ESPORTS_ESL_CHALLENGER]: '#bd78a5',
  [Constants.LeagueSlug.ESPORTS_ESEA_CASH_CUP]: '#b5d5a8',
};

const CALENDAR_TIER_PRIORITY: Partial<Record<Constants.TierSlug | string, number>> = {
  [Constants.TierSlug.MAJOR_CHAMPIONS_STAGE]: 10,
  [Constants.TierSlug.MAJOR_LEGENDS_STAGE]: 20,
  [Constants.TierSlug.MAJOR_CHALLENGERS_STAGE]: 30,
  [Constants.TierSlug.IEM_COLOGNE_PLAYOFFS]: 40,
  [Constants.TierSlug.IEM_KRAKOW_PLAYOFFS]: 40,
  [Constants.TierSlug.BLAST_FINALS]: 50,
  [Constants.TierSlug.LEAGUE_PRO_PLAYOFFS]: 60,
  [Constants.TierSlug.LEAGUE_PRO]: 70,
  [Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS]: 80,
  [Constants.TierSlug.LEAGUE_ADVANCED]: 90,
  [Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS]: 100,
  [Constants.TierSlug.LEAGUE_MAIN]: 110,
  [Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS]: 120,
  [Constants.TierSlug.LEAGUE_INTERMEDIATE]: 130,
  [Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS]: 140,
  [Constants.TierSlug.LEAGUE_OPEN]: 150,
};

function getTournamentColor(match: CalendarMatch) {
  const leagueSlug = match.competition?.tier?.league?.slug;

  if (leagueSlug && TOURNAMENT_COLORS[leagueSlug]) {
    return TOURNAMENT_COLORS[leagueSlug];
  }

  return '#8aa0b5';
}

function getCompetitionLabel(match: CalendarMatch) {
  return Util.getCompetitionDisplayName(
    match.competition?.tier?.league?.name,
    match.competition?.tier?.slug,
  );
}

function getCalendarCompetitionLabel(match: CalendarMatch) {
  return getCompetitionLabel(match).replace(/\s+Division$/i, '');
}

function getCalendarTierPriority(match: CalendarMatch) {
  return CALENDAR_TIER_PRIORITY[match.competition?.tier?.slug] ?? 999;
}

function getStageLabel(match: CalendarMatch, matchdayLabel: string) {
  if (!match.competition?.tier) {
    return 'Match';
  }

  if (match.competition.tier.groupSize) {
    return `${matchdayLabel} ${match.round}`;
  }

  return getTeamsRoundLabel(match);
}

function getOpponent(match: CalendarMatch, teamId?: number | null) {
  if (!teamId) {
    return match.competitors[0];
  }

  return match.competitors.find((competitor) => competitor.teamId !== teamId);
}

function getMatchScore(match: CalendarMatch) {
  return match.competitors.map((competitor) => competitor.score).join('-');
}

function getCompetitorScore(
  match: CalendarMatch,
  competitor: CalendarMatch['competitors'][number],
) {
  if (match.status !== Constants.MatchStatus.COMPLETED) {
    return '-';
  }

  return competitor.score ?? 0;
}

function isPlayableFixture(match: CalendarMatch) {
  return (
    match.competitors.length >= 2 && match.competitors.every((competitor) => !!competitor.team)
  );
}

function sortMatches(a: CalendarMatch, b: CalendarMatch) {
  const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();

  if (dateDiff !== 0) {
    return dateDiff;
  }

  return getCompetitionLabel(a).localeCompare(getCompetitionLabel(b));
}

function getTournamentMarkers(matches: CalendarMatch[]) {
  return Object.values(
    matches.reduce<
      Record<
        string,
        {
          color: string;
          count: number;
          label: string;
          priority: number;
        }
      >
    >((acc, match) => {
      const label = getCalendarCompetitionLabel(match);
      const color = getTournamentColor(match);
      const key = `${label}__${color}`;
      const priority = getCalendarTierPriority(match);

      acc[key] ||= {
        color,
        count: 0,
        label,
        priority,
      };
      acc[key].count += 1;
      acc[key].priority = Math.min(acc[key].priority, priority);

      return acc;
    }, {}),
  ).sort((a, b) => a.priority - b.priority || b.count - a.count || a.label.localeCompare(b.label));
}

function getTournamentGroups(matches: CalendarMatch[]) {
  return Object.values(
    matches.filter(isPlayableFixture).reduce<
      Record<
        string,
        {
          color: string;
          key: string;
          label: string;
          logo: string;
          matches: CalendarMatch[];
          stage: string;
        }
      >
    >((acc, match) => {
      const label = getCompetitionLabel(match);
      const key = `${match.competitionId}__${label}`;

      acc[key] ||= {
        color: getTournamentColor(match),
        key,
        label,
        logo: Util.getCompetitionLogo(
          match.competition.tier.slug,
          match.competition.federation.slug,
          {
            location: match.competition.location,
            organizer: match.competition.organizer,
          },
        ),
        matches: [],
        stage: getStageLabel(match, 'Matchday'),
      };
      acc[key].matches.push(match);

      return acc;
    }, {}),
  ).sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  // grab today's date
  const t = useTranslation('windows');
  const { state } = React.useContext(AppStateContext);
  const [current, setCurrent] = React.useState(state.profile?.date || new Date());
  const defaultMode = React.useMemo<CalendarMode>(
    () => (state.profile?.teamId ? 'mine' : 'global'),
    [state.profile?.teamId],
  );
  const [mode, setMode] = React.useState<CalendarMode>(defaultMode);
  const [selectedDate, setSelectedDate] = React.useState(state.profile?.date || new Date());
  const [spotlight, setSpotlight] = React.useState<CalendarMatch>();
  const today = React.useMemo(() => state.profile?.date || new Date(), [state.profile]);

  React.useEffect(() => {
    setMode(defaultMode);
  }, [defaultMode]);

  // start and end of the month
  const start = React.useMemo(() => startOfMonth(current), [current]);
  const end = React.useMemo(() => endOfMonth(current), [current]);

  // actual days of the current month
  const days = React.useMemo(() => eachDayOfInterval({ start, end }), [start, end]);

  // grab the days of the week to render at the
  // top of the calendar ("sun", "mon", etc)
  const weekdays = React.useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(new Date()),
        end: endOfWeek(new Date()),
      }),
    [],
  );

  // padding for beginning and end of the month
  const paddingStart = React.useMemo(() => Array(getDay(start)).fill(null), [start]);
  const paddingEnd = React.useMemo(
    () => Array(42 - (paddingStart.length + days.length)).fill(null),
    [paddingStart, days],
  );

  // build the calendar data object
  const calendar = React.useMemo(
    () =>
      Array.from({ length: WEEKS_PER_MONTH }).map((_, weekIdx) =>
        [...paddingStart, ...days, ...paddingEnd].slice(
          weekIdx * DAYS_PER_WEEK,
          weekIdx * DAYS_PER_WEEK + DAYS_PER_WEEK,
        ),
      ),
    [paddingStart, days, paddingEnd],
  );

  // grab the match data for the current month
  const [matches, setMatches] = React.useState<MatchesResponse>([]);

  React.useEffect(() => {
    api.matches
      .all({
        ...Eagers.match,
        where: {
          date: {
            gte: start.toISOString(),
            lte: end.toISOString(),
          },
          competitionId: { not: null },
        },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
      })
      .then(setMatches);
  }, [start, end]);

  const visibleMatches = React.useMemo(
    () =>
      [...matches]
        .filter((match) => {
          if (mode === 'global') {
            return true;
          }

          return match.competitors.some(
            (competitor) => competitor.teamId === state.profile?.teamId,
          );
        })
        .sort(sortMatches),
    [matches, mode, state.profile?.teamId],
  );

  const selectedMatches = React.useMemo(
    () => visibleMatches.filter((match) => isSameDay(match.date, selectedDate)),
    [selectedDate, visibleMatches],
  );
  const selectedFixtures = React.useMemo(
    () => selectedMatches.filter(isPlayableFixture),
    [selectedMatches],
  );
  const selectedTournamentGroups = React.useMemo(
    () => getTournamentGroups(selectedFixtures),
    [selectedFixtures],
  );

  React.useEffect(() => {
    setSpotlight(undefined);
  }, [selectedDate, mode]);

  React.useEffect(() => {
    if (!start || !end) {
      return;
    }

    if (selectedDate >= start && selectedDate <= end) {
      return;
    }

    setSelectedDate(start);
  }, [start, end, selectedDate]);

  return (
    <div className="dashboard">
      <header>
        <button className={cx(mode === 'mine' && 'btn-active!')} onClick={() => setMode('mine')}>
          My Calendar
        </button>
        <button
          className={cx(mode === 'global' && 'btn-active!')}
          onClick={() => setMode('global')}
        >
          Global Calendar
        </button>
        <button
          disabled={start.toISOString() === startOfMonth(today).toISOString()}
          onClick={() => {
            setCurrent(today);
            setSelectedDate(today);
          }}
        >
          <FaCalendarDay />
          {'Today'}
        </button>
        <button onClick={() => setCurrent(subMonths(current, 1))}>
          <FaArrowCircleLeft />
          {'Previous'}
        </button>
        <button onClick={() => setCurrent(addMonths(current, 1))}>
          {'Next'}
          <FaArrowCircleRight />
        </button>
        <button className="ml-auto">{format(current, 'MMMM yyyy')}</button>
      </header>
      <main>
        <section>
          {(() => {
            if (!selectedFixtures.length) {
              return (
                <article>
                  <header className="prose border-t-0!">
                    <h2>{format(selectedDate, 'PPP')}</h2>
                  </header>
                  <footer className="center h-24">
                    <p>No matches on this date.</p>
                  </footer>
                  <aside className="px-2 pb-2">
                    <h3 className="text-primary text-sm font-bold">Fixtures on this date</h3>
                    <p className="text-base-content/60 text-sm">
                      Pick another highlighted day to view fixtures.
                    </p>
                  </aside>
                </article>
              );
            }

            return (
              <article className="stack-y">
                <header className="prose border-t-0!">
                  <h2>{format(selectedDate, 'PPP')}</h2>
                </header>
                <footer className="stack-y px-2 pb-2">
                  <h3 className="text-primary text-sm font-bold">Fixtures on this date</h3>
                  {selectedTournamentGroups.map((group) => (
                    <section
                      key={group.key}
                      className="border-base-content/10 bg-base-200 overflow-hidden rounded border"
                    >
                      <header className="border-base-content/10 flex items-center gap-2 border-b p-2">
                        <Image className="size-9 shrink-0" src={group.logo} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">{group.label}</span>
                          <span className="text-base-content/60 block truncate text-xs">
                            {group.stage}
                          </span>
                        </span>
                        <span className="bg-error text-error-content center size-8 shrink-0 rounded-full text-xs font-black">
                          {group.matches.length}
                        </span>
                      </header>
                      <section className="stack-y gap-0! p-1">
                        {group.matches.map((match) => {
                          const [home, away] = match.competitors;
                          const isActive = spotlight?.id === match.id;
                          const isSwiss = Boolean(
                            Constants.TierSwissConfig[
                              match.competition.tier.slug as Constants.TierSlug
                            ],
                          );

                          return (
                            <article
                              key={match.id}
                              className={cx(
                                'border-base-content/10 rounded border p-2',
                                isActive ? 'border-primary bg-base-300' : 'bg-base-100',
                              )}
                            >
                              <button
                                className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 text-left"
                                onClick={() => setSpotlight(match)}
                              >
                                <span className="flex min-w-0 items-center gap-2">
                                  {!!home?.team?.blazon && (
                                    <Image className="size-6 shrink-0" src={home.team.blazon} />
                                  )}
                                  <span className="truncate text-sm">
                                    {home?.team?.name || 'TBD'}
                                  </span>
                                </span>
                                <span className="badge badge-sm font-black">
                                  {home ? getCompetitorScore(match, home) : '-'}-
                                  {away ? getCompetitorScore(match, away) : '-'}
                                </span>
                                <span className="flex min-w-0 items-center justify-end gap-2 text-right">
                                  <span className="truncate text-sm">
                                    {away?.team?.name || 'TBD'}
                                  </span>
                                  {!!away?.team?.blazon && (
                                    <Image className="size-6 shrink-0" src={away.team.blazon} />
                                  )}
                                </span>
                              </button>
                              {isActive && (
                                <aside className="join mt-2 w-full">
                                  {!match.competition.tier.groupSize &&
                                    (isSwiss ? (
                                      <Link
                                        className="btn join-item btn-sm flex-1 rounded-none"
                                        to={`/competitions/standings?federationId=${match.competition.federationId}&season=${match.competition.season}&tierId=${match.competition.tier.id}`}
                                      >
                                        View Standings
                                      </Link>
                                    ) : (
                                      <button
                                        className="btn join-item btn-sm flex-1 rounded-none"
                                        onClick={() => {
                                          api.window.send<ModalRequest>(
                                            Constants.WindowIdentifier.Modal,
                                            {
                                              target: '/brackets',
                                              payload: match.competitionId,
                                            },
                                          );
                                        }}
                                      >
                                        {t('main.dashboard.viewBracket')}
                                      </button>
                                    ))}
                                  <button
                                    className="btn join-item btn-sm flex-1 rounded-none"
                                    disabled={!match._count.events}
                                    title={
                                      match._count.events > 0
                                        ? t('shared.viewMatchDetails')
                                        : t('shared.noMatchDetails')
                                    }
                                    onClick={() =>
                                      match._count.events > 0 &&
                                      api.window.send<ModalRequest>(
                                        Constants.WindowIdentifier.Modal,
                                        {
                                          target: '/postgame',
                                          payload: match.id,
                                        },
                                      )
                                    }
                                  >
                                    {t('shared.viewMatchDetails')}
                                  </button>
                                </aside>
                              )}
                            </article>
                          );
                        })}
                      </section>
                    </section>
                  ))}
                </footer>
              </article>
            );
          })()}
        </section>
        <section>
          <table className="table-pin-rows table-xs table-zebra table h-full table-fixed">
            <thead>
              <tr>
                {weekdays.map((day) => (
                  <th key={day.toString()}>
                    <p className="uppercase">{format(day, 'EEE')}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calendar.map((week, weekIdx) => (
                <tr key={weekIdx}>
                  {week.map((day: Date | null, dayIdx) => (
                    <td
                      key={day?.toString() || dayIdx + '__empty_day'}
                      className={cx(
                        'border-base-content/10 h-24 border align-top',
                        !!day && isSameDay(day, today) && 'bg-primary/10',
                        !!day && isSameDay(day, selectedDate) && 'bg-base-300',
                      )}
                      onClick={() => {
                        if (day) {
                          setSelectedDate(day);
                        }
                      }}
                    >
                      {(() => {
                        if (!day) {
                          return <p />;
                        }

                        const matchday = visibleMatches.filter((match) =>
                          isSameDay(match.date, day),
                        );

                        if (!matchday.length) {
                          return <h2>{day.getDate()}</h2>;
                        }

                        const primary = matchday[0];
                        const opponent = getOpponent(primary, state.profile.teamId);
                        const tournamentMarkers = getTournamentMarkers(matchday);
                        const firstMarker = tournamentMarkers[0];

                        return (
                          <div
                            className={cx(
                              'hover:bg-base-300/60 relative flex h-full w-full cursor-pointer flex-col gap-1 overflow-hidden rounded-sm px-1 py-0.5 transition-colors',
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <h2>{day.getDate()}</h2>
                              <span className="flex max-w-[60%] justify-end gap-1 pt-1">
                                {tournamentMarkers.slice(0, 5).map((marker) => (
                                  <span
                                    key={`${marker.label}__${marker.color}`}
                                    className="block size-2 rounded-full"
                                    style={{ backgroundColor: marker.color }}
                                    title={marker.label}
                                  />
                                ))}
                              </span>
                            </div>
                            {!!firstMarker && (
                              <div
                                className="border-base-content/10 flex items-center gap-1 rounded border px-1.5 py-1"
                                style={{
                                  backgroundColor: `${firstMarker.color}24`,
                                  borderColor: `${firstMarker.color}80`,
                                }}
                                title={firstMarker.label}
                              >
                                <span
                                  className="h-4 w-1 shrink-0 rounded"
                                  style={{ backgroundColor: firstMarker.color }}
                                />
                                <span className="text-base-content min-w-0 truncate text-[0.65rem] font-semibold">
                                  {firstMarker.label}
                                </span>
                              </div>
                            )}
                            <div className="text-base-content/60 flex items-center gap-1 text-[0.65rem]">
                              <span>
                                {matchday.length} {matchday.length === 1 ? 'match' : 'matches'}
                              </span>
                              {tournamentMarkers.length > 1 && (
                                <span>+{tournamentMarkers.length - 1} tournaments</span>
                              )}
                            </div>
                            {!opponent && <p>BYE</p>}
                            {mode === 'mine' &&
                              primary.status === Constants.MatchStatus.COMPLETED &&
                              !!opponent && (
                                <span
                                  className={cx(
                                    'badge badge-xs',
                                    ['badge-error', 'badge-ghost', 'badge-success'][
                                      opponent.result
                                    ],
                                  )}
                                >
                                  {getMatchScore(primary)}
                                </span>
                              )}
                            {!!opponent && mode === 'mine' && (
                              <img
                                title={opponent.team.name}
                                className="absolute right-0 bottom-0 size-12"
                                src={opponent.team.blazon}
                              />
                            )}
                          </div>
                        );
                      })()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
