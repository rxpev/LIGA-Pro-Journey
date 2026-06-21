/**
 * Postgame modal.
 *
 * @module
 */
import React from 'react';
import { groupBy } from 'lodash';
import { useLocation } from 'react-router-dom';
import { Constants, Eagers, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { AppStateContext } from '@liga/frontend/redux';
import { useTranslation } from '@liga/frontend/hooks';
import { Image } from '@liga/frontend/components';
import { FaBomb, FaSkull, FaTools } from 'react-icons/fa';
import asiaFlag from '@liga/frontend/assets/flags/as.svg';
import euFlag from '@liga/frontend/assets/flags/eu.svg';
import northAmericaFlag from '@liga/frontend/assets/flags/na.svg';
import southAmericaFlag from '@liga/frontend/assets/flags/sa.svg';
import worldFlag from '@liga/frontend/assets/flags/world.svg';

/** @type {Matches} */
type Matches<T = typeof Eagers.match> = Awaited<ReturnType<typeof api.matches.all<T>>>;

/** @type {MatchGame} */
type MatchGame = Matches[number]['games'][number];

type ExhibitionPostgamePayload = {
  type: 'exhibition';
  map: string;
  game: Constants.Game;
  fallbackPlayerId: number | null;
  teams: Array<{
    id: number;
    name: string;
    blazon?: string | null;
    score: number;
    players: Array<{
      id: number;
      name: string;
      matchName: string;
      country?: { code?: string | null } | null;
    }>;
  }>;
  events: Array<{
    type: string;
    payload: {
      timestamp: string;
      attacker?: { name: string };
      assist?: { name: string };
      victim?: { name: string };
      weapon?: string;
      headshot?: boolean;
    };
  }>;
};

type ExhibitionPlayer = ExhibitionPostgamePayload['teams'][number]['players'][number];

/** @interface */
interface ScoreboardProps {
  competitor: Matches<typeof Eagers.matchEvents>[number]['competitors'][number];
  match: Matches<typeof Eagers.matchEvents>[number];
  matchGame?: MatchGame;
  vetoes: Array<MatchVetoEntry>;
}

type MatchVetoEntry = Awaited<ReturnType<typeof api.match.findVetoList>>[number];
type MatchInfoMatch = Matches<typeof Eagers.matchEvents>[number];
type PostgameMatch = Matches<typeof Eagers.matchEvents>[number];
type PostgameCompetitor = PostgameMatch['competitors'][number];
type PostgamePlayer = PostgameMatch['players'][number];
type SwissSiblingMatch = Matches<typeof Eagers.match>[number];
type SwissRecord = { losses: number; wins: number };
type MiniSwissConfig = { maxLosses: number; maxWins: number };

/** @enum */
enum Rating {
  LOW = 0.95,
  HIGH = 1.05,
}

const VETO_BADGE_STYLES = {
  [Constants.MapVetoAction.BAN]: 'badge-error',
  [Constants.MapVetoAction.DECIDER]: 'badge-warning',
  [Constants.MapVetoAction.PICK]: 'badge-success',
};
const TEAM_COUNTRY_CORE_SIZE = 3;
const MIXED_REGION_COUNTRY_CODES: Record<string, string> = {
  AS: 'as',
  EU: 'eu',
  NA: 'na',
  SA: 'sa',
};

function getExhibitionEventPlayerId(
  playerName: string | undefined,
  teams: ExhibitionPostgamePayload['teams'],
  fallbackPlayerId: number | null,
) {
  if (!playerName) {
    return fallbackPlayerId;
  }

  const players = teams.flatMap((team) => team.players);
  return (
    players.find((player) => player.matchName === playerName || player.name === playerName)?.id ??
    fallbackPlayerId
  );
}

function getExhibitionPlayerPerformance(
  player: ExhibitionPlayer,
  payload: ExhibitionPostgamePayload,
) {
  const killEvents = payload.events
    .filter((event) => event.type === 'playerkilled')
    .map((event) => ({
      ...event,
      attackerId: getExhibitionEventPlayerId(
        event.payload.attacker?.name,
        payload.teams,
        payload.fallbackPlayerId,
      ),
      victimId: getExhibitionEventPlayerId(
        event.payload.victim?.name,
        payload.teams,
        payload.fallbackPlayerId,
      ),
    }));
  const assistEvents = payload.events
    .filter((event) => event.type === 'playerassisted')
    .map((event) => ({
      ...event,
      assistId: getExhibitionEventPlayerId(
        event.payload.assist?.name,
        payload.teams,
        payload.fallbackPlayerId,
      ),
      victimId: getExhibitionEventPlayerId(
        event.payload.victim?.name,
        payload.teams,
        payload.fallbackPlayerId,
      ),
    }));
  const kills = killEvents.filter((event) => event.attackerId === player.id);
  const headshots = kills.filter((event) => event.payload.headshot);
  const assists = assistEvents.filter((event) => event.assistId === player.id);
  const deaths = killEvents.filter((event) => event.victimId === player.id);
  const hsp = headshots.length / (kills.length || 1);
  const kd = kills.length - deaths.length;
  const rating = Util.getPlayerRating(kills.length, deaths.length, assists.length);
  return { assists, kills, deaths, hsp, kd, rating };
}

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

/**
 * Generates a player's match performance from the
 * provided player killed or assists events array.
 *
 * @param player  The player to generate stats for.
 * @param events  The player killed events object.
 * @function
 */
function getPlayerPerformance(
  player: ScoreboardProps['competitor']['team']['players'][number],
  events: ScoreboardProps['match']['events'],
) {
  const kills = events.filter((event) => event.attackerId === player.id);
  const headshots = kills.filter((kills) => kills.headshot);
  const assists = events.filter((event) => event.assistId === player.id);
  const deaths = events.filter((event) => event.victimId === player.id && !event.assistId);
  const hsp = headshots.length / (kills.length || 1);
  const kd = kills.length - deaths.length;
  const rating = Util.getPlayerRating(kills.length, deaths.length, assists.length);
  return { events, assists, kills, deaths, hsp, kd, rating };
}

/**
 * @param result  The round result.
 */
function getRoundWinIcon(result: string) {
  switch (result) {
    case 'SFUI_Notice_Terrorists_Win':
    case 'Terrorists_Win':
      return <FaSkull className="text-error" />;
    case 'SFUI_Notice_Target_Bombed':
    case 'Target_Bombed':
      return <FaBomb className="text-error" />;
    case 'SFUI_Notice_CTs_Win':
    case 'SFUI_Notice_CT_Win':
    case 'CTs_Win':
    case 'CT_Win':
      return <FaSkull className="text-info" />;
    case 'SFUI_Notice_Bomb_Defused':
    case 'Bomb_Defused':
    case 'SFUI_Target_Saved':
    case 'Target_Saved':
      return <FaTools className="text-info" />;
    default:
      return null;
  }
}

function isWithinStint(date: Date, startedAt: Date | string, endedAt: Date | string | null) {
  const start = new Date(startedAt);
  start.setHours(0, 0, 0, 0);

  const end = endedAt ? new Date(endedAt) : null;
  if (end) end.setHours(23, 59, 59, 999);

  return start <= date && (!end || end >= date);
}

function getHistoricalCompetitorPlayers(match: PostgameMatch, competitor: PostgameCompetitor) {
  const matchDate = new Date(match.date);

  return match.players.filter((player) =>
    player.careerStints?.some(
      (stint) =>
        stint.teamId === competitor.team.id &&
        isWithinStint(matchDate, stint.startedAt, stint.endedAt),
    ),
  );
}

function getHistoricalTeamCountryCode(
  match: PostgameMatch,
  competitor: PostgameCompetitor,
): string | undefined {
  const historicalPlayers = getHistoricalCompetitorPlayers(match, competitor);
  const countryCounts = historicalPlayers.reduce<Record<string, number>>((counts, player) => {
    const code = player.country?.code?.toLowerCase();

    if (code) {
      counts[code] = (counts[code] || 0) + 1;
    }

    return counts;
  }, {});
  const historicalCountryCore = Object.entries(countryCounts).sort(
    ([codeA, countA], [codeB, countB]) => countB - countA || codeA.localeCompare(codeB),
  )[0];

  if ((historicalCountryCore?.[1] ?? 0) >= TEAM_COUNTRY_CORE_SIZE) {
    return historicalCountryCore?.[0];
  }

  const regionCounts = historicalPlayers.reduce<Record<string, number>>(
    (counts, player: PostgamePlayer) => {
      const regionCode = player.country?.continent?.code?.toUpperCase();

      if (regionCode && MIXED_REGION_COUNTRY_CODES[regionCode]) {
        counts[regionCode] = (counts[regionCode] || 0) + 1;
      }

      return counts;
    },
    {},
  );
  const historicalRegionCore = Object.entries(regionCounts).sort(
    ([codeA, countA], [codeB, countB]) => countB - countA || codeA.localeCompare(codeB),
  )[0];

  if ((historicalRegionCore?.[1] ?? 0) >= TEAM_COUNTRY_CORE_SIZE) {
    return MIXED_REGION_COUNTRY_CODES[historicalRegionCore[0]];
  }

  return Util.getTeamDisplayCountry({ ...competitor.team, players: historicalPlayers }).code;
}

function getSwissRecordBeforeMatch(
  match: MatchInfoMatch,
  competitionMatches: SwissSiblingMatch[],
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

function getGroupSwissConfig(match: MatchInfoMatch): MiniSwissConfig | null {
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

function getSwissCompetitorRecords(match: MatchInfoMatch, competitionMatches: SwissSiblingMatch[]) {
  return match.competitors.map((competitor) => ({
    competitor,
    record: getSwissRecordBeforeMatch(match, competitionMatches, competitor.teamId),
  }));
}

function getMatchFormatNotes(match: MatchInfoMatch, competitionMatches: SwissSiblingMatch[] = []) {
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

function MatchInfo(props: { competitionMatches: SwissSiblingMatch[]; match: MatchInfoMatch }) {
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
function PostgameTeamHeader(props: { competitor: PostgameCompetitor; side: 'left' | 'right' }) {
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

function PostgameScoreHeader(props: {
  away: PostgameCompetitor;
  awayScore: number | null;
  home: PostgameCompetitor;
  homeScore: number | null;
  match: PostgameMatch;
}) {
  const competitionLogo = Util.getCompetitionLogo(
    props.match.competition.tier.slug,
    props.match.competition.federation.slug,
    {
      location: props.match.competition.location,
      organizer: props.match.competition.organizer,
    },
  );
  const homeCountryCode = getHistoricalTeamCountryCode(props.match, props.home);
  const awayCountryCode = getHistoricalTeamCountryCode(props.match, props.away);
  const homeCountryBackground = getCustomCountryBackground(homeCountryCode);
  const awayCountryBackground = getCustomCountryBackground(awayCountryCode);
  const matchDateLabel = formatMatchDate(props.match.date);

  return (
    <section className="border-base-content/10 bg-base-200 relative isolate grid h-32 grid-cols-[minmax(0,1fr)_7rem_15rem_7rem_minmax(0,1fr)] items-center overflow-hidden border-b">
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

      <PostgameTeamHeader competitor={props.home} side="left" />

      <p
        className={cx(
          'relative z-10 text-center text-6xl leading-none font-black',
          props.homeScore > props.awayScore && 'text-success',
          props.homeScore < props.awayScore && 'text-error',
        )}
      >
        {props.homeScore}
      </p>

      <article className="relative z-10 grid place-items-center gap-1">
        <Image src={competitionLogo} className="size-24 object-contain" />
        <p className="text-base-content/60 text-xs leading-none font-bold tracking-wide uppercase">
          {matchDateLabel}
        </p>
      </article>

      <p
        className={cx(
          'relative z-10 text-center text-6xl leading-none font-black',
          props.awayScore > props.homeScore && 'text-success',
          props.awayScore < props.homeScore && 'text-error',
        )}
      >
        {props.awayScore}
      </p>

      <PostgameTeamHeader competitor={props.away} side="right" />
    </section>
  );
}

function VetoSummary(props: {
  competitionMatches: SwissSiblingMatch[];
  match: Matches<typeof Eagers.matchEvents>[number];
  matchGame?: MatchGame;
  settings: typeof Constants.Settings;
  vetoes: Array<MatchVetoEntry>;
}) {
  const playedMaps = React.useMemo(
    () =>
      props.match.games.map((game) => ({
        game,
        veto: props.vetoes.find((entry) => entry.map === game.map),
      })),
    [props.match.games, props.vetoes],
  );

  return (
    <section className="border-base-content/10 grid grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)] gap-2 border-t p-2">
      <article className="border-base-content/10 bg-base-200/60 min-h-32 overflow-hidden rounded border">
        <header className="border-base-content/10 flex items-center justify-between border-b px-3 py-1.5 text-xs font-bold uppercase opacity-70">
          <span>Maps</span>
          {!!props.matchGame && (
            <span>{Util.convertMapPool(props.matchGame.map, props.settings.general.game)}</span>
          )}
        </header>
        <section
          className="grid h-[118px] gap-2 p-2"
          style={{ gridTemplateColumns: `repeat(${playedMaps.length}, minmax(0, 1fr))` }}
        >
          {playedMaps.map(({ game, veto }) => {
            const selected = !props.matchGame || props.matchGame.id === game.id;
            const competitor =
              veto && props.match.competitors.find((entry) => entry.teamId === veto.teamId);
            const [homeGame, awayGame] = game.teams;
            const hasScore = homeGame.score !== null && awayGame.score !== null;
            const unusedDecider = veto?.type === Constants.MapVetoAction.DECIDER && !hasScore;

            return (
              <figure
                key={game.id + '__veto_map'}
                className={cx(
                  'relative overflow-hidden rounded-sm border',
                  selected
                    ? 'border-base-content/30 opacity-100'
                    : 'border-base-content/10 opacity-50',
                  unusedDecider && 'opacity-40 grayscale',
                )}
              >
                <Image
                  className="h-full w-full object-cover"
                  src={Util.convertMapPool(game.map, props.settings.general.game, true)}
                  title={Util.convertMapPool(game.map, props.settings.general.game)}
                />
                <figcaption className="bg-base-300/85 absolute inset-x-0 bottom-0 px-2 py-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-bold">
                      {Util.convertMapPool(game.map, props.settings.general.game)}
                    </span>
                    {!!veto && (
                      <span
                        className={cx(
                          'badge badge-xs uppercase',
                          VETO_BADGE_STYLES[veto.type as Constants.MapVetoAction],
                        )}
                      >
                        {veto.type}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="flex min-w-0 items-center gap-1">
                      {!!competitor && <img src={competitor.team.blazon} className="size-4" />}
                      <span className="truncate opacity-70">
                        {competitor ? competitor.team.name : '\u00a0'}
                      </span>
                    </span>
                    {hasScore && (
                      <span className="font-bold">
                        {homeGame.score}:{awayGame.score}
                      </span>
                    )}
                    {!hasScore && <span>&nbsp;</span>}
                  </div>
                </figcaption>
              </figure>
            );
          })}
        </section>
      </article>
      <MatchInfo competitionMatches={props.competitionMatches} match={props.match} />
    </section>
  );
}

/**
 * @param props Root props.
 */
function Scoreboard(props: ScoreboardProps) {
  const t = useTranslation('windows');
  const players = React.useMemo(() => {
    return getHistoricalCompetitorPlayers(props.match, props.competitor);
  }, [props.competitor, props.match]);
  const matchEvents = React.useMemo(
    () =>
      props.matchGame
        ? props.match.events.filter((matchEvent) => matchEvent.gameId === props.matchGame.id)
        : props.match.events,
    [props.match, props.matchGame],
  );
  const killOrAssistEvents = React.useMemo(
    () => matchEvents.filter((event) => event.weapon !== null || event.assistId),
    [matchEvents],
  );
  const veto = React.useMemo(
    () => props.matchGame && props.vetoes.find((entry) => entry.map === props.matchGame.map),
    [props.matchGame, props.vetoes],
  );

  return (
    <table className="table-xs table">
      <thead>
        <tr className="border-t-base-content/10 border-t">
          <th>
            <p title={props.competitor.team.name}>
              {!!props.competitor.team.blazon && (
                <img src={props.competitor.team.blazon} className="mr-2 inline-block size-4" />
              )}
              {props.competitor.team.name}
              {!!veto && veto.teamId === props.competitor.teamId && (
                <span className="badge badge-xs ml-2 uppercase">pick</span>
              )}
            </p>
          </th>
          <th title="Rating" className="w-[10%] text-center">
            {t('postgame.rating')}
          </th>
          <th title={t('postgame.kills')} className="w-[10%] text-center">
            {t('postgame.killsAlt')}
          </th>
          <th title={t('postgame.deaths')} className="w-[10%] text-center">
            {t('postgame.deathsAlt')}
          </th>
          <th title={t('postgame.assists')} className="w-[10%] text-center">
            {t('postgame.assistsAlt')}
          </th>
          <th title={t('postgame.headshots')} className="w-[10%] text-center">
            {t('postgame.headshotsAlt')}
          </th>
          <th title={t('postgame.kd')} className="w-[10%] text-center">
            {t('postgame.kdAlt')}
          </th>
        </tr>
      </thead>
      <tbody>
        {players
          .sort(
            (playerA, playerB) =>
              getPlayerPerformance(playerB, killOrAssistEvents).kd -
              getPlayerPerformance(playerA, killOrAssistEvents).kd,
          )
          .map((player) => {
            const report = getPlayerPerformance(player, killOrAssistEvents);

            // if we don't have a match game defined, our rating should be based
            // off of the average rating of all games rather than just the k/d
            let rating = report.rating;

            if (!props.matchGame) {
              const ratings = Object.values(groupBy(killOrAssistEvents, 'gameId')).map(
                (data) => getPlayerPerformance(player, data).rating,
              );
              rating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
            }

            return (
              <tr key={player.name + '__scoreboard'}>
                <td>
                  <span className={cx('fp', 'mr-2', player.country.code.toLowerCase())} />
                  <span>{player.name}</span>
                </td>
                <td
                  className={cx(
                    'text-center',
                    rating <= Rating.LOW && 'text-error',
                    rating > Rating.LOW && rating < Rating.HIGH && 'text-inherit',
                    rating >= Rating.HIGH && 'text-success',
                  )}
                >
                  {new Intl.NumberFormat('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }).format(rating)}
                </td>
                <td className="text-center">{report.kills.length}</td>
                <td className="text-center">{report.deaths.length}</td>
                <td className="text-center">{report.assists.length}</td>
                <td className="text-center">
                  {new Intl.NumberFormat('en-US', {
                    style: 'percent',
                  }).format(report.hsp)}
                </td>
                <td
                  className={cx(
                    'text-center',
                    report.kd > 0 ? 'text-success' : 'text-error',
                    report.kd === 0 && 'text-inherit',
                  )}
                >
                  {new Intl.NumberFormat('en-US', { signDisplay: 'exceptZero' }).format(report.kd)}
                </td>
              </tr>
            );
          })}
      </tbody>
    </table>
  );
}

function ExhibitionScoreboard(props: {
  payload: ExhibitionPostgamePayload;
  team: ExhibitionPostgamePayload['teams'][number];
}) {
  const t = useTranslation('windows');

  return (
    <table className="table-xs table">
      <thead>
        <tr className="border-t-base-content/10 border-t">
          <th>
            <p title={props.team.name}>
              {!!props.team.blazon && (
                <img src={props.team.blazon} className="mr-2 inline-block size-4" />
              )}
              {props.team.name}
            </p>
          </th>
          <th title="Rating" className="w-[10%] text-center">
            {t('postgame.rating')}
          </th>
          <th title={t('postgame.kills')} className="w-[10%] text-center">
            {t('postgame.killsAlt')}
          </th>
          <th title={t('postgame.deaths')} className="w-[10%] text-center">
            {t('postgame.deathsAlt')}
          </th>
          <th title={t('postgame.assists')} className="w-[10%] text-center">
            {t('postgame.assistsAlt')}
          </th>
          <th title={t('postgame.headshots')} className="w-[10%] text-center">
            {t('postgame.headshotsAlt')}
          </th>
          <th title={t('postgame.kd')} className="w-[10%] text-center">
            {t('postgame.kdAlt')}
          </th>
        </tr>
      </thead>
      <tbody>
        {props.team.players
          .sort(
            (playerA, playerB) =>
              getExhibitionPlayerPerformance(playerB, props.payload).kd -
              getExhibitionPlayerPerformance(playerA, props.payload).kd,
          )
          .map((player) => {
            const report = getExhibitionPlayerPerformance(player, props.payload);

            return (
              <tr key={props.team.id + '_' + player.id + '__scoreboard'}>
                <td>
                  {!!player.country?.code && (
                    <span className={cx('fp', 'mr-2', player.country.code.toLowerCase())} />
                  )}
                  <span>{player.name}</span>
                </td>
                <td
                  className={cx(
                    'text-center',
                    report.rating <= Rating.LOW && 'text-error',
                    report.rating > Rating.LOW && report.rating < Rating.HIGH && 'text-inherit',
                    report.rating >= Rating.HIGH && 'text-success',
                  )}
                >
                  {new Intl.NumberFormat('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }).format(report.rating)}
                </td>
                <td className="text-center">{report.kills.length}</td>
                <td className="text-center">{report.deaths.length}</td>
                <td className="text-center">{report.assists.length}</td>
                <td className="text-center">
                  {new Intl.NumberFormat('en-US', {
                    style: 'percent',
                  }).format(report.hsp)}
                </td>
                <td
                  className={cx(
                    'text-center',
                    report.kd > 0 ? 'text-success' : 'text-error',
                    report.kd === 0 && 'text-inherit',
                  )}
                >
                  {new Intl.NumberFormat('en-US', { signDisplay: 'exceptZero' }).format(report.kd)}
                </td>
              </tr>
            );
          })}
      </tbody>
    </table>
  );
}

function ExhibitionPostgame(props: { payload: ExhibitionPostgamePayload }) {
  const t = useTranslation('windows');
  const [home, away] = props.payload.teams;

  return (
    <main className="flex h-screen w-full flex-col">
      <header className="breadcrumbs border-base-content/10 bg-base-200 sticky top-0 z-30 border-b px-2 text-sm">
        <ul>
          <li>
            <span>{t('landing.home.exhibition')}</span>
          </li>
          <li>{Util.convertMapPool(props.payload.map, props.payload.game)}</li>
        </ul>
      </header>
      <section className="card image-full h-16 rounded-none before:rounded-none!">
        <figure>
          <Image
            className="h-full w-full"
            src={Util.convertMapPool(props.payload.map, props.payload.game, true)}
          />
        </figure>
        <header className="card-body grid grid-cols-3 place-items-center p-0">
          <article className="grid w-full grid-cols-2 place-items-center font-black">
            {!!home.blazon && <img src={home.blazon} className="size-8" />}
            <p>{home.name}</p>
          </article>
          <article className="grid grid-cols-3 place-items-center text-4xl font-bold">
            <p
              className={cx(
                home.score > away.score && 'text-success',
                home.score < away.score && 'text-error',
              )}
            >
              {home.score}
            </p>
            <p>:</p>
            <p
              className={cx(
                away.score > home.score && 'text-success',
                away.score < home.score && 'text-error',
              )}
            >
              {away.score}
            </p>
          </article>
          <article className="grid w-full grid-cols-2 place-items-center font-black">
            <p>{away.name}</p>
            {!!away.blazon && <img src={away.blazon} className="size-8" />}
          </article>
        </header>
      </section>
      <ExhibitionScoreboard payload={props.payload} team={home} />
      <ExhibitionScoreboard payload={props.payload} team={away} />
      <section className="h-0 flex-grow" />
    </main>
  );
}

function isExhibitionPostgamePayload(payload: unknown): payload is ExhibitionPostgamePayload {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      'type' in payload &&
      payload.type === 'exhibition' &&
      'teams' in payload &&
      Array.isArray(payload.teams),
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
  const exhibitionPayload = React.useMemo(
    () =>
      isExhibitionPostgamePayload(location.state)
        ? (location.state as ExhibitionPostgamePayload)
        : null,
    [location.state],
  );
  const [match, setMatch] = React.useState<Matches<typeof Eagers.matchEvents>[number]>();
  const [competitionMatches, setCompetitionMatches] = React.useState<SwissSiblingMatch[]>([]);
  const [matchGame, setMatchGame] = React.useState<MatchGame>();
  const [vetoes, setVetoes] = React.useState<Array<MatchVetoEntry>>([]);
  const [settings, setSettings] = React.useState(Constants.Settings);

  // grab match data
  React.useEffect(() => {
    if (!location.state || exhibitionPayload) {
      return;
    }

    api.matches
      .all<typeof Eagers.matchEvents>({
        where: {
          id: location.state,
        },
        include: Eagers.matchEvents.include,
      })
      .then((matches) => setMatch(matches[0]));
  }, [exhibitionPayload, location.state]);

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
        .all<typeof Eagers.match>({
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

  // load settings
  React.useEffect(() => {
    if (!state.profile) {
      return;
    }

    setSettings(Util.loadSettings(state.profile.settings));
  }, [state.profile]);

  // grab basic match info
  const [home, away] = React.useMemo(() => (match ? match.competitors : []), [match]);
  const [matchGameHome, matchGameAway] = React.useMemo(
    () => (matchGame ? matchGame.teams : match ? match.competitors : []),
    [match, matchGame],
  );
  const matchEvents = React.useMemo(
    () =>
      matchGame
        ? match.events.filter((matchEvent) => matchEvent.gameId === matchGame.id)
        : match
          ? match.events
          : [],
    [match, matchGame],
  );
  const totalHalves = React.useMemo(
    () => Math.max(...matchEvents.map((me) => me.half)) + 1,
    [matchEvents],
  );

  if (exhibitionPayload) {
    return <ExhibitionPostgame payload={exhibitionPayload} />;
  }

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
      <header className="breadcrumbs border-base-content/10 bg-base-200 sticky top-0 z-30 border-b px-2 text-sm">
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
          <li>
            {matchGame
              ? Util.convertMapPool(matchGame.map, settings.general.game)
              : t('shared.overview')}
          </li>
        </ul>
      </header>
      <PostgameScoreHeader
        away={away}
        awayScore={matchGameAway.score}
        home={home}
        homeScore={matchGameHome.score}
        match={match}
      />
      {match.games.length > 1 && (
        <section
          role="tablist"
          className="tabs-box tabs border-base-content/10 tabs-xs rounded-none border-t"
        >
          <a
            role="tab"
            className={cx('tab', !matchGame && 'tab-active')}
            onClick={() => setMatchGame(null)}
          >
            {t('shared.overview')}
          </a>
          {match.games.map((game) => (
            <a
              role="tab"
              key={'game_' + game.num + '__tab'}
              className={cx(
                'tab',
                game.num === matchGame?.num && 'tab-active',
                game.status !== Constants.MatchStatus.COMPLETED && 'tab-disabled',
              )}
              onClick={() => setMatchGame(game)}
            >
              {Util.convertMapPool(game.map, settings.general.game)}
            </a>
          ))}
        </section>
      )}
      <VetoSummary
        competitionMatches={competitionMatches}
        match={match}
        matchGame={matchGame}
        settings={settings}
        vetoes={vetoes}
      />
      <Scoreboard competitor={home} match={match} matchGame={matchGame} vetoes={vetoes} />
      {(match.games.length === 1 || !!matchGame) && (
        <table className="table-xs table">
          <thead>
            <tr className="border-t-base-content/10 border-t">
              <th colSpan={totalHalves + 1}>{t('postgame.timeline')}</th>
            </tr>
          </thead>
          <tbody>
            {match.competitors.map((competitor) => {
              const roundEndEvents = matchEvents.filter((event) => event.winnerId !== null);
              return (
                <tr key={competitor.team.name + '__round_history'}>
                  <td className="w-[10%] text-center">
                    <img src={competitor.team.blazon} className="inline-block size-4" />
                  </td>
                  {[...Array(totalHalves)].map((_, half) => (
                    <td
                      key={competitor.team.name + half + '__round_item'}
                      className={cx('border-base-content/10 border-l', `w-[${90 / totalHalves}%]`)}
                    >
                      <section className="flex justify-between">
                        {roundEndEvents
                          .filter((event) => event.half === half)
                          .map((event, round) => (
                            <article
                              key={competitor.team.name + event.id}
                              title={t('postgame.round') + ' ' + (round + 1)}
                              className="center basis-4"
                            >
                              {event.winnerId === competitor.id ? (
                                getRoundWinIcon(event.result)
                              ) : (
                                <span>&nbsp;</span>
                              )}
                            </article>
                          ))}
                      </section>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <Scoreboard competitor={away} match={match} matchGame={matchGame} vetoes={vetoes} />
      <section className="h-0 flex-grow" />
      {match.status !== Constants.MatchStatus.COMPLETED && (
        <button
          className="btn btn-xl btn-block btn-secondary rounded-none active:translate-0!"
          onClick={() => {
            api.window.send(Constants.WindowIdentifier.Main, match.id, null);
            api.window.close(Constants.WindowIdentifier.Modal);
          }}
        >
          {t('main.dashboard.play')}
        </button>
      )}
    </main>
  );
}
