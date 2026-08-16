/**
 * Renders the layout for the teams route.
 *
 * @module
 */
import React from 'react';
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Constants, Eagers, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { AppStateContext } from '@liga/frontend/redux';
import { useFormatAppShortDate, useTranslation } from '@liga/frontend/hooks';
import { Image, TeamBlazon } from '@liga/frontend/components';
import {
  FaArrowDown,
  FaArrowUp,
  FaBolt,
  FaChartBar,
  FaClock,
  FaCrosshairs,
  FaNewspaper,
  FaStar,
} from 'react-icons/fa';
import { getTeamsTierLabel } from './labels';
import { Chart } from 'chart.js/auto';

/** @enum */
enum TabIdentifier {
  OVERVIEW = '/teams',
  ROSTER = '/teams/roster',
  MATCHES = '/teams/matches',
  EVENTS = '/teams/events',
  ACHIEVEMENTS = '/teams/achievements',
  NEWS = '/teams/news',
}

type RankingDivisionOption = {
  label: string;
  tierSlug?: Constants.TierSlug;
};

type TeamPlayer = Awaited<ReturnType<typeof api.players.all<typeof Eagers.player>>>[number];
type Team = Awaited<ReturnType<typeof api.teams.all<typeof Eagers.team>>>[number];
type NewsItem = Awaited<ReturnType<typeof api.news.all>>[number];
type TeamHonor = {
  federationId: number;
  federationSlug: string;
  id: number;
  isMajor: boolean;
  location: string | null;
  organizer: string | null;
  season: number | null;
  tierId: number;
  tierSlug: string;
  title: string;
};

const HONOR_TIER_SLUGS = [
  ...Constants.Awards.filter((award) => award.type === Constants.AwardType.CHAMPION).map(
    (award) => award.target,
  ),
  Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
];

const RankingDivisionOptions: RankingDivisionOption[] = [
  { label: 'All Divisions' },
  { label: 'ESL Pro League', tierSlug: Constants.TierSlug.LEAGUE_PRO },
  { label: 'ESEA Advanced', tierSlug: Constants.TierSlug.LEAGUE_ADVANCED },
  { label: 'ESEA Main', tierSlug: Constants.TierSlug.LEAGUE_MAIN },
  { label: 'ESEA Intermediate', tierSlug: Constants.TierSlug.LEAGUE_INTERMEDIATE },
  { label: 'ESEA Open', tierSlug: Constants.TierSlug.LEAGUE_OPEN },
];

const UnsupportedAsiaOceDivisionSlugs = new Set<Constants.TierSlug>([
  Constants.TierSlug.LEAGUE_MAIN,
  Constants.TierSlug.LEAGUE_INTERMEDIATE,
]);

function isUnsupportedRankingDivision(
  federation: { slug: string } | undefined,
  tierSlug: Constants.TierSlug | undefined,
) {
  if (!tierSlug) {
    return false;
  }

  return (
    (federation?.slug === Constants.FederationSlug.ESPORTS_ASIA ||
      federation?.slug === Constants.FederationSlug.ESPORTS_OCE) &&
    UnsupportedAsiaOceDivisionSlugs.has(tierSlug)
  );
}

function isAwper(player: TeamPlayer) {
  const role = String(player.role).toUpperCase();
  return role === Constants.PlayerRole.SNIPER || role === Constants.UserRole.AWPER;
}

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function parseNewsPayload(item: NewsItem): Record<string, unknown> {
  if (!item.payload) {
    return {};
  }

  try {
    return JSON.parse(item.payload) as Record<string, unknown>;
  } catch (_) {
    return {};
  }
}

function getNewsFlagCode(item: NewsItem) {
  const payload = parseNewsPayload(item);
  return typeof payload.flagCode === 'string' ? payload.flagCode : null;
}

function getNewsTopicLabel(item: NewsItem) {
  if (item.type === 'SHORT') {
    return 'Short';
  }

  return item.topic.charAt(0) + item.topic.slice(1).toLowerCase();
}

function isRelatedTeamNews(item: NewsItem, teamId: number) {
  const relatedTeams = parseNewsPayload(item).relatedTeams;

  return (
    Array.isArray(relatedTeams) &&
    relatedTeams.filter(isRecord).some((relatedTeam) => Number(relatedTeam.id) === teamId)
  );
}

function getCompetitionTitle(competition: {
  location: string | null;
  organizer: string | null;
  season: number | null;
  federation: { slug: string };
  tier: { league: { name: string }; slug: string };
}) {
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
  const region =
    competition.federation.slug === Constants.FederationSlug.ESPORTS_OCE
      ? 'Oceania'
      : competition.federation.slug === Constants.FederationSlug.ESPORTS_ASIA
        ? 'Asia'
        : competition.federation.slug === Constants.FederationSlug.ESPORTS_AMERICAS
          ? 'Americas'
          : competition.federation.slug === Constants.FederationSlug.ESPORTS_EUROPA
            ? 'Europe'
            : city;

  return [displayName, region, year].filter(Boolean).join(' ');
}

function getCompetitionLink(competition: {
  federationId: number;
  season: number | null;
  tier?: { id: number };
  tierId?: number;
}) {
  return `/competitions?federationId=${competition.federationId}&season=${competition.season}&tierId=${competition.tier?.id ?? competition.tierId}`;
}

function MajorHonorBadge() {
  return (
    <span className="absolute right-1 bottom-1 grid size-4 place-items-center rounded-full border border-yellow-300/70 bg-yellow-600/90 text-[8px] text-yellow-100 shadow-sm">
      <FaStar />
    </span>
  );
}

function TeamHonorStrip(props: { honors: TeamHonor[] }) {
  if (!props.honors.length) {
    return null;
  }

  return (
    <section className="border-t border-[#52667a] bg-[#1b262c] px-5 py-1">
      <div className="flex h-14 max-w-full items-center gap-1 overflow-x-auto overflow-y-hidden">
        {props.honors.map((honor) => (
          <Link
            key={`${honor.id}__team_honor`}
            to={getCompetitionLink(honor)}
            className="hover:bg-base-content/5 border-base-content/10 relative flex h-12 w-16 shrink-0 items-center justify-center border-r last:border-r-0"
            title={honor.title}
          >
            <Image
              alt={honor.title}
              className="max-h-10 max-w-14 object-contain drop-shadow"
              src={Util.getCompetitionLogo(honor.tierSlug, honor.federationSlug, {
                location: honor.location,
                organizer: honor.organizer,
              })}
            />
            {honor.isMajor && <MajorHonorBadge />}
          </Link>
        ))}
      </div>
    </section>
  );
}

function TeamRosterHero(props: {
  displayCountry: { code: string; name: string };
  honors: TeamHonor[];
  onPlayerClick: (playerId: number) => void;
  players: TeamPlayer[];
  team: Team;
}) {
  return (
    <section className="border-base-content/10 overflow-hidden border-b">
      <div
        className="border-base-content/10 border-b-4"
        style={{
          backgroundImage:
            'radial-gradient(circle at 15% 0%, rgba(255, 255, 255, 0.05), transparent 30%), radial-gradient(circle at 85% 0%, rgba(255, 255, 255, 0.04), transparent 32%), linear-gradient(to bottom, color-mix(in srgb, var(--color-base-200) 72%, black), var(--color-base-200), color-mix(in srgb, var(--color-base-100) 76%, black))',
        }}
      >
        <div className="relative grid h-34 w-full grid-cols-5 items-end">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/65 to-transparent" />
          {props.players.map((player) => {
            const awper = isAwper(player);

            return (
              <button
                key={`${player.id}__team_roster_hero`}
                type="button"
                title={player.name}
                className="group relative z-10 flex h-34 min-w-0 cursor-pointer appearance-none items-end justify-center overflow-hidden border-0 bg-transparent p-0 text-inherit"
                onClick={() => props.onPlayerClick(player.id)}
              >
                {awper && (
                  <span
                    className="bg-success text-success-content absolute top-1 left-2 z-10 flex size-5 items-center justify-center rounded"
                    title="Main AWPer"
                  >
                    <FaCrosshairs className="size-3" />
                  </span>
                )}
                <img
                  src={player.avatar || 'resources://avatars/empty.png'}
                  className="h-33 w-auto max-w-full object-contain object-bottom drop-shadow-2xl transition-transform group-hover:scale-105"
                />
                <span className="absolute inset-x-0 bottom-0 flex h-6 items-center justify-center gap-1 px-1 text-xs font-bold text-white">
                  <span className={cx('fp shrink-0', player.country.code.toLowerCase())} />
                  <span className="truncate drop-shadow">{player.name}</span>
                </span>
              </button>
            );
          })}
          {!props.players.length &&
            [...Array(Constants.GameSettings.SQUAD_STARTERS_NUM)].map((_, index) => (
              <div
                key={`${index}__team_roster_placeholder`}
                className="relative z-10 flex h-34 min-w-0 items-end justify-center overflow-hidden"
              >
                <img
                  src="resources://avatars/empty.png"
                  className="h-31 w-auto object-contain object-bottom opacity-45"
                />
              </div>
            ))}
        </div>
      </div>
      <section className="bg-base-200/85">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-3">
          <section className="flex min-w-0 items-center gap-3">
            <TeamBlazon
              alt={props.team.name}
              src={props.team.blazon}
              className="size-14 shrink-0"
            />
            <article className="min-w-0">
              <p className="mb-1 truncate text-sm opacity-70" title={props.displayCountry.name}>
                <span className={cx('fp', props.displayCountry.code.toLowerCase())} />
                &nbsp;{props.displayCountry.name}
              </p>
              <h3 className="truncate text-xl leading-tight font-bold" title={props.team.name}>
                {props.team.name}
              </h3>
            </article>
          </section>
        </div>
        <TeamHonorStrip honors={props.honors} />
      </section>
    </section>
  );
}

function TeamNewsList(props: {
  fmtShortDate: (date: Date | string) => string;
  items: NewsItem[];
  onOpen: (articleId: number) => void;
}) {
  return (
    <section className="divide-base-content/10 divide-y">
      {!props.items.length && (
        <article className="center h-48 gap-3 px-6 text-center">
          <FaNewspaper className="text-muted size-14" />
          <p className="text-muted text-sm">No related stories yet.</p>
        </article>
      )}
      {props.items.map((item) => {
        const flagCode = getNewsFlagCode(item);

        return (
          <article
            key={`${item.id}__team_news`}
            className="hover:bg-base-content/5 cursor-pointer p-4"
            onClick={() => props.onOpen(item.id)}
          >
            <header className="relative pr-4">
              {!item.read && <span className="badge-xxs badge badge-info absolute top-1 right-0" />}
              <div className="text-base-content/60 mb-2 flex min-w-0 items-center gap-2 text-xs font-bold uppercase">
                {item.type === 'SHORT' ? (
                  <FaBolt className="shrink-0" />
                ) : (
                  <FaNewspaper className="shrink-0" />
                )}
                {flagCode && <span className={cx('fp shrink-0', flagCode.toLowerCase())} />}
                <span className="truncate">{getNewsTopicLabel(item)}</span>
                <span className="flex shrink-0 items-center gap-1">
                  <FaClock />
                  {props.fmtShortDate(toDate(item.publishedAt))}
                </span>
              </div>
              <p className="leading-tight font-bold">{item.headline}</p>
            </header>
            <footer>
              <p className="line-clamp-2 pt-2 text-sm opacity-70">{item.summary}</p>
            </footer>
          </article>
        );
      })}
    </section>
  );
}

function TeamRightRail(props: {
  fmtShortDate: (date: Date | string) => string;
  matches: Awaited<ReturnType<typeof api.matches.previous<typeof Eagers.match>>>;
  team: Team;
  worldRanking: number;
  leagueHistory: Awaited<ReturnType<typeof api.competitions.all<typeof Eagers.competition>>>;
}) {
  const chartRef = React.useRef<HTMLCanvasElement>(null);
  const recentMatches = props.matches
    .filter((match) => match.competitors.some((competitor) => competitor.teamId !== props.team.id))
    .slice(0, 5);
  const wins = recentMatches.filter(
    (match) =>
      match.competitors.find((competitor) => competitor.teamId === props.team.id)?.result ===
      Constants.MatchResult.WIN,
  ).length;
  const hasMovement =
    props.team.elo < 2000 && recentMatches.length > 0 && wins !== recentMatches.length - wins;
  const improving = hasMovement && wins > recentMatches.length - wins;

  React.useEffect(() => {
    if (!chartRef.current) return;
    const seasons = [...new Set(props.leagueHistory.map((entry) => entry.season))].sort(
      (a, b) => a - b,
    );
    const federationSlug = props.team.country.continent?.federation?.slug as
      | Constants.FederationSlug
      | undefined;
    const restrictedRegion =
      federationSlug === Constants.FederationSlug.ESPORTS_ASIA ||
      federationSlug === Constants.FederationSlug.ESPORTS_OCE;
    const prestige = restrictedRegion
      ? Constants.Prestige.filter(
          (tier) =>
            tier !== Constants.TierSlug.LEAGUE_MAIN &&
            tier !== Constants.TierSlug.LEAGUE_INTERMEDIATE,
        )
      : Constants.Prestige;
    const chart = new Chart(chartRef.current, {
      type: 'line',
      data: {
        labels: seasons.map((season) => `S${season}`),
        datasets: [
          {
            data: seasons.map((season) => {
              const seasonEntries = props.leagueHistory.filter((item) => item.season === season);
              return Math.max(
                0,
                ...seasonEntries.map((entry) =>
                  prestige.indexOf(entry.tier.slug as Constants.TierSlug),
                ),
              );
            }),
            borderColor: '#8fb8df',
            backgroundColor: '#8fb8df',
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 4,
            pointBackgroundColor: '#8fb8df',
            pointBorderColor: '#8fb8df',
            tension: 0,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: {
            border: { dash: [5, 5], display: false },
            offset: true,
            ticks: { color: '#6f8294' },
            grid: { color: 'rgba(143, 184, 223, 0.12)' },
          },
          y: {
            afterBuildTicks: (axis) => {
              axis.ticks = prestige.map((_, value) => ({ value })) as typeof axis.ticks;
            },
            max: prestige.length - 0.5,
            min: -0.5,
            ticks: {
              autoSkip: false,
              color: '#6f8294',
              includeBounds: true,
              count: prestige.length,
              callback: (value: number | string) =>
                getTeamsTierLabel(prestige[Math.round(Number(value))]),
              stepSize: 1,
            },
            grid: { color: 'rgba(143, 184, 223, 0.12)' },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [props.leagueHistory]);

  return (
    <aside className="min-w-0 overflow-y-auto p-4">
      <section className="border-base-content/10 bg-base-200/45 mb-3 border">
        <header className="border-base-content/10 flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-base font-bold">World Ranking</h2>
        </header>
        <div className="divide-base-content/10 grid grid-cols-2 divide-x px-4 py-5">
          <div>
            <p className="text-3xl font-black">#{props.worldRanking || '-'}</p>
            <p className="text-muted text-xs">World ranking</p>
          </div>
          <div className="pl-4">
            <p className="flex items-center gap-2 text-3xl font-black">
              {props.team.elo}
              {hasMovement && (
                <span
                  className={improving ? 'text-success' : 'text-error'}
                  title={improving ? 'Gaining points' : 'Losing points'}
                >
                  {improving ? (
                    <FaArrowUp className="size-4" />
                  ) : (
                    <FaArrowDown className="size-4" />
                  )}
                </span>
              )}
            </p>
            <p className="text-muted text-xs">Points</p>
          </div>
        </div>
      </section>

      <section className="border-base-content/10 bg-base-200/45 mb-3 border">
        <header className="border-base-content/10 border-b px-4 py-3">
          <h2 className="text-base font-bold">Last 5 Matches</h2>
        </header>
        <div className="divide-base-content/10 grid grid-cols-5 divide-x">
          {recentMatches.map((match) => {
            const opponent = match.competitors.find(
              (competitor) => competitor.teamId !== props.team.id,
            );
            const result = match.competitors.find(
              (competitor) => competitor.teamId === props.team.id,
            )?.result;
            return (
              <div
                key={`${match.id}__rail_match`}
                className="flex min-w-0 flex-col items-center gap-1 px-2 py-5 text-center"
              >
                <TeamBlazon src={opponent?.team.blazon} className="size-12 shrink-0" />
                <span className="w-full truncate text-xs">{opponent?.team.name || 'BYE'}</span>
                <span
                  className={cx(
                    'badge badge-xs text-[9px] font-bold',
                    result === Constants.MatchResult.WIN ? 'badge-success' : 'badge-error',
                  )}
                >
                  {result === Constants.MatchResult.WIN ? 'W' : 'L'}
                </span>
              </div>
            );
          })}
          {!recentMatches.length && (
            <p className="text-muted col-span-5 p-4 text-sm">No recent matches.</p>
          )}
        </div>
      </section>

      <section className="border-base-content/10 bg-base-200/45 border">
        <header className="border-base-content/10 border-b px-4 py-3">
          <h2 className="text-base font-bold">League History</h2>
        </header>
        <div className="h-56 p-3">
          {props.leagueHistory.length ? (
            <canvas ref={chartRef} />
          ) : (
            <p className="text-muted p-4 text-sm">No league history.</p>
          )}
        </div>
      </section>
    </aside>
  );
}

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const t = useTranslation('windows');
  const fmtShortDate = useFormatAppShortDate();
  const { state } = React.useContext(AppStateContext);
  const [federations, setFederations] = React.useState<
    Awaited<ReturnType<typeof api.federations.all>>
  >([]);
  const [teams, setTeams] = React.useState<
    Awaited<ReturnType<typeof api.teams.all<typeof Eagers.team>>>
  >([]);
  const [team, setTeam] = React.useState<(typeof teams)[number]>();
  const [competition, setCompetition] =
    React.useState<Awaited<ReturnType<typeof api.competitions.find<typeof Eagers.competition>>>>();
  const [standingMatches, setStandingMatches] = React.useState<
    Awaited<ReturnType<typeof api.matches.all<typeof Eagers.match>>>
  >([]);
  const [teamNewsItems, setTeamNewsItems] = React.useState<NewsItem[]>([]);
  const [teamHonors, setTeamHonors] = React.useState<TeamHonor[]>([]);
  const [worldRanking, setWorldRanking] = React.useState(0);
  const [recentMatches, setRecentMatches] = React.useState<
    Awaited<ReturnType<typeof api.matches.previous<typeof Eagers.match>>>
  >([]);
  const [leagueHistory, setLeagueHistory] = React.useState<
    Awaited<ReturnType<typeof api.competitions.all<typeof Eagers.competition>>>
  >([]);
  const [squad, setSquad] = React.useState<TeamPlayer[]>([]);
  const [rankings, setRankings] = React.useState<typeof teams>([]);
  const [selectedRankingFederationId, setSelectedRankingFederationId] = React.useState<number>();
  const [selectedRankingTierSlug, setSelectedRankingTierSlug] =
    React.useState<Constants.TierSlug>();
  const [teamSearch, setTeamSearch] = React.useState('');
  const [showCompleteRanking, setShowCompleteRanking] = React.useState(false);
  const requestedTeamId = React.useMemo(() => {
    const teamId = Number(searchParams.get('teamId'));
    return Number.isInteger(teamId) && teamId > 0 ? teamId : undefined;
  }, [searchParams]);

  const displayCountry = React.useMemo(
    () =>
      team ? Util.getTeamDisplayCountry({ ...team, players: squad }) : Util.OTHER_TEAM_COUNTRY,
    [squad, team],
  );

  const activeLineup = React.useMemo(
    () =>
      [...squad]
        .filter((player) => player.starter === true)
        .sort((a, b) => Number(b.starter) - Number(a.starter) || (b.xp ?? 0) - (a.xp ?? 0))
        .slice(0, Constants.GameSettings.SQUAD_STARTERS_NUM),
    [squad],
  );
  const userTeam = React.useMemo(
    () =>
      !!competition && competition.competitors.find((competitor) => competitor.teamId === team?.id),
    [competition, team],
  );
  const standingsGroup = React.useMemo(
    () =>
      competition
        ? competition.competitors.filter(
            (competitor) => competitor.group === (userTeam?.group || 1),
          )
        : [],
    [competition, userTeam],
  );
  const standingsCompetitionLabel = React.useMemo(
    () =>
      competition ? getTeamsTierLabel(competition.tier.slug, competition.tier.league?.name) : '',
    [competition],
  );
  const divisionLabel = React.useMemo(
    () => getTeamsTierLabel(competition?.tier.slug, competition?.tier.league?.name),
    [competition],
  );
  const hasStandingsTable = React.useMemo(
    () =>
      Boolean(
        competition &&
          standingsGroup.length &&
          (competition.tier.groupSize ||
            Constants.TierSwissConfig[competition.tier.slug as Constants.TierSlug]),
      ),
    [competition, standingsGroup.length],
  );

  const openPlayerTransferModal = React.useCallback((playerId: number) => {
    api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
      target: '/transfer',
      payload: playerId,
    });
  }, []);

  const openNewsArticle = React.useCallback(
    (articleId: number) => {
      navigate('/news', { state: { articleId } });
    },
    [navigate],
  );

  const rankingFederations = React.useMemo(
    () => [...federations].sort((a, b) => a.id - b.id),
    [federations],
  );

  const selectedRankingFederation = React.useMemo(
    () => federations.find((federation) => federation.id === selectedRankingFederationId),
    [federations, selectedRankingFederationId],
  );

  const selectedRankingTier = React.useMemo(() => {
    if (!selectedRankingTierSlug) {
      return undefined;
    }

    const tier = Constants.Prestige.findIndex((tierSlug) => tierSlug === selectedRankingTierSlug);
    return tier >= 0 ? tier : undefined;
  }, [selectedRankingTierSlug]);

  const rankingDivisionOptions = React.useMemo(() => {
    if (!isUnsupportedRankingDivision(selectedRankingFederation, Constants.TierSlug.LEAGUE_MAIN)) {
      return RankingDivisionOptions;
    }

    return RankingDivisionOptions.filter(
      (option) => !option.tierSlug || !UnsupportedAsiaOceDivisionSlugs.has(option.tierSlug),
    );
  }, [selectedRankingFederation]);

  const selectRankingFederation = React.useCallback(
    (federation?: (typeof federations)[number]) => {
      setSelectedRankingFederationId(federation?.id);

      if (isUnsupportedRankingDivision(federation, selectedRankingTierSlug)) {
        setSelectedRankingTierSlug(undefined);
      }
    },
    [selectedRankingTierSlug],
  );

  const searchedTeams = React.useMemo(() => {
    const search = teamSearch.trim().toLowerCase();
    if (!search) {
      return [];
    }

    return teams
      .filter((team) => team.name.toLowerCase().includes(search))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 12);
  }, [teamSearch, teams]);

  // initial data fetch
  React.useEffect(() => {
    api.federations.all().then(setFederations);
    api.teams.all<typeof Eagers.team>(Eagers.team).then(setTeams);
  }, []);

  React.useEffect(() => {
    api.teams
      .all<typeof Eagers.team>({
        ...Eagers.team,
        orderBy: {
          elo: 'desc',
        },
        where: {
          tier: {
            not: null,
          },
          ...(Number.isInteger(selectedRankingFederationId)
            ? { competitionFederationId: selectedRankingFederationId }
            : {}),
          ...(Number.isInteger(selectedRankingTier) ? { tier: selectedRankingTier } : {}),
        },
      })
      .then(setRankings);
  }, [selectedRankingFederationId, selectedRankingTier]);

  React.useEffect(() => {
    setSquad([]);
    setCompetition(undefined);
    setStandingMatches([]);
    setTeamNewsItems([]);
    setTeamHonors([]);
    setWorldRanking(0);
    setRecentMatches([]);
    setLeagueHistory([]);

    if (!team) {
      return;
    }

    api.competitions
      .find({
        ...Eagers.competition,
        where: {
          tier: {
            slug: Constants.Prestige[team.tier],
          },
          competitors: {
            some: {
              teamId: team.id,
            },
          },
        },
        orderBy: {
          season: 'desc',
        },
      })
      .then(setCompetition);
    api.players
      .all({
        include: {
          ...Eagers.player.include,
          country: {
            include: {
              continent: true,
            },
          },
        },
        where: {
          teamId: team.id,
        },
      })
      .then(setSquad);
    api.news
      .all()
      .then((items) => setTeamNewsItems(items.filter((item) => isRelatedTeamNews(item, team.id))));
    api.team.worldRanking(team.id).then(setWorldRanking);
    // Fetch a buffer because the rail removes byes/incomplete opponent records
    // before selecting the five matches it displays.
    api.matches.previous(Eagers.match, team.id, 12).then(setRecentMatches);
    api.competitions
      .all({
        ...Eagers.competition,
        where: { competitors: { some: { teamId: team.id } } },
        orderBy: [{ season: 'desc' }, { id: 'desc' }],
      })
      .then((items) =>
        setLeagueHistory(
          items.filter((item) => Constants.Prestige.includes(item.tier.slug as Constants.TierSlug)),
        ),
      );
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
        };
      }>({
        where: {
          status: Constants.CompetitionStatus.COMPLETED,
          tier: {
            slug: { in: HONOR_TIER_SLUGS },
          },
          competitors: {
            some: {
              position: 1,
              teamId: team.id,
            },
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
        },
        orderBy: [{ season: 'desc' }, { id: 'desc' }],
      })
      .then((competitions) =>
        setTeamHonors(
          competitions.map((competition) => ({
            federationSlug: competition.federation.slug,
            federationId: competition.federationId,
            tierId: competition.tier.id,
            id: competition.id,
            isMajor: Util.isMajorStageTier(competition.tier.slug),
            location: competition.location,
            organizer: competition.organizer,
            season: competition.season,
            tierSlug: competition.tier.slug,
            title: getCompetitionTitle(competition),
          })),
        ),
      );
  }, [team]);

  React.useEffect(() => {
    setStandingMatches([]);

    if (
      !competition ||
      (!competition.tier.groupSize &&
        !Constants.TierSwissConfig[competition.tier.slug as Constants.TierSlug])
    ) {
      return;
    }

    api.matches
      .all({
        include: Eagers.match.include,
        orderBy: [{ round: 'asc' }, { date: 'asc' }, { id: 'asc' }],
        where: {
          competitionId: competition.id,
        },
      })
      .then(setStandingMatches);
  }, [competition]);

  React.useEffect(() => {
    if (
      selectedRankingTierSlug &&
      !rankingDivisionOptions.some((option) => option.tierSlug === selectedRankingTierSlug)
    ) {
      setSelectedRankingTierSlug(undefined);
    }
  }, [rankingDivisionOptions, selectedRankingTierSlug]);

  // preload the user's team
  React.useEffect(() => {
    if (!state.profile || !teams.length || team) {
      return;
    }

    setTeam(teams.find((tteam) => tteam.id === state.profile.teamId));
  }, [state.profile, teams, team]);

  // load team from query params
  React.useEffect(() => {
    if (!Number.isInteger(requestedTeamId) || !teams.length) {
      return;
    }

    const matched = teams.find((tteam) => tteam.id === requestedTeamId);
    if (matched) {
      setTeam(matched);
    }
  }, [requestedTeamId, teams]);

  // fallback: auto-select world #1 team when teamless
  React.useEffect(() => {
    // only run after main data loads
    if (!teams.length || team) {
      return;
    }

    if (Number.isInteger(requestedTeamId) && teams.some((tteam) => tteam.id === requestedTeamId)) {
      return;
    }

    // user has no team → pick world #1
    if (!state.profile?.teamId) {
      const sorted = [...teams].sort((a, b) => b.elo - a.elo); // highest elo first
      if (sorted.length > 0) {
        setTeam(sorted[0]);
      }
    }
  }, [state.profile, teams, team, requestedTeamId]);

  return (
    <div className="dashboard">
      <main>
        <section>
          <article className="stack-y">
            <input
              className="input input-bordered w-full rounded-lg"
              placeholder="Search teams"
              value={teamSearch}
              onChange={(event) => setTeamSearch(event.target.value)}
            />
            <footer className="max-h-64 overflow-y-auto">
              <table className="table-xs table table-fixed">
                <tbody>
                  {searchedTeams.map((teamSearchResult) => (
                    <tr
                      key={teamSearchResult.id + '__search'}
                      data-interaction-hover-sound="none"
                      className={cx(
                        'cursor-pointer',
                        teamSearchResult.id === team?.id && 'bg-base-content/10',
                      )}
                      onClick={() => setTeam(teamSearchResult)}
                    >
                      <td className="w-10 px-0">
                        <TeamBlazon
                          src={teamSearchResult.blazon}
                          title={teamSearchResult.name}
                          className="mx-auto size-8"
                          blur="blur-xs"
                        />
                      </td>
                      <td className="truncate">{teamSearchResult.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </footer>
          </article>
          <article className="stack-y gap-0!">
            <header className="prose">
              <h2 className="text-sm tracking-wide uppercase">World ranking</h2>
            </header>
            <nav className="grid grid-cols-5 gap-1 p-2">
              <button
                type="button"
                className={cx(
                  'btn border-base-content/10 h-8 rounded-lg border px-2 text-xs font-semibold shadow-none',
                  !Number.isInteger(selectedRankingFederationId)
                    ? 'btn-primary'
                    : 'btn-ghost bg-base-200 hover:bg-base-300',
                )}
                onClick={() => selectRankingFederation(undefined)}
              >
                World
              </button>
              {rankingFederations
                .filter((federation) => federation.slug !== Constants.FederationSlug.ESPORTS_WORLD)
                .map((federation) => (
                  <button
                    type="button"
                    key={federation.id + '__ranking_filter'}
                    className={cx(
                      'btn border-base-content/10 h-8 rounded-lg border px-2 text-xs font-semibold shadow-none',
                      selectedRankingFederationId === federation.id
                        ? 'btn-primary'
                        : 'btn-ghost bg-base-200 hover:bg-base-300',
                    )}
                    onClick={() => selectRankingFederation(federation)}
                  >
                    {federation.slug === Constants.FederationSlug.ESPORTS_OCE
                      ? 'OCE'
                      : federation.name}
                  </button>
                ))}
            </nav>
            <div className="p-2 pt-0">
              <select
                aria-label="Ranking division"
                className="select select-bordered bg-base-200 border-base-content/10 h-10 w-full rounded-lg font-semibold shadow-none"
                value={selectedRankingTierSlug ?? ''}
                onChange={(event) =>
                  setSelectedRankingTierSlug(
                    (event.target.value || undefined) as Constants.TierSlug | undefined,
                  )
                }
              >
                {rankingDivisionOptions.map((option) => (
                  <option
                    key={`${option.tierSlug ?? 'all'}__ranking_division_filter`}
                    value={option.tierSlug ?? ''}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <footer className="px-2 pb-2">
              {rankings.slice(0, showCompleteRanking ? undefined : 30).map((teamRank) => {
                const rank = rankings.findIndex((entry) => entry.id === teamRank.id) + 1;
                const isSelected = teamRank.id === team?.id;

                return (
                  <button
                    key={teamRank.id + '__ranking'}
                    type="button"
                    data-interaction-hover-sound="none"
                    className={cx(
                      'border-base-content/10 flex w-full items-center gap-2 border-b px-1 py-4 text-left',
                      'hover:bg-base-content/5',
                      isSelected && 'border-l-4 border-l-[#ff795b] bg-[#20303b] pl-0',
                    )}
                    onClick={() => setTeam(teamRank)}
                  >
                    {isSelected ? (
                      <span className="flex min-h-24 min-w-0 flex-1 items-center gap-3 px-2 py-5">
                        <TeamBlazon
                          src={teamRank.blazon}
                          title={teamRank.name}
                          className="size-8"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="text-base-content/80 block text-sm font-bold">
                            #{rank}
                          </span>
                          <span className="block truncate text-base font-bold">
                            {teamRank.name}
                          </span>
                          <span className="text-muted block truncate text-xs">
                            {displayCountry.name} &bull; {divisionLabel || 'Unranked division'}
                          </span>
                        </span>
                        <span className="text-right">
                          <span className="text-base-content block text-xl font-bold">
                            {teamRank.elo}
                          </span>
                          <span className="text-muted text-[10px] uppercase">Points</span>
                        </span>
                      </span>
                    ) : (
                      <>
                        <span className="text-base-content/70 w-8 text-sm font-semibold">
                          #{rank}
                        </span>
                        <TeamBlazon
                          src={teamRank.blazon}
                          title={teamRank.name}
                          className="size-5"
                        />
                        <span className="min-w-0 flex-1 truncate font-semibold">
                          {teamRank.name}
                        </span>
                        <span className="text-base-content/80 text-base font-semibold">
                          {teamRank.elo}
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
              {!showCompleteRanking && rankings.length > 30 && (
                <button
                  type="button"
                  className="btn btn-ghost border-base-content/10 bg-base-200 mt-2 w-full justify-between rounded border text-left font-semibold"
                  onClick={() => setShowCompleteRanking(true)}
                >
                  Show complete ranking <span aria-hidden="true">&rsaquo;</span>
                </button>
              )}
            </footer>
          </article>
        </section>
        {!team && (
          <section className="center h-full">
            <span className="loading loading-bars" />
          </section>
        )}
        {!!team && (
          <section className="divide-base-content/10 grid h-full w-full grid-cols-[minmax(0,2fr)_minmax(0,1fr)] divide-x overflow-hidden">
            <section className="flex min-w-0 flex-col overflow-y-auto">
              <TeamRosterHero
                displayCountry={displayCountry}
                honors={teamHonors}
                onPlayerClick={openPlayerTransferModal}
                players={activeLineup}
                team={team}
              />
              <nav className="border-base-content/10 bg-base-100/70 border-b">
                <div className="flex w-full">
                  <button
                    className={cx(
                      'btn hover:bg-base-200 flex-1 rounded-none border-0 font-normal shadow-none',
                      location.pathname === TabIdentifier.ROSTER && 'btn-active!',
                    )}
                    onClick={() => navigate(TabIdentifier.ROSTER)}
                  >
                    Roster
                  </button>
                  <button
                    className={cx(
                      'btn hover:bg-base-200 flex-1 rounded-none border-0 font-normal shadow-none',
                      location.pathname === TabIdentifier.MATCHES && 'btn-active!',
                    )}
                    onClick={() => navigate(TabIdentifier.MATCHES)}
                  >
                    Matches
                  </button>
                  <button
                    className={cx(
                      'btn hover:bg-base-200 flex-1 rounded-none border-0 font-normal shadow-none',
                      location.pathname === TabIdentifier.EVENTS && 'btn-active!',
                    )}
                    onClick={() => navigate(TabIdentifier.EVENTS)}
                  >
                    Events
                  </button>
                  <button
                    className={cx(
                      'btn hover:bg-base-200 flex-1 rounded-none border-0 font-normal shadow-none',
                      location.pathname === TabIdentifier.ACHIEVEMENTS && 'btn-active!',
                    )}
                    onClick={() => navigate(TabIdentifier.ACHIEVEMENTS)}
                  >
                    Achievements
                  </button>
                  <button
                    className={cx(
                      'btn hover:bg-base-200 flex-1 rounded-none border-0 font-normal shadow-none',
                      location.pathname === TabIdentifier.NEWS && 'btn-active!',
                    )}
                    onClick={() => navigate(TabIdentifier.NEWS)}
                  >
                    News
                  </button>
                </div>
              </nav>
              <section className="min-h-0 w-full flex-1 overflow-y-auto">
                <Outlet context={{ team } satisfies RouteContextTeams} />
              </section>
            </section>
            <TeamRightRail
              fmtShortDate={fmtShortDate}
              leagueHistory={leagueHistory}
              matches={recentMatches}
              team={team}
              worldRanking={worldRanking}
            />
          </section>
        )}
      </main>
    </div>
  );
}
