/**
 * Team achievements route.
 *
 * @module
 */
import React from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Constants, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { FaTrophy } from 'react-icons/fa';
import { getTeamsTierLabel } from './labels';

type TeamCompetition = Awaited<
  ReturnType<
    typeof api.competitions.all<{
      include: {
        competitors: true;
        federation: true;
        tier: {
          include: {
            league: true;
          };
        };
      };
    }>
  >
>[number];

type AchievementTab = 'major' | 'lan';
type AchievementRow = {
  competition: TeamCompetition;
  placement: string;
  placementKind: 'text' | 'first' | 'second' | 'third';
  title: string;
};
type MajorCompetitionGroup = {
  challengers?: TeamCompetition;
  legends?: TeamCompetition;
  champions?: TeamCompetition;
  latestId: number;
  season: number;
};

const LAN_RESULT_TIER_SLUGS = new Set([
  ...Constants.Awards.filter((award) => award.type === Constants.AwardType.CHAMPION).map(
    (award) => award.target,
  ),
  Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
]);

function getSeasonYear(season?: number | null) {
  return season ? 2025 + season : null;
}

function getCompetitionTitle(competition: TeamCompetition) {
  const year = getSeasonYear(competition.season);
  const city = Util.getCompetitionHostingLocationCity(competition.location);

  if (Util.isMajorStageTier(competition.tier.slug)) {
    return getMajorEventTitle(competition);
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

  const hostedEventLabel = Util.getHostedEventTitleDisplayName(
    competition.tier.slug,
    competition.location,
  );
  if (hostedEventLabel) {
    return [hostedEventLabel, year].filter(Boolean).join(' ');
  }

  return [
    Util.getCompetitionDisplayName(competition.tier.league.name, competition.tier.slug),
    city,
    year,
  ]
    .filter(Boolean)
    .join(' ');
}

function getMajorEventTitle(competition: TeamCompetition, suffix?: string) {
  const year = getSeasonYear(competition.season);

  return [Util.getMajorEventDisplayName(competition.location, competition.organizer), year, suffix]
    .filter(Boolean)
    .join(' ');
}

function getCompetitionLink(competition: TeamCompetition) {
  return `/competitions?federationId=${competition.federationId}&season=${competition.season}&tierId=${competition.tier.id}`;
}

function getStatsLink(competition: TeamCompetition) {
  return `/competitions/statistics?federationId=${competition.federationId}&season=${competition.season}&tierId=${competition.tier.id}`;
}

function getTeamPosition(competition: TeamCompetition, teamId: number) {
  return (
    competition.competitors.find((competitor) => competitor.teamId === teamId)?.position ?? null
  );
}

function getPlacementKind(position: number): AchievementRow['placementKind'] {
  if (position === 1) {
    return 'first';
  }

  if (position === 2) {
    return 'second';
  }

  return 'third';
}

function getMajorPlacement(competition: TeamCompetition, teamId: number) {
  const position = getTeamPosition(competition, teamId);

  if (competition.tier.slug === Constants.TierSlug.MAJOR_CHALLENGERS_STAGE) {
    return {
      placement: 'Challengers',
      placementKind: 'text' as const,
    };
  }

  if (competition.tier.slug === Constants.TierSlug.MAJOR_LEGENDS_STAGE) {
    return {
      placement: 'Legends',
      placementKind: 'text' as const,
    };
  }

  if (!position) {
    return null;
  }

  if (position === 1) {
    return { placement: '1st', placementKind: 'first' as const };
  }

  if (position === 2) {
    return { placement: '2nd', placementKind: 'second' as const };
  }

  if (position <= 4) {
    return { placement: '3-4th', placementKind: 'third' as const };
  }

  return {
    placement: '1/4 final',
    placementKind: 'text' as const,
  };
}

function buildMajorRows(competitions: TeamCompetition[], teamId: number) {
  const groups = competitions
    .filter((competition) => Util.isMajorStageTier(competition.tier.slug))
    .reduce<Map<string, MajorCompetitionGroup>>((map, competition) => {
      const key = [
        competition.federationId,
        competition.season,
        competition.organizer,
        competition.location,
      ].join('__');
      const group = map.get(key) ?? {
        latestId: competition.id,
        season: competition.season,
      };

      if (competition.tier.slug === Constants.TierSlug.MAJOR_CHALLENGERS_STAGE) {
        group.challengers = competition;
      } else if (competition.tier.slug === Constants.TierSlug.MAJOR_LEGENDS_STAGE) {
        group.legends = competition;
      } else if (competition.tier.slug === Constants.TierSlug.MAJOR_CHAMPIONS_STAGE) {
        group.champions = competition;
      }

      group.latestId = Math.max(group.latestId, competition.id);
      map.set(key, group);

      return map;
    }, new Map());

  return [...groups.values()]
    .sort((a, b) => b.season - a.season || b.latestId - a.latestId)
    .map<AchievementRow | null>((group) => {
      const competition = group.champions ?? group.legends ?? group.challengers;

      if (!competition) {
        return null;
      }

      const placement =
        group.champions && getMajorPlacement(group.champions, teamId)
          ? getMajorPlacement(group.champions, teamId)
          : group.legends
            ? {
                placement: 'Legends',
                placementKind: 'text' as const,
              }
            : {
                placement: 'Challengers',
                placementKind: 'text' as const,
              };

      if (!placement) {
        return null;
      }

      const title =
        group.champions || group.legends
          ? getMajorEventTitle(competition)
          : getMajorEventTitle(competition, 'Challengers Stage');

      return {
        competition,
        placement: placement.placement,
        placementKind: placement.placementKind,
        title,
      };
    })
    .filter(Boolean) as AchievementRow[];
}

function buildLanRows(competitions: TeamCompetition[], teamId: number) {
  return competitions
    .filter(
      (competition) =>
        competition.tier.lan &&
        LAN_RESULT_TIER_SLUGS.has(competition.tier.slug as Constants.TierSlug),
    )
    .map<AchievementRow | null>((competition) => {
      const position = getTeamPosition(competition, teamId);

      if (!position || position > 4) {
        return null;
      }

      return {
        competition,
        placement: position === 1 ? '1st' : position === 2 ? '2nd' : '3-4th',
        placementKind: getPlacementKind(position),
        title: getCompetitionTitle(competition),
      };
    })
    .filter(Boolean) as AchievementRow[];
}

function PlacementCell(props: { kind: AchievementRow['placementKind']; label: string }) {
  if (props.kind === 'text') {
    return <span className="text-muted text-xs">{props.label}</span>;
  }

  return (
    <span
      className={cx(
        'inline-flex min-w-[76px] items-center justify-center gap-1 rounded px-3 py-1 text-xs font-bold text-[#1f2630]',
        props.kind === 'first' && 'bg-[#e6bf19]',
        props.kind === 'second' && 'bg-[#d7d8d4]',
        props.kind === 'third' && 'bg-[#c77a2d]',
      )}
    >
      <FaTrophy />
      {props.label}
    </span>
  );
}

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const { team } = useOutletContext<RouteContextTeams>();
  const [competitions, setCompetitions] = React.useState<TeamCompetition[]>([]);
  const [selectedTab, setSelectedTab] = React.useState<AchievementTab>('major');

  React.useEffect(() => {
    setSelectedTab('major');
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
          competitors: {
            some: {
              teamId: team.id,
            },
          },
          status: Constants.CompetitionStatus.COMPLETED,
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
      .then(setCompetitions);
  }, [team.id]);

  const rows = React.useMemo(
    () =>
      selectedTab === 'major'
        ? buildMajorRows(competitions, team.id)
        : buildLanRows(competitions, team.id),
    [competitions, selectedTab, team.id],
  );

  return (
    <section className="p-3">
      <nav className="join mb-5 grid grid-cols-2">
        <button
          className={cx('btn join-item rounded-none', selectedTab === 'major' && 'btn-active')}
          onClick={() => setSelectedTab('major')}
        >
          Major
        </button>
        <button
          className={cx('btn join-item rounded-none', selectedTab === 'lan' && 'btn-active')}
          onClick={() => setSelectedTab('lan')}
        >
          LAN
        </button>
      </nav>
      <header className="mb-3">
        <h3 className="text-base leading-none font-bold text-[#9aa8b5]">
          Breakdown of {team.name}'s {selectedTab === 'major' ? 'Major' : 'LAN'} achievements
        </h3>
      </header>
      <table className="table table-fixed">
        <thead>
          <tr>
            <th className="w-24 text-center">Placement</th>
            <th>Tournament</th>
            <th className="w-20 text-right" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.competition.id}__team_achievement`}>
              <td className="text-center">
                <PlacementCell kind={row.placementKind} label={row.placement} />
              </td>
              <td className="truncate" title={row.title}>
                <Link
                  to={getCompetitionLink(row.competition)}
                  className="link-hover text-[#9aa8b5]"
                >
                  {row.title}
                </Link>
              </td>
              <td className="text-right">
                <Link
                  to={getStatsLink(row.competition)}
                  className="btn btn-xs bg-[#4d6783] text-[#d8e5f1]"
                >
                  Stats
                </Link>
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={3} className="h-24 text-center text-[#9aa8b5]">
                No {selectedTab === 'major' ? 'Major' : 'LAN'} achievements yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
