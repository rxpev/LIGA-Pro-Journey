/**
 * The pregame modal allows users to manage their squad
 * before starting their match.
 *
 * @module
 */
import React from 'react';
import { useLocation } from 'react-router-dom';
import { subMonths } from 'date-fns';
import { Constants, Eagers, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { AppStateContext } from '@liga/frontend/redux';
import { useTranslation } from '@liga/frontend/hooks';
import { Image, PlayerCard } from '@liga/frontend/components';
import asiaFlag from '@liga/frontend/assets/flags/as.svg';
import euFlag from '@liga/frontend/assets/flags/eu.svg';
import northAmericaFlag from '@liga/frontend/assets/flags/na.svg';
import southAmericaFlag from '@liga/frontend/assets/flags/sa.svg';
import worldFlag from '@liga/frontend/assets/flags/world.svg';

/** @type {Matches} */
type Matches<T = typeof Eagers.match> = Awaited<ReturnType<typeof api.matches.all<T>>>;
type MatchGame = Matches[number]['games'][number];
type MatchVetoEntry = Awaited<ReturnType<typeof api.match.findVetoList>>[number];
type CompetitionMatch = Matches[number];
type MiniSwissConfig = { maxLosses: number; maxWins: number };
type SwissRecord = { losses: number; wins: number };

const VETO_BADGE_STYLES = {
  [Constants.MapVetoAction.BAN]: 'badge-error',
  [Constants.MapVetoAction.DECIDER]: 'badge-warning',
  [Constants.MapVetoAction.PICK]: 'badge-success',
};

function getOrdinalDay(day: number) {
  if (day >= 11 && day <= 13) {
    return `${day}th`;
  }

  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

function formatMatchDate(date: Date | string) {
  const matchDate = new Date(date);

  const day = getOrdinalDay(matchDate.getDate());
  const month = new Intl.DateTimeFormat('en-US', {
    month: 'long',
  }).format(matchDate);
  const year = matchDate.getFullYear();

  return `${day} of ${month} ${year}`;
}

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

function getCustomCountryBackground(code?: string | null) {
  switch (code?.toLowerCase()) {
    case 'eu':
      return euFlag;
    case 'as':
    case 'asia':
      return asiaFlag;
    case 'na':
    case 'north-america':
    case 'northamerica':
    case 'north_america':
      return northAmericaFlag;
    case 'sa':
    case 'xsa':
    case 'south-america':
    case 'southamerica':
    case 'south_america':
      return southAmericaFlag;
    case 'other':
      return worldFlag;
    default:
      return null;
  }
}

function getSwissRecordBeforeMatch(
  match: Matches[number],
  competitionMatches: CompetitionMatch[],
  teamId: number,
): SwissRecord {
  return competitionMatches
    .filter(
      (sibling) =>
        sibling.id !== match.id &&
        sibling.status === Constants.MatchStatus.COMPLETED &&
        (sibling.round || 0) < (match.round || 0) &&
        sibling.competitors.some((competitor) => competitor.teamId === teamId),
    )
    .reduce<SwissRecord>(
      (record, sibling) => {
        const competitor = sibling.competitors.find((entry) => entry.teamId === teamId);

        if (competitor?.result === Constants.MatchResult.WIN) {
          return { ...record, wins: record.wins + 1 };
        }

        if (competitor?.result === Constants.MatchResult.LOSS) {
          return { ...record, losses: record.losses + 1 };
        }

        return record;
      },
      { losses: 0, wins: 0 },
    );
}

function getGroupSwissConfig(match: Matches[number]): MiniSwissConfig | null {
  try {
    const parsed = JSON.parse(match.competition.tournament || '{}');
    const options = parsed?.groupSwiss?.options;

    return options?.maxLosses && options?.maxWins
      ? { maxLosses: options.maxLosses, maxWins: options.maxWins }
      : null;
  } catch {
    return null;
  }
}

function getSwissCompetitorRecords(match: Matches[number], competitionMatches: CompetitionMatch[]) {
  return match.competitors.map((competitor) => ({
    competitor,
    record: getSwissRecordBeforeMatch(match, competitionMatches, competitor.teamId),
  }));
}

function getMatchFormatNotes(match: Matches[number], competitionMatches: CompetitionMatch[] = []) {
  const tierSlug = match.competition.tier.slug as Constants.TierSlug;
  const swissConfig = Constants.TierSwissConfig[tierSlug];

  if (swissConfig) {
    const competitorRecords = getSwissCompetitorRecords(match, competitionMatches);
    const records = competitorRecords
      .map(({ record }) => `${record.wins}-${record.losses}`)
      .filter((record, index, list) => list.indexOf(record) === index);
    const winner = competitorRecords.find(
      ({ competitor }) => competitor.result === Constants.MatchResult.WIN,
    );
    const loser = competitorRecords.find(
      ({ competitor }) => competitor.result === Constants.MatchResult.LOSS,
    );
    const consequences = [
      winner && winner.record.wins + 1 >= swissConfig.maxWins && 'Winning team advances',
      loser && loser.record.losses + 1 >= swissConfig.maxLosses && 'Losing team is eliminated',
    ].filter(Boolean);
    const recordLabel =
      match.round > 1 && records.length === 1 ? ` (teams with a ${records[0]} record)` : '';

    return `* ${Util.parseSwissRound(match.round)}${recordLabel}${
      consequences.length ? `. ${consequences.join('; ')}.` : ''
    }`;
  }

  const groupSwissConfig = getGroupSwissConfig(match);

  if (groupSwissConfig) {
    const competitorRecords = getSwissCompetitorRecords(match, competitionMatches);
    const records = competitorRecords
      .map(({ record }) => `${record.wins}-${record.losses}`)
      .filter((record, index, list) => list.indexOf(record) === index);
    const winner = competitorRecords.find(
      ({ competitor }) => competitor.result === Constants.MatchResult.WIN,
    );
    const loser = competitorRecords.find(
      ({ competitor }) => competitor.result === Constants.MatchResult.LOSS,
    );
    const details = [
      match.round > 1 && records.length === 1 && records[0],
      winner && winner.record.wins + 1 >= groupSwissConfig.maxWins && 'winning team advances',
      loser && loser.record.losses + 1 >= groupSwissConfig.maxLosses && 'losing team is eliminated',
    ].filter(Boolean);

    return `* ${Util.getMatchRoundLabel(match)}${details.length ? ` (${details.join(', ')})` : ''}`;
  }

  return `* ${Util.getMatchRoundLabel(match)}`;
}

function MatchInfo(props: { competitionMatches: CompetitionMatch[]; match: Matches[number] }) {
  return (
    <article className="border-base-content/10 bg-base-200/60 min-h-32 overflow-hidden rounded border">
      <header className="border-base-content/10 border-b px-3 py-1.5 text-xs font-bold uppercase opacity-70">
        Match
      </header>
      <section className="space-y-5 px-3 py-3 text-xs leading-5 opacity-70">
        <p>
          Best of {props.match.games.length} ({props.match.competition.tier.lan ? 'LAN' : 'Online'})
        </p>
        <p>{getMatchFormatNotes(props.match, props.competitionMatches)}</p>
      </section>
    </article>
  );
}

function PregameVetoSummary(props: {
  competitionMatches: CompetitionMatch[];
  match: Matches[number];
  settings: typeof Constants.Settings;
  vetoes: Array<MatchVetoEntry>;
}) {
  const decidedMaps = React.useMemo(
    () =>
      props.match.games.map((game) => ({
        game,
        veto: props.vetoes.find(
          (entry) =>
            entry.map === game.map &&
            [Constants.MapVetoAction.DECIDER, Constants.MapVetoAction.PICK].includes(
              entry.type as Constants.MapVetoAction,
            ),
        ),
      })),
    [props.match.games, props.vetoes],
  );
  const mapsDecided = decidedMaps.some(({ veto }) => !!veto);

  return (
    <section className="border-base-content/10 grid grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)] gap-2 border-b p-2">
      <article className="border-base-content/10 bg-base-200/60 min-h-32 overflow-hidden rounded border">
        <header className="border-base-content/10 border-b px-3 py-1.5 text-xs font-bold uppercase opacity-70">
          <span>Maps</span>
        </header>
        {mapsDecided && (
          <section
            className="grid h-[118px] gap-2 p-2"
            style={{ gridTemplateColumns: `repeat(${decidedMaps.length}, minmax(0, 1fr))` }}
          >
            {decidedMaps.map(({ game, veto }) => {
              const competitor =
                veto && props.match.competitors.find((entry) => entry.teamId === veto.teamId);

              return (
                <MapCard
                  key={game.id + '__pregame_veto_map'}
                  competitor={competitor}
                  game={game}
                  settings={props.settings}
                  veto={veto}
                />
              );
            })}
          </section>
        )}
        {!mapsDecided && (
          <section className="p-2">
            <figure className="border-base-content/10 relative h-[118px] overflow-hidden rounded-sm border">
              <Image
                className="h-full w-full object-cover opacity-25 grayscale"
                src="resources://maps/allmaps.png"
              />
              <figcaption className="absolute inset-0 grid place-items-center">
                <span className="border-base-content/20 bg-base-300/80 text-base-content/80 rounded-sm border px-4 py-1 text-lg font-black uppercase shadow">
                  TBA
                </span>
              </figcaption>
            </figure>
          </section>
        )}
      </article>
      <MatchInfo competitionMatches={props.competitionMatches} match={props.match} />
    </section>
  );
}

function MapCard(props: {
  competitor?: Matches[number]['competitors'][number] | false;
  game: MatchGame;
  settings: typeof Constants.Settings;
  veto?: MatchVetoEntry;
}) {
  return (
    <figure
      className={cx(
        'relative overflow-hidden rounded-sm border',
        props.veto ? 'border-base-content/30 opacity-100' : 'border-base-content/10 opacity-40',
      )}
    >
      <Image
        className="h-full w-full object-cover"
        src={Util.convertMapPool(props.game.map, props.settings.general.game, true)}
        title={Util.convertMapPool(props.game.map, props.settings.general.game)}
      />
      <figcaption className="bg-base-300/85 absolute inset-x-0 bottom-0 px-2 py-1 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-bold">
            {props.veto ? Util.convertMapPool(props.game.map, props.settings.general.game) : 'TBD'}
          </span>
          {!!props.veto && (
            <span
              className={cx(
                'badge badge-xs uppercase',
                VETO_BADGE_STYLES[props.veto.type as Constants.MapVetoAction],
              )}
            >
              {props.veto.type}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="flex min-w-0 items-center gap-1">
            {!!props.competitor && <img src={props.competitor.team.blazon} className="size-4" />}
            <span className="truncate opacity-70">
              {props.competitor ? props.competitor.team.name : '\u00a0'}
            </span>
          </span>
          <span>&nbsp;</span>
        </div>
      </figcaption>
    </figure>
  );
}

function PregameTeamHeader(props: {
  competitor: Matches[number]['competitors'][number];
  side: 'left' | 'right';
}) {
  return (
    <article
      className={cx(
        'relative z-10 flex h-full min-w-0 items-center',
        props.side === 'left' ? 'justify-start pl-16' : 'justify-end pr-16',
      )}
    >
      <div className="grid w-28 place-items-center gap-1">
        <img src={props.competitor.team.blazon} className="size-16 object-contain" />
        <p className="max-w-full truncate px-1 text-sm font-black">{props.competitor.team.name}</p>
      </div>
    </article>
  );
}

export function PregameMatchHeader(props: {
  away: Matches[number]['competitors'][number];
  home: Matches[number]['competitors'][number];
  match: Matches[number];
}) {
  const competitionLogo = Util.getCompetitionLogo(
    props.match.competition.tier.slug,
    props.match.competition.federation.slug,
    {
      location: props.match.competition.location,
      organizer: props.match.competition.organizer,
    },
  );

  const homeCountryCode = Util.getTeamDisplayCountry(props.home.team).code.toLowerCase();
  const awayCountryCode = Util.getTeamDisplayCountry(props.away.team).code.toLowerCase();
  const homeCountryBackground = getCustomCountryBackground(homeCountryCode);
  const awayCountryBackground = getCustomCountryBackground(awayCountryCode);
  const matchDateLabel = formatMatchDate(props.match.date);

  return (
    <section className="border-base-content/10 bg-base-200 relative isolate grid h-32 grid-cols-[minmax(0,1fr)_15rem_minmax(0,1fr)] items-center overflow-hidden border-b">
      {!!homeCountryCode && (
        <div
          className={cx(
            'pointer-events-none absolute inset-y-0 left-0 z-0 w-[15rem] bg-left bg-no-repeat saturate-75',
            !homeCountryBackground && homeCountryCode,
          )}
          style={{
            backgroundImage: homeCountryBackground ? `url(${homeCountryBackground})` : undefined,
            backgroundPosition: 'left center',
            backgroundSize: homeCountryBackground ? 'cover' : '100% 100%',
            backgroundRepeat: 'no-repeat',
            maskImage: 'linear-gradient(to right, #000 0%, rgba(0,0,0,.9) 46%, transparent 100%)',
            opacity: 0.22,
            WebkitMaskImage:
              'linear-gradient(to right, #000 0%, rgba(0,0,0,.9) 46%, transparent 100%)',
          }}
        />
      )}

      {!!awayCountryCode && (
        <div
          className={cx(
            'pointer-events-none absolute inset-y-0 right-0 z-0 w-[15rem] bg-right bg-no-repeat saturate-75',
            !awayCountryBackground && awayCountryCode,
          )}
          style={{
            backgroundImage: awayCountryBackground ? `url(${awayCountryBackground})` : undefined,
            backgroundPosition: 'right center',
            backgroundSize: awayCountryBackground ? 'cover' : '100% 100%',
            backgroundRepeat: 'no-repeat',
            maskImage: 'linear-gradient(to left, #000 0%, rgba(0,0,0,.9) 46%, transparent 100%)',
            opacity: 0.22,
            WebkitMaskImage:
              'linear-gradient(to left, #000 0%, rgba(0,0,0,.9) 46%, transparent 100%)',
          }}
        />
      )}

      <PregameTeamHeader competitor={props.home} side="left" />

      <article className="relative z-10 grid place-items-center gap-1">
        <Image src={competitionLogo} className="size-24 object-contain" />
        <p className="text-base-content/60 text-xs leading-none font-bold tracking-wide uppercase">
          {matchDateLabel}
        </p>
      </article>

      <PregameTeamHeader competitor={props.away} side="right" />
    </section>
  );
}

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const location = useLocation();
  const t = useTranslation('windows');
  const { state } = React.useContext(AppStateContext);
  const [match, setMatch] = React.useState<Matches[number]>();
  const [competitionMatches, setCompetitionMatches] = React.useState<CompetitionMatch[]>([]);
  const [vetoes, setVetoes] = React.useState<Array<MatchVetoEntry>>([]);
  const [userSquad, setUserSquad] = React.useState<
    Awaited<ReturnType<typeof api.squad.all<typeof Eagers.player>>>
  >([]);
  const [recentPlayerRatings, setRecentPlayerRatings] = React.useState<
    Record<number, { maps: number; rating: number }>
  >({});

  // load profile settings for game-specific visuals
  const settingsAll = React.useMemo(
    () => !!state.profile && Util.loadSettings(state.profile.settings),
    [],
  );

  // initial data load
  React.useEffect(() => {
    if (!location.state) {
      return;
    }

    api.squad.all().then(setUserSquad);
    api.matches
      .all({
        where: {
          id: location.state,
        },
        include: Eagers.match.include,
      })
      .then((matches) => setMatch(matches[0]));
  }, []);

  React.useEffect(() => {
    if (!match) {
      return;
    }

    api.match.findVetoList(match.id).then(setVetoes);

    if (
      Constants.TierSwissConfig[match.competition.tier.slug as Constants.TierSlug] ||
      getGroupSwissConfig(match)
    ) {
      api.matches
        .all({
          where: {
            competitionId: match.competitionId,
          },
          include: Eagers.match.include,
          orderBy: [{ round: 'asc' }, { id: 'asc' }],
        })
        .then(setCompetitionMatches);
      return;
    }

    setCompetitionMatches([]);
  }, [match]);

  // grab basic match info
  const game = React.useMemo(() => match && match.games[0], [match]);
  const [home, away] = React.useMemo(() => (match ? match.competitors : []), [match]);

  React.useEffect(() => {
    setRecentPlayerRatings({});

    if (!state.profile?.simulateNpcMatchStats || !match) {
      return;
    }

    const teamIds = match.competitors
      .map((competitor) => competitor.teamId)
      .filter((teamId): teamId is number => teamId != null);

    if (!teamIds.length) {
      return;
    }

    api.matches
      .recentPlayerRatings(teamIds, subMonths(state.profile.date, 3), state.profile.date)
      .then(setRecentPlayerRatings);
  }, [match, state.profile]);

  if (!state.profile || !match) {
    return (
      <main className="h-screen w-screen">
        <section className="center h-full">
          <span className="loading loading-bars" />
        </section>
      </main>
    );
  }

  return (
    <main className="flex h-screen w-full flex-col">
      <header className="breadcrumbs border-base-content/10 bg-base-200 sticky top-0 z-30 overflow-x-visible border-b px-2 text-sm">
        <ul>
          <li>
            <span>
              {Util.getCompetitionDisplayName(
                match.competition.tier.league.name,
                match.competition.tier.slug,
              )}
            </span>
          </li>
          <li>{Util.getMatchRoundLabel(match, t('shared.matchday'))}</li>
          {match.games.length > 1 && (
            <li>
              {t('shared.bestOf')}&nbsp;
              {match.games.length}
            </li>
          )}
          {match.games.length === 1 && (
            <li>{Util.convertMapPool(game.map, settingsAll.general.game)}</li>
          )}
        </ul>
      </header>
      <PregameMatchHeader home={home} away={away} match={match} />
      <PregameVetoSummary
        competitionMatches={competitionMatches}
        match={match}
        settings={settingsAll}
        vetoes={vetoes}
      />
      <section className="divide-base-content/10 grid grid-cols-2 items-start divide-x">
        {match.competitors.map((competitor) => {
          const isUserTeam = competitor.teamId === state.profile.teamId;
          const team = competitor.team;

          // wire user's squad which can be changed
          // on-the-fly to this competitor's squad
          if (isUserTeam) {
            team.players = team.players.map((player) => ({
              ...player,
              starter: userSquad.find((userPlayer) => userPlayer.id === player.id)?.starter,
            }));
          }

          const starters = Util.getSquad(team, state.profile, true);
          return (
            <table key={competitor.id + '__competitor'} className="table-xs table table-fixed">
              <thead>
                <tr className="border-t-base-content/10 border-t">
                  <th>EXPECTED LINEUP</th>
                </tr>
              </thead>
              <tbody>
                {starters.map((player) => (
                  <tr key={player.id + '__squad'}>
                    <td
                      title={player.id === state.profile.playerId ? t('shared.you') : undefined}
                      className={cx(
                        'p-0',
                        player.id === state.profile.playerId && 'bg-base-200/50',
                      )}
                    >
                      <PlayerCard
                        compact
                        key={player.id + '__squad'}
                        className="border-transparent bg-transparent"
                        game={settingsAll.general.game}
                        player={player}
                        compactMetric={
                          state.profile?.simulateNpcMatchStats
                            ? {
                                className: recentPlayerRatings[player.id]
                                  ? getRatingColorClass(recentPlayerRatings[player.id].rating)
                                  : 'text-muted',
                                subtitle: '(Past 3 months)',
                                title: 'Rating',
                                value: recentPlayerRatings[player.id]
                                  ? recentPlayerRatings[player.id].rating.toFixed(2)
                                  : '-',
                              }
                            : undefined
                        }
                        noStats={player.id === state.profile.playerId}
                        showStatusBadge={false}
                        wideCompactIdentity
                        onClickStarter={
                          isUserTeam &&
                          player.id !== state.profile.playerId &&
                          (userSquad.filter((userPlayer) => userPlayer.starter).length <
                            Constants.Application.SQUAD_MIN_LENGTH - 1 ||
                            player.starter) &&
                          (() => {
                            api.squad
                              .update({
                                where: { id: player.id },
                                data: {
                                  starter: !player.starter,
                                },
                              })
                              .then(setUserSquad);
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })}
      </section>
    </main>
  );
}
