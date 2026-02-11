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

  // Initial data fetch
  React.useEffect(() => {
    api.federations.all().then(setFederations);
    api.tiers.all(tierQuery).then(setTiers);
  }, []);

  // Re-fetch tiers when its query changes
  React.useEffect(() => {
    api.tiers.all(tierQuery).then(setTiers);
  }, [tierQuery]);

  // Reset tier selection when federation changes
  React.useEffect(() => {
    setSelectedTierId(-1);
  }, [selectedFederationId]);

  React.useEffect(() => {
    if (!hasQueryParams || initializedFromQuery) return;

    setSelectedFederationId(queryFederationId);
    setSelectedSeasonId(querySeasonId);
    setSelectedTierId(queryTierId);
    setInitializedFromQuery(true);
  }, [
    hasQueryParams,
    initializedFromQuery,
    queryFederationId,
    querySeasonId,
    queryTierId,
  ]);

  React.useEffect(() => {
    if (!hasQueryParams || initializedQueryCompetition) return;
    if (selectedFederationId <= 0 || selectedSeasonId <= 0 || selectedTierId <= 0) return;

    api.competitions
      .find({
        ...Eagers.competition,
        where: {
          federationId: selectedFederationId,
          season: selectedSeasonId,
          tier: {
            id: selectedTierId,
          },
        },
      })
      .then((result) => {
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

        return false;
      }

      return Util.isLeagueTierEnabledForFederation(
        tier.slug as Constants.TierSlug,
        selectedFederation.slug as Constants.FederationSlug,
      );
    });
  }, [tiers, selectedFederation]);

  React.useEffect(() => {
    if (hasQueryParams) return;
    if (!state.profile) return;
    if (selectedFederationId < 0) return;
    if (!visibleTiers.length) return;

    // Don't override user choice
    if (selectedTierId > 0 && competition) return;

    let defaultTier: (typeof tiers)[number] | undefined;

    if (state.profile.teamId && state.profile.team) {
      // Manager-style: use the team's current league tier.
      const desiredSlug = Constants.Prestige[state.profile.team.tier];
      defaultTier = visibleTiers.find((tier) => tier.slug === desiredSlug);
    } else {
      // Player-style (teamless): pick the highest league tier in this federation.
      const preferredOrder = [
        'league:premier',
        'league:advanced',
        'league:main',
        'league:intermediate',
        'league:open',
      ];

      defaultTier =
        preferredOrder
          .map((slug) => visibleTiers.find((tier) => tier.slug === slug))
          .find(Boolean) || visibleTiers[0];
    }

    if (!defaultTier) return;

    if (selectedTierId <= 0) {
      setSelectedTierId(defaultTier.id);
    }

    api.competitions
      .find({
        ...Eagers.competition,
        where: {
          federationId: selectedFederationId,
          season: state.profile.season,
          tier: { id: defaultTier.id },
        },
      })
      .then((result) => {
        if (result) {
          setCompetition(result);
        }
      });
  }, [state.profile, selectedFederationId, visibleTiers, selectedTierId, competition]);

  // Build seasons dropdown data
  const seasons = React.useMemo(
    () => [...Array(state?.profile?.season || 0)],
    [state.profile],
  );

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
        <form className="form-ios form-ios-col-2">
          <fieldset>
            <legend className="border-t-0!">{t('shared.filters')}</legend>
            <section>
              <header>
                <p>{t('shared.federation')}</p>
              </header>
              <article>
                <select
                  className="select"
                  onChange={(event) => setSelectedFederationId(Number(event.target.value))}
                  value={selectedFederationId || -1}
                >
                  <option disabled value={-1}>
                    {t('main.competitions.select')}
                  </option>
                  {federations.map((federation) => (
                    <option key={federation.id} value={federation.id}>
                      {federation.name}
                    </option>
                  ))}
                </select>
              </article>
            </section>
            <section>
              <header>
                <p>{t('shared.competition')}</p>
              </header>
              <article>
                <select
                  className="select"
                  onChange={(event) => setSelectedTierId(Number(event.target.value))}
                  value={selectedTierId || -1}
                  disabled={selectedFederationId < 0}
                >
                  <option disabled value={-1}>
                    {t('main.competitions.select')}
                  </option>
                  {visibleTiers.map((tier) => (
                    <option key={tier.id} value={tier.id}>
                      {tier.league.name} {Constants.IdiomaticTier[tier.slug]}
                    </option>
                  ))}
                </select>
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
            <section>
              <button
                type="button"
                className="btn btn-primary btn-block col-span-2!"
                disabled={selectedFederationId < 0 || selectedTierId < 0 || selectedSeasonId < 0}
                onClick={() => api.competitions.find(competitionQuery).then(setCompetition)}
              >
                {t('shared.apply')}
              </button>
            </section>
          </fieldset>
        </form>
        {!competition && (
          <section className="center h-full">
            <span className="loading loading-bars" />
          </section>
        )}
        {!!competition && <Outlet context={{ competition } satisfies RouteContextCompetitions} />}
      </main>
    </div>
  );
}
