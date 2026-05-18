/**
 * Renders the layout for the competitions route.
 *
 * @module
 */
import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Constants, Eagers, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { AppStateContext } from '@liga/frontend/redux';
import { useTranslation } from '@liga/frontend/hooks';

/** @enum */
enum TabIdentifier {
  OVERVIEW = '/competitions',
  STANDINGS = '/competitions/standings',
  RESULTS = '/competitions/results',
  PARTICIPANTS = '/competitions/participants',
}

type CompetitionTier = Awaited<ReturnType<typeof api.tiers.all<typeof Eagers.tier>>>[number];
type TournamentFamily = 'all' | 'esea' | 'major' | 'cct' | 'qualifiers';

type TournamentCard = {
  key: string;
  name: string;
  eyebrow: string;
  family: TournamentFamily | 'event';
  accent: string;
  tiers: CompetitionTier[];
};

const FAMILY_FILTERS: Array<{ id: TournamentFamily; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'esea', label: 'ESEA' },
  { id: 'major', label: 'Major' },
  { id: 'cct', label: 'CCT' },
  { id: 'qualifiers', label: 'Qualifiers' },
];

const FEDERATION_LABELS: Partial<Record<Constants.FederationSlug, string>> = {
  [Constants.FederationSlug.ESPORTS_EUROPA]: 'Europe',
  [Constants.FederationSlug.ESPORTS_AMERICAS]: 'Americas',
  [Constants.FederationSlug.ESPORTS_ASIA]: 'Asia',
  [Constants.FederationSlug.ESPORTS_OCE]: 'Oceania',
  [Constants.FederationSlug.ESPORTS_WORLD]: 'International',
};

const FEDERATION_ORDER: Constants.FederationSlug[] = [
  Constants.FederationSlug.ESPORTS_EUROPA,
  Constants.FederationSlug.ESPORTS_AMERICAS,
  Constants.FederationSlug.ESPORTS_ASIA,
  Constants.FederationSlug.ESPORTS_OCE,
  Constants.FederationSlug.ESPORTS_WORLD,
];

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

      return {
        key: 'major:rmr',
        name: federationLabel ? `${federationLabel} RMR` : 'RMR',
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

  const [selectedFederationId, setSelectedFederationId] = React.useState<number>(-1);
  const [selectedSeasonId, setSelectedSeasonId] = React.useState<number>(-1);
  const [selectedTierId, setSelectedTierId] = React.useState<number>(-1);
  const [selectedFamily, setSelectedFamily] = React.useState<TournamentFamily>('all');

  const [initializedFromQuery, setInitializedFromQuery] = React.useState(false);
  // Used to ensure we only auto-initialize filters once from the profile.
  const [initializedFromProfile, setInitializedFromProfile] = React.useState(false);
  const [initializedQueryCompetition, setInitializedQueryCompetition] = React.useState(false);

  const queryParams = React.useMemo(() => new URLSearchParams(location.search), [location.search]);
  const queryFederationId = Number(queryParams.get('federationId'));
  const querySeasonId = Number(queryParams.get('season'));
  const queryTierId = Number(queryParams.get('tierId'));
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
    if (hasQueryParams) return;
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
  }, [state.profile, state.continents, initializedFromProfile]);

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
    if (!selectedFederation) {
      return tiers;
    }

    return tiers.filter((tier) => {
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
  }, [tiers, selectedFederation]);

  const federationTabs = React.useMemo(
    () =>
      [...federations].sort((a, b) => {
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

  const loadTier = React.useCallback(
    async (tierId: number) => {
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

    // Don't override user choice
    if (selectedTierId > 0 && competition) return;

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
    competition,
    loadCompetition,
  ]);

  // Build seasons dropdown data
  const seasons = React.useMemo(() => [...Array(state?.profile?.season || 0)], [state.profile]);

  return (
    <div className="dashboard">
      <header>
        <button
          className={cx(location.pathname === TabIdentifier.OVERVIEW && 'btn-active!')}
          onClick={() => navigate(TabIdentifier.OVERVIEW)}
        >
          {t('shared.overview')}
        </button>
        <button
          className={cx(location.pathname === TabIdentifier.STANDINGS && 'btn-active!')}
          onClick={() => navigate(TabIdentifier.STANDINGS)}
        >
          {t('shared.standings')}
        </button>
        <button
          className={cx(location.pathname === TabIdentifier.RESULTS && 'btn-active!')}
          onClick={() => navigate(TabIdentifier.RESULTS)}
        >
          {t('shared.results')}
        </button>
        <button
          className={cx(location.pathname === TabIdentifier.PARTICIPANTS && 'btn-active!')}
          onClick={() => navigate(TabIdentifier.PARTICIPANTS)}
        >
          Participants
        </button>
      </header>
      <main>
        <form className="form-ios">
          <fieldset>
            <legend className="border-t-0!">{t('shared.filters')}</legend>
            <section className="block!">
              <article className="grid! grid-cols-2 gap-2!">
                {federationTabs.map((federation) => (
                  <button
                    key={federation.id}
                    type="button"
                    className={cx(
                      'btn btn-sm border-base-content/10 h-10 rounded border font-semibold shadow-none',
                      federation.slug === Constants.FederationSlug.ESPORTS_WORLD &&
                        'col-span-2 mx-auto w-[calc(50%_-_0.25rem)]',
                      selectedFederationId === federation.id
                        ? 'btn-primary'
                        : 'btn-ghost bg-base-200 hover:bg-base-300',
                    )}
                    onClick={() => {
                      setSelectedFederationId(federation.id);
                      setSelectedTierId(-1);
                      setCompetition(undefined);
                      setSelectedFamily('all');
                    }}
                  >
                    {FEDERATION_LABELS[federation.slug as Constants.FederationSlug] ||
                      federation.name}
                  </button>
                ))}
              </article>
            </section>
            <section>
              <header>
                <p>{t('shared.season')}</p>
              </header>
              <article>
                <select
                  className="select"
                  onChange={(event) => setSelectedSeasonId(Number(event.target.value))}
                  value={selectedSeasonId || -1}
                >
                  <option disabled value={-1}>
                    {t('main.competitions.select')}
                  </option>
                  {seasons.map((_, idx) => (
                    <option key={idx + 1 + '__season'} value={idx + 1}>
                      {t('shared.season')} {idx + 1}
                    </option>
                  ))}
                </select>
              </article>
            </section>
          </fieldset>
          <fieldset>
            <legend>{t('shared.competition')}</legend>
            <section className="block!">
              <header className="mb-2 flex! items-center justify-between">
                <p className="text-base-content/70 text-xs font-bold uppercase">Series</p>
                <p className="text-base-content/50 text-xs">{tournamentCards.length} visible</p>
              </header>
              <article className="grid! grid-cols-1 gap-2!">
                {tournamentCards.map((card) => {
                  const primaryTier = card.tiers[0];
                  const isActive = selectedTournamentKey === card.key;

                  return (
                    <button
                      key={card.key}
                      type="button"
                      className={cx(
                        'group border-base-content/10 bg-base-200 h-auto rounded border p-0 text-left shadow-none',
                        'hover:border-primary/60 hover:bg-base-300',
                        isActive && 'border-primary bg-base-300',
                      )}
                      disabled={selectedFederationId < 0 || selectedSeasonId < 0}
                      onClick={() => loadTier(primaryTier.id)}
                    >
                      <span
                        className={cx(
                          'block rounded-t bg-gradient-to-r to-transparent px-3 py-2',
                          card.accent,
                        )}
                      >
                        <span className="text-base-content/60 block text-[0.65rem] font-bold tracking-wide uppercase">
                          {card.eyebrow}
                        </span>
                        <span className="block truncate text-sm font-bold">{card.name}</span>
                      </span>
                      <span className="flex flex-wrap gap-1 px-3 py-2">
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
          <section className="grid h-full grid-rows-[auto_1fr] overflow-hidden">
            <nav className="border-base-content/10 bg-base-200 flex items-center justify-between border-b px-3 py-2">
              <article className="min-w-0">
                <p className="text-base-content/50 text-xs font-bold uppercase">
                  {selectedFederation
                    ? FEDERATION_LABELS[selectedFederation.slug as Constants.FederationSlug] ||
                      selectedFederation.name
                    : t('shared.competition')}
                </p>
                <h2 className="truncate text-lg font-black">
                  {selectedTournamentName
                    ? selectedTournamentName
                    : Util.getCompetitionDisplayName(
                        competition.tier.league.name,
                        competition.tier.slug,
                      )}
                </h2>
              </article>
              <article className="join shrink-0">
                {FAMILY_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    className={cx(
                      'btn join-item btn-sm rounded-none',
                      selectedFamily === filter.id ? 'btn-primary' : 'btn-ghost',
                    )}
                    onClick={() => setSelectedFamily(filter.id)}
                  >
                    {filter.label}
                  </button>
                ))}
              </article>
            </nav>
            <section className="overflow-y-scroll">
              <Outlet context={{ competition } satisfies RouteContextCompetitions} />
            </section>
          </section>
        )}
      </main>
    </div>
  );
}
