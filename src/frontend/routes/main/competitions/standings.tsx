/**
 * Competition standings route.
 *
 * @module
 */
import React from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { groupBy } from 'lodash';
import { Constants, Eagers, Util } from '@liga/shared';
import { AppStateContext } from '@liga/frontend/redux';
import { useTranslation } from '@liga/frontend/hooks';
import { Brackets, Standings } from '@liga/frontend/components';

/**
 * Prevents re-renders caused by application heartbeat.
 *
 * @param props Passthru props to the underlying Brackets component.
 * @function
 */
function PureBrackets(props: React.ComponentProps<typeof Brackets>) {
  return React.useMemo(
    () => <Brackets matches={props.matches} onPartyClick={props.onPartyClick} />,
    [props.matches, props.onPartyClick],
  );
}

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const t = useTranslation();
  const { state } = React.useContext(AppStateContext);
  const navigate = useNavigate();
  const { competition } = useOutletContext<RouteContextCompetitions>();
  const [bracket, setBracket] =
    React.useState<Awaited<ReturnType<typeof api.matches.all<typeof Eagers.match>>>>();
  const groups = React.useMemo(
    () => groupBy(competition.competitors, 'group'),
    [competition.competitors],
  );
  const teamLinkById = React.useMemo(
    () =>
      new Map(
        competition.competitors.map((competitor) => [
          competitor.team.id,
          `/teams?teamId=${competitor.team.id}`,
        ]),
      ),
    [competition.competitors],
  );

  const isSwiss = Boolean(
    Constants.TierSwissConfig[competition.tier.slug as Constants.TierSlug],
  );

  // fetch matches when viewing bracket
  React.useEffect(() => {
    if (competition.tier.groupSize || isSwiss) {
      return;
    }

    api.matches
      .all({
        where: {
          competitionId: competition.id,
        },
        include: Eagers.match.include,
      })
      .then(setBracket);
  }, [competition, isSwiss]);

  if (competition.tier.groupSize) {
    return (
      <section>
        {Object.keys(groups).map((group) => (
          <Standings
            key={group + '__standings'}
            highlight={state.profile.teamId}
            competitors={groups[group]}
            teamLink={(team) => `/teams?teamId=${team.id}`}
            title={
              competition.tier.league.slug === Constants.LeagueSlug.ESPORTS_LEAGUE
                ? Constants.IdiomaticTier[competition.tier.slug]
                : `${t('shared.group')} ${Util.toAlpha(group)}`
            }
            zones={
              competition.status === Constants.CompetitionStatus.STARTED &&
              Util.getTierZones(
                competition.tier.slug as Constants.TierSlug,
                competition.federation.slug as Constants.FederationSlug,
              )
            }
          />
        ))}
      </section>
    );
  }

  if (isSwiss) {
    return (
      <section>
        <Standings
          highlight={state.profile.teamId}
          competitors={competition.competitors}
          mode="swiss"
          teamLink={(team) => `/teams?teamId=${team.id}`}
          title={Constants.IdiomaticTier[competition.tier.slug]}
        />
      </section>
    );
  }

  if (!bracket || !bracket.length) {
    return (
      <section className="center h-full">
        {!bracket && <span className="loading loading-bars" />}
        {!!bracket && !bracket.length && <span>{t('shared.competitionNotStarted')}</span>}
      </section>
    );
  }

  return (
    <section className="h-full w-full">
      <PureBrackets
        matches={bracket}
        onPartyClick={(party) => {
          const route = teamLinkById.get(Number(party.id));
          if (route) {
            navigate(route);
          }
        }}
      />
    </section>
  );
}
