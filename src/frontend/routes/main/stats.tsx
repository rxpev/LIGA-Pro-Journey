/**
 * League match stats concept route.
 *
 * @module
 */
import React from 'react';
import { groupBy } from 'lodash';
import { format, subMonths } from 'date-fns';
import { Constants, Eagers, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { AppStateContext } from '@liga/frontend/redux';
import { FaChartBar } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import CompetitionLocationTag from './competitions/competition-location-tag';

declare const require: {
  context: (
    path: string,
    recursive: boolean,
    regExp: RegExp,
  ) => {
    (id: string): string;
    keys(): string[];
  };
};

type MatchRecord = any;

const weaponAssetContext = require.context('@liga/frontend/assets/weapons/3D', false, /\.png$/);

type CareerStintRecord = {
  teamId: number;
  startedAt: Date | string;
  endedAt: Date | string | null;
  team: {
    id: number;
    name: string;
    blazon?: string;
  };
};

type MatchPerformance = {
  match: MatchRecord;
  kills: number;
  deaths: number;
  plusMinus: number;
  rating: number;
};

type WeaponPerformance = {
  weapon: string;
  label: string;
  image?: string;
  kills: number;
  headshots: number;
  hsPercent: number;
};

type CompetitionGroupKey =
  | 'MAJOR'
  | 'ESL_PRO_LEAGUE'
  | 'ESEA_ADVANCED'
  | 'ESEA_MAIN'
  | 'ESEA_INTERMEDIATE'
  | 'ESEA_OPEN'
  | 'RMR_EUROPE'
  | 'RMR_QUALIFIERS_EUROPE'
  | 'RMR_QUALIFIERS_AMERICAS'
  | 'RMR_QUALIFIERS_ASIA'
  | 'RMR_QUALIFIERS_CHINA'
  | 'RMR_QUALIFIERS_OCEANIA';

type TimeframeOption = '' | '6' | '3' | '1';
type MatchTypeOption = '' | 'LAN' | 'ONLINE';

const CompetitionGroupLabels: Record<CompetitionGroupKey, string> = {
  MAJOR: 'Major (Challengers + Legends + Champions)',
  ESL_PRO_LEAGUE: 'ESL Pro League (Groups + Playoffs)',
  ESEA_ADVANCED: 'ESEA Advanced (Groups + Playoffs)',
  ESEA_MAIN: 'ESEA Main (Groups + Playoffs)',
  ESEA_INTERMEDIATE: 'ESEA Intermediate (Groups + Playoffs)',
  ESEA_OPEN: 'ESEA Open (Groups + Playoffs)',
  RMR_EUROPE: 'RMR (Europe A + B)',
  RMR_QUALIFIERS_EUROPE: 'RMR Qualifiers (Europe)',
  RMR_QUALIFIERS_AMERICAS: 'RMR Qualifiers (Americas)',
  RMR_QUALIFIERS_ASIA: 'RMR Qualifiers (Asia)',
  RMR_QUALIFIERS_CHINA: 'RMR Qualifiers (China)',
  RMR_QUALIFIERS_OCEANIA: 'RMR Qualifiers (Oceania)',
};

const CompetitionGroupOrder: CompetitionGroupKey[] = [
  'MAJOR',
  'ESL_PRO_LEAGUE',
  'ESEA_ADVANCED',
  'ESEA_MAIN',
  'ESEA_INTERMEDIATE',
  'ESEA_OPEN',
  'RMR_EUROPE',
  'RMR_QUALIFIERS_EUROPE',
  'RMR_QUALIFIERS_AMERICAS',
  'RMR_QUALIFIERS_ASIA',
  'RMR_QUALIFIERS_CHINA',
  'RMR_QUALIFIERS_OCEANIA',
];

const TimeframeLabels: Record<TimeframeOption, string> = {
  '': 'All time',
  '6': 'Last 6 months',
  '3': 'Last 3 months',
  '1': 'Last month',
};

const TimeframeOptions: TimeframeOption[] = ['', '6', '3', '1'];

const MatchTypeLabels: Record<MatchTypeOption, string> = {
  '': 'Any',
  LAN: 'LAN',
  ONLINE: 'Online',
};

const MatchTypeOptions: MatchTypeOption[] = ['', 'LAN', 'ONLINE'];

enum StatsTab {
  INDIVIDUAL = 'INDIVIDUAL',
  TOURNAMENTS = 'TOURNAMENTS',
  TEAMMATES = 'TEAMMATES',
  WEAPONS = 'WEAPONS',
}

function isLeagueMatch(match: MatchRecord) {
  return match.matchType !== 'FACEIT_PUG' && !!match.competition?.tier;
}

function isWithinStint(date: Date, startedAt: Date | string, endedAt: Date | string | null) {
  const start = new Date(startedAt);
  start.setHours(0, 0, 0, 0);

  const end = endedAt ? new Date(endedAt) : null;
  if (end) {
    end.setHours(23, 59, 59, 999);
  }

  return start <= date && (!end || end >= date);
}

function stintsOverlap(
  leftStart: Date | string,
  leftEnd: Date | string | null,
  rightStart: Date | string,
  rightEnd: Date | string | null,
) {
  const startA = new Date(leftStart).getTime();
  const endA = leftEnd ? new Date(leftEnd).getTime() : Number.MAX_SAFE_INTEGER;
  const startB = new Date(rightStart).getTime();
  const endB = rightEnd ? new Date(rightEnd).getTime() : Number.MAX_SAFE_INTEGER;
  return startA <= endB && startB <= endA;
}

function getCompetitionLabel(match: MatchRecord) {
  const tierSlug = match.competition?.tier?.slug;

  if (tierSlug === Constants.TierSlug.LEAGUE_PRO) {
    return 'ESL Pro League';
  }

  if (tierSlug === Constants.TierSlug.LEAGUE_PRO_PLAYOFFS) {
    return 'ESL Pro League Playoffs';
  }

  if (
    tierSlug === Constants.TierSlug.MAJOR_CHALLENGERS_STAGE ||
    tierSlug === Constants.TierSlug.MAJOR_LEGENDS_STAGE ||
    tierSlug === Constants.TierSlug.MAJOR_CHAMPIONS_STAGE
  ) {
    return Constants.IdiomaticTier[tierSlug];
  }

  const federation = match.competition?.federation?.name || 'Unknown';
  const tier = tierSlug ? Constants.IdiomaticTier[tierSlug] : 'Competition';

  return `${federation} ${tier}`.trim();
}

function getCompetitionGroup(match: MatchRecord): CompetitionGroupKey | null {
  const tierSlug = String(match.competition?.tier?.slug || '').toLowerCase();

  if (
    tierSlug.includes('major:challengers-stage') ||
    tierSlug.includes('major:legends-stage') ||
    tierSlug.includes('major:champions-stage')
  ) {
    return 'MAJOR';
  }

  if (tierSlug === 'league:pro' || tierSlug === 'league:pro:playoffs') {
    return 'ESL_PRO_LEAGUE';
  }

  if (tierSlug === 'league:advanced' || tierSlug === 'league:advanced:playoffs') {
    return 'ESEA_ADVANCED';
  }

  if (tierSlug === 'league:main' || tierSlug === 'league:main:playoffs') {
    return 'ESEA_MAIN';
  }

  if (tierSlug === 'league:intermediate' || tierSlug === 'league:intermediate:playoffs') {
    return 'ESEA_INTERMEDIATE';
  }

  if (tierSlug === 'league:open' || tierSlug === 'league:open:playoffs') {
    return 'ESEA_OPEN';
  }

  if (tierSlug.includes('major:europe:rmr:a') || tierSlug.includes('major:europe:rmr:b')) {
    return 'RMR_EUROPE';
  }

  if (tierSlug.includes('major:europe:open-qualifier')) return 'RMR_QUALIFIERS_EUROPE';
  if (tierSlug.includes('major:americas:open-qualifier')) return 'RMR_QUALIFIERS_AMERICAS';
  if (tierSlug.includes('major:asia:open-qualifier')) return 'RMR_QUALIFIERS_ASIA';
  if (tierSlug.includes('major:china:open-qualifier')) return 'RMR_QUALIFIERS_CHINA';
  if (tierSlug.includes('major:oce:open-qualifier')) return 'RMR_QUALIFIERS_OCEANIA';

  return null;
}

function getPlayerRating(kills: number, deaths: number) {
  const boost = 0.05;
  const raw = (kills + 1) / (deaths + 1) + boost * (kills - deaths);
  const scale = 0.5;
  const offset = 0.401;
  return scale * raw + offset;
}

function getPlayerPerformanceFromEvents(playerId: number, events: any[]) {
  const killOrAssistEvents = events.filter((event: any) => !!event.attackerId || !!event.assistId);
  const kills = killOrAssistEvents.filter((event: any) => event.attackerId === playerId).length;
  const deaths = killOrAssistEvents.filter(
    (event: any) => event.victimId === playerId && !event.assistId,
  ).length;
  const plusMinus = kills - deaths;
  const rating = getPlayerRating(kills, deaths);
  return { kills, deaths, plusMinus, rating };
}

function getSeriesAwarePerformance(
  playerId: number,
  eventsForStats: any[],
  useSeriesAverageRating: boolean,
) {
  const performance = getPlayerPerformanceFromEvents(playerId, eventsForStats);

  if (!useSeriesAverageRating) {
    return performance;
  }

  const ratings = Object.values(groupBy(eventsForStats, 'gameId'))
    .map((gameEvents: any) => getPlayerPerformanceFromEvents(playerId, gameEvents).rating)
    .filter((rating: number) => Number.isFinite(rating));

  if (!ratings.length) {
    return performance;
  }

  return {
    ...performance,
    rating: ratings.reduce((sum: number, rating: number) => sum + rating, 0) / ratings.length,
  };
}

function isPlayedGame(game: any) {
  const scores = (game?.teams || []).map((team: any) => Number(team.score || 0));
  if (!scores.length) return false;
  return scores.some((score: number) => score > 0);
}

function isWithinTimeframe(matchDate: Date | string, currentDate: Date | string, months: string) {
  const parsedMonths = Number(months);
  if (!Number.isFinite(parsedMonths) || parsedMonths <= 0) {
    return true;
  }

  const date = new Date(matchDate);
  const end = new Date(currentDate);
  end.setHours(23, 59, 59, 999);

  const start = subMonths(end, parsedMonths);
  start.setHours(0, 0, 0, 0);

  return date >= start && date <= end;
}

function getPlayedGames(match: MatchRecord) {
  return [...(match.games || [])]
    .filter((game: any) => isPlayedGame(game))
    .sort((a: any, b: any) => Number(b.num ?? 0) - Number(a.num ?? 0));
}

function getWeaponKey(weapon: string) {
  const normalized = weapon.replace(/^weapon_/, '').toLowerCase();

  if (['incgrenade', 'inferno', 'molotov'].includes(normalized)) {
    return 'incgrenade';
  }

  return normalized;
}

function getWeaponImage(weapon: string) {
  const weaponKey = getWeaponKey(weapon);
  const assetKey = `./weapon_${weaponKey}.png`;

  if (weaponAssetContext.keys().includes(assetKey)) {
    return weaponAssetContext(assetKey);
  }

  if (weaponKey.startsWith('knife')) {
    return weaponAssetContext('./weapon_knife.png');
  }

  return undefined;
}

function formatWeaponName(weapon: string) {
  const normalized = getWeaponKey(weapon);
  const labels: Record<string, string> = {
    ak47: 'AK-47',
    aug: 'AUG',
    awp: 'AWP',
    bizon: 'PP-Bizon',
    cz75a: 'CZ75-Auto',
    deagle: 'Desert Eagle',
    elite: 'Dual Berettas',
    famas: 'FAMAS',
    fiveseven: 'Five-SeveN',
    g3sg1: 'G3SG1',
    galilar: 'Galil AR',
    glock: 'Glock-18',
    hegrenade: 'HE Grenade',
    hkp2000: 'P2000',
    incgrenade: 'Fire Grenade',
    m249: 'M249',
    m4a1: 'M4A4',
    m4a1_silencer: 'M4A1-S',
    mac10: 'MAC-10',
    mag7: 'MAG-7',
    mp5sd: 'MP5-SD',
    mp7: 'MP7',
    mp9: 'MP9',
    negev: 'Negev',
    nova: 'Nova',
    p250: 'P250',
    p90: 'P90',
    revolver: 'R8 Revolver',
    sawedoff: 'Sawed-Off',
    scar20: 'SCAR-20',
    sg556: 'SG 553',
    ssg08: 'SSG 08',
    tec9: 'Tec-9',
    ump45: 'UMP-45',
    usp_silencer: 'USP-S',
    xm1014: 'XM1014',
  };

  return (
    labels[normalized] ||
    normalized
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  );
}

function getCareerMatchCompetitor(
  match: MatchRecord,
  careerStints: CareerStintRecord[],
  selectedCareerTeamId = '',
) {
  const matchingStints = careerStints
    .filter((stint: any) => {
      if (selectedCareerTeamId && String(stint.teamId) !== selectedCareerTeamId) {
        return false;
      }

      return isWithinStint(match.date, stint.startedAt, stint.endedAt);
    })
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  return matchingStints
    .map((stint) => match.competitors.find((competitor: any) => competitor.teamId === stint.teamId))
    .find(Boolean);
}

export default function LeagueStatsConcept(): JSX.Element {
  const { state } = React.useContext(AppStateContext);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<StatsTab>(StatsTab.INDIVIDUAL);
  const [matches, setMatches] = React.useState<MatchRecord[]>([]);
  const [careerStints, setCareerStints] = React.useState<CareerStintRecord[]>([]);
  const [selectedCompetitionGroup, setSelectedCompetitionGroup] = React.useState<string>('');
  const [selectedMap, setSelectedMap] = React.useState<string>('');
  const [selectedSeason, setSelectedSeason] = React.useState<string>('');
  const [selectedTimeframe, setSelectedTimeframe] = React.useState<TimeframeOption>('');
  const [selectedMatchType, setSelectedMatchType] = React.useState<MatchTypeOption>('');
  const [selectedCareerTeamId, setSelectedCareerTeamId] = React.useState<string>('');
  const [selectedTeammateId, setSelectedTeammateId] = React.useState<string>('');
  const [matchPage, setMatchPage] = React.useState(1);
  const [tournamentPage, setTournamentPage] = React.useState(1);
  const previousActiveTab = React.useRef<StatsTab>(activeTab);
  const shouldDefaultTeammateTeam = React.useRef(false);

  const settingsAll = React.useMemo(() => {
    if (!state.profile) {
      return Constants.Settings;
    }

    return Util.loadSettings(state.profile.settings);
  }, [state.profile]);

  React.useEffect(() => {
    if (!state.profile?.player?.id) {
      setCareerStints([]);
      return;
    }

    api.players
      .find({
        include: {
          careerStints: {
            include: {
              team: true,
            },
          },
        },
        where: {
          id: state.profile.player.id,
        },
      })
      .then((player: any) => setCareerStints((player?.careerStints || []) as CareerStintRecord[]));
  }, [state.profile?.player?.id]);

  const careerTeamIds = React.useMemo(
    () => [...new Set(careerStints.map((stint) => stint.teamId))],
    [careerStints],
  );

  React.useEffect(() => {
    if (!careerTeamIds.length) {
      setMatches([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    api.matches
      .all({
        ...Eagers.matchEvents,
        where: {
          status: Constants.MatchStatus.COMPLETED,
          competitors: {
            some: {
              teamId: {
                in: careerTeamIds,
              },
            },
          },
          competitionId: {
            not: null as null,
          },
          matchType: {
            not: 'FACEIT_PUG',
          },
        },
        orderBy: {
          date: 'desc',
        },
      })
      .then((result: any[]) => setMatches(result.filter(isLeagueMatch)))
      .finally(() => setLoading(false));
  }, [careerTeamIds]);

  const mapOptions = React.useMemo(() => {
    const options = new Set<string>();
    matches.forEach((match: any) =>
      getPlayedGames(match).forEach((game: any) => game.map && options.add(game.map)),
    );

    return [...options].sort((a, b) =>
      Util.convertMapPool(a, settingsAll.general.game).localeCompare(
        Util.convertMapPool(b, settingsAll.general.game),
      ),
    );
  }, [matches, settingsAll.general.game]);

  const seasonOptions = React.useMemo(() => {
    const seasons = new Set<number>();
    matches.forEach((match: any) => {
      if (match.competition?.season !== undefined && match.competition?.season !== null) {
        seasons.add(match.competition.season);
      }
    });

    return [...seasons].sort((a, b) => b - a);
  }, [matches]);

  const competitionOptions = React.useMemo(() => {
    const available = new Set<CompetitionGroupKey>();
    matches.forEach((match: any) => {
      const group = getCompetitionGroup(match);
      if (group) {
        available.add(group);
      }
    });

    return CompetitionGroupOrder.filter((group) => available.has(group)).map((group) => ({
      id: group,
      label: CompetitionGroupLabels[group],
    }));
  }, [matches]);

  const careerTeamOptions = React.useMemo(() => {
    const map = new Map<number, { id: number; name: string; blazon?: string }>();
    careerStints.forEach((stint: any) =>
      map.set(stint.team.id, {
        id: stint.team.id,
        name: stint.team.name,
        blazon: stint.team.blazon,
      }),
    );
    return [...map.values()];
  }, [careerStints]);

  const matchesByFilters = React.useMemo(() => {
    if (activeTab === StatsTab.TOURNAMENTS) {
      return matches;
    }

    return matches.filter((match: any) => {
      const byCompetition = selectedCompetitionGroup
        ? getCompetitionGroup(match) === selectedCompetitionGroup
        : true;
      const byMap = selectedMap
        ? getPlayedGames(match).some((game: any) => game.map === selectedMap)
        : true;
      const byMatchType = selectedMatchType
        ? selectedMatchType === 'LAN'
          ? Boolean(match.competition?.tier?.lan)
          : !Boolean(match.competition?.tier?.lan)
        : true;
      const bySeason = selectedSeason ? String(match.competition?.season) === selectedSeason : true;
      const byTimeframe = state.profile?.date
        ? isWithinTimeframe(match.date, state.profile.date, selectedTimeframe)
        : true;
      const eligibleStints = careerStints.filter((stint: any) => {
        if (selectedCareerTeamId && String(stint.teamId) !== selectedCareerTeamId) {
          return false;
        }

        return isWithinStint(match.date, stint.startedAt, stint.endedAt);
      });

      const byCareerTeam = eligibleStints.some((stint: any) =>
        match.competitors.some((competitor: any) => competitor.teamId === stint.teamId),
      );

      return byCompetition && byMap && byMatchType && bySeason && byTimeframe && byCareerTeam;
    });
  }, [
    matches,
    selectedCompetitionGroup,
    selectedMap,
    selectedMatchType,
    selectedSeason,
    selectedTimeframe,
    selectedCareerTeamId,
    careerStints,
    activeTab,
    state.profile?.date,
  ]);

  const ownPlayerPerformances = React.useMemo(() => {
    const playerId = state.profile?.player?.id;
    if (!playerId) return [] as MatchPerformance[];
    const scopedSelectedMap = activeTab === StatsTab.TOURNAMENTS ? '' : selectedMap;

    return matchesByFilters.flatMap((match: any) => {
      const played = (match.players || []).some((player: any) => player.id === playerId);
      if (!played) {
        return [];
      }

      const gamesForStats = scopedSelectedMap
        ? getPlayedGames(match).filter((game: any) => game.map === scopedSelectedMap)
        : getPlayedGames(match);
      if (!gamesForStats.length) {
        return [];
      }

      const allEvents = match.events || [];
      const eventsForStats =
        scopedSelectedMap || (match.games || []).length > 1
          ? allEvents.filter((event: any) =>
              gamesForStats.some((game: any) => game.id === event.gameId),
            )
          : allEvents;

      const performance = getSeriesAwarePerformance(
        playerId,
        eventsForStats,
        !scopedSelectedMap && (match.games || []).length > 1,
      );
      return [{ match, ...performance }];
    });
  }, [matchesByFilters, state.profile?.player?.id, selectedMap, activeTab]);

  const teammates = React.useMemo(() => {
    const selfId = state.profile?.player?.id;
    const map = new Map<number, { id: number; name: string; avatar?: string }>();

    matchesByFilters.forEach((match: any) => {
      const ownTeam = getCareerMatchCompetitor(match, careerStints, selectedCareerTeamId);
      const userTeamStints = careerStints.filter(
        (stint: any) =>
          stint.teamId === ownTeam?.teamId &&
          isWithinStint(match.date, stint.startedAt, stint.endedAt),
      );
      (match.players || []).forEach((player: any) => {
        if (player.id === selfId) {
          return;
        }

        const teammateStints = (player.careerStints || []).filter(
          (stint: any) =>
            stint.teamId === ownTeam?.teamId &&
            isWithinStint(match.date, stint.startedAt, stint.endedAt),
        );
        const hasOverlap = teammateStints.some((teammateStint: any) =>
          userTeamStints.some((userStint: any) =>
            stintsOverlap(
              teammateStint.startedAt,
              teammateStint.endedAt,
              userStint.startedAt,
              userStint.endedAt,
            ),
          ),
        );

        if (hasOverlap) {
          map.set(player.id, { id: player.id, name: player.name, avatar: player.avatar });
        }
      });
    });

    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [matchesByFilters, careerStints, selectedCareerTeamId, state.profile?.player?.id]);

  React.useEffect(() => {
    if (!teammates.length) {
      setSelectedTeammateId('');
      return;
    }

    if (
      !selectedTeammateId ||
      !teammates.some((teammate) => String(teammate.id) === selectedTeammateId)
    ) {
      setSelectedTeammateId(String(teammates[0].id));
    }
  }, [teammates, selectedTeammateId]);

  React.useEffect(() => {
    setMatchPage(1);
  }, [
    activeTab,
    selectedCompetitionGroup,
    selectedSeason,
    selectedTimeframe,
    selectedMap,
    selectedMatchType,
    selectedCareerTeamId,
    selectedTeammateId,
  ]);

  React.useEffect(() => {
    setTournamentPage(1);
  }, [activeTab]);

  React.useEffect(() => {
    const enteredTeammatesTab =
      activeTab === StatsTab.TEAMMATES && previousActiveTab.current !== StatsTab.TEAMMATES;
    previousActiveTab.current = activeTab;

    if (enteredTeammatesTab) {
      shouldDefaultTeammateTeam.current = true;
    }

    if (activeTab !== StatsTab.TEAMMATES) {
      return;
    }

    if (selectedCareerTeamId) {
      shouldDefaultTeammateTeam.current = false;
      return;
    }

    if (!shouldDefaultTeammateTeam.current) {
      return;
    }

    const currentTeamId = state.profile?.teamId;
    if (!currentTeamId) {
      shouldDefaultTeammateTeam.current = false;
      return;
    }

    if (currentTeamId && careerTeamOptions.some((team: any) => team.id === currentTeamId)) {
      shouldDefaultTeammateTeam.current = false;
      setSelectedCareerTeamId(String(currentTeamId));
      return;
    }

    if (careerTeamOptions.length || careerStints.length) {
      shouldDefaultTeammateTeam.current = false;
    }
  }, [activeTab, selectedCareerTeamId, state.profile?.teamId, careerTeamOptions, careerStints]);

  const teammatePerformances = React.useMemo(() => {
    if (!selectedTeammateId) return [] as MatchPerformance[];
    const teammateId = Number(selectedTeammateId);

    return matchesByFilters.flatMap((match: any) => {
      const ownTeam = getCareerMatchCompetitor(match, careerStints, selectedCareerTeamId);
      const userTeamStints = careerStints.filter(
        (stint: any) =>
          stint.teamId === ownTeam?.teamId &&
          isWithinStint(match.date, stint.startedAt, stint.endedAt),
      );
      const teammate = (match.players || []).find((player: any) => player.id === teammateId);
      if (!teammate) {
        return [];
      }

      const teammateStints = (teammate.careerStints || []).filter(
        (stint: any) =>
          stint.teamId === ownTeam?.teamId &&
          isWithinStint(match.date, stint.startedAt, stint.endedAt),
      );
      const playedAsTeammate = teammateStints.some((teammateStint: any) =>
        userTeamStints.some((userStint: any) =>
          stintsOverlap(
            teammateStint.startedAt,
            teammateStint.endedAt,
            userStint.startedAt,
            userStint.endedAt,
          ),
        ),
      );

      if (!playedAsTeammate) {
        return [];
      }

      const gamesForStats = selectedMap
        ? getPlayedGames(match).filter((game: any) => game.map === selectedMap)
        : getPlayedGames(match);
      if (!gamesForStats.length) {
        return [];
      }

      const allEvents = match.events || [];
      const eventsForStats =
        selectedMap || (match.games || []).length > 1
          ? allEvents.filter((event: any) =>
              gamesForStats.some((game: any) => game.id === event.gameId),
            )
          : allEvents;

      const performance = getSeriesAwarePerformance(
        teammateId,
        eventsForStats,
        !selectedMap && (match.games || []).length > 1,
      );
      return [{ match, ...performance }];
    });
  }, [matchesByFilters, selectedTeammateId, selectedMap, careerStints, selectedCareerTeamId]);

  const tournamentRows = React.useMemo(() => {
    const grouped = new Map<
      number,
      {
        label: string;
        placement: string;
        plusMinus: number;
        ratingSum: number;
        count: number;
        mapsPlayed: number;
        teamBlazon: string;
        href: string;
        tier?: { lan?: boolean | null };
      }
    >();

    ownPlayerPerformances.forEach((item: any) => {
      const compId = item.match.competitionId || 0;
      const ownTeam = getCareerMatchCompetitor(item.match, careerStints);
      const placement = item.match.competition?.competitors?.find(
        (c: any) => c.teamId === ownTeam?.teamId,
      )?.position;
      const existing = grouped.get(compId);
      const playedMaps = getPlayedGames(item.match).length;

      if (!existing) {
        grouped.set(compId, {
          label: getCompetitionLabel(item.match),
          placement: placement ? `#${placement}` : '-',
          plusMinus: item.plusMinus,
          ratingSum: item.rating,
          count: 1,
          mapsPlayed: playedMaps,
          teamBlazon: ownTeam?.team.blazon || 'resources://blazonry/noteam.svg',
          tier: item.match.competition?.tier,
          href: item.match.competition
            ? `/competitions?federationId=${item.match.competition.federationId}&season=${item.match.competition.season}&tierId=${item.match.competition.tierId}`
            : '/competitions',
        });
      } else {
        existing.plusMinus += item.plusMinus;
        existing.ratingSum += item.rating;
        existing.count += 1;
        existing.mapsPlayed += playedMaps;
      }
    });

    return [...grouped.values()].map((row) => ({
      ...row,
      rating: (row.ratingSum / row.count).toFixed(2),
    }));
  }, [ownPlayerPerformances, careerStints]);

  const weaponRows = React.useMemo(() => {
    const playerId = state.profile?.player?.id;
    if (!playerId) return [] as WeaponPerformance[];

    const grouped = new Map<string, { kills: number; headshots: number }>();

    matchesByFilters.forEach((match: any) => {
      if (match.matchType === 'FACEIT_PUG') {
        return;
      }

      const played = (match.players || []).some((player: any) => player.id === playerId);
      if (!played) {
        return;
      }

      const gamesForStats = selectedMap
        ? getPlayedGames(match).filter((game: any) => game.map === selectedMap)
        : getPlayedGames(match);
      if (!gamesForStats.length) {
        return;
      }

      const gameIds = new Set(gamesForStats.map((game: any) => game.id));
      const eventsForStats =
        selectedMap || (match.games || []).length > 1
          ? (match.events || []).filter((event: any) => gameIds.has(event.gameId))
          : match.events || [];

      eventsForStats.forEach((event: any) => {
        if (event.attackerId !== playerId || !event.weapon) {
          return;
        }

        const weapon = getWeaponKey(String(event.weapon));
        const entry = grouped.get(weapon) || { kills: 0, headshots: 0 };
        entry.kills += 1;
        if (event.headshot) {
          entry.headshots += 1;
        }
        grouped.set(weapon, entry);
      });
    });

    return [...grouped.entries()]
      .map(([weapon, entry]) => ({
        weapon,
        label: formatWeaponName(weapon),
        image: getWeaponImage(weapon),
        kills: entry.kills,
        headshots: entry.headshots,
        hsPercent: entry.kills ? Math.round((entry.headshots / entry.kills) * 100) : 0,
      }))
      .sort(
        (a, b) => b.kills - a.kills || b.hsPercent - a.hsPercent || a.label.localeCompare(b.label),
      );
  }, [matchesByFilters, selectedMap, state.profile?.player?.id]);

  const activePerformances =
    activeTab === StatsTab.TEAMMATES ? teammatePerformances : ownPlayerPerformances;
  const summary = React.useMemo(() => {
    const totals = activePerformances.reduce(
      (acc: any, item: any) => {
        acc.matches += 1;
        acc.kills += item.kills;
        acc.deaths += item.deaths;
        acc.plusMinus += item.plusMinus;
        acc.ratingSum += item.rating;
        return acc;
      },
      { matches: 0, kills: 0, deaths: 0, plusMinus: 0, ratingSum: 0 },
    );

    return {
      ...totals,
      avgRating: totals.matches ? Number((totals.ratingSum / totals.matches).toFixed(2)) : 0,
      kdRatio: totals.deaths ? Number((totals.kills / totals.deaths).toFixed(2)) : totals.kills,
      avgKills: totals.matches ? Math.round(totals.kills / totals.matches) : 0,
      mapsPlayed: activePerformances.reduce((acc: number, item: any) => {
        const playedGames = getPlayedGames(item.match);
        if (selectedMap) {
          return acc + playedGames.filter((game: any) => game.map === selectedMap).length;
        }
        return acc + playedGames.length;
      }, 0),
    };
  }, [activePerformances, selectedMap]);

  const featuredMapSlug =
    selectedMap || getPlayedGames(activePerformances[0]?.match || {})[0]?.map || 'de_mirage';
  const featuredMapImage = Util.convertMapPool(featuredMapSlug, settingsAll.general.game, true);
  const featuredMapLabel = Util.convertMapPool(featuredMapSlug, settingsAll.general.game);
  const hasMapSelected = !!selectedMap;
  const selectedFilterTeam = careerTeamOptions.find(
    (team: any) => String(team.id) === selectedCareerTeamId,
  );
  const headerTeamLabel =
    activeTab !== StatsTab.TEAMMATES
      ? selectedFilterTeam?.name || state.profile?.team?.name || 'Free Agent'
      : selectedFilterTeam?.name || 'Any team';
  const headerTeamLogo =
    activeTab === StatsTab.TEAMMATES && !selectedCareerTeamId
      ? null
      : selectedFilterTeam?.blazon ||
        state.profile?.team?.blazon ||
        'resources://blazonry/noteam.svg';

  const renderMatchTable = (rows: MatchPerformance[]) => {
    const flattenedRows = rows.flatMap((item: any) => {
      const ownTeam = getCareerMatchCompetitor(item.match, careerStints, selectedCareerTeamId);
      const opponent = item.match.competitors.find(
        (competitor: any) => competitor.teamId !== ownTeam?.teamId,
      );
      const games = selectedMap
        ? getPlayedGames(item.match).filter((game: any) => game.map === selectedMap)
        : getPlayedGames(item.match);

      return games.map((game: any) => {
        const allEvents = item.match.events || [];
        const gameEvents =
          (item.match.games || []).length > 1
            ? allEvents.filter((event: any) => event.gameId === game.id)
            : allEvents.filter((event: any) => !event.gameId || event.gameId === game.id);
        const playerId =
          activeTab === StatsTab.TEAMMATES ? Number(selectedTeammateId) : state.profile?.player?.id;
        const { plusMinus, rating } = getPlayerPerformanceFromEvents(playerId, gameEvents);

        const ownGameTeam = game.teams?.find(
          (gameTeam: any) => gameTeam.teamId === ownTeam?.teamId,
        );
        const oppGameTeam = game.teams?.find(
          (gameTeam: any) => gameTeam.teamId !== ownTeam?.teamId,
        );
        const didWin = (ownGameTeam?.score || 0) >= (oppGameTeam?.score || 0);

        return {
          key: `${item.match.id}_${game.id}`,
          matchId: item.match.id,
          date: item.match.date,
          mapSlug: game.map || 'de_mirage',
          ownTeam,
          opponent,
          didWin,
          ownScore: ownGameTeam?.score ?? 0,
          oppScore: oppGameTeam?.score ?? 0,
          plusMinus,
          rating,
        };
      });
    });
    const totalPages = Math.max(1, Math.ceil(flattenedRows.length / 15));
    const pagedRows = flattenedRows.slice((matchPage - 1) * 15, matchPage * 15);

    return (
      <article className="border-base-content/10 rounded-none border">
        <header className="border-base-content/10 border-b px-4 py-3 text-sm font-semibold">
          Match History
        </header>
        <div className="overflow-x-auto">
          <table className="table-zebra table-sm table">
            <thead>
              <tr>
                <th>Team</th>
                <th className="text-center">Match Details</th>
                <th>Date</th>
                <th>Map</th>
                <th>Opponent</th>
                <th className="text-center">Result</th>
                <th className="text-center">Score</th>
                <th className="text-center">+ / -</th>
                <th className="text-center">Rating</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row) => (
                <tr key={row.key}>
                  <td>
                    <span className="inline-flex items-center gap-2">
                      <img
                        src={row.ownTeam?.team?.blazon || 'resources://blazonry/noteam.svg'}
                        className="h-5 w-5 object-contain"
                      />
                      <span>{row.ownTeam?.team?.name || 'Unknown'}</span>
                    </span>
                  </td>
                  <td className="text-center">
                    <button
                      onClick={() =>
                        api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
                          target: '/postgame',
                          payload: row.matchId,
                        })
                      }
                      className="hover:text-primary cursor-pointer"
                      title="View match details"
                    >
                      <FaChartBar className="mx-auto" />
                    </button>
                  </td>
                  <td>{format(row.date, 'PP')}</td>
                  <td>{Util.convertMapPool(row.mapSlug, settingsAll.general.game)}</td>
                  <td>
                    <span className="inline-flex items-center gap-2">
                      <img
                        src={row.opponent?.team?.blazon || 'resources://blazonry/noteam.svg'}
                        className="h-5 w-5 object-contain"
                      />
                      <span>{row.opponent?.team?.name || 'TBD'}</span>
                    </span>
                  </td>
                  <td className="text-center">
                    <span
                      className={`badge badge-sm border-0 text-white ${
                        row.didWin ? 'bg-success/80' : 'bg-error/80'
                      }`}
                    >
                      {row.didWin ? 'Win' : 'Loss'}
                    </span>
                  </td>
                  <td className="text-base-content/80 text-center">
                    {row.ownScore}-{row.oppScore}
                  </td>
                  <td
                    className={
                      row.plusMinus > 0
                        ? 'text-success text-center font-semibold'
                        : row.plusMinus < 0
                          ? 'text-error text-center font-semibold'
                          : 'text-center font-semibold text-inherit'
                    }
                  >
                    {new Intl.NumberFormat('en-US', { signDisplay: 'exceptZero' }).format(
                      row.plusMinus,
                    )}
                  </td>
                  <td
                    className={`text-center font-semibold ${
                      row.rating > 1
                        ? 'text-success'
                        : row.rating < 1
                          ? 'text-error'
                          : 'text-inherit'
                    }`}
                  >
                    {row.rating.toFixed(2)}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={9} className="text-base-content/60 py-8 text-center text-sm">
                    No matches for selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {rows.length > 0 && (
          <footer className="border-base-content/10 flex items-center justify-end gap-2 border-t px-3 py-2">
            <button
              className="btn btn-ghost btn-xs rounded-none"
              disabled={matchPage <= 1}
              onClick={() => setMatchPage((page) => Math.max(1, page - 1))}
            >
              Prev
            </button>
            <span className="text-xs">
              Page {matchPage} / {totalPages}
            </span>
            <button
              className="btn btn-ghost btn-xs rounded-none"
              disabled={matchPage >= totalPages}
              onClick={() => setMatchPage((page) => Math.min(totalPages, page + 1))}
            >
              Next
            </button>
          </footer>
        )}
      </article>
    );
  };

  const renderWeaponTable = (rows: WeaponPerformance[]) => (
    <article className="border-base-content/10 rounded-none border">
      <header className="border-base-content/10 border-b px-4 py-3 text-sm font-semibold">
        Weapons
      </header>
      <div className="overflow-x-auto">
        <table className="table-zebra table-sm table">
          <thead>
            <tr>
              <th>Weapon</th>
              <th className="text-center">Kills</th>
              <th className="text-center">HS Kills</th>
              <th className="text-center">HS %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.weapon}>
                <td>
                  <span className="inline-flex items-center gap-3 font-semibold">
                    <span className="border-base-content/10 bg-base-200/70 flex h-16 w-28 items-center justify-center border">
                      {row.image ? (
                        <img src={row.image} className="max-h-14 max-w-24 object-contain" />
                      ) : (
                        <span className="text-base-content/40 text-xs">-</span>
                      )}
                    </span>
                    <span>{row.label}</span>
                  </span>
                </td>
                <td className="text-center">{row.kills}</td>
                <td className="text-center">{row.headshots}</td>
                <td
                  className={cx(
                    'text-center font-semibold',
                    row.hsPercent >= 50
                      ? 'text-success'
                      : row.hsPercent <= 20
                        ? 'text-error'
                        : 'text-inherit',
                  )}
                >
                  {row.hsPercent}%
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={4} className="text-base-content/60 py-8 text-center text-sm">
                  No weapon stats for selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );

  return (
    <section className="bg-base-300/40 h-full overflow-hidden">
      <header className="stack-x border-base-content/10 bg-base-200 w-full gap-0! border-b">
        {Object.values(StatsTab).map((tab) => (
          <button
            key={tab}
            className={cx(
              'btn btn-wide border-base-content/10 rounded-none border-0 border-r font-normal shadow-none',
              activeTab === tab && 'btn-active!',
            )}
            onClick={() => setActiveTab(tab)}
          >
            {tab === StatsTab.INDIVIDUAL
              ? 'Individual'
              : tab === StatsTab.TOURNAMENTS
                ? 'Tournaments'
                : tab === StatsTab.TEAMMATES
                  ? 'Teammates'
                  : 'Weapons'}
          </button>
        ))}
      </header>

      <div
        className={`grid h-[calc(100%-48px)] grid-cols-1 gap-0 ${activeTab === StatsTab.TOURNAMENTS ? '' : 'xl:grid-cols-[310px_1fr]'}`}
      >
        {activeTab !== StatsTab.TOURNAMENTS && (
          <aside className="border-base-content/10 bg-base-100 border-r p-4">
            <h2 className="text-2xl font-bold">Filters</h2>
            <p className="text-base-content/60 mt-1 text-xs">
              Timeframe, competition, season, map and team filters.
            </p>

            {activeTab === StatsTab.TEAMMATES && (
              <section className="border-base-content/10 mt-4 border p-2">
                <p className="text-base-content/70 mb-2 text-xs uppercase">Teammates</p>
                <div
                  className={cx(
                    'grid grid-cols-3 gap-2',
                    teammates.length > 6 && 'max-h-36 overflow-y-auto pr-1',
                  )}
                >
                  {teammates.map((teammate) => (
                    <button
                      key={teammate.id}
                      className={`border p-1 ${selectedTeammateId === String(teammate.id) ? 'border-primary' : 'border-base-content/10'}`}
                      onClick={() => setSelectedTeammateId(String(teammate.id))}
                    >
                      <img
                        src={teammate.avatar || 'resources://avatars/empty.png'}
                        className="mx-auto h-14 w-14 object-cover"
                      />
                    </button>
                  ))}
                </div>
              </section>
            )}

            <div className="mt-4 space-y-3">
              <fieldset>
                <label className="label pb-1 text-xs font-semibold uppercase">Competition</label>
                <select
                  className="select select-sm select-bordered w-full rounded-none"
                  value={selectedCompetitionGroup}
                  onChange={(e) => setSelectedCompetitionGroup(e.target.value)}
                >
                  <option value="">Any competition</option>
                  {competitionOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </fieldset>
              <fieldset>
                <label className="label pb-1 text-xs font-semibold uppercase">Season</label>
                <select
                  className="select select-sm select-bordered w-full rounded-none"
                  value={selectedSeason}
                  onChange={(e) => setSelectedSeason(e.target.value)}
                >
                  <option value="">All seasons</option>
                  {seasonOptions.map((season) => (
                    <option key={season} value={season}>{`Season ${season}`}</option>
                  ))}
                </select>
              </fieldset>
              <fieldset>
                <label className="label pb-1 text-xs font-semibold uppercase">Timeframe</label>
                <select
                  className="select select-sm select-bordered w-full rounded-none"
                  value={selectedTimeframe}
                  onChange={(e) => setSelectedTimeframe(e.target.value as TimeframeOption)}
                >
                  {TimeframeOptions.map((option) => (
                    <option key={option || 'all'} value={option}>
                      {TimeframeLabels[option]}
                    </option>
                  ))}
                </select>
              </fieldset>
              <fieldset>
                <label className="label pb-1 text-xs font-semibold uppercase">Map</label>
                <select
                  className="select select-sm select-bordered w-full rounded-none"
                  value={selectedMap}
                  onChange={(e) => setSelectedMap(e.target.value)}
                >
                  <option value="">Any map</option>
                  {mapOptions.map((m) => (
                    <option key={m} value={m}>
                      {Util.convertMapPool(m, settingsAll.general.game)}
                    </option>
                  ))}
                </select>
              </fieldset>
              <fieldset>
                <label className="label pb-1 text-xs font-semibold uppercase">Match type</label>
                <select
                  className="select select-sm select-bordered w-full rounded-none"
                  value={selectedMatchType}
                  onChange={(e) => setSelectedMatchType(e.target.value as MatchTypeOption)}
                >
                  {MatchTypeOptions.map((option) => (
                    <option key={option || 'any'} value={option}>
                      {MatchTypeLabels[option]}
                    </option>
                  ))}
                </select>
              </fieldset>
              <fieldset>
                <label className="label pb-1 text-xs font-semibold uppercase">Team</label>
                <select
                  className="select select-sm select-bordered w-full rounded-none"
                  value={selectedCareerTeamId}
                  onChange={(e) => setSelectedCareerTeamId(e.target.value)}
                >
                  <option value="">Any team</option>
                  {careerTeamOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </fieldset>
            </div>
          </aside>
        )}

        <main className="overflow-y-auto p-3">
          {loading && (
            <div className="flex h-full items-center justify-center">
              <span className="loading loading-bars loading-md" />
            </div>
          )}

          {!loading && activeTab !== StatsTab.TOURNAMENTS && (
            <div className="grid grid-cols-1 gap-3 2xl:grid-cols-[500px_1fr]">
              <article className="border-base-content/10 relative border">
                {hasMapSelected ? (
                  <img
                    src={featuredMapImage}
                    className="h-full min-h-[520px] w-full object-cover"
                  />
                ) : (
                  <div className="bg-base-300/40 h-full min-h-[520px] w-full" />
                )}
                <div className="from-base-300/95 via-base-300/80 to-base-300/45 absolute inset-0 bg-gradient-to-t p-4">
                  {headerTeamLogo && (
                    <img
                      src={headerTeamLogo}
                      className="absolute top-4 right-4 h-14 w-14 object-contain"
                    />
                  )}
                  <div className="mb-4 flex items-center gap-3">
                    <img
                      src={
                        (activeTab === StatsTab.TEAMMATES
                          ? teammates.find((t) => String(t.id) === selectedTeammateId)?.avatar
                          : state.profile?.player?.avatar) || 'resources://avatars/empty.png'
                      }
                      className="border-base-content/20 h-24 w-24 border object-cover"
                    />
                    <div>
                      <p className="text-2xl font-bold">
                        {activeTab === StatsTab.TEAMMATES
                          ? teammates.find((t) => String(t.id) === selectedTeammateId)?.name ||
                            'Teammate'
                          : state.profile?.player?.name || 'Player'}
                      </p>
                      <p className="text-base-content/70 text-xs">{headerTeamLabel}</p>
                      <p className="text-primary text-xs">
                        {hasMapSelected ? featuredMapLabel || featuredMapSlug : 'All maps'}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <article className="bg-base-200/55 p-4">
                      <p className="text-xs uppercase opacity-70">Rating</p>
                      <p className="text-3xl font-black">{summary.avgRating.toFixed(2)}</p>
                    </article>
                    <article className="bg-base-200/55 p-4">
                      <p className="text-xs uppercase opacity-70">Avg Kills</p>
                      <p className="text-3xl font-black">{summary.avgKills}</p>
                    </article>
                    <article className="bg-base-200/55 p-4">
                      <p className="text-xs uppercase opacity-70">Kills</p>
                      <p className="text-3xl font-black">{summary.kills}</p>
                    </article>
                    <article className="bg-base-200/55 p-4">
                      <p className="text-xs uppercase opacity-70">Deaths</p>
                      <p className="text-3xl font-black">{summary.deaths}</p>
                    </article>
                    <article className="bg-base-200/55 p-4">
                      <p className="text-xs uppercase opacity-70">K/D</p>
                      <p className="text-3xl font-black">{summary.kdRatio.toFixed(2)}</p>
                    </article>
                    <article className="bg-base-200/55 p-4">
                      <p className="text-xs uppercase opacity-70">Maps Played</p>
                      <p className="text-3xl font-black">{summary.mapsPlayed}</p>
                    </article>
                  </div>
                </div>
              </article>

              {activeTab === StatsTab.WEAPONS
                ? renderWeaponTable(weaponRows)
                : renderMatchTable(activePerformances)}
            </div>
          )}

          {!loading && activeTab === StatsTab.TOURNAMENTS && (
            <article className="border-base-content/10 border">
              <header className="border-base-content/10 border-b px-4 py-3 text-sm font-semibold">
                Participated tournaments
              </header>
              <div className="overflow-x-auto">
                <table className="table-zebra table-sm table">
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th>
                        <span className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-2">
                          <span />
                          <span>Tournament</span>
                        </span>
                      </th>
                      <th>Placement</th>
                      <th className="text-center">+ / -</th>
                      <th>Rating</th>
                      <th>Maps</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tournamentRows
                      .slice((tournamentPage - 1) * 15, tournamentPage * 15)
                      .map((row, idx) => (
                        <tr key={row.label + idx}>
                          <td>
                            <img src={row.teamBlazon} className="h-8 w-8 object-contain" />
                          </td>
                          <td>
                            <span className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-2">
                              <span className="inline-flex justify-start">
                                {row.tier?.lan && <CompetitionLocationTag tier={row.tier} />}
                              </span>
                              <Link to={row.href} className="link link-hover">
                                {row.label}
                              </Link>
                            </span>
                          </td>
                          <td
                            className={cx(
                              'font-semibold',
                              row.placement === '#1' ? 'text-warning' : 'text-inherit',
                            )}
                          >
                            {row.placement}
                          </td>
                          <td
                            className={
                              row.plusMinus > 0
                                ? 'text-success text-center font-semibold'
                                : row.plusMinus < 0
                                  ? 'text-error text-center font-semibold'
                                  : 'text-center font-semibold text-inherit'
                            }
                          >
                            {new Intl.NumberFormat('en-US', { signDisplay: 'exceptZero' }).format(
                              row.plusMinus,
                            )}
                          </td>
                          <td
                            className={`font-semibold ${Number(row.rating) > 1 ? 'text-success' : Number(row.rating) < 1 ? 'text-error' : 'text-inherit'}`}
                          >
                            {row.rating}
                          </td>
                          <td>{row.mapsPlayed}</td>
                        </tr>
                      ))}
                    {!tournamentRows.length && (
                      <tr>
                        <td colSpan={6} className="text-base-content/60 py-8 text-center text-sm">
                          No tournament records for selected filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {tournamentRows.length > 0 && (
                <footer className="border-base-content/10 flex items-center justify-end gap-2 border-t px-3 py-2">
                  <button
                    className="btn btn-ghost btn-xs rounded-none"
                    disabled={tournamentPage <= 1}
                    onClick={() => setTournamentPage((page) => Math.max(1, page - 1))}
                  >
                    Prev
                  </button>
                  <span className="text-xs">
                    Page {tournamentPage} / {Math.max(1, Math.ceil(tournamentRows.length / 15))}
                  </span>
                  <button
                    className="btn btn-ghost btn-xs rounded-none"
                    disabled={tournamentPage >= Math.max(1, Math.ceil(tournamentRows.length / 15))}
                    onClick={() =>
                      setTournamentPage((page) =>
                        Math.min(Math.max(1, Math.ceil(tournamentRows.length / 15)), page + 1),
                      )
                    }
                  >
                    Next
                  </button>
                </footer>
              )}
            </article>
          )}
        </main>
      </div>
    </section>
  );
}
