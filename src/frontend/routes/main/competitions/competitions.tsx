/**
 * Renders the layout for the competitions route.
 *
 * @module
 */
import React from 'react';
import { format } from 'date-fns';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Constants, Eagers, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { AppStateContext } from '@liga/frontend/redux';
import { useTranslation } from '@liga/frontend/hooks';
import CompetitionLocationTag from './competition-location-tag';

/** @enum */
enum TabIdentifier {
  OVERVIEW = '/competitions',
  RESULTS = '/competitions/results',
  STATISTICS = '/competitions/statistics',
  PARTICIPANTS = '/competitions/participants',
  NEWS = '/competitions/news',
}

type CompetitionTier = Awaited<ReturnType<typeof api.tiers.all<typeof Eagers.tier>>>[number];
type Competition = Awaited<
  ReturnType<typeof api.competitions.all<typeof Eagers.competition>>
>[number];
type TournamentFamily = 'all' | 'esea' | 'major' | 'cct' | 'qualifiers';

type TournamentCard = {
  key: string;
  name: string;
  eyebrow: string;
  family: TournamentFamily | 'event';
  accent: string;
  tiers: CompetitionTier[];
};

const FEDERATION_LABELS: Partial<Record<Constants.FederationSlug, string>> = {
  [Constants.FederationSlug.ESPORTS_EUROPA]: 'Europe',
  [Constants.FederationSlug.ESPORTS_AMERICAS]: 'Americas',
  [Constants.FederationSlug.ESPORTS_ASIA]: 'Asia',
  [Constants.FederationSlug.ESPORTS_OCE]: 'OCE',
  [Constants.FederationSlug.ESPORTS_WORLD]: 'International',
};

const FEDERATION_ORDER: Constants.FederationSlug[] = [
  Constants.FederationSlug.ESPORTS_WORLD,
  Constants.FederationSlug.ESPORTS_EUROPA,
  Constants.FederationSlug.ESPORTS_AMERICAS,
  Constants.FederationSlug.ESPORTS_ASIA,
  Constants.FederationSlug.ESPORTS_OCE,
];

function getTournamentThumbnail(
  card: TournamentCard,
  federation?: string,
  organizer?: string | null,
) {
  const name = card.name.toLowerCase();
  const organizerName = (organizer || '').toLowerCase();
  if (name.includes('challenger') || name.includes('pro league')) return null;

  let file = 'major-pgl.png';

  if (name.includes('cash cup')) file = 'cashcup.png';
  else if (name.includes('esea')) file = 'esea.png';
  else if (name.includes('rmr')) {
    const region = federation?.includes('amer')
      ? 'am'
      : federation?.includes('asia') || federation?.includes('oce')
        ? 'as'
        : 'eu';
    file = `rmr-${region}.png`;
  } else if (name.includes('blast') || organizerName.includes('blast'))
    file = name.includes('final') ? 'blast-finals.png' : 'major-blast.png';
  else if (name.includes('cct')) {
    file = name.includes('global')
      ? 'cct-global-finals.png'
      : federation?.includes('amer')
        ? 'cct-am.png'
        : federation?.includes('asia')
          ? 'cct-as.png'
          : federation?.includes('oce')
            ? 'cct-oce.png'
            : 'cct-eu.png';
  } else if (
    name.includes('perfect world') ||
    name.includes('pw') ||
    organizerName.includes('perfect world')
  )
    file = 'major-pw.png';
  else if (name.includes('starladder') || organizerName.includes('starladder'))
    file = 'major-starladder.png';
  else if (organizerName.includes('iem') && name === 'major') file = 'major-iem.png';
  else if (name.includes('iem')) file = 'iem-cologne-krakow.png';
  else if (name.includes('iem')) file = 'iem-cologne-krakow.png';

  return `resources://competitions/thumbnail/${file}`;
}

const INTERNATIONAL_ORDER: Partial<Record<Constants.LeagueSlug | string, number>> = {
  'major:international': 10,
  [Constants.LeagueSlug.ESPORTS_BLAST]: 20,
  [Constants.LeagueSlug.ESPORTS_IEM_COLOGNE]: 30,
  [Constants.LeagueSlug.ESPORTS_IEM_KRAKOW]: 40,
  [Constants.LeagueSlug.ESPORTS_PRO_LEAGUE]: 50,
  [Constants.LeagueSlug.ESPORTS_ESL_CHALLENGER]: 60,
  [Constants.LeagueSlug.ESPORTS_CCT_GLOBAL]: 70,
};

const ESEA_TOURNAMENT_ORDER: Partial<Record<string, number>> = {
  [`${Constants.LeagueSlug.ESPORTS_LEAGUE}:Advanced Division`]: 10,
  [`${Constants.LeagueSlug.ESPORTS_LEAGUE}:Main Division`]: 20,
  [`${Constants.LeagueSlug.ESPORTS_LEAGUE}:Intermediate Division`]: 30,
  [`${Constants.LeagueSlug.ESPORTS_LEAGUE}:Open Division`]: 40,
  [Constants.LeagueSlug.ESPORTS_ESEA_CASH_CUP]: 50,
};

function getStageOrder(tier: CompetitionTier) {
  const slug = tier.slug as Constants.TierSlug;
  const stageOrder: Partial<Record<Constants.TierSlug, number>> = {
    [Constants.TierSlug.LEAGUE_OPEN]: 10,
    [Constants.TierSlug.LEAGUE_INTERMEDIATE]: 10,
    [Constants.TierSlug.LEAGUE_MAIN]: 10,
    [Constants.TierSlug.LEAGUE_ADVANCED]: 10,
    [Constants.TierSlug.LEAGUE_PRO]: 10,
    [Constants.TierSlug.ESL_CHALLENGER]: 10,
    [Constants.TierSlug.CCT_SERIES]: 10,
    [Constants.TierSlug.CCT_OCE_SERIES]: 10,
    [Constants.TierSlug.IEM_COLOGNE_GROUP_A]: 10,
    [Constants.TierSlug.IEM_KRAKOW_GROUP_A]: 10,
    [Constants.TierSlug.IEM_COLOGNE_GROUP_B]: 20,
    [Constants.TierSlug.IEM_KRAKOW_GROUP_B]: 20,
    [Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_1]: 10,
    [Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_1]: 10,
    [Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1]: 10,
    [Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_1]: 10,
    [Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_1]: 10,
    [Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_2]: 20,
    [Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_2]: 20,
    [Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_2]: 20,
    [Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_2]: 20,
    [Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_2]: 20,
    [Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3]: 30,
    [Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_4]: 40,
    [Constants.TierSlug.MAJOR_ASIA_RMR]: 50,
    [Constants.TierSlug.MAJOR_AMERICAS_RMR]: 50,
    [Constants.TierSlug.MAJOR_EUROPE_RMR_A]: 50,
    [Constants.TierSlug.MAJOR_EUROPE_RMR_B]: 60,
    [Constants.TierSlug.MAJOR_CHALLENGERS_STAGE]: 70,
    [Constants.TierSlug.MAJOR_LEGENDS_STAGE]: 80,
    [Constants.TierSlug.MAJOR_CHAMPIONS_STAGE]: 90,
    [Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS]: 100,
    [Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS]: 100,
    [Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS]: 100,
    [Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS]: 100,
    [Constants.TierSlug.LEAGUE_PRO_PLAYOFFS]: 100,
    [Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS]: 100,
    [Constants.TierSlug.CCT_SERIES_PLAYOFFS]: 100,
    [Constants.TierSlug.CCT_OCE_PLAYOFFS]: 100,
    [Constants.TierSlug.IEM_COLOGNE_PLAYOFFS]: 100,
    [Constants.TierSlug.IEM_KRAKOW_PLAYOFFS]: 100,
  };

  return stageOrder[slug] ?? 50;
}

function getTournamentMeta(
  tier: CompetitionTier,
  federationSlug?: Constants.FederationSlug | string,
): Omit<TournamentCard, 'tiers'> {
  const slug = tier.slug as Constants.TierSlug;
  const leagueSlug = tier.league.slug as Constants.LeagueSlug;
  const displayName = Util.getCompetitionDisplayName(tier.league.name, tier.slug);

  if (leagueSlug === Constants.LeagueSlug.ESPORTS_LEAGUE) {
    const division = Constants.IdiomaticTier[tier.slug].replace(' Playoffs', '');

    return {
      key: `${leagueSlug}:${division}`,
      name: `ESEA ${division}`,
      eyebrow: 'League season',
      family: 'esea',
      accent: 'from-sky-500/25',
    };
  }

  if (leagueSlug === Constants.LeagueSlug.ESPORTS_CCT) {
    return {
      key:
        slug === Constants.TierSlug.CCT_OCE_SERIES || slug === Constants.TierSlug.CCT_OCE_PLAYOFFS
          ? 'cct:oceania'
          : 'cct:regional',
      name:
        slug === Constants.TierSlug.CCT_OCE_SERIES || slug === Constants.TierSlug.CCT_OCE_PLAYOFFS
          ? 'CCT Oceania Series'
          : 'CCT Series',
      eyebrow: 'Circuit event',
      family: 'cct',
      accent: 'from-emerald-500/25',
    };
  }

  if (leagueSlug === Constants.LeagueSlug.ESPORTS_CCT_GLOBAL) {
    return {
      key: 'cct:global-finals',
      name: 'CCT Global Finals',
      eyebrow: 'Circuit final',
      family: 'cct',
      accent: 'from-emerald-500/25',
    };
  }

  if (leagueSlug === Constants.LeagueSlug.ESPORTS_MAJOR) {
    const isQualifier = slug.includes('open-qualifier');
    const isRmr = slug.includes(':rmr');

    if (isQualifier) {
      const qualifier =
        slug === Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_1
          ? { region: 'Oceania', number: 1 }
          : slug === Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_2
            ? { region: 'Oceania', number: 2 }
            : slug === Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_1
              ? { region: 'Asia', number: 1 }
              : slug === Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_2
                ? { region: 'Asia', number: 2 }
                : slug === Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_1
                  ? { region: 'China', number: 1 }
                  : slug === Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_2
                    ? { region: 'China', number: 2 }
                    : slug === Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_1
                      ? { region: 'Americas', number: 1 }
                      : slug === Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_2
                        ? { region: 'Americas', number: 2 }
                        : slug === Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1
                          ? { region: 'Europe', number: 1 }
                          : slug === Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_2
                            ? { region: 'Europe', number: 2 }
                            : slug === Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3
                              ? { region: 'Europe', number: 3 }
                              : slug === Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_4
                                ? { region: 'Europe', number: 4 }
                                : null;

      if (qualifier) {
        return {
          key: `major:${qualifier.region.toLowerCase()}:qualifier:${qualifier.number}`,
          name: `${qualifier.region} RMR Open Qualifier #${qualifier.number}`,
          eyebrow: 'Open qualifier',
          family: 'qualifiers',
          accent: 'from-amber-500/25',
        };
      }

      return {
        key: `major:qualifiers:${slug.includes(':china:') ? 'china' : 'regional'}`,
        name: slug.includes(':china:') ? 'China RMR Qualifiers' : 'Major RMR Qualifiers',
        eyebrow: 'Open qualifiers',
        family: 'qualifiers',
        accent: 'from-amber-500/25',
      };
    }

    if (isRmr) {
      const federationLabel = federationSlug
        ? FEDERATION_LABELS[federationSlug as Constants.FederationSlug]
        : null;
      const europeRmrGroup =
        slug === Constants.TierSlug.MAJOR_EUROPE_RMR_A
          ? 'A'
          : slug === Constants.TierSlug.MAJOR_EUROPE_RMR_B
            ? 'B'
            : null;

      return {
        // Europe has two concurrent RMR tournaments. They must remain separate
        // cards so selecting one cannot silently load the other tier.
        key: europeRmrGroup ? `major:rmr:europe:${europeRmrGroup.toLowerCase()}` : 'major:rmr',
        name: federationLabel
          ? `${federationLabel} RMR${europeRmrGroup ? ` ${europeRmrGroup}` : ''}`
          : 'RMR',
        eyebrow: 'Regional major ranking',
        family: 'major',
        accent: 'from-red-500/25',
      };
    }

    return {
      key: 'major:international',
      name: 'Major',
      eyebrow: 'International stage',
      family: 'major',
      accent: 'from-red-500/25',
    };
  }

  if (leagueSlug === Constants.LeagueSlug.ESPORTS_BLAST) {
    return {
      key: leagueSlug,
      name: tier.league.name,
      eyebrow: 'BLAST finals',
      family: 'event',
      accent: 'from-purple-500/30',
    };
  }

  if (leagueSlug === Constants.LeagueSlug.ESPORTS_ESEA_CASH_CUP) {
    return {
      key: leagueSlug,
      name: tier.league.name,
      eyebrow: 'Cash cup',
      family: 'esea',
      accent: 'from-sky-500/25',
    };
  }

  if (
    leagueSlug === Constants.LeagueSlug.ESPORTS_IEM_COLOGNE ||
    leagueSlug === Constants.LeagueSlug.ESPORTS_IEM_KRAKOW ||
    leagueSlug === Constants.LeagueSlug.ESPORTS_ESL_CHALLENGER ||
    leagueSlug === Constants.LeagueSlug.ESPORTS_PRO_LEAGUE
  ) {
    return {
      key: leagueSlug,
      name: tier.league.name,
      eyebrow: 'Group play + playoffs',
      family: 'event',
      accent: 'from-cyan-500/25',
    };
  }

  if (
    leagueSlug === Constants.LeagueSlug.ESPORTS_IEM_COLOGNE_QUALIFIER ||
    leagueSlug === Constants.LeagueSlug.ESPORTS_IEM_KRAKOW_QUALIFIER
  ) {
    return {
      key: leagueSlug,
      name: tier.league.name,
      eyebrow: 'Open qualifier',
      family: 'qualifiers',
      accent: 'from-amber-500/25',
    };
  }

  return {
    key: `${leagueSlug}:${tier.slug}`,
    name: displayName,
    eyebrow: tier.league.name || 'Tournament',
    family: 'event',
    accent: 'from-base-content/10',
  };
}

function sortTournamentCards(
  cards: TournamentCard[],
  federationSlug?: Constants.FederationSlug | string,
) {
  if (federationSlug === Constants.FederationSlug.ESPORTS_WORLD) {
    return [...cards].sort((a, b) => {
      const aOrder = INTERNATIONAL_ORDER[a.key] ?? 999;
      const bOrder = INTERNATIONAL_ORDER[b.key] ?? 999;

      return aOrder === bOrder ? a.name.localeCompare(b.name) : aOrder - bOrder;
    });
  }

  return [...cards].sort((a, b) => {
    const regionalOrder = (card: TournamentCard) => {
      if (card.family === 'esea') {
        return ESEA_TOURNAMENT_ORDER[card.key] ?? 10;
      }

      if (card.family === 'major') {
        return 60;
      }

      if (card.family === 'cct') {
        return 70;
      }

      if (card.family === 'qualifiers') {
        return 80;
      }

      return 90;
    };

    const familyDiff = regionalOrder(a) - regionalOrder(b);

    if (familyDiff !== 0) {
      return familyDiff;
    }

    return a.name.localeCompare(b.name);
  });
}

function isCompetitionVisibleForSeason(
  competition: Competition,
  selectedSeasonId: number,
  currentSeason?: number | null,
) {
  if (!currentSeason || selectedSeasonId >= currentSeason) {
    return true;
  }

  return competition.status === Constants.CompetitionStatus.COMPLETED;
}

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const location = useLocation();
  const navigate = useNavigate();
  const t = useTranslation('windows');
  const { state } = React.useContext(AppStateContext);

  const [competition, setCompetition] =
    React.useState<Awaited<ReturnType<typeof api.competitions.find<typeof Eagers.competition>>>>();
  const [federations, setFederations] = React.useState<
    Awaited<ReturnType<typeof api.federations.all>>
  >([]);
  const [tiers, setTiers] = React.useState<
    Awaited<ReturnType<typeof api.tiers.all<typeof Eagers.tier>>>
  >([]);
  const [seasonCompetitions, setSeasonCompetitions] = React.useState<Awaited<
    ReturnType<typeof api.competitions.all<typeof Eagers.competition>>
  > | null>(null);
  const [competitionDates, setCompetitionDates] = React.useState<Record<number, string>>({});
  const [competitionStartDates, setCompetitionStartDates] = React.useState<Record<number, number>>(
    {},
  );

  const [selectedFederationId, setSelectedFederationId] = React.useState<number>(-1);
  const [selectedSeasonId, setSelectedSeasonId] = React.useState<number>(-1);
  const [selectedTierId, setSelectedTierId] = React.useState<number>(-1);
  const [selectedFamily, setSelectedFamily] = React.useState<TournamentFamily>('all');
  const [preserveTournamentOnSeasonChange, setPreserveTournamentOnSeasonChange] =
    React.useState(false);

  const [initializedFromQuery, setInitializedFromQuery] = React.useState(false);
  // Used to ensure we only auto-initialize filters once from the profile.
  const [initializedFromProfile, setInitializedFromProfile] = React.useState(false);
  const [initializedQueryCompetition, setInitializedQueryCompetition] = React.useState(false);
  const canViewStatistics = Boolean(state.profile?.simulateNpcMatchStats);
  const hasCompetitionStarted = Boolean(
    competition &&
      [Constants.CompetitionStatus.STARTED, Constants.CompetitionStatus.COMPLETED].includes(
        competition.status,
      ),
  );

  const queryParams = React.useMemo(() => new URLSearchParams(location.search), [location.search]);
  const queryCompetitionId = Number(queryParams.get('competitionId'));
  const queryFederationId = Number(queryParams.get('federationId'));
  const querySeasonId = Number(queryParams.get('season'));
  const queryTierId = Number(queryParams.get('tierId'));
  const hasQueryCompetitionId = Number.isFinite(queryCompetitionId) && queryCompetitionId > 0;
  const hasQueryParams =
    Number.isFinite(queryFederationId) &&
    Number.isFinite(querySeasonId) &&
    Number.isFinite(queryTierId) &&
    queryFederationId > 0 &&
    querySeasonId > 0 &&
    queryTierId > 0;

  // Build queries
  const tierQuery: Parameters<typeof api.tiers.all>[number] = React.useMemo(
    () => ({
      ...Eagers.tier,
      ...(selectedFederationId > 0
        ? {
            where: {
              league: {
                federations: {
                  some: {
                    id: selectedFederationId,
                  },
                },
              },
            },
          }
        : {}),
    }),
    [selectedFederationId],
  );

  const competitionQuery: Parameters<typeof api.competitions.find>[number] = React.useMemo(
    () => ({
      ...Eagers.competition,
      where: {
        federationId: selectedFederationId,
        season: selectedSeasonId,
        tier: {
          id: selectedTierId,
        },
      },
    }),
    [selectedFederationId, selectedSeasonId, selectedTierId],
  );

  const loadCompetition = React.useCallback(
    async (federationId: number, season: number, tierId: number) => {
      const strict = await api.competitions.find({
        ...Eagers.competition,
        where: {
          federationId,
          season,
          tier: {
            id: tierId,
          },
        },
      });

      if (strict) {
        return strict;
      }

      const tier = tiers.find((item) => item.id === tierId);
      if (!tier) {
        return undefined;
      }

      const bySlugInFederation = await api.competitions.all({
        ...Eagers.competition,
        where: {
          federationId,
          season,
          tier: {
            slug: tier.slug,
          },
        },
      });

      if (!bySlugInFederation.length) {
        return undefined;
      }

      return bySlugInFederation[0];
    },
    [tiers],
  );

  React.useEffect(() => {
    if (selectedFederationId <= 0 || selectedSeasonId <= 0) {
      setSeasonCompetitions(null);
      return;
    }

    let isCurrent = true;
    setSeasonCompetitions(null);

    api.competitions
      .all({
        ...Eagers.competition,
        where: {
          federationId: selectedFederationId,
          season: selectedSeasonId,
        },
      })
      .then((competitions) => {
        if (isCurrent) {
          setSeasonCompetitions(competitions);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedFederationId, selectedSeasonId]);

  React.useEffect(() => {
    if (!seasonCompetitions?.length) {
      setCompetitionDates({});
      setCompetitionStartDates({});
      return;
    }
    Promise.all(
      seasonCompetitions.map(async (item) => {
        const [start, end] = await Promise.all([
          api.calendar.find({
            where: { type: Constants.CalendarEntry.COMPETITION_START, payload: String(item.id) },
          }),
          api.calendar.find({
            where: { type: Constants.CalendarEntry.COMPETITION_END, payload: String(item.id) },
          }),
        ]);
        if (!start && !end) return null;
        const startValue = start?.date ? new Date(start.date) : null;
        const endValue = end?.date ? new Date(end.date) : null;
        const startDate = startValue ? format(startValue, 'MMM d') : '';
        const endDate = endValue ? format(endValue, 'MMM d, yyyy') : '';
        const dateLabel =
          startDate && endDate && startValue?.getFullYear() === endValue?.getFullYear()
            ? `${startDate} – ${format(endValue, 'MMM d')}, ${endValue.getFullYear()}`
            : [startDate, endDate].filter(Boolean).join(' – ');
        return [item.tierId, dateLabel, startValue?.getTime() ?? Number.POSITIVE_INFINITY] as const;
      }),
    ).then((entries) => {
      const datedEntries = entries.filter(Boolean) as Array<readonly [number, string, number]>;
      setCompetitionDates(
        Object.fromEntries(datedEntries.map(([tierId, label]) => [tierId, label])),
      );
      setCompetitionStartDates(
        Object.fromEntries(datedEntries.map(([tierId, , startDate]) => [tierId, startDate])),
      );
    });
  }, [seasonCompetitions]);

  // Initial data fetch
  React.useEffect(() => {
    api.federations.all().then(setFederations);
    api.tiers.all(tierQuery).then(setTiers);
  }, []);

  // Re-fetch tiers when its query changes
  React.useEffect(() => {
    api.tiers.all(tierQuery).then(setTiers);
  }, [tierQuery]);

  React.useEffect(() => {
    if (hasQueryParams || !hasQueryCompetitionId || initializedFromQuery) return;

    let isCurrent = true;

    api.competitions
      .find({
        ...Eagers.competition,
        where: {
          id: queryCompetitionId,
        },
      })
      .then((result) => {
        if (!isCurrent) {
          return;
        }

        if (result) {
          setSelectedFederationId(result.federationId);
          setSelectedSeasonId(result.season);
          setSelectedTierId(result.tierId);
          setCompetition(result);
        }

        setInitializedFromQuery(true);
        setInitializedQueryCompetition(true);
      });

    return () => {
      isCurrent = false;
    };
  }, [hasQueryParams, hasQueryCompetitionId, initializedFromQuery, queryCompetitionId]);

  React.useEffect(() => {
    if (!hasQueryParams || initializedFromQuery) return;

    setSelectedFederationId(queryFederationId);
    setSelectedSeasonId(querySeasonId);
    setSelectedTierId(queryTierId);
    setInitializedFromQuery(true);
  }, [hasQueryParams, initializedFromQuery, queryFederationId, querySeasonId, queryTierId]);

  React.useEffect(() => {
    if (!hasQueryParams || initializedQueryCompetition) return;
    if (selectedFederationId <= 0 || selectedSeasonId <= 0 || selectedTierId <= 0) return;

    loadCompetition(selectedFederationId, selectedSeasonId, selectedTierId).then((result) => {
      if (result) {
        setCompetition(result);
      }
      setInitializedQueryCompetition(true);
    });
  }, [
    hasQueryParams,
    initializedQueryCompetition,
    selectedFederationId,
    selectedSeasonId,
    selectedTierId,
  ]);

  /**
   * Auto-initialize federation/season filters from the user's profile.
   *
   * - If the user has a team, uses the team's country.
   * - If teamless, uses the player's country.
   * - Maps country → continent → federation.
   */
  React.useEffect(() => {
    if (hasQueryParams || hasQueryCompetitionId) return;
    if (!state.profile || initializedFromProfile) return;

    const competitionFederationId = state.profile.team?.competitionFederationId ?? null;
    if (competitionFederationId) {
      setSelectedFederationId(competitionFederationId);
      if (state.profile.season > 0) {
        setSelectedSeasonId(state.profile.season);
      }
      setInitializedFromProfile(true);
      return;
    }

    // Prefer team country if available, otherwise player's country.
    const playerCountryId =
      state.profile.team?.countryId ?? state.profile.player?.countryId ?? null;

    if (!playerCountryId) {
      setInitializedFromProfile(true);
      return;
    }

    const continent = state.continents.find((c) =>
      c.countries.some((country) => country.id === playerCountryId),
    );

    if (!continent) {
      setInitializedFromProfile(true);
      return;
    }

    const federationId = continent.federationId;
    if (federationId) {
      setSelectedFederationId(federationId);
    }
    if (state.profile.season > 0) {
      setSelectedSeasonId(state.profile.season);
    }

    setInitializedFromProfile(true);
  }, [
    hasQueryCompetitionId,
    hasQueryParams,
    state.profile,
    state.continents,
    initializedFromProfile,
  ]);

  /**
   * Once we know:
   * - which federation we are in
   * - the tiers for that federation
   * we can:
   *
   * - If the user has a team: pick the league tier matching the team's tier.
   * - If teamless: pick the highest league tier available in that region.
   *
   * In both cases we auto-load the corresponding competition.
   */

  const selectedFederation = React.useMemo(
    () => federations.find((federation) => federation.id === selectedFederationId),
    [federations, selectedFederationId],
  );

  const visibleTiers = React.useMemo(() => {
    if (selectedFederationId > 0 && !selectedFederation) {
      return [];
    }

    if (!selectedFederation) {
      return tiers;
    }

    if (selectedSeasonId > 0 && seasonCompetitions === null) {
      return [];
    }

    const seasonCompetitionTierIds =
      selectedSeasonId > 0
        ? new Set(
            (seasonCompetitions ?? [])
              .filter((competition) =>
                isCompetitionVisibleForSeason(competition, selectedSeasonId, state.profile?.season),
              )
              .map((competition) => competition.tierId),
          )
        : null;

    return tiers.filter((tier) => {
      if (seasonCompetitionTierIds && !seasonCompetitionTierIds.has(tier.id)) {
        return false;
      }

      const leagueFederationSlugs = tier.league.federations.map(
        (federation) => federation.slug as Constants.FederationSlug,
      );

      if (!leagueFederationSlugs.includes(selectedFederation.slug as Constants.FederationSlug)) {
        return false;
      }

      if (tier.league.slug !== Constants.LeagueSlug.ESPORTS_LEAGUE) {
        if (tier.league.slug === Constants.LeagueSlug.ESPORTS_CCT) {
          const regionalSeriesTiers = [
            Constants.TierSlug.CCT_SERIES,
            Constants.TierSlug.CCT_SERIES_PLAYOFFS,
          ];
          const oceaniaSeriesTiers = [
            Constants.TierSlug.CCT_OCE_SERIES,
            Constants.TierSlug.CCT_OCE_PLAYOFFS,
          ];

          if (selectedFederation.slug === Constants.FederationSlug.ESPORTS_OCE) {
            return oceaniaSeriesTiers.includes(tier.slug as Constants.TierSlug);
          }

          if (
            [
              Constants.FederationSlug.ESPORTS_AMERICAS,
              Constants.FederationSlug.ESPORTS_ASIA,
              Constants.FederationSlug.ESPORTS_EUROPA,
            ].includes(selectedFederation.slug as Constants.FederationSlug)
          ) {
            return regionalSeriesTiers.includes(tier.slug as Constants.TierSlug);
          }

          return false;
        }

        if (tier.league.slug !== Constants.LeagueSlug.ESPORTS_MAJOR) {
          return true;
        }

        if (selectedFederation.slug === Constants.FederationSlug.ESPORTS_ASIA) {
          return (
            tier.slug === Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_1 ||
            tier.slug === Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_2 ||
            tier.slug === Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_1 ||
            tier.slug === Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_2 ||
            tier.slug === Constants.TierSlug.MAJOR_ASIA_RMR
          );
        }

        if (selectedFederation.slug === Constants.FederationSlug.ESPORTS_OCE) {
          return (
            tier.slug === Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_1 ||
            tier.slug === Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_2
          );
        }

        if (selectedFederation.slug === Constants.FederationSlug.ESPORTS_AMERICAS) {
          return (
            tier.slug === Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_1 ||
            tier.slug === Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_2 ||
            tier.slug === Constants.TierSlug.MAJOR_AMERICAS_RMR
          );
        }

        if (selectedFederation.slug === Constants.FederationSlug.ESPORTS_EUROPA) {
          return (
            tier.slug === Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1 ||
            tier.slug === Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_2 ||
            tier.slug === Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3 ||
            tier.slug === Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_4 ||
            tier.slug === Constants.TierSlug.MAJOR_EUROPE_RMR_A ||
            tier.slug === Constants.TierSlug.MAJOR_EUROPE_RMR_B
          );
        }

        if (selectedFederation.slug === Constants.FederationSlug.ESPORTS_WORLD) {
          return (
            tier.slug === Constants.TierSlug.MAJOR_CHALLENGERS_STAGE ||
            tier.slug === Constants.TierSlug.MAJOR_LEGENDS_STAGE ||
            tier.slug === Constants.TierSlug.MAJOR_CHAMPIONS_STAGE
          );
        }

        return false;
      }

      return Util.isLeagueTierEnabledForFederation(
        tier.slug as Constants.TierSlug,
        selectedFederation.slug as Constants.FederationSlug,
      );
    });
  }, [seasonCompetitions, selectedFederation, selectedSeasonId, state.profile?.season, tiers]);

  const federationTabs = React.useMemo(
    () =>
      [...federations]
        .filter((federation) =>
          FEDERATION_ORDER.includes(federation.slug as Constants.FederationSlug),
        )
        .sort((a, b) => {
          const aIndex = FEDERATION_ORDER.indexOf(a.slug as Constants.FederationSlug);
          const bIndex = FEDERATION_ORDER.indexOf(b.slug as Constants.FederationSlug);

          return (aIndex < 0 ? 99 : aIndex) - (bIndex < 0 ? 99 : bIndex);
        }),
    [federations],
  );

  const allTournamentCards = React.useMemo(() => {
    const cards = visibleTiers.reduce<Record<string, TournamentCard>>((acc, tier) => {
      const meta = getTournamentMeta(tier, selectedFederation?.slug as Constants.FederationSlug);

      acc[meta.key] ||= {
        ...meta,
        tiers: [],
      };
      acc[meta.key].tiers.push(tier);

      return acc;
    }, {});

    return sortTournamentCards(
      Object.values(cards).map((card) => ({
        ...card,
        tiers: [...card.tiers].sort((a, b) => getStageOrder(a) - getStageOrder(b)),
      })),
      selectedFederation?.slug as Constants.FederationSlug,
    );
  }, [selectedFederation, visibleTiers]);

  const tournamentCards = React.useMemo(
    () =>
      allTournamentCards.filter(
        (card) => selectedFamily === 'all' || card.family === selectedFamily,
      ),
    [allTournamentCards, selectedFamily],
  );
  const isCurrentSeason = selectedSeasonId === state.profile?.season;

  const orderedTournamentCards = React.useMemo(() => {
    if (!isCurrentSeason) {
      return tournamentCards;
    }

    const getStatus = (card: TournamentCard) => {
      const tournament = seasonCompetitions?.find((item) =>
        card.tiers.some((tier) => tier.id === item.tierId),
      );
      return tournament?.status === Constants.CompetitionStatus.COMPLETED
        ? 'completed'
        : tournament?.status === Constants.CompetitionStatus.STARTED
          ? 'live'
          : 'upcoming';
    };
    const order = { live: 0, upcoming: 1, completed: 2 } as const;
    const getStartDate = (card: TournamentCard) =>
      Math.min(
        ...card.tiers.map((tier) => competitionStartDates[tier.id] ?? Number.POSITIVE_INFINITY),
      );

    return [...tournamentCards].sort((a, b) => {
      const statusDiff = order[getStatus(a)] - order[getStatus(b)];

      if (statusDiff !== 0) {
        return statusDiff;
      }

      const dateDiff = getStartDate(a) - getStartDate(b);
      return dateDiff !== 0 ? dateDiff : tournamentCards.indexOf(a) - tournamentCards.indexOf(b);
    });
  }, [competitionStartDates, isCurrentSeason, seasonCompetitions, tournamentCards]);

  const selectedTournamentKey = React.useMemo(() => {
    const selectedTier = tiers.find((tier) => tier.id === selectedTierId);

    return selectedTier
      ? getTournamentMeta(selectedTier, selectedFederation?.slug as Constants.FederationSlug).key
      : null;
  }, [selectedFederation, selectedTierId, tiers]);

  const selectedTournamentName = React.useMemo(() => {
    if (!selectedTournamentKey) {
      return null;
    }

    return allTournamentCards.find((card) => card.key === selectedTournamentKey)?.name ?? null;
  }, [allTournamentCards, selectedTournamentKey]);
  const isChinaRmrOpenQualifier = competition
    ? [
        Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_1,
        Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_2,
      ].includes(competition.tier.slug as Constants.TierSlug)
    : false;
  const competitionLocationDisplay = competition
    ? isChinaRmrOpenQualifier
      ? 'China (Online)'
      : Util.getCompetitionDisplayLocation({
          federationName: competition.federation.name,
          federationSlug: competition.federation.slug,
          lan: competition.tier.lan,
          location: competition.location,
        })
    : null;
  const competitionLocationCountryCode = competition
    ? isChinaRmrOpenQualifier
      ? 'cn'
      : Util.getCompetitionDisplayLocationCountryCode({
          federationSlug: competition.federation.slug,
          lan: competition.tier.lan,
          location: competition.location,
        })
    : null;
  const competitionTitle = React.useMemo(() => {
    let title = '';
    if (competition && Util.isMajorStageTier(competition.tier.slug)) {
      title = Util.getMajorEventDisplayName(competition.location, competition.organizer);
    } else if (
      competition?.tier.slug === Constants.TierSlug.MAJOR_EUROPE_RMR_A ||
      competition?.tier.slug === Constants.TierSlug.MAJOR_EUROPE_RMR_B
    ) {
      title = `${
        Util.getHostedEventTitleDisplayName(competition.tier.slug, competition.location) ||
        'Europe RMR'
      } ${competition.tier.slug === Constants.TierSlug.MAJOR_EUROPE_RMR_A ? 'A' : 'B'}`;
    } else {
      const hostedEventLabel = competition
        ? Util.getHostedEventTitleDisplayName(competition.tier.slug, competition.location)
        : null;
      title =
        hostedEventLabel ||
        selectedTournamentName ||
        (competition
          ? Util.getCompetitionDisplayName(competition.tier.league.name, competition.tier.slug)
          : '');
    }

    const isMajor = competition?.tier.slug.toLowerCase().includes('major');
    const isCctSeries =
      competition?.tier.slug.toLowerCase().includes('cct') &&
      !competition?.tier.slug.toLowerCase().includes('global');
    if (isCctSeries && competition) {
      const region =
        competition.federation.slug === Constants.FederationSlug.ESPORTS_OCE
          ? 'Oceania'
          : FEDERATION_LABELS[competition.federation.slug as Constants.FederationSlug] ||
            competition.federation.name;
      title = `CCT Series ${region}`;
    }
    return competition && (competition.tier.lan || isMajor)
      ? `${title} ${2025 + (competition.season || 0)}`
      : title;
  }, [competition, selectedTournamentName]);

  const loadTier = React.useCallback(
    async (tierId: number) => {
      setPreserveTournamentOnSeasonChange(false);
      setSelectedTierId(tierId);

      if (selectedFederationId < 0 || selectedSeasonId < 0) {
        return;
      }

      const nextCompetition = await loadCompetition(selectedFederationId, selectedSeasonId, tierId);
      setCompetition(nextCompetition);
    },
    [loadCompetition, selectedFederationId, selectedSeasonId],
  );
  React.useEffect(() => {
    if (selectedFederationId <= 0 || selectedSeasonId <= 0 || selectedTierId <= 0) {
      return;
    }

    if (
      competition?.federationId === selectedFederationId &&
      competition.season === selectedSeasonId &&
      competition.tierId === selectedTierId
    ) {
      return;
    }

    let isCurrent = true;

    loadCompetition(selectedFederationId, selectedSeasonId, selectedTierId).then((result) => {
      if (isCurrent) {
        setCompetition(result);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [
    competition?.federationId,
    competition?.season,
    competition?.tierId,
    loadCompetition,
    selectedFederationId,
    selectedSeasonId,
    selectedTierId,
  ]);

  // Refresh an in-progress competition when the calendar advances. The selected
  // competition identity does not change, so the selection-loading effect above
  // otherwise leaves its standings and bracket snapshot stale for the rest of the
  // tournament.
  React.useEffect(() => {
    if (
      !competition ||
      !state.profile?.date ||
      competition.status !== Constants.CompetitionStatus.STARTED
    ) {
      return;
    }

    let isCurrent = true;

    api.competitions
      .find({
        ...Eagers.competition,
        where: { id: competition.id },
      })
      .then((result) => {
        if (isCurrent && result) {
          setCompetition(result);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [competition?.id, competition?.status, state.profile?.date]);

  React.useEffect(() => {
    if (selectedTierId <= 0 || !visibleTiers.length) {
      return;
    }

    if (visibleTiers.some((tier) => tier.id === selectedTierId)) {
      return;
    }

    const selectedTier = tiers.find((tier) => tier.id === selectedTierId);
    if (!selectedTier) {
      setSelectedTierId(-1);
      return;
    }

    const mappedTier = visibleTiers.find((tier) => tier.slug === selectedTier.slug);
    setSelectedTierId(mappedTier ? mappedTier.id : -1);
  }, [selectedTierId, tiers, visibleTiers]);

  React.useEffect(() => {
    if (hasQueryParams) return;
    if (!state.profile) return;
    if (selectedFederationId < 0) return;
    if (!visibleTiers.length) return;

    // Don't override user choice or season-filter reloads.
    if (selectedTierId > 0 || preserveTournamentOnSeasonChange) return;

    let defaultTier: (typeof tiers)[number] | undefined;

    const preferredOrder = [
      'league:premier',
      'league:advanced',
      'league:main',
      'league:intermediate',
      'league:open',
    ];

    const teamCompetitionFederationId = state.profile.team?.competitionFederationId ?? null;
    const isTeamFederation =
      state.profile.teamId &&
      teamCompetitionFederationId &&
      selectedFederationId === teamCompetitionFederationId;

    if (isTeamFederation && state.profile.team) {
      // On the team's true federation: prefer the team's current league tier.
      const desiredSlug = Constants.Prestige[state.profile.team.tier];
      defaultTier = visibleTiers.find((tier) => tier.slug === desiredSlug);
    }

    if (
      !defaultTier &&
      !state.profile.teamId &&
      selectedFederation?.slug === Constants.FederationSlug.ESPORTS_WORLD
    ) {
      defaultTier = visibleTiers.find(
        (tier) =>
          getTournamentMeta(tier, selectedFederation.slug as Constants.FederationSlug).key ===
          'major:international',
      );
    }

    // In all other cases (teamless or non-team federation), use top division in that region.
    if (!defaultTier) {
      defaultTier =
        preferredOrder
          .map((slug) => visibleTiers.find((tier) => tier.slug === slug))
          .find(Boolean) || visibleTiers[0];
    }

    if (!defaultTier) return;

    if (selectedTierId <= 0) {
      setSelectedTierId(defaultTier.id);
    }

    loadCompetition(selectedFederationId, selectedSeasonId, defaultTier.id).then((result) => {
      if (result) {
        setCompetition(result);
      }
    });
  }, [
    state.profile,
    selectedFederationId,
    selectedSeasonId,
    visibleTiers,
    selectedTierId,
    preserveTournamentOnSeasonChange,
    selectedFederation,
    loadCompetition,
  ]);

  React.useEffect(() => {
    if (
      !canViewStatistics &&
      [TabIdentifier.STATISTICS, TabIdentifier.NEWS].includes(location.pathname as TabIdentifier)
    ) {
      navigate({ pathname: TabIdentifier.RESULTS, search: location.search });
    }
  }, [canViewStatistics, location.pathname, location.search, navigate]);

  React.useEffect(() => {
    if (!hasCompetitionStarted && location.pathname === TabIdentifier.PARTICIPANTS) {
      navigate({ pathname: TabIdentifier.OVERVIEW, search: location.search });
    }
  }, [hasCompetitionStarted, location.pathname, location.search, navigate]);

  const navigateTab = React.useCallback(
    (pathname: TabIdentifier) => navigate({ pathname, search: location.search }),
    [location.search, navigate],
  );

  // Build seasons dropdown data
  const seasons = React.useMemo(() => [...Array(state?.profile?.season || 0)], [state.profile]);

  return (
    <div className="dashboard competitions-dashboard">
      <main>
        <form className="form-ios">
          <fieldset className="gap-0!">
            <legend className="border-t-0! text-lg! font-black uppercase">Competitions</legend>
            <section className="block! py-2!">
              <article className="grid! grid-cols-[1.35fr_1fr_1fr_1fr_1fr] gap-1! p-2!">
                {federationTabs.map((federation) => (
                  <button
                    key={federation.id}
                    type="button"
                    className={cx(
                      'btn border-base-content/10 h-8 rounded-lg border px-2 text-xs font-semibold shadow-none',
                      selectedFederationId === federation.id
                        ? 'btn-primary'
                        : 'btn-ghost bg-base-200 hover:bg-base-300',
                    )}
                    onClick={() => {
                      setSelectedFederationId(federation.id);
                      setSelectedTierId(-1);
                      setCompetition(undefined);
                      setSelectedFamily('all');
                      setPreserveTournamentOnSeasonChange(false);
                    }}
                  >
                    {FEDERATION_LABELS[federation.slug as Constants.FederationSlug] ||
                      federation.name}
                  </button>
                ))}
              </article>
            </section>
            <section className="py-2!">
              <article className="col-span-3! flex! justify-start!">
                <select
                  className="select select-bordered bg-base-200 border-base-content/10 h-10 w-full rounded-lg font-semibold shadow-none"
                  onChange={(event) => {
                    setSelectedSeasonId(Number(event.target.value));
                    setCompetition(undefined);
                    setPreserveTournamentOnSeasonChange(true);
                  }}
                  value={selectedSeasonId || -1}
                >
                  {seasons.map((_, idx) => (
                    <option key={idx + 1 + '__season'} value={idx + 1}>
                      {2025 + idx + 1}
                    </option>
                  ))}
                </select>
              </article>
            </section>
          </fieldset>
          <fieldset>
            <legend className="text-base! font-bold uppercase">
              {isCurrentSeason ? 'Live & Upcoming' : `Tournaments in ${2025 + selectedSeasonId}`}
            </legend>
            <section className="block! p-0!">
              <article className="divide-base-content/10! grid! grid-cols-1! divide-y!">
                {orderedTournamentCards.map((card, cardIndex) => {
                  const primaryTier = card.tiers[0];
                  const isActive =
                    selectedTournamentKey === card.key ||
                    card.tiers.some((tier) => tier.id === selectedTierId);
                  const tournament = seasonCompetitions?.find((item) =>
                    card.tiers.some((tier) => tier.id === item.tierId),
                  );
                  const dateLabel =
                    competitionDates[primaryTier.id] || `${2025 + selectedSeasonId}`;
                  const rmrQualifierNumber =
                    primaryTier.slug.match(/open-qualifier:(\d+)$/)?.[1] || null;
                  const isMajor = primaryTier.slug.toLowerCase().includes('major');
                  const isRmr =
                    primaryTier.slug.toLowerCase().includes('rmr') ||
                    card.name.toLowerCase().includes('rmr');
                  const europeRmrGroup =
                    primaryTier.slug === Constants.TierSlug.MAJOR_EUROPE_RMR_A
                      ? 'A'
                      : primaryTier.slug === Constants.TierSlug.MAJOR_EUROPE_RMR_B
                        ? 'B'
                        : '';
                  const federationName =
                    FEDERATION_LABELS[selectedFederation?.slug as Constants.FederationSlug] ||
                    selectedFederation?.name;
                  const rmrRegionName = primaryTier.slug.toLowerCase().includes('china')
                    ? 'China'
                    : federationName;
                  const hostedName = Util.getHostedEventTitleDisplayName(
                    primaryTier.slug,
                    tournament?.location,
                  );
                  const cctName =
                    card.name.toLowerCase().includes('cct') &&
                    !card.name.toLowerCase().includes('global')
                      ? `CCT Series ${selectedFederation?.slug === Constants.FederationSlug.ESPORTS_OCE ? 'Oceania' : federationName || selectedFederation?.name || ''}`.trim()
                      : card.name;
                  const displayName =
                    tournament && (primaryTier.lan || isMajor)
                      ? `${
                          isRmr
                            ? primaryTier.lan
                              ? [
                                  `${federationName || card.name} RMR${
                                    europeRmrGroup ? ` ${europeRmrGroup}` : ''
                                  }`,
                                  Util.getCompetitionHostingLocationCity(tournament.location),
                                ]
                                  .filter(Boolean)
                                  .join(' ')
                              : `${rmrRegionName || card.name} RMR Open Qualifier${rmrQualifierNumber ? ` #${rmrQualifierNumber}` : 's'}`
                            : isMajor
                              ? Util.getMajorEventDisplayName(
                                  tournament.location,
                                  tournament.organizer,
                                )
                              : hostedName || cctName
                        } ${2025 + selectedSeasonId}`
                      : cctName;

                  const previousStatus =
                    cardIndex > 0
                      ? seasonCompetitions?.find((item) =>
                          orderedTournamentCards[cardIndex - 1].tiers.some(
                            (tier) => tier.id === item.tierId,
                          ),
                        )?.status
                      : null;
                  const currentStatus = tournament?.status;

                  return (
                    <React.Fragment key={`${card.key}__competition_row`}>
                      {isCurrentSeason &&
                        currentStatus === Constants.CompetitionStatus.COMPLETED &&
                        previousStatus !== Constants.CompetitionStatus.COMPLETED && (
                          <div className="border-base-content/10 bg-base-200 px-3 py-3 text-xs font-bold tracking-wide uppercase">
                            Recently Completed
                          </div>
                        )}
                      <button
                        type="button"
                        data-interaction-hover-sound="none"
                        style={{
                          boxShadow: isActive ? 'inset 4px 0 0 #ff7d5c' : 'none',
                          backgroundColor: isActive ? '#203542' : undefined,
                        }}
                        className={cx(
                          'group flex min-h-24 items-center gap-3 px-3 py-4 text-left',
                          'hover:bg-base-300',
                        )}
                        disabled={selectedFederationId < 0 || selectedSeasonId < 0}
                        onClick={() => loadTier(primaryTier.id)}
                      >
                        <span className="bg-base-100 border-base-content/15 flex size-14 shrink-0 items-center justify-center rounded border">
                          <img
                            className="size-12 object-contain"
                            src={
                              getTournamentThumbnail(
                                card,
                                selectedFederation?.slug,
                                tournament?.organizer,
                              ) ||
                              Util.getCompetitionLogo(primaryTier.slug, selectedFederation?.slug, {
                                organizer: tournament?.organizer || card.name,
                              })
                            }
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="mb-1 flex items-center justify-between gap-2">
                            <CompetitionLocationTag tier={primaryTier} />
                            {tournament?.status === Constants.CompetitionStatus.STARTED && (
                              <span className="inline-flex items-center rounded border border-[#ff5f56]/70 bg-[#ff5f56]/15 px-1.5 py-0.5 text-[0.58rem] font-black text-[#ff5f56] uppercase">
                                • LIVE
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-sm font-bold">{displayName}</span>
                          <span className="text-base-content/60 block text-xs">{dateLabel}</span>
                        </span>
                        <span className="hidden flex-wrap gap-1">
                          {card.tiers.map((tier) => (
                            <span
                              key={tier.id}
                              className={cx(
                                'border-base-content/10 rounded border px-2 py-1 text-[0.68rem] font-semibold',
                                selectedTierId === tier.id
                                  ? 'bg-primary text-primary-content border-primary'
                                  : 'bg-base-100 text-base-content/80',
                              )}
                              onClick={(event) => {
                                event.stopPropagation();
                                loadTier(tier.id);
                              }}
                            >
                              {Constants.IdiomaticTier[tier.slug] || tier.name}
                            </span>
                          ))}
                        </span>
                      </button>
                    </React.Fragment>
                  );
                })}
                {!tournamentCards.length && (
                  <p className="text-base-content/60 bg-base-200 border-base-content/10 rounded border p-3 text-sm">
                    No tournaments in this filter.
                  </p>
                )}
              </article>
            </section>
          </fieldset>
        </form>
        {!competition && initializedFromProfile && selectedFederationId > 0 && (
          <section className="center text-base-content/60 h-full px-6 text-center">
            <span>Select a tournament to view its overview, standings, results, and teams.</span>
          </section>
        )}
        {!competition && (!initializedFromProfile || selectedFederationId < 0) && (
          <section className="center h-full">
            <span className="loading loading-bars" />
          </section>
        )}
        {!!competition && (
          <section
            className={cx(
              'h-full overflow-hidden',
              [
                TabIdentifier.OVERVIEW,
                TabIdentifier.RESULTS,
                TabIdentifier.STATISTICS,
                TabIdentifier.PARTICIPANTS,
                TabIdentifier.NEWS,
              ].includes(location.pathname as TabIdentifier)
                ? 'block'
                : 'grid grid-rows-[auto_1fr]',
            )}
          >
            {![
              TabIdentifier.OVERVIEW,
              TabIdentifier.RESULTS,
              TabIdentifier.STATISTICS,
              TabIdentifier.PARTICIPANTS,
              TabIdentifier.NEWS,
            ].includes(location.pathname as TabIdentifier) && (
              <section className="border-base-content/10 bg-base-200 border-b">
                <article className="min-w-0 px-4 py-3">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase">
                    <span className="text-base-content/50 truncate">
                      {selectedFederation
                        ? isChinaRmrOpenQualifier
                          ? 'China'
                          : FEDERATION_LABELS[
                              selectedFederation.slug as Constants.FederationSlug
                            ] || selectedFederation.name
                        : t('shared.competition')}
                    </span>
                    <CompetitionLocationTag tier={competition.tier} />
                  </p>
                  <h2 className="truncate text-lg font-black">{competitionTitle}</h2>
                  {competitionLocationDisplay && (
                    <p className="text-base-content/70 mt-0.5 flex items-center gap-2 text-xs font-semibold">
                      {competitionLocationCountryCode && (
                        <span className={cx('fp', competitionLocationCountryCode)} />
                      )}
                      <span className="truncate">{competitionLocationDisplay}</span>
                    </p>
                  )}
                </article>
                <nav className="border-base-content/10 flex border-t px-2">
                  <button
                    className={cx(
                      'btn btn-ghost h-11 flex-1 rounded-none border-0 border-b-2 border-transparent text-xs font-bold shadow-none',
                      location.pathname === TabIdentifier.OVERVIEW &&
                        'border-primary! text-primary! bg-transparent!',
                    )}
                    onClick={() => navigateTab(TabIdentifier.OVERVIEW)}
                  >
                    {t('shared.overview')}
                  </button>
                  <button
                    className={cx(
                      'btn btn-ghost h-11 flex-1 rounded-none border-0 border-b-2 border-transparent text-xs font-bold shadow-none',
                      location.pathname === TabIdentifier.RESULTS &&
                        'border-primary! text-primary! bg-transparent!',
                    )}
                    onClick={() => navigateTab(TabIdentifier.RESULTS)}
                  >
                    {t('shared.results')}
                  </button>
                </nav>
              </section>
            )}
            <section
              className={cx(
                'overflow-y-scroll',
                [
                  TabIdentifier.OVERVIEW,
                  TabIdentifier.RESULTS,
                  TabIdentifier.STATISTICS,
                  TabIdentifier.PARTICIPANTS,
                  TabIdentifier.NEWS,
                ].includes(location.pathname as TabIdentifier) && 'h-full',
              )}
            >
              <Outlet
                context={
                  {
                    competition,
                    competitionTitle,
                    competitionLocationCountryCode,
                    competitionLocationDisplay,
                    canViewStatistics,
                  } satisfies RouteContextCompetitions
                }
              />
            </section>
          </section>
        )}
      </main>
    </div>
  );
}
