/**
 * Team events route.
 *
 * @module
 */
import React from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Constants, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { useFormatAppShortDate } from '@liga/frontend/hooks';
import { FaTrophy } from 'react-icons/fa';
import { getTeamsTierLabel } from './labels';

type TeamCompetition = Awaited<
  ReturnType<
    typeof api.competitions.all<{
      include: {
        competitors: true;
        federation: true;
        matches: true;
        tier: {
          include: {
            league: true;
          };
        };
      };
    }>
  >
>[number];

type EventTab = 'active' | 'ended';

const PLACEMENT_TIER_SLUGS = new Set([
  ...Constants.Awards.filter((award) => award.type === Constants.AwardType.CHAMPION).map(
    (award) => award.target,
  ),
  Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
]);
const RMR_PLACEMENT_TIER_SLUGS = new Set([
  Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_1,
  Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_2,
  Constants.TierSlug.MAJOR_AMERICAS_RMR,
  Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_1,
  Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_2,
  Constants.TierSlug.MAJOR_ASIA_RMR,
  Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_1,
  Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_2,
  Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1,
  Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_2,
  Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3,
  Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_4,
  Constants.TierSlug.MAJOR_EUROPE_RMR_A,
  Constants.TierSlug.MAJOR_EUROPE_RMR_B,
  Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_1,
  Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_2,
]);

function getSeasonYear(season?: number | null) {
  return season ? 2025 + season : null;
}

function getEventName(competition: TeamCompetition) {
  const year = getSeasonYear(competition.season);
  const city = Util.getCompetitionHostingLocationCity(competition.location);
  const tierSlug = competition.tier.slug as Constants.TierSlug;

  if (Util.isMajorStageTier(tierSlug)) {
    const eventName = [
      Util.getMajorEventDisplayName(competition.location, competition.organizer),
      year,
    ]
      .filter(Boolean)
      .join(' ');

    return tierSlug === Constants.TierSlug.MAJOR_CHALLENGERS_STAGE
      ? `${eventName} Challengers Stage`
      : eventName;
  }

  if (
    [
      Constants.TierSlug.MAJOR_EUROPE_RMR_A,
      Constants.TierSlug.MAJOR_EUROPE_RMR_B,
      Constants.TierSlug.MAJOR_AMERICAS_RMR,
      Constants.TierSlug.MAJOR_ASIA_RMR,
    ].includes(tierSlug)
  ) {
    return [
      competition.federation.name,
      getTeamsTierLabel(tierSlug, competition.tier.league?.name),
      city,
      year,
    ]
      .filter(Boolean)
      .join(' ');
  }

  if (RMR_PLACEMENT_TIER_SLUGS.has(tierSlug)) {
    return [
      competition.federation.name,
      getTeamsTierLabel(tierSlug, competition.tier.league?.name),
      year,
    ]
      .filter(Boolean)
      .join(' ');
  }

  if (
    [
      Constants.TierSlug.IEM_KRAKOW_GROUP_A,
      Constants.TierSlug.IEM_KRAKOW_GROUP_B,
      Constants.TierSlug.IEM_KRAKOW_PLAYOFFS,
    ].includes(competition.tier.slug as Constants.TierSlug)
  ) {
    return ['IEM Krakow', year].filter(Boolean).join(' ');
  }

  if (competition.tier.slug === Constants.TierSlug.IEM_KRAKOW_OPEN_QUALIFIER) {
    return ['IEM Krakow', year, 'Open Qualifier'].filter(Boolean).join(' ');
  }

  if (
    [
      Constants.TierSlug.IEM_COLOGNE_GROUP_A,
      Constants.TierSlug.IEM_COLOGNE_GROUP_B,
      Constants.TierSlug.IEM_COLOGNE_PLAYOFFS,
    ].includes(competition.tier.slug as Constants.TierSlug)
  ) {
    return ['IEM Cologne', year].filter(Boolean).join(' ');
  }

  if (competition.tier.slug === Constants.TierSlug.IEM_COLOGNE_OPEN_QUALIFIER) {
    return ['IEM Cologne', year, 'Open Qualifier'].filter(Boolean).join(' ');
  }

  if (
    [Constants.TierSlug.LEAGUE_PRO, Constants.TierSlug.LEAGUE_PRO_PLAYOFFS].includes(
      competition.tier.slug as Constants.TierSlug,
    )
  ) {
    return ['ESL Pro League', city, year].filter(Boolean).join(' ');
  }

  if (
    [Constants.TierSlug.ESL_CHALLENGER, Constants.TierSlug.ESL_CHALLENGER_PLAYOFFS].includes(
      competition.tier.slug as Constants.TierSlug,
    )
  ) {
    return ['ESL Challenger', city, year].filter(Boolean).join(' ');
  }

  const hostedEventLabel = Util.getHostedEventDisplayName(
    competition.tier.slug,
    competition.location,
    '',
  );
  if (hostedEventLabel) {
    return [hostedEventLabel, year].filter(Boolean).join(' ');
  }

  return [
    competition.federation.name,
    getTeamsTierLabel(competition.tier.slug, competition.tier.league?.name),
    city,
    year,
  ]
    .filter(Boolean)
    .join(' ');
}

function getEventKey(competition: TeamCompetition) {
  return getEventName(competition);
}

function getEventLogo(competition: TeamCompetition) {
  return (
    Util.getCompetitionThumbnail({
      federationSlug: competition.federation.slug,
      organizer: competition.organizer,
      tierSlug: competition.tier.slug,
    }) ||
    Util.getCompetitionLogo(competition.tier.slug, competition.federation.slug, {
      location: competition.location,
      organizer: competition.organizer,
    })
  );
}

function getCompetitionLink(competition: TeamCompetition) {
  return `/competitions?federationId=${competition.federationId}&season=${competition.season}&tierId=${competition.tier.id}`;
}

function getEventDateRange(competitions: TeamCompetition[], fmtShortDate: (date: Date) => string) {
  const dates = competitions.flatMap((competition) =>
    competition.matches.map((match) => match.date),
  );

  if (!dates.length) {
    return `Season ${competitions[0]?.season ?? '-'}`;
  }

  const sorted = dates.map((date) => new Date(date)).sort((a, b) => a.getTime() - b.getTime());
  const first = sorted[0];
  const last = sorted.at(-1) || first;

  if (first.toDateString() === last.toDateString()) {
    return fmtShortDate(first);
  }

  return `${fmtShortDate(first)} - ${fmtShortDate(last)}`;
}

function getEventLatestDate(competitions: TeamCompetition[]) {
  const dates = competitions.flatMap((competition) =>
    competition.matches.map((match) => new Date(match.date).getTime()),
  );

  return dates.length ? Math.max(...dates) : 0;
}

function getPlacement(competitions: TeamCompetition[], teamId: number) {
  const placementCompetitions = competitions.filter((competition) =>
    [...PLACEMENT_TIER_SLUGS, ...RMR_PLACEMENT_TIER_SLUGS].some(
      (tierSlug) => tierSlug === competition.tier.slug,
    ),
  );

  const competitor = placementCompetitions
    .flatMap((competition) => competition.competitors)
    .filter((item) => item.teamId === teamId && item.position)
    .sort((a, b) => (a.position || Infinity) - (b.position || Infinity))[0];

  return competitor?.position || null;
}

function PlacementBadge(props: { position: number | null }) {
  if (!props.position || props.position > 4) {
    return null;
  }

  const label =
    props.position <= 2 ? `${props.position}${props.position === 1 ? 'st' : 'nd'}` : '3-4th';

  return (
    <span
      className={cx(
        'inline-flex min-w-[76px] items-center justify-center gap-1 rounded px-3 py-1 text-xs font-bold text-[#1f2630]',
        props.position === 1 && 'bg-[#e6bf19]',
        props.position === 2 && 'bg-[#d7d8d4]',
        props.position >= 3 && 'bg-[#c77a2d]',
      )}
    >
      <FaTrophy />
      {label}
    </span>
  );
}

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const fmtShortDate = useFormatAppShortDate();
  const { team } = useOutletContext<RouteContextTeams>();
  const [competitions, setCompetitions] = React.useState<TeamCompetition[]>([]);
  const [selectedTab, setSelectedTab] = React.useState<EventTab>('active');
  const [showAllEnded, setShowAllEnded] = React.useState(false);

  React.useEffect(() => {
    setSelectedTab('active');
    setShowAllEnded(false);
    api.competitions
      .all<{
        include: {
          competitors: true;
          federation: true;
          matches: true;
          tier: {
            include: {
              league: true;
            };
          };
        };
      }>({
        where: {
          competitors: {
            some: {
              teamId: team.id,
            },
          },
        },
        include: {
          competitors: true,
          federation: true,
          matches: true,
          tier: {
            include: {
              league: true,
            },
          },
        },
        orderBy: {
          season: 'desc',
        },
      })
      .then(setCompetitions);
  }, [team.id]);

  const eventGroups = React.useMemo(() => {
    return competitions
      .reduce<
        Array<{
          competitions: TeamCompetition[];
          key: string;
          status: Constants.CompetitionStatus;
        }>
      >((groups, competition) => {
        const key = getEventKey(competition);
        const previous = groups.find((group) => group.key === key);

        if (previous) {
          previous.competitions.push(competition);
          if (competition.status !== Constants.CompetitionStatus.COMPLETED) {
            previous.status = competition.status;
          }
          return groups;
        }

        groups.push({
          competitions: [competition],
          key,
          status: competition.status,
        });

        return groups;
      }, [])
      .sort((a, b) => getEventLatestDate(b.competitions) - getEventLatestDate(a.competitions));
  }, [competitions]);
  const activeEvents = eventGroups.filter(
    (event) => event.status !== Constants.CompetitionStatus.COMPLETED,
  );
  const endedEvents = eventGroups.filter(
    (event) => event.status === Constants.CompetitionStatus.COMPLETED,
  );
  const visibleEndedEvents = showAllEnded ? endedEvents : endedEvents.slice(0, 10);
  const visibleEvents = selectedTab === 'active' ? activeEvents : visibleEndedEvents;

  return (
    <section className="p-3">
      <nav className="join mb-5 grid grid-cols-2">
        <button
          className={cx('btn join-item rounded-none', selectedTab === 'active' && 'btn-active')}
          onClick={() => setSelectedTab('active')}
        >
          Ongoing & Upcoming
        </button>
        <button
          className={cx('btn join-item rounded-none', selectedTab === 'ended' && 'btn-active')}
          onClick={() => setSelectedTab('ended')}
        >
          Ended
        </button>
      </nav>
      <header className="mb-3">
        <h3 className="text-base leading-none font-bold text-[#9aa8b5]">
          {selectedTab === 'active'
            ? `Ongoing & upcoming events for ${team.name}`
            : `Played events for ${team.name}`}
        </h3>
      </header>
      <section className="space-y-2">
        {visibleEvents.map((event) => {
          const primary = event.competitions[0];
          const placement = getPlacement(event.competitions, team.id);

          return (
            <Link
              key={`${event.key}__team_event`}
              to={getCompetitionLink(primary)}
              className="bg-base-content/10 grid min-h-16 grid-cols-[56px_minmax(0,1fr)_92px] items-center gap-3 px-4"
            >
              <img src={getEventLogo(primary)} className="max-h-12 max-w-12 object-contain" />
              <div className="min-w-0">
                <h4 className="truncate text-base font-black text-[#9aa8b5]">{event.key}</h4>
                <p className="text-muted text-sm">
                  {getEventDateRange(event.competitions, fmtShortDate)}
                </p>
              </div>
              <div className="text-right">
                {selectedTab === 'ended' && <PlacementBadge position={placement} />}
              </div>
            </Link>
          );
        })}
        {!visibleEvents.length && (
          <div className="border-base-content/10 bg-base-200/80 grid h-20 place-items-center border text-[#9aa8b5]">
            No events in this section
          </div>
        )}
        {selectedTab === 'ended' &&
          !showAllEnded &&
          endedEvents.length > visibleEndedEvents.length && (
            <button
              className="btn w-full rounded-none border-0 bg-[#4d6783] text-[#d8e5f1]"
              onClick={() => setShowAllEnded(true)}
            >
              All events attended by {team.name}
            </button>
          )}
      </section>
    </section>
  );
}
