/**
 * News route showing generated LIGA newsroom items.
 *
 * @module
 */
import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import { Link, useLocation } from 'react-router-dom';
import { Constants, Eagers, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { useFormatAppDate } from '@liga/frontend/hooks/use-FormatAppDate';
import { Pagination } from '@liga/frontend/components';
import {
  FaBolt,
  FaCheckDouble,
  FaClock,
  FaFlask,
  FaNewspaper,
  FaSyncAlt,
  FaTrash,
} from 'react-icons/fa';

type NewsItem = Awaited<ReturnType<typeof api.news.all>>[number];
type NewsTopic = NewsItem['topic'] | 'ALL' | 'SHORTS';
type NewsRouteState = {
  articleId?: number;
};
type RelatedTeam = {
  id: number;
  name?: string | null;
  blazon?: string | null;
};
type RelatedPlayer = {
  id: number;
  name?: string | null;
  avatar?: string | null;
  flagCode?: string | null;
};
type NewsComment = {
  id: number;
  author: string;
  flagCode?: string | null;
  message: string;
  score: number;
};
type MapUsageDatum = {
  color?: string | null;
  map?: string | null;
  name?: string | null;
  plays?: number | null;
};
type TopPlayerRankingEntry = {
  analysis?: string | null;
  bigEventMaps?: number | null;
  flagCode?: string | null;
  maps?: number | null;
  playerAvatar?: string | null;
  playerId?: number | null;
  playerName?: string | null;
  rank?: number | null;
  rating?: number | null;
  teamName?: string | null;
};

const mapIconImagesContext = (require as any).context(
  '../../assets/faceit',
  false,
  /^\.\/[a-z0-9]+\.png$/,
);
const mapIconImages = (mapIconImagesContext.keys() as string[]).reduce(
  (acc: Record<string, string>, key: string) => {
    const iconName = key.replace('./', '').replace(/\.png$/, '');
    const loadedIcon = mapIconImagesContext(key);
    acc[iconName] = typeof loadedIcon === 'string' ? loadedIcon : loadedIcon?.default || '';
    return acc;
  },
  {},
);

type WelcomeGraphic = {
  aspectRatio?: string | null;
  avatar?: string | null;
  avatarLayout?: {
    bottom?: string | null;
    height?: string | null;
    left?: string | null;
    maxWidth?: string | null;
  } | null;
  fontFamily?: string | null;
  fontSize?: string | null;
  fontStyle?: string | null;
  letterSpacing?: string | null;
  nameLayout?: {
    left?: string | null;
    top?: string | null;
    width?: string | null;
  } | null;
  playerName?: string | null;
  rotate?: string | null;
  skewX?: string | null;
  teamSlug?: string | null;
  template?: string | null;
  textColor?: string | null;
  textGradient?: string | null;
  textShadow?: boolean | null;
  textStroke?: string | null;
};
type MvpGraphic = {
  medal?: string | null;
  playerImage?: string | null;
  tournamentLogo?: string | null;
};
type NewsPayload = Record<string, unknown> & {
  comments?: NewsComment[];
  competitionId?: number | null;
  flagCode?: string | null;
  hideArticleImage?: boolean;
  mapUsage?: MapUsageDatum[];
  matchId?: number | null;
  qualifiedTeams?: RelatedTeam[] & Array<{ flagCode?: string | null }>;
  ranking?: TopPlayerRankingEntry[];
  relatedPlayers?: RelatedPlayer[];
  relatedTeams?: RelatedTeam[];
  showMatchPanel?: boolean;
  mvpGraphic?: MvpGraphic | null;
  welcomeGraphic?: WelcomeGraphic | null;
};
type PlayerHoverStats = Awaited<ReturnType<typeof api.matches.playerAllTimeStats>>;
type HoverPlayer = {
  age?: number | null;
  avatar?: string | null;
  country?: { code?: string | null; name?: string | null } | null;
  id: number;
  name: string;
  starter?: boolean | null;
  team?: { blazon?: string | null; id: number; name: string } | null;
};
type HoverTeam = {
  blazon?: string | null;
  country?: { code?: string | null; name?: string | null } | null;
  id: number;
  name: string;
  players?: Array<{
    country?: { code?: string | null; name?: string | null } | null;
    id: number;
    name: string;
    starter?: boolean | null;
  }>;
};
type HoverCompetition = {
  federation?: { slug?: string | null } | null;
  id: number;
  location?: string | null;
  organizer?: string | null;
  season: number;
  tier: {
    lan?: boolean | null;
    league?: { name?: string | null } | null;
    name?: string | null;
    slug?: string | null;
  };
  matches?: Array<{ date: Date | string }>;
};
type PlayerHoverCacheEntry = {
  loaded: boolean;
  player: HoverPlayer | null;
  stats: PlayerHoverStats;
};
type TeamHoverCacheEntry = {
  loaded: boolean;
  rank: number | null;
  team: HoverTeam | null;
};
type CompetitionHoverCacheEntry = {
  competition: HoverCompetition | null;
  loaded: boolean;
};

const FILTERS: Array<{ label: string; value: NewsTopic }> = [
  { label: 'Top Stories', value: 'ALL' },
  { label: 'Transfers', value: 'TRANSFERS' },
  { label: 'Shorts', value: 'SHORTS' },
];
const NEWS_ITEMS_PER_PAGE = 8;
const playerHoverCache = new Map<number, PlayerHoverCacheEntry>();
const playerHoverRequests = new Map<number, Promise<PlayerHoverCacheEntry>>();
const teamHoverCache = new Map<number, TeamHoverCacheEntry>();
const teamHoverRequests = new Map<number, Promise<TeamHoverCacheEntry>>();
const competitionHoverCache = new Map<number, CompetitionHoverCacheEntry>();
const competitionHoverRequests = new Map<number, Promise<CompetitionHoverCacheEntry>>();

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function parsePayload(item: NewsItem): NewsPayload {
  if (!item.payload) {
    return {};
  }

  try {
    return JSON.parse(item.payload) as NewsPayload;
  } catch (_) {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function asRelatedTeams(value: unknown): RelatedTeam[] {
  return Array.isArray(value)
    ? value
        .filter(isRecord)
        .map((item) => ({
          id: Number(item.id),
          name: typeof item.name === 'string' ? item.name : null,
          blazon: typeof item.blazon === 'string' ? item.blazon : null,
        }))
        .filter((item) => Number.isFinite(item.id))
    : [];
}

function asRelatedPlayers(value: unknown): RelatedPlayer[] {
  return Array.isArray(value)
    ? value
        .filter(isRecord)
        .map((item) => ({
          id: Number(item.id),
          name: typeof item.name === 'string' ? item.name : null,
          avatar: typeof item.avatar === 'string' ? item.avatar : null,
          flagCode: typeof item.flagCode === 'string' ? item.flagCode : null,
        }))
        .filter((item) => Number.isFinite(item.id))
    : [];
}

function asComments(value: unknown): NewsComment[] {
  return Array.isArray(value)
    ? value
        .filter(isRecord)
        .map((item, index) => ({
          id: Number.isFinite(Number(item.id)) ? Number(item.id) : index + 1,
          author: typeof item.author === 'string' ? item.author : `user${index + 1}`,
          flagCode: typeof item.flagCode === 'string' ? item.flagCode : null,
          message: typeof item.message === 'string' ? item.message : '',
          score: Number.isFinite(Number(item.score)) ? Number(item.score) : 0,
        }))
        .filter((item) => item.message.trim())
    : [];
}

function asTopPlayerRanking(value: unknown): TopPlayerRankingEntry[] {
  return Array.isArray(value)
    ? value
        .filter(isRecord)
        .map((item) => ({
          analysis: typeof item.analysis === 'string' ? item.analysis : null,
          bigEventMaps: Number.isFinite(Number(item.bigEventMaps))
            ? Number(item.bigEventMaps)
            : null,
          flagCode: typeof item.flagCode === 'string' ? item.flagCode : null,
          maps: Number.isFinite(Number(item.maps)) ? Number(item.maps) : null,
          playerAvatar: typeof item.playerAvatar === 'string' ? item.playerAvatar : null,
          playerId: Number.isFinite(Number(item.playerId)) ? Number(item.playerId) : null,
          playerName: typeof item.playerName === 'string' ? item.playerName : null,
          rank: Number.isFinite(Number(item.rank)) ? Number(item.rank) : null,
          rating: Number.isFinite(Number(item.rating)) ? Number(item.rating) : null,
          teamName: typeof item.teamName === 'string' ? item.teamName : null,
        }))
        .filter((item) => item.rank && item.playerId)
    : [];
}

function getFlagCode(item: NewsItem) {
  const payload = parsePayload(item);
  return typeof payload.flagCode === 'string' ? payload.flagCode : null;
}

function Flag(props: { code?: string | null; className?: string }) {
  if (!props.code) {
    return null;
  }

  return <span className={cx('fp shrink-0', props.code.toLocaleLowerCase(), props.className)} />;
}

function formatHoverStat(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '-';
}

function getCompetitionHoverName(competition?: HoverCompetition | null, fallback = 'Tournament') {
  if (!competition) {
    return fallback;
  }

  const hostedName = Util.getHostedEventDisplayName(competition.tier.slug, competition.location);
  const rawName =
    hostedName ||
    (Util.isMajorStageTier(competition.tier.slug)
      ? Util.getMajorEventDisplayName(competition.location, competition.organizer)
      : Util.getCompetitionDisplayName(competition.tier.league?.name, competition.tier.slug) ||
        competition.tier.name ||
        competition.tier.league?.name ||
        fallback);

  return rawName.replace(/\s+Playoffs\b/gi, '').trim();
}

function formatHoverDate(value?: Date | string | null) {
  if (!value) {
    return '-';
  }

  const date = toDate(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
}

function getNodeText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getNodeText).join('');
  }

  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return getNodeText(node.props.children);
  }

  return '';
}

function preserveMarkdownUri(uri: string) {
  return uri;
}

function getCompetitionIdFromHref(href?: string | null) {
  if (!href) {
    return null;
  }

  if (href.startsWith('liga-competition:')) {
    const competitionId = Number(href.replace('liga-competition:', ''));
    return Number.isFinite(competitionId) ? competitionId : null;
  }

  const [, query = ''] = href.split('?');
  const competitionId = Number(new URLSearchParams(query).get('competitionId'));
  return Number.isFinite(competitionId) ? competitionId : null;
}

function isCompetitionHref(href?: string | null) {
  if (!href) {
    return false;
  }

  return href.startsWith('liga-competition:') || href.split('?')[0] === '/competitions';
}

function normalizeStrongMarkdownLinks(value: string) {
  return value.replace(/\*\*\[([^\]]+)\]\(([^)]+)\)\*\*/g, '[**$1**]($2)');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getHeadlineTournamentName(headline: string) {
  const match =
    headline.match(/\b(?:at|of)\s+(.+?)$/i) ||
    headline.match(
      /\b(?:named|wins|claims|earns|crowned|takes home|secures|voted|lands|awarded|collects|picks up|walks away with|takes)\s+(.+?)\s+MVP\b/i,
    );

  return match?.[1]?.trim() || null;
}

function linkPlainTournamentMentions(
  value: string,
  tournamentName: string | null,
  competitionId: number | null,
) {
  if (!tournamentName || !competitionId) {
    return value;
  }

  const linked = `[**${tournamentName}**](/competitions?competitionId=${competitionId})`;
  const placeholder = `__LIGA_TOURNAMENT_LINK_${competitionId}__`;
  const linkPlaceholders: string[] = [];
  const boldPattern = new RegExp(`\\*\\*${escapeRegExp(tournamentName)}\\*\\*`, 'g');
  const plainPattern = new RegExp(`\\b${escapeRegExp(tournamentName)}\\b`, 'g');

  return value
    .replace(/\[[^\]]+\]\([^)]+\)/g, (match) => {
      const index = linkPlaceholders.push(match) - 1;
      return `__LIGA_EXISTING_LINK_${index}__`;
    })
    .replace(boldPattern, placeholder)
    .replace(plainPattern, placeholder)
    .replace(new RegExp(escapeRegExp(placeholder), 'g'), linked)
    .replace(/__LIGA_EXISTING_LINK_(\d+)__/g, (_, index) => linkPlaceholders[Number(index)] || '');
}

function PlayerHoverCard(props: { children: React.ReactNode; playerId: number }) {
  const cached = playerHoverCache.get(props.playerId);
  const [player, setPlayer] = React.useState<HoverPlayer | null>(cached?.player ?? null);
  const [stats, setStats] = React.useState<PlayerHoverStats>(cached?.stats ?? null);
  const [loaded, setLoaded] = React.useState(Boolean(cached?.loaded));
  const label = getNodeText(props.children) || 'Player';

  React.useEffect(() => {
    const nextCached = playerHoverCache.get(props.playerId);

    setPlayer(nextCached?.player ?? null);
    setStats(nextCached?.stats ?? null);
    setLoaded(Boolean(nextCached?.loaded));
  }, [props.playerId]);

  const load = React.useCallback(() => {
    if (loaded || !Number.isFinite(props.playerId)) {
      return;
    }

    const cachedEntry = playerHoverCache.get(props.playerId);
    if (cachedEntry) {
      setPlayer(cachedEntry.player);
      setStats(cachedEntry.stats);
      setLoaded(cachedEntry.loaded);
      return;
    }

    setLoaded(true);

    const request =
      playerHoverRequests.get(props.playerId) ||
      Promise.all([
        api.players.find({
          include: {
            country: true,
            team: true,
          },
          where: { id: props.playerId },
        }) as Promise<HoverPlayer | null>,
        api.matches.playerAllTimeStats(props.playerId),
      ])
        .then(([foundPlayer, foundStats]) => {
          const entry: PlayerHoverCacheEntry = {
            loaded: true,
            player: foundPlayer || null,
            stats: foundStats,
          };

          playerHoverCache.set(props.playerId, entry);
          return entry;
        })
        .catch(() => {
          const entry: PlayerHoverCacheEntry = {
            loaded: true,
            player: null,
            stats: null,
          };

          playerHoverCache.set(props.playerId, entry);
          return entry;
        })
        .finally(() => {
          playerHoverRequests.delete(props.playerId);
        });

    playerHoverRequests.set(props.playerId, request);
    request.then((entry) => {
      setPlayer(entry.player);
      setStats(entry.stats);
      setLoaded(entry.loaded);
    });
  }, [loaded, props.playerId]);

  const teamName = player?.team?.name || (loaded ? 'No Team' : '-');
  const isBenched = player?.starter === false;

  return (
    <span className="group relative inline-block" onMouseEnter={load}>
      {props.children}
      <span className="pointer-events-none absolute top-full left-0 z-50 mt-1 hidden w-[265px] border border-[#607186] bg-[#314253] text-[#b8c7d6] shadow-2xl group-hover:block">
        <span className="flex h-5 items-center gap-1.5 border-b border-[#607186] bg-[#34485b] px-1.5 text-[10px] font-black text-[#c6d5e4]">
          <Flag code={player?.country?.code} className="opacity-100" />
          <span className="truncate">{player?.name || label}</span>
        </span>
        <span className="relative grid h-[142px] grid-cols-[116px_1fr] overflow-hidden">
          {player?.team?.blazon && (
            <img
              src={player.team.blazon}
              className="absolute right-2 bottom-1 size-20 object-contain opacity-15"
            />
          )}
          <span className="h-full overflow-hidden bg-[#2c3b4a]">
            <img
              src={player?.avatar || 'resources://avatars/empty.png'}
              className="h-full w-full object-cover object-top"
            />
          </span>
          <span className="relative z-10 grid grid-rows-6 text-[10px]">
            <span className="grid grid-cols-[58px_1fr] items-center border-b border-[#607186] px-1.5">
              <span>Age:</span>
              <span className="text-right font-bold">{player?.age ?? '-'}</span>
            </span>
            <span className="grid grid-cols-[58px_1fr] items-center border-b border-[#607186] px-1.5">
              <span>Team:</span>
              <span className="flex min-w-0 items-center justify-end gap-1">
                <span className="truncate">{teamName}</span>
                {isBenched && (
                  <span className="shrink-0 bg-red-500 px-1 text-[9px] leading-3 font-black text-white">
                    B
                  </span>
                )}
              </span>
            </span>
            <span className="grid grid-cols-[58px_1fr] items-center border-b border-[#607186] px-1.5">
              <span>Rating:</span>
              <span className="text-right font-bold">{formatHoverStat(stats?.rating)}</span>
            </span>
            <span className="grid grid-cols-[58px_1fr] items-center border-b border-[#607186] px-1.5">
              <span>Maps:</span>
              <span className="text-right font-bold">{stats?.maps ?? '-'}</span>
            </span>
            <span className="grid grid-cols-[58px_1fr] items-center border-b border-[#607186] px-1.5">
              <span>KPR:</span>
              <span className="text-right font-bold">{formatHoverStat(stats?.kpr)}</span>
            </span>
            <span className="grid grid-cols-[58px_1fr] items-center px-1.5">
              <span>DPR:</span>
              <span className="text-right font-bold">{formatHoverStat(stats?.dpr)}</span>
            </span>
          </span>
        </span>
      </span>
    </span>
  );
}

function TeamHoverCard(props: { teamId: number; children: React.ReactNode }) {
  const cached = teamHoverCache.get(props.teamId);
  const [team, setTeam] = React.useState<HoverTeam | null>(cached?.team ?? null);
  const [rank, setRank] = React.useState<number | null>(cached?.rank ?? null);
  const [loaded, setLoaded] = React.useState(Boolean(cached?.loaded));
  const label = getNodeText(props.children) || 'Team';

  React.useEffect(() => {
    const nextCached = teamHoverCache.get(props.teamId);

    setTeam(nextCached?.team ?? null);
    setRank(nextCached?.rank ?? null);
    setLoaded(Boolean(nextCached?.loaded));
  }, [props.teamId]);

  const load = React.useCallback(() => {
    if (loaded || !Number.isFinite(props.teamId)) {
      return;
    }

    const cachedEntry = teamHoverCache.get(props.teamId);
    if (cachedEntry) {
      setTeam(cachedEntry.team);
      setRank(cachedEntry.rank);
      setLoaded(cachedEntry.loaded);
      return;
    }

    setLoaded(true);
    const request =
      teamHoverRequests.get(props.teamId) ||
      Promise.all([
        api.teams.all({
          include: {
            country: true,
            players: {
              include: {
                country: true,
              },
              orderBy: { id: 'asc' },
            },
          },
          where: { id: props.teamId },
        }) as Promise<HoverTeam[]>,
        api.team.worldRanking(props.teamId),
      ])
        .then(([teams, foundRank]) => {
          const entry: TeamHoverCacheEntry = {
            loaded: true,
            rank: foundRank,
            team: teams[0] || null,
          };

          teamHoverCache.set(props.teamId, entry);
          return entry;
        })
        .catch(() => {
          const entry: TeamHoverCacheEntry = {
            loaded: true,
            rank: null,
            team: null,
          };

          teamHoverCache.set(props.teamId, entry);
          return entry;
        })
        .finally(() => {
          teamHoverRequests.delete(props.teamId);
        });

    teamHoverRequests.set(props.teamId, request);
    request.then((entry) => {
      setTeam(entry.team);
      setRank(entry.rank);
      setLoaded(entry.loaded);
    });
  }, [loaded, props.teamId]);

  const starters = (team?.players || []).filter((player) => player.starter !== false).slice(0, 5);

  return (
    <span className="group relative inline-block" onMouseEnter={load}>
      {props.children}
      <span className="pointer-events-none absolute top-full left-0 z-50 mt-1 hidden w-[250px] border border-[#607186] bg-[#314253] text-[#b8c7d6] shadow-2xl group-hover:block">
        <span className="flex h-5 items-center justify-between gap-2 border-b border-[#607186] bg-[#34485b] px-1.5 text-[10px] font-black text-[#c6d5e4]">
          <span className="flex min-w-0 items-center gap-1.5">
            <Flag code={team?.country?.code} className="opacity-100" />
            <span className="truncate">{team?.name || label}</span>
          </span>
          {rank ? <span>#{rank}</span> : null}
        </span>
        <span className="relative grid min-h-[122px] grid-cols-[92px_1fr] overflow-hidden p-1.5">
          <span className="flex items-center justify-center">
            <img
              src={team?.blazon || 'resources://blazonry/noteam.svg'}
              className="size-20 object-contain"
            />
          </span>
          <span className="relative z-10 grid content-start">
            {starters.map((player) => (
              <span
                key={player.id}
                className="flex items-center gap-1.5 border-b border-[#607186]/70 py-0.5 text-[10px]"
              >
                <Flag code={player.country?.code} className="opacity-100" />
                <span className="truncate">{player.name}</span>
              </span>
            ))}
            {!starters.length && (
              <span className="py-2 text-[10px] text-[#91a4b8]">
                {loaded ? 'No active lineup' : 'Loading lineup...'}
              </span>
            )}
          </span>
          <img
            src={team?.blazon || 'resources://blazonry/noteam.svg'}
            className="absolute right-3 bottom-0 size-24 object-contain opacity-15"
          />
        </span>
      </span>
    </span>
  );
}

function CompetitionHoverCard(props: { children: React.ReactNode; competitionId: number }) {
  const cached = competitionHoverCache.get(props.competitionId);
  const [competition, setCompetition] = React.useState<HoverCompetition | null>(
    cached?.competition ?? null,
  );
  const [loaded, setLoaded] = React.useState(Boolean(cached?.loaded));
  const label = getNodeText(props.children) || 'Tournament';

  React.useEffect(() => {
    const nextCached = competitionHoverCache.get(props.competitionId);

    setCompetition(nextCached?.competition ?? null);
    setLoaded(Boolean(nextCached?.loaded));
  }, [props.competitionId]);

  const load = React.useCallback(() => {
    if (loaded || !Number.isFinite(props.competitionId)) {
      return;
    }

    const cachedEntry = competitionHoverCache.get(props.competitionId);
    if (cachedEntry) {
      setCompetition(cachedEntry.competition);
      setLoaded(cachedEntry.loaded);
      return;
    }

    setLoaded(true);
    const request =
      competitionHoverRequests.get(props.competitionId) ||
      (
        api.competitions.find({
          include: {
            federation: true,
            matches: {
              orderBy: [{ date: 'desc' }, { id: 'desc' }],
              select: {
                date: true,
              },
              take: 1,
            },
            tier: {
              include: {
                league: true,
              },
            },
          },
          where: { id: props.competitionId },
        }) as Promise<HoverCompetition | null>
      )
        .then((foundCompetition) => {
          const entry: CompetitionHoverCacheEntry = {
            competition: foundCompetition || null,
            loaded: true,
          };

          competitionHoverCache.set(props.competitionId, entry);
          return entry;
        })
        .catch(() => {
          const entry: CompetitionHoverCacheEntry = {
            competition: null,
            loaded: true,
          };

          competitionHoverCache.set(props.competitionId, entry);
          return entry;
        })
        .finally(() => {
          competitionHoverRequests.delete(props.competitionId);
        });

    competitionHoverRequests.set(props.competitionId, request);
    request.then((entry) => {
      setCompetition(entry.competition);
      setLoaded(entry.loaded);
    });
  }, [loaded, props.competitionId]);

  const name = getCompetitionHoverName(competition, label);
  const location = competition
    ? Util.getCompetitionDisplayLocation({
        federationSlug: competition.federation?.slug,
        lan: competition.tier.lan,
        location: competition.location,
      })
    : null;
  const flagCode = competition
    ? Util.getCompetitionDisplayLocationCountryCode({
        federationSlug: competition.federation?.slug,
        lan: competition.tier.lan,
        location: competition.location,
      })
    : null;
  const logo = competition
    ? Util.getCompetitionLogo(competition.tier.slug, competition.federation?.slug, {
        location: competition.location,
        organizer: competition.organizer,
      })
    : 'resources://competitions/league-pro-world.png';

  return (
    <span className="group relative inline-block" onMouseEnter={load}>
      {props.children}
      <span className="pointer-events-none absolute top-full left-0 z-50 mt-1 hidden w-[250px] border border-[#607186] bg-[#314253] text-[#b8c7d6] shadow-2xl group-hover:block">
        <span className="flex h-5 items-center gap-1.5 border-b border-[#607186] bg-[#34485b] px-1.5 text-[10px] font-black text-[#c6d5e4]">
          <Flag code={flagCode} className="opacity-100" />
          <span className="truncate">{name}</span>
        </span>
        <span className="relative grid min-h-[96px] grid-cols-[92px_1fr] overflow-hidden p-1.5">
          <span className="flex items-center justify-center">
            <img src={logo} className="size-20 object-contain" />
          </span>
          <span className="relative z-10 grid content-start text-[10px]">
            <span className="grid grid-cols-[58px_1fr] items-center border-b border-[#607186]/70 py-1">
              <span>Season:</span>
              <span className="text-right font-bold">{competition?.season ?? '-'}</span>
            </span>
            <span className="grid grid-cols-[58px_1fr] items-center border-b border-[#607186]/70 py-1">
              <span>Date:</span>
              <span className="text-right font-bold">
                {formatHoverDate(competition?.matches?.[0]?.date)}
              </span>
            </span>
            <span className="grid grid-cols-[58px_1fr] items-center py-1">
              <span>Region:</span>
              <span className="truncate text-right font-bold">{location || '-'}</span>
            </span>
          </span>
          <img src={logo} className="absolute right-3 bottom-0 size-24 object-contain opacity-15" />
        </span>
      </span>
    </span>
  );
}

function getTopicLabel(item: NewsItem) {
  if (item.type === 'SHORT') {
    return 'Short';
  }

  return item.topic.charAt(0) + item.topic.slice(1).toLowerCase();
}

function isTopStoryItem(item: NewsItem) {
  return item.type === 'ARTICLE';
}

function hasGoldenNewsHue(item?: NewsItem | null) {
  if (!item) {
    return false;
  }

  const payload = parsePayload(item);

  return (
    (Array.isArray(payload.mapUsage) && payload.mapUsage.length > 0) ||
    (Array.isArray(payload.ranking) && payload.ranking.length > 0)
  );
}

function asWelcomeGraphic(value: unknown): WelcomeGraphic | null {
  if (!isRecord(value)) {
    return null;
  }

  const template = typeof value.template === 'string' ? value.template : null;
  const playerName = typeof value.playerName === 'string' ? value.playerName : null;

  if (!template || !playerName) {
    return null;
  }

  const avatarLayout = isRecord(value.avatarLayout) ? value.avatarLayout : null;
  const nameLayout = isRecord(value.nameLayout) ? value.nameLayout : null;

  return {
    aspectRatio: typeof value.aspectRatio === 'string' ? value.aspectRatio : null,
    avatar: typeof value.avatar === 'string' ? value.avatar : null,
    avatarLayout: avatarLayout
      ? {
          bottom: typeof avatarLayout.bottom === 'string' ? avatarLayout.bottom : null,
          height: typeof avatarLayout.height === 'string' ? avatarLayout.height : null,
          left: typeof avatarLayout.left === 'string' ? avatarLayout.left : null,
          maxWidth: typeof avatarLayout.maxWidth === 'string' ? avatarLayout.maxWidth : null,
        }
      : null,
    fontFamily: typeof value.fontFamily === 'string' ? value.fontFamily : null,
    fontSize: typeof value.fontSize === 'string' ? value.fontSize : null,
    fontStyle: typeof value.fontStyle === 'string' ? value.fontStyle : null,
    letterSpacing: typeof value.letterSpacing === 'string' ? value.letterSpacing : null,
    nameLayout: nameLayout
      ? {
          left: typeof nameLayout.left === 'string' ? nameLayout.left : null,
          top: typeof nameLayout.top === 'string' ? nameLayout.top : null,
          width: typeof nameLayout.width === 'string' ? nameLayout.width : null,
        }
      : null,
    playerName,
    rotate: typeof value.rotate === 'string' ? value.rotate : null,
    skewX: typeof value.skewX === 'string' ? value.skewX : null,
    teamSlug: typeof value.teamSlug === 'string' ? value.teamSlug : null,
    template,
    textColor: typeof value.textColor === 'string' ? value.textColor : null,
    textGradient: typeof value.textGradient === 'string' ? value.textGradient : null,
    textShadow: typeof value.textShadow === 'boolean' ? value.textShadow : null,
    textStroke: typeof value.textStroke === 'string' ? value.textStroke : null,
  };
}

function asMvpGraphic(value: unknown): MvpGraphic | null {
  if (!isRecord(value)) {
    return null;
  }

  const playerImage = typeof value.playerImage === 'string' ? value.playerImage : null;

  if (!playerImage) {
    return null;
  }

  return {
    medal: typeof value.medal === 'string' ? value.medal : 'resources://competitions/mvp.png',
    playerImage,
    tournamentLogo: typeof value.tournamentLogo === 'string' ? value.tournamentLogo : null,
  };
}

function WelcomeGraphicImage(props: { graphic: WelcomeGraphic }) {
  const fontFamily = props.graphic.fontFamily
    ? `${props.graphic.fontFamily}, Impact, Haettenschweiler, 'Arial Black', sans-serif`
    : "Impact, Haettenschweiler, 'Arial Black', sans-serif";
  const avatar = props.graphic.avatarLayout;
  const name = props.graphic.nameLayout;

  return (
    <figure
      className="border-base-content/10 bg-base-100 relative mb-6 overflow-hidden border"
      style={{ aspectRatio: props.graphic.aspectRatio || '1836 / 857' }}
    >
      <img src={props.graphic.template} className="absolute inset-0 size-full object-cover" />
      <img
        src={props.graphic.avatar || 'resources://avatars/empty.png'}
        className="absolute object-contain object-bottom drop-shadow-[0_18px_22px_rgba(0,0,0,0.65)]"
        style={{
          bottom: avatar?.bottom || '0%',
          height: avatar?.height || '90%',
          left: avatar?.left || '3%',
          maxWidth: avatar?.maxWidth || '37%',
        }}
      />
      <figcaption
        className={cx(
          'absolute overflow-visible text-center leading-[1.16] font-black tracking-normal whitespace-nowrap uppercase',
          props.graphic.textShadow !== false && 'drop-shadow-[0_8px_12px_rgba(0,0,0,0.9)]',
        )}
        style={{
          color: props.graphic.textColor || '#ffffff',
          fontFamily,
          fontSize: props.graphic.fontSize || '4.5rem',
          fontStyle: props.graphic.fontStyle || 'normal',
          letterSpacing: props.graphic.letterSpacing || '0',
          left: name?.left || '68%',
          backgroundClip: props.graphic.textGradient ? 'text' : undefined,
          backgroundImage: props.graphic.textGradient || undefined,
          top: name?.top || '84%',
          transform: `translate(-50%, -50%) rotate(${props.graphic.rotate || '0deg'}) skewX(${props.graphic.skewX || '0deg'})`,
          WebkitBackgroundClip: props.graphic.textGradient ? 'text' : undefined,
          WebkitTextFillColor: props.graphic.textGradient ? 'transparent' : undefined,
          WebkitTextStroke: props.graphic.textStroke || undefined,
          width: name?.width || '34%',
        }}
      >
        {props.graphic.playerName}
      </figcaption>
    </figure>
  );
}

function ArticlePlayerImageFrame(props: { src?: string | null }) {
  return (
    <figure className="bg-base-100 border-base-content/10 relative aspect-square w-full overflow-hidden border">
      <img
        src={props.src || 'resources://blazonry/noteam.svg'}
        alt=""
        className="absolute right-1/2 bottom-0 h-full max-w-none translate-x-1/2 object-contain object-bottom"
      />
    </figure>
  );
}

function MvpArticleImage(props: { graphic: MvpGraphic; image?: string | null }) {
  return (
    <figure className="bg-base-100 border-base-content/10 relative aspect-square w-full overflow-hidden border">
      <img
        src={props.graphic.playerImage || props.image || 'resources://blazonry/noteam.svg'}
        alt=""
        className="absolute right-1/2 bottom-0 h-full max-w-none translate-x-1/2 object-contain object-bottom"
      />
      <img
        src={props.graphic.medal || 'resources://competitions/mvp.png'}
        alt=""
        className="absolute right-1 bottom-1 size-12 object-contain drop-shadow-[0_5px_8px_rgba(0,0,0,0.75)]"
        aria-hidden="true"
      />
    </figure>
  );
}

function splitOpeningBlock(body: string) {
  const blocks = body.split(/\r?\n\s*\r?\n/).filter((block) => block.trim());

  return {
    openingBlock: blocks[0] || '',
    remainingBody: blocks.slice(1).join('\n\n'),
  };
}

function MapPoolArticleImage(props: { icon: string; map: string }) {
  const icon = mapIconImages[props.icon];

  return (
    <figure className="border-base-content/10 bg-base-200/70 relative my-4 overflow-hidden border">
      <img
        src={Util.convertMapPool(props.map, Constants.Game.CSGO, true)}
        alt={Util.convertMapPool(props.map, Constants.Game.CSGO)}
        className="h-64 w-full object-cover"
      />
      {!!icon && (
        <span className="bg-base-100/90 border-base-content/10 absolute right-3 bottom-3 flex size-14 items-center justify-center border shadow-lg backdrop-blur">
          <img src={icon} alt="" className="max-h-10 max-w-10 object-contain" aria-hidden="true" />
        </span>
      )}
    </figure>
  );
}

function MapUsageChart(props: { item?: NewsItem }) {
  const payload = props.item ? parsePayload(props.item) : {};
  const getColor = (map: string, name: string) => {
    const key = map || name.toLocaleLowerCase().replace(/\s+/g, '');
    const colors: Record<string, string> = {
      ancient: '#aaa53a',
      anubis: '#d46914',
      cache: '#eea72a',
      de_ancient: '#aaa53a',
      de_anubis: '#d46914',
      de_cache: '#eea72a',
      de_dust2: '#3fac59',
      de_inferno: '#2f9097',
      de_mirage: '#2f7fbd',
      de_nuke: '#38a06a',
      de_overpass: '#85a83f',
      de_train: '#c49a2c',
      de_vertigo: '#e28c1c',
      dustii: '#3fac59',
      inferno: '#2f9097',
      mirage: '#2f7fbd',
      nuke: '#38a06a',
      overpass: '#85a83f',
      train: '#c49a2c',
      vertigo: '#e28c1c',
    };

    return colors[key] || '#8ba3b8';
  };
  const rows = Array.isArray(payload.mapUsage)
    ? payload.mapUsage
        .map((row) => ({
          color:
            typeof row?.color === 'string'
              ? row.color
              : getColor(typeof row?.map === 'string' ? row.map : '', String(row?.name || '')),
          map: typeof row?.map === 'string' ? row.map : '',
          name:
            typeof row?.name === 'string' ? row.name : typeof row?.map === 'string' ? row.map : '',
          plays: Number.isFinite(Number(row?.plays)) ? Number(row?.plays) : 0,
        }))
        .filter((row) => row.name)
        .sort((a, b) => b.plays - a.plays || a.name.localeCompare(b.name))
    : [];
  const maxPlays = Math.max(1, ...rows.map((row) => row.plays));

  if (!rows.length) {
    return null;
  }

  return (
    <figure className="border-base-content/10 bg-base-100/70 my-4 border p-4">
      <figcaption className="text-base-content/70 mb-3 text-xs font-black uppercase">
        Last Season Map Plays
      </figcaption>
      <div className="grid h-52 grid-cols-7 items-end gap-2">
        {rows.map((row) => (
          <div key={row.name} className="flex h-full min-w-0 flex-col justify-end gap-2">
            <span className="text-center text-xs font-black">{row.plays.toLocaleString()}</span>
            <div
              className="min-h-1"
              style={{
                backgroundColor: row.color,
                height: `${(row.plays / maxPlays) * 100}%`,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-2">
        {rows.map((row) => (
          <span
            key={`${row.name}__label`}
            className="truncate text-center text-[11px] leading-tight opacity-70"
            title={row.name}
          >
            {row.name}
          </span>
        ))}
      </div>
    </figure>
  );
}

function NewsBody(props: { body: string; headline: string; item?: NewsItem }) {
  const payload = props.item ? parsePayload(props.item) : {};
  const topPlayerRanking = asTopPlayerRanking(payload.ranking);
  const payloadCompetitionId =
    typeof payload.competitionId === 'number' ? payload.competitionId : null;
  const headlineTournamentName = getHeadlineTournamentName(props.headline);
  const normalizeBodyMarkdown = React.useCallback(
    (value: string) =>
      linkPlainTournamentMentions(
        normalizeStrongMarkdownLinks(value),
        headlineTournamentName,
        payloadCompetitionId,
      ),
    [headlineTournamentName, payloadCompetitionId],
  );
  const lines = props.body
    .split(/\r?\n/)
    .filter((line, index) => !(index === 0 && line.trim() === `# ${props.headline}`));
  const blocks = lines.reduce<string[]>((acc, line) => {
    const isFlagLine = /^- :flag_([a-z0-9_]+):\s+(.+)$/i.test(line);
    const previous = acc[acc.length - 1] || '';
    const previousIsFlagLine = /^- :flag_([a-z0-9_]+):\s+(.+)$/i.test(
      previous.split('\n').at(-1) || '',
    );

    if (!line.trim()) {
      if (previous && !previous.endsWith('\n')) {
        acc.push('');
      }

      return acc;
    }

    if (isFlagLine && previousIsFlagLine) {
      acc[acc.length - 1] = `${previous}\n${line}`;
      return acc;
    }

    acc.push(line);
    return acc;
  }, []);
  const markdownComponents: Components = {
    a: ({ href, children }) => {
      const isPlayerHref =
        href?.startsWith('/players?playerId=') || href?.startsWith('liga-player:');
      const isTeamHref = href?.startsWith('/teams?teamId=') || href?.startsWith('liga-team:');
      const isCompetitionLink = isCompetitionHref(href);

      if (isPlayerHref) {
        const playerId = href.startsWith('liga-player:')
          ? Number(href.replace('liga-player:', ''))
          : Number(new URLSearchParams(href.split('?')[1]).get('playerId'));

        return (
          <PlayerHoverCard playerId={playerId}>
            <button
              type="button"
              className="link-hover text-base-content inline font-black"
              onClick={() =>
                api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
                  target: '/transfer',
                  payload: playerId,
                })
              }
            >
              {children}
            </button>
          </PlayerHoverCard>
        );
      }

      if (isTeamHref) {
        const teamId = href.startsWith('liga-team:')
          ? Number(href.replace('liga-team:', ''))
          : Number(new URLSearchParams(href.split('?')[1]).get('teamId'));
        const to = href.startsWith('liga-team:') ? `/teams?teamId=${teamId}` : href;

        return (
          <TeamHoverCard teamId={teamId}>
            <Link to={to} className="link-hover text-base-content font-black">
              {children}
            </Link>
          </TeamHoverCard>
        );
      }

      if (isCompetitionLink) {
        const competitionId = getCompetitionIdFromHref(href) ?? payloadCompetitionId;
        const to = href?.startsWith('liga-competition:')
          ? `/competitions?competitionId=${competitionId}`
          : href || '/competitions';

        if (!competitionId) {
          return (
            <Link to={to || '/competitions'} className="link-hover text-base-content font-black">
              {children}
            </Link>
          );
        }

        return (
          <CompetitionHoverCard competitionId={competitionId}>
            <Link to={to} className="link-hover text-base-content font-black">
              {children}
            </Link>
          </CompetitionHoverCard>
        );
      }

      if (href?.startsWith('/')) {
        return (
          <Link to={href} className="link-hover text-base-content font-black">
            {children}
          </Link>
        );
      }

      return (
        <a href={href} className="link-hover text-base-content font-black">
          {children}
        </a>
      );
    },
    h1: () => null,
    strong: ({ children }) => <strong className="text-base-content font-black">{children}</strong>,
    ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
    li: ({ children }) => <li>{children}</li>,
  };
  const inlineMarkdownComponents: Components = {
    ...markdownComponents,
    p: ({ children }) => <span>{children}</span>,
  };
  const blockMarkdownComponents: Components = {
    ...markdownComponents,
    p: ({ children }) => <p className="m-0">{children}</p>,
  };

  return (
    <div className="space-y-2.5 text-[15px] leading-6">
      {blocks
        .filter((block) => block.trim())
        .map((block, index) => {
          const blockLines = block.split('\n');
          const mapImage = block.match(/^::map-image\{map="([^"]+)" icon="([^"]+)"\}$/);
          const topPlayerRankingBlock = block.match(/^::top-player-ranking\{rank=(\d+)\}$/);

          if (topPlayerRankingBlock) {
            const rank = Number(topPlayerRankingBlock[1]);
            const entry = topPlayerRanking.find((item) => item.rank === rank);

            if (!entry) {
              return null;
            }

            return (
              <article
                key={`${index}__top_player_ranking`}
                className="border-base-content/10 bg-base-100/40 grid grid-cols-[7.5rem_1fr] gap-4 border p-3"
              >
                <button
                  type="button"
                  className="border-base-content/10 bg-base-200 h-36 overflow-hidden border"
                  onClick={() =>
                    entry.playerId &&
                    api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
                      target: '/transfer',
                      payload: entry.playerId,
                    })
                  }
                >
                  <img
                    src={entry.playerAvatar || 'resources://avatars/empty.png'}
                    className="h-full w-full object-cover object-top"
                  />
                </button>
                <section className="min-w-0">
                  <header className="mb-2 flex flex-wrap items-center gap-2 leading-5">
                    <Flag code={entry.flagCode} className="opacity-100" />
                    <span className="font-black">#{entry.rank}</span>
                    <PlayerHoverCard playerId={entry.playerId || 0}>
                      <button
                        type="button"
                        className="link-hover text-base-content font-black"
                        onClick={() =>
                          entry.playerId &&
                          api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
                            target: '/transfer',
                            payload: entry.playerId,
                          })
                        }
                      >
                        {entry.playerName || `Player #${entry.playerId}`}
                      </button>
                    </PlayerHoverCard>
                    <span className="text-base-content/60">
                      - {entry.rating?.toFixed(2) || '-'} rating
                    </span>
                    {entry.teamName && (
                      <span className="text-base-content/50 text-xs font-bold uppercase">
                        {entry.teamName}
                      </span>
                    )}
                  </header>
                  <div className="text-sm leading-6">
                    <ReactMarkdown
                      components={blockMarkdownComponents}
                      transformLinkUri={preserveMarkdownUri}
                    >
                      {normalizeBodyMarkdown(entry.analysis || '')}
                    </ReactMarkdown>
                  </div>
                </section>
              </article>
            );
          }

          if (mapImage) {
            return (
              <MapPoolArticleImage
                key={`${index}__map_image`}
                map={mapImage[1]}
                icon={mapImage[2]}
              />
            );
          }

          if (block.trim() === '::map-usage-chart') {
            return <MapUsageChart key={`${index}__map_usage_chart`} item={props.item} />;
          }

          const allFlagLines = blockLines.every((line) =>
            /^- :flag_([a-z0-9_]+):\s+(.+)$/i.test(line),
          );

          if (allFlagLines) {
            return (
              <ul key={`${index}__flag_list`} className="space-y-0">
                {blockLines.map((line) => {
                  const flagLine = line.match(/^- :flag_([a-z0-9_]+):\s+(.+)$/i);

                  if (!flagLine) {
                    return null;
                  }

                  return (
                    <li key={line} className="flex items-center gap-2 leading-5">
                      <Flag code={flagLine[1]} />
                      <ReactMarkdown
                        components={inlineMarkdownComponents}
                        transformLinkUri={preserveMarkdownUri}
                      >
                        {normalizeBodyMarkdown(flagLine[2])}
                      </ReactMarkdown>
                    </li>
                  );
                })}
              </ul>
            );
          }

          const flagLine = block.match(/^- :flag_([a-z0-9_]+):\s+(.+)$/i);
          if (flagLine) {
            return (
              <p key={`${index}__flag_line`} className="flex items-center gap-2">
                <Flag code={flagLine[1]} />
                <ReactMarkdown
                  components={inlineMarkdownComponents}
                  transformLinkUri={preserveMarkdownUri}
                >
                  {normalizeBodyMarkdown(flagLine[2])}
                </ReactMarkdown>
              </p>
            );
          }

          const isRosterHeading = /^\*\*.+\*\* are now:$/i.test(block.trim());
          return (
            <div key={`${index}__markdown_block`} className={cx(isRosterHeading && 'pt-1')}>
              <ReactMarkdown
                components={blockMarkdownComponents}
                transformLinkUri={preserveMarkdownUri}
              >
                {normalizeBodyMarkdown(block)}
              </ReactMarkdown>
            </div>
          );
        })}
    </div>
  );
}

function MatchPanel(props: { item: NewsItem }) {
  const payload = parsePayload(props.item);
  const matchId = typeof payload.matchId === 'number' ? payload.matchId : null;
  const showMatchPanel = payload.showMatchPanel === true;
  const [match, setMatch] = React.useState<
    Awaited<ReturnType<typeof api.matches.all<typeof Eagers.matchEvents>>>[number] | null
  >(null);

  React.useEffect(() => {
    if (!showMatchPanel || !matchId) {
      setMatch(null);
      return;
    }

    api.matches
      .all<typeof Eagers.matchEvents>({
        include: Eagers.matchEvents.include,
        where: {
          id: matchId,
        },
      })
      .then((matches) => setMatch(matches[0] || null));
  }, [matchId, showMatchPanel]);

  if (!showMatchPanel || !matchId || !match) {
    return null;
  }

  const [home, away] = match.competitors;
  const mapRows = match.games.map((game) => {
    const [homeGame, awayGame] = game.teams;
    return {
      map: Util.convertMapPool(game.map, Constants.Game.CSGO),
      score: `${homeGame?.score ?? 0}:${awayGame?.score ?? 0}`,
    };
  });

  return (
    <article className="border-base-content/10 bg-base-200/60 my-6 overflow-hidden border">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 p-4">
        <section className="flex items-center gap-3">
          <img src={home.team.blazon} className="size-12 object-contain" />
          <p className="truncate font-black">{home.team.name}</p>
        </section>
        <section className="text-center">
          <p className="text-4xl font-black">
            <span className={cx((home.score || 0) > (away.score || 0) && 'text-success')}>
              {home.score ?? 0}
            </span>
            <span className="text-base-content/40 px-3">:</span>
            <span className={cx((away.score || 0) > (home.score || 0) && 'text-success')}>
              {away.score ?? 0}
            </span>
          </p>
          <p className="text-base-content/60 text-xs font-bold uppercase">
            Best of {match.games.length}
          </p>
        </section>
        <section className="flex items-center justify-end gap-3">
          <p className="truncate text-right font-black">{away.team.name}</p>
          <img src={away.team.blazon} className="size-12 object-contain" />
        </section>
      </header>
      {!!mapRows.length && (
        <section className="border-base-content/10 grid grid-cols-3 gap-2 border-t p-3">
          {mapRows.map((row) => (
            <article key={`${match.id}_${row.map}`} className="bg-base-100 p-2 text-sm">
              <p className="font-bold">{row.map}</p>
              <p className="text-base-content/60">{row.score}</p>
            </article>
          ))}
        </section>
      )}
      <footer className="border-base-content/10 flex justify-end border-t p-3">
        <button
          className="btn btn-sm"
          onClick={() =>
            api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
              target: '/postgame',
              payload: match.id,
            })
          }
        >
          Match details
        </button>
      </footer>
    </article>
  );
}

function RelatedLinks(props: { item: NewsItem }) {
  const payload = parsePayload(props.item);
  const payloadTeams = asRelatedTeams(payload.relatedTeams);
  const payloadPlayers = asRelatedPlayers(payload.relatedPlayers);
  const teamIds = Array.isArray(payload.teamIds)
    ? payload.teamIds.filter((id): id is number => typeof id === 'number')
    : [];
  const playerId = typeof payload.playerId === 'number' ? payload.playerId : null;
  const teamId = typeof payload.teamId === 'number' ? payload.teamId : null;
  const [resolvedTeams, setResolvedTeams] = React.useState<RelatedTeam[]>([]);
  const [resolvedPlayers, setResolvedPlayers] = React.useState<RelatedPlayer[]>([]);
  const richTeamIds = new Set(payloadTeams.map((team) => team.id));
  const richPlayerIds = new Set(payloadPlayers.map((player) => player.id));
  const fallbackTeamIds = [...new Set([...teamIds, teamId].filter(Boolean) as number[])].filter(
    (id) => !richTeamIds.has(id),
  );
  const fallbackPlayerIds = [...new Set([playerId].filter(Boolean) as number[])].filter(
    (id) => !richPlayerIds.has(id),
  );

  React.useEffect(() => {
    if (!fallbackTeamIds.length) {
      setResolvedTeams([]);
      return;
    }

    api.teams
      .all({
        where: {
          id: {
            in: fallbackTeamIds,
          },
        },
      })
      .then((teams) =>
        setResolvedTeams(
          teams.map((team) => ({
            id: team.id,
            name: team.name,
            blazon: team.blazon,
          })),
        ),
      );
  }, [fallbackTeamIds.join(',')]);

  React.useEffect(() => {
    if (!fallbackPlayerIds.length) {
      setResolvedPlayers([]);
      return;
    }

    Promise.all(
      fallbackPlayerIds.map((id) =>
        api.players.find({
          where: { id },
          include: {
            country: true,
          },
        }),
      ),
    ).then((players) =>
      setResolvedPlayers(
        players.filter(Boolean).map((player) => ({
          id: player.id,
          name: player.name,
          avatar: player.avatar,
          flagCode: player.country?.code?.toLocaleLowerCase(),
        })),
      ),
    );
  }, [fallbackPlayerIds.join(',')]);

  const teams = [...payloadTeams, ...resolvedTeams];
  const players = [...payloadPlayers, ...resolvedPlayers];

  if (!teams.length && !players.length) {
    return null;
  }

  return (
    <footer className="border-base-content/10 mt-6 border-t pt-4">
      <p className="text-base-content/60 mb-2 text-xs font-bold uppercase">Related</p>
      <div className="flex flex-wrap gap-2">
        {teams.map((team) => (
          <Link key={`team-${team.id}`} to={`/teams?teamId=${team.id}`} className="btn btn-sm">
            <img src={team.blazon || 'resources://blazonry/noteam.svg'} className="size-5" />
            {team.name || `Team #${team.id}`}
          </Link>
        ))}
        {players.map((player) => (
          <button
            key={`player-${player.id}`}
            className="btn btn-sm"
            onClick={() =>
              api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
                target: '/transfer',
                payload: player.id,
              })
            }
          >
            <Flag code={player.flagCode} />
            {player.name || `Player #${player.id}`}
          </button>
        ))}
      </div>
    </footer>
  );
}

function NewsComments(props: { fmtDate: (date: Date | string) => string; item: NewsItem }) {
  const payload = parsePayload(props.item);
  const comments = asComments(payload.comments);

  if (!comments.length) {
    return null;
  }

  return (
    <section className="mt-6">
      <header className="border-base-content/10 bg-base-300/70 flex items-center justify-between border px-3 py-2">
        <p className="text-sm font-black">Comments</p>
        <p className="text-base-content/60 text-xs font-bold uppercase">{comments.length} posts</p>
      </header>
      <div className="border-base-content/10 divide-base-content/10 border-x border-b">
        {comments.map((comment) => (
          <article
            key={`${props.item.id}_${comment.id}`}
            className="divide-base-content/10 divide-y"
          >
            <header className="bg-base-200/70 flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
              <span className="text-base-content/60 font-bold">#{comment.id}</span>
              <span className="flex min-w-0 items-center gap-1.5">
                <Flag code={comment.flagCode} />
                <span className="truncate font-bold">{comment.author}</span>
              </span>
            </header>
            <p className="bg-base-200/40 px-3 py-2 text-sm leading-5 opacity-80">
              {comment.message}
            </p>
            <footer className="bg-base-200/70 flex items-center justify-between px-3 py-1.5 text-xs">
              <span className="text-base-content/50">
                {props.fmtDate(toDate(props.item.publishedAt))}
              </span>
              <span
                className={cx(
                  'rounded px-2 py-0.5 font-black',
                  comment.score > 20
                    ? 'bg-warning/70 text-warning-content'
                    : 'bg-base-content/10 text-base-content/70',
                )}
              >
                {comment.score >= 0 ? `+ ${comment.score}` : comment.score}
              </span>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const fmtDate = useFormatAppDate();
  const location = useLocation();
  const routeState = (location.state || {}) as NewsRouteState;
  const routeArticleId = typeof routeState.articleId === 'number' ? routeState.articleId : null;
  const [requestedArticleId, setRequestedArticleId] = React.useState<number | null>(routeArticleId);
  const [items, setItems] = React.useState<NewsItem[]>([]);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [filter, setFilter] = React.useState<NewsTopic>('ALL');
  const [page, setPage] = React.useState(1);
  const [working, setWorking] = React.useState(false);

  const refresh = React.useCallback(() => {
    api.news.all().then((data) => {
      setItems(data);
      setSelectedId((current) => requestedArticleId || current || data[0]?.id || null);
    });
  }, [requestedArticleId]);

  React.useEffect(() => {
    refresh();
    const removeNewsItemsUpdatedListener = api.ipc.on(
      Constants.IPCRoute.NEWS_ITEMS_UPDATED,
      refresh,
    );

    return () => {
      removeNewsItemsUpdatedListener();
    };
  }, [refresh]);

  React.useEffect(() => {
    setRequestedArticleId(routeArticleId);
  }, [routeArticleId, location.key]);

  React.useEffect(() => {
    const removeWindowSendListener = api.ipc.on(
      Constants.IPCRoute.WINDOW_SEND,
      (payload: number | (ModalRequest<NewsRouteState> & { inAppModal?: boolean })) => {
        if (
          typeof payload !== 'number' &&
          payload?.target === '/news' &&
          typeof payload.payload?.articleId === 'number'
        ) {
          setRequestedArticleId(payload.payload.articleId);
        }
      },
    );

    return () => {
      removeWindowSendListener();
    };
  }, []);

  React.useEffect(() => {
    if (!requestedArticleId || !items.length) {
      return;
    }

    const requestedItem = items.find((item) => item.id === requestedArticleId);
    if (!requestedItem) {
      return;
    }

    setSelectedId(requestedItem.id);
    setFilter(
      requestedItem.type === 'SHORT'
        ? 'SHORTS'
        : requestedItem.topic === 'TRANSFERS'
          ? 'TRANSFERS'
          : 'ALL',
    );
  }, [items, requestedArticleId]);

  const filteredItems = React.useMemo(() => {
    if (filter === 'ALL') {
      return items.filter(isTopStoryItem);
    }

    if (filter === 'SHORTS') {
      return items.filter((item) => item.type === 'SHORT');
    }

    return items.filter((item) => item.topic === filter);
  }, [filter, items]);
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / NEWS_ITEMS_PER_PAGE));
  const visibleItems = React.useMemo(
    () => filteredItems.slice((page - 1) * NEWS_ITEMS_PER_PAGE, page * NEWS_ITEMS_PER_PAGE),
    [filteredItems, page],
  );

  const selected = React.useMemo(
    () =>
      filteredItems.find((item) => item.id === selectedId) ||
      filteredItems[0] ||
      null,
    [filteredItems, selectedId],
  );
  const selectedPayload = React.useMemo(() => (selected ? parsePayload(selected) : {}), [selected]);
  const selectedWelcomeGraphic = React.useMemo(
    () => (selected ? asWelcomeGraphic(selectedPayload.welcomeGraphic) : null),
    [selected, selectedPayload],
  );
  const selectedMvpGraphic = React.useMemo(
    () => (selected ? asMvpGraphic(selectedPayload.mvpGraphic) : null),
    [selected, selectedPayload],
  );
  const selectedCompetitionId =
    typeof selectedPayload.competitionId === 'number' ? selectedPayload.competitionId : null;
  const selectedMvpLogo = selectedMvpGraphic?.tournamentLogo || null;
  const selectedHasTopPlayerRanking =
    Array.isArray(selectedPayload.ranking) && selectedPayload.ranking.length > 0;
  const selectedWelcomeBody = React.useMemo(
    () => (selectedWelcomeGraphic && selected ? splitOpeningBlock(selected.body) : null),
    [selected?.body, selectedWelcomeGraphic],
  );

  React.useEffect(() => {
    setPage(1);
  }, [filter]);

  React.useEffect(() => {
    setPage((current) => Math.min(Math.max(1, current), totalPages));
  }, [totalPages]);

  React.useEffect(() => {
    if (!selectedId) {
      return;
    }

    const selectedIndex = filteredItems.findIndex((item) => item.id === selectedId);
    if (selectedIndex < 0) {
      return;
    }

    setPage(Math.floor(selectedIndex / NEWS_ITEMS_PER_PAGE) + 1);
  }, [filteredItems, selectedId]);

  React.useEffect(() => {
    if (!selected || selected.read) {
      return;
    }

    api.news
      .updateMany({
        where: { id: selected.id },
        data: { read: true },
      })
      .then(setItems);
  }, [selected?.id]);

  const markAllRead = () =>
    api.news
      .updateMany({
        where: { read: false },
        data: { read: true },
      })
      .then(setItems);

  const generateTestItems = () =>
    Promise.resolve(setWorking(true))
      .then(() => api.news.generateTest())
      .then(() => refresh())
      .finally(() => setWorking(false));

  const clearTestItems = () =>
    Promise.resolve(setWorking(true))
      .then(() => api.news.clearTest())
      .then(() => {
        setSelectedId(null);
        refresh();
      })
      .finally(() => setWorking(false));

  return (
    <div id="news" className="dashboard news-hltv-theme">
      <header>
        <button disabled={working} onClick={refresh}>
          <FaSyncAlt />
          Refresh
        </button>
        <button disabled={working} onClick={generateTestItems}>
          <FaFlask />
          Run Generator
        </button>
        <button disabled={working || !items.some((item) => !item.read)} onClick={markAllRead}>
          <FaCheckDouble />
          Mark Read
        </button>
        <button disabled={working || !items.length} onClick={clearTestItems}>
          <FaTrash />
          Clear Generated
        </button>
      </header>
      <main>
        <section className="divide-base-content/10 divide-y">
          <header className="bg-base-100 sticky top-0 z-10 p-3">
            <div className="join w-full">
              {FILTERS.map((item) => (
                <button
                  key={item.value}
                  className={cx(
                    'btn join-item btn-sm flex-1',
                    filter === item.value && 'btn-primary',
                  )}
                  onClick={() => {
                    setFilter(item.value);
                    setSelectedId(null);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </header>
          {!filteredItems.length && (
            <article className="center h-96 gap-3 px-6 text-center">
              <FaNewspaper className="text-muted size-20" />
              <p className="text-muted">No stories yet. Run the generator to test the feed.</p>
            </article>
          )}
          {visibleItems.map((item) => (
            <article
              key={`${item.id}__news_item`}
              className={cx(
                'hover:bg-base-content/5 cursor-pointer border border-transparent p-4',
                selected?.id === item.id && 'bg-base-200',
                hasGoldenNewsHue(item) &&
                  'border-orange-300/10 bg-orange-500/[0.025] shadow-[inset_0_0_0_1px_rgba(251,146,60,0.03)]',
              )}
              onClick={() => setSelectedId(item.id)}
            >
              <header className="relative pr-4">
                {!item.read && (
                  <span className="badge-xxs badge badge-info absolute top-1 right-0" />
                )}
                <div className="text-base-content/60 mb-2 flex items-center gap-2 text-xs font-bold uppercase">
                  {item.type === 'SHORT' ? <FaBolt /> : <FaNewspaper />}
                  <Flag code={getFlagCode(item)} />
                  <span>{getTopicLabel(item)}</span>
                  <span className="flex items-center gap-1">
                    <FaClock />
                    {fmtDate(toDate(item.publishedAt))}
                  </span>
                </div>
                <p className="leading-tight font-bold">{item.headline}</p>
              </header>
              <footer>
                <p className="line-clamp-2 pt-2 text-sm opacity-70">{item.summary}</p>
              </footer>
            </article>
          ))}
          {filteredItems.length > NEWS_ITEMS_PER_PAGE && (
            <footer className="border-base-content/10 bg-base-100 sticky bottom-0 z-10 flex items-center justify-between border-t px-3 py-2">
              <Pagination
                numPage={page}
                totalPages={totalPages}
                onChange={setPage}
                onClick={setPage}
              />
              <span className="text-base-content/60 font-mono text-xs">
                {filteredItems.length} Stories
              </span>
            </footer>
          )}
        </section>
        <section className="bg-base-100 overflow-y-auto p-6">
          {!selected && (
            <article className="center h-full gap-3">
              <FaNewspaper className="text-muted size-24" />
              <p className="text-muted">Select a story.</p>
            </article>
          )}
          {selected && (
            <article className="border-base-content/10 bg-base-200/80 mx-auto max-w-5xl border shadow-lg">
              <header className="border-base-content/10 relative border-b px-7 py-6">
                <div
                  className={cx(
                    'grid items-center gap-6',
                    selectedMvpLogo && selectedCompetitionId
                      ? 'grid-cols-[9rem_minmax(0,1fr)]'
                      : 'grid-cols-1',
                  )}
                >
                  {selectedMvpLogo && selectedCompetitionId && (
                    <CompetitionHoverCard competitionId={selectedCompetitionId}>
                      <Link
                        to={`/competitions?competitionId=${selectedCompetitionId}`}
                        className="flex w-full items-center justify-center"
                      >
                        <img
                          src={selectedMvpLogo}
                          alt=""
                          className="max-h-24 max-w-full object-contain"
                        />
                      </Link>
                    </CompetitionHoverCard>
                  )}
                  <div className="min-w-0">
                    <div className="text-base-content/60 mb-3 flex flex-wrap items-center gap-2 text-xs font-bold uppercase">
                      {selected.type === 'SHORT' ? <FaBolt /> : <FaNewspaper />}
                      <Flag code={getFlagCode(selected)} className="opacity-100" />
                      <span>{getTopicLabel(selected)}</span>
                      <span className="flex items-center gap-1">
                        <FaClock />
                        {fmtDate(toDate(selected.publishedAt))}
                      </span>
                    </div>
                    <h1 className="mb-2 text-3xl leading-tight font-black">{selected.headline}</h1>
                    <p className="max-w-4xl text-base opacity-70">{selected.summary}</p>
                  </div>
                </div>
              </header>
              {selectedWelcomeGraphic ? (
                <div className="px-7 py-6">
                  <div className="mx-auto max-w-3xl">
                    {selectedWelcomeBody?.openingBlock && (
                      <div className="mb-6">
                        <NewsBody
                          body={selectedWelcomeBody.openingBlock}
                          headline={selected.headline}
                          item={selected}
                        />
                      </div>
                    )}
                    <WelcomeGraphicImage graphic={selectedWelcomeGraphic} />
                    {selectedWelcomeBody?.remainingBody && (
                      <NewsBody
                        body={selectedWelcomeBody.remainingBody}
                        headline={selected.headline}
                        item={selected}
                      />
                    )}
                    <MatchPanel item={selected} />
                  </div>
                </div>
              ) : (
                <div
                  className={cx(
                    'grid gap-6 px-7 py-6',
                    selectedPayload.hideArticleImage === true || selectedHasTopPlayerRanking
                      ? 'grid-cols-1'
                      : 'grid-cols-[9rem_1fr]',
                  )}
                >
                  {selectedPayload.hideArticleImage !== true && !selectedHasTopPlayerRanking && (
                    <aside className="pt-1">
                      {selectedMvpGraphic ? (
                        <MvpArticleImage graphic={selectedMvpGraphic} image={selected.image} />
                      ) : (
                        <ArticlePlayerImageFrame src={selected.image} />
                      )}
                    </aside>
                  )}
                  <section className="min-w-0">
                    <div className="mx-auto max-w-3xl">
                      <NewsBody body={selected.body} headline={selected.headline} item={selected} />
                    </div>
                    <MatchPanel item={selected} />
                  </section>
                </div>
              )}
              <section className="px-7 pb-6">
                <div className="mx-auto max-w-3xl">
                  <RelatedLinks item={selected} />
                  <NewsComments item={selected} fmtDate={fmtDate} />
                </div>
              </section>
            </article>
          )}
        </section>
      </main>
    </div>
  );
}
