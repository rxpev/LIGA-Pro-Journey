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
import { Image } from '@liga/frontend/components';

/** @enum */
enum TabIdentifier {
  OVERVIEW = '/teams',
  HISTORY = '/teams/history',
  RESULTS = '/teams/results',
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
  const [teamSearch, setTeamSearch] = React.useState('');

  const rankingFederations = React.useMemo(
    () => [...federations].sort((a, b) => a.id - b.id),
    [federations],
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
        },
      })
      .then(setRankings);
  }, [selectedRankingFederationId]);

  // preload the user's team
  React.useEffect(() => {
    if (!state.profile || !teams.length || team) {
      return;
    }

    setTeam(teams.find((tteam) => tteam.id === state.profile.teamId));
  }, [state.profile, teams, team]);

  // load team from query params
  React.useEffect(() => {
    const teamId = Number(searchParams.get('teamId'));
    if (!Number.isInteger(teamId) || !teams.length) {
      return;
    }

    const matched = teams.find((tteam) => tteam.id === teamId);
    if (matched) {
      setTeam(matched);
    }
  }, [searchParams, teams]);

  // fallback: auto-select world #1 team when teamless
  React.useEffect(() => {
    // only run after main data loads
    if (!teams.length || team) {
      return;
    }

    // user has no team → pick world #1
    if (!state.profile?.teamId) {
      const sorted = [...teams].sort((a, b) => b.elo - a.elo); // highest elo first
      if (sorted.length > 0) {
        setTeam(sorted[0]);
      }
    }
  }, [state.profile, teams, team]);

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
                      className={cx(
                        'cursor-pointer',
                        teamSearchResult.id === team?.id && 'bg-base-content/10',
                      )}
                      onClick={() => setTeam(teamSearchResult)}
                    >
                      <td className="w-10 px-0">
                        <Image
                          src={teamSearchResult.blazon}
                          title={teamSearchResult.name}
                          className="mx-auto size-8 object-cover"
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
                onClick={() => setSelectedRankingFederationId(undefined)}
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
                      onClick={() => setSelectedRankingFederationId(federation.id)}
                    >
                      {federation.name}
                    </button>
                  );
                })}
            </nav>
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
                      className={cx(
                        'cursor-pointer',
                        teamRank.id === team?.id && 'bg-base-content/10',
                      )}
                      onClick={() => setTeam(teamRank)}
                    >
                      <td className="px-0 text-center">#{rank + 1}</td>
                      <td className="px-0">
                        <Image
                          src={teamRank.blazon}
                          title={teamRank.name}
                          className="mx-auto size-8 object-cover"
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
