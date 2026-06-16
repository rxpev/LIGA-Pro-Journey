/**
 * Renders the layout for the teams route.
 *
 * @module
 */
import React from 'react';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Constants, Eagers } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { AppStateContext } from '@liga/frontend/redux';
import { useTranslation } from '@liga/frontend/hooks';
import { TeamBlazon } from '@liga/frontend/components';

/** @enum */
enum TabIdentifier {
  OVERVIEW = '/teams',
  HISTORY = '/teams/history',
  RESULTS = '/teams/results',
}

type RankingDivisionOption = {
  label: string;
  tierSlug?: Constants.TierSlug;
};

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
  const { state } = React.useContext(AppStateContext);
  const [federations, setFederations] = React.useState<
    Awaited<ReturnType<typeof api.federations.all>>
  >([]);
  const [teams, setTeams] = React.useState<
    Awaited<ReturnType<typeof api.teams.all<typeof Eagers.team>>>
  >([]);
  const [team, setTeam] = React.useState<(typeof teams)[number]>();
  const [rankings, setRankings] = React.useState<typeof teams>([]);
  const [selectedRankingFederationId, setSelectedRankingFederationId] = React.useState<number>();
  const [selectedRankingTierSlug, setSelectedRankingTierSlug] =
    React.useState<Constants.TierSlug>();
  const [teamSearch, setTeamSearch] = React.useState('');
  const requestedTeamId = React.useMemo(() => {
    const teamId = Number(searchParams.get('teamId'));
    return Number.isInteger(teamId) && teamId > 0 ? teamId : undefined;
  }, [searchParams]);

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
      <header>
        <button
          className={cx(location.pathname === TabIdentifier.OVERVIEW && 'btn-active!')}
          onClick={() => navigate(TabIdentifier.OVERVIEW)}
        >
          {t('shared.overview')}
        </button>
        <button
          className={cx(location.pathname === TabIdentifier.HISTORY && 'btn-active!')}
          onClick={() => navigate(TabIdentifier.HISTORY)}
        >
          {t('main.teams.history')}
        </button>
        <button
          className={cx(location.pathname === TabIdentifier.RESULTS && 'btn-active!')}
          onClick={() => navigate(TabIdentifier.RESULTS)}
        >
          {t('shared.results')}
        </button>
      </header>
      <main>
        <section>
          <article className="stack-y">
            <header className="prose">
              <h2>{t('shared.team')}</h2>
            </header>
            <input
              className="input input-bordered w-full"
              placeholder={`Search ${t('shared.team').toLowerCase()}`}
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
              <h2>Rankings</h2>
            </header>
            <nav className="grid grid-cols-2 gap-2 p-2">
              <button
                type="button"
                className={cx(
                  'btn border-base-content/10 h-10 rounded border font-semibold shadow-none',
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
                .map((federation, federationIdx, filteredFederations) => {
                  const isLastOdd =
                    (filteredFederations.length + 1) % 2 === 1 &&
                    federationIdx === filteredFederations.length - 1;

                  return (
                    <button
                      type="button"
                      key={federation.id + '__ranking_filter'}
                      className={cx(
                        'btn border-base-content/10 h-10 rounded border font-semibold shadow-none',
                        isLastOdd && 'col-span-2 mx-auto w-[calc(50%_-_0.25rem)]',
                        selectedRankingFederationId === federation.id
                          ? 'btn-primary'
                          : 'btn-ghost bg-base-200 hover:bg-base-300',
                      )}
                      onClick={() => selectRankingFederation(federation)}
                    >
                      {federation.name}
                    </button>
                  );
                })}
            </nav>
            <div className="p-2 pt-0">
              <select
                aria-label="Ranking division"
                className="select select-bordered bg-base-200 border-base-content/10 h-10 w-full rounded font-semibold shadow-none"
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
            <footer>
              <table className="table table-fixed">
                <thead>
                  <tr>
                    <th className="w-10" />
                    <th className="w-10" />
                    <th>{t('shared.name')}</th>
                    <th className="text-center">Elo Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {rankings.map((teamRank, rank) => (
                    <tr
                      key={teamRank.id + '__ranking'}
                      data-interaction-hover-sound="none"
                      className={cx(
                        'cursor-pointer',
                        teamRank.id === team?.id && 'bg-base-content/10',
                      )}
                      onClick={() => setTeam(teamRank)}
                    >
                      <td className="px-0 text-center">#{rank + 1}</td>
                      <td className="px-0">
                        <TeamBlazon
                          src={teamRank.blazon}
                          title={teamRank.name}
                          className="mx-auto size-8"
                          blur="blur-xs"
                        />
                      </td>
                      <td className="truncate">{teamRank.name}</td>
                      <td className="text-center">{teamRank.elo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </footer>
          </article>
        </section>
        {!team && (
          <section className="center h-full">
            <span className="loading loading-bars" />
          </section>
        )}
        {!!team && <Outlet context={{ team } satisfies RouteContextTeams} />}
      </main>
    </div>
  );
}
