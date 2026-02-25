/**
 * Dedicated modal for player team history.
 *
 * Transfer offer tabs have been replaced with a compact team history view.
 */

import React from 'react';
import { useLocation } from 'react-router-dom';
import { Bot, Constants, Eagers, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { Image } from '@liga/frontend/components';
import { XPBar } from '@liga/frontend/components/player-card';

/** @type {Player} */
type Player = (NonNullable<Awaited<ReturnType<typeof api.players.find<typeof Eagers.player>>>> & {
  careerStints?: Array<{
    id: number;
    teamId: number | null;
    startedAt: Date;
    endedAt: Date | null;
    team?: {
      id: number;
      name: string;
      blazon: string;
    } | null;
  }>;
}) | null;

type HonorOccurrence = {
  key: string;
  teamId: number;
  season: number;
  date: Date;
  tierSlug: string;
  federationSlug: string;
};

type HonorGroup = {
  key: string;
  count: number;
  seasons: number[];
  tierSlug: string;
  federationSlug: string;
};

function formatStintDate(input: Date | string) {
  const date = new Date(input);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

function isWithinStint(date: Date, startedAt: Date | string, endedAt: Date | string | null) {
  const start = new Date(startedAt);
  start.setHours(0, 0, 0, 0);

  const end = endedAt ? new Date(endedAt) : null;
  if (end) end.setHours(23, 59, 59, 999);

  return start <= date && (!end || end >= date);
}

export default function TransferModal() {
  const location = useLocation();
  const [player, setPlayer] = React.useState<Player>();
  const [honors, setHonors] = React.useState<HonorOccurrence[]>([]);

  React.useEffect(() => {
    if (!location.state) return;

    const playerId = location.state as number;

    api.players
      .find({
        include: {
          ...Eagers.player.include,
          careerStints: {
            include: {
              team: true,
            },
          },
        },
        where: { id: playerId },
      })
      .then((foundPlayer) => setPlayer(foundPlayer ?? undefined));
  }, []);

  const teamHistory = React.useMemo(() => {
    const stints = player?.careerStints ?? [];
    return [...stints].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
  }, [player?.careerStints]);

  React.useEffect(() => {
    if (!player) return;

    const championAwards = [
      ...Constants.Awards.filter((award) => award.type === Constants.AwardType.CHAMPION).map(
        (award) => award.target,
      ),
      Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
    ];

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
          matches: {
            include: {
              competitors: true;
            };
          };
        };
      }>({
        where: {
          status: Constants.CompetitionStatus.COMPLETED,
          tier: {
            slug: { in: championAwards },
          },
        },
        include: {
          competitors: true,
          federation: true,
          tier: {
            include: {
              league: true,
            },
          },
          matches: {
            include: {
              competitors: true,
            },
          },
        },
        orderBy: { season: 'desc' },
      })
      .then((competitions) => {
        const stints = player.careerStints ?? [];

        const occurrences = competitions.reduce<HonorOccurrence[]>((acc, competition) => {
          const championshipMatch = competition.matches.reduce<(typeof competition.matches)[number] | null>(
            (latest: (typeof competition.matches)[number] | null, match: (typeof competition.matches)[number]) => {
              if (!latest || match.date > latest.date) return match;
              return latest;
            },
            null,
          );

          if (!championshipMatch) return acc;

          let winnerTeamId = competition.competitors.find((c) => c.position === 1)?.teamId;
          if (!winnerTeamId && championshipMatch.competitors.length >= 2) {
            const ordered = [...championshipMatch.competitors].sort(
              (a, b) => (b.score ?? 0) - (a.score ?? 0),
            );
            winnerTeamId = ordered[0]?.teamId;
          }

          if (!winnerTeamId) return acc;

          const championshipDate = new Date(championshipMatch.date);
          const wonTitle = stints.some(
            (stint) =>
              stint.teamId === winnerTeamId &&
              isWithinStint(championshipDate, stint.startedAt, stint.endedAt),
          );

          if (!wonTitle) return acc;

          acc.push({
            key: `${competition.tier.slug}__${competition.federation.slug}`,
            teamId: winnerTeamId,
            season: competition.season,
            date: championshipDate,
            tierSlug: competition.tier.slug,
            federationSlug: competition.federation.slug,
          });

          return acc;
        }, []);

        setHonors(occurrences);
      });
  }, [player]);

  const honorGroups = React.useMemo(() => {
    return honors.reduce<Record<string, HonorGroup>>((acc, honor) => {
      if (!acc[honor.key]) {
        acc[honor.key] = {
          key: honor.key,
          count: 0,
          seasons: [],
          tierSlug: honor.tierSlug,
          federationSlug: honor.federationSlug,
        };
      }

      acc[honor.key].count += 1;
      acc[honor.key].seasons.push(honor.season);
      return acc;
    }, {});
  }, [honors]);

  const majorWinCount = React.useMemo(
    () => honors.filter((honor) => honor.tierSlug === Constants.TierSlug.MAJOR_CHAMPIONS_STAGE).length,
    [honors],
  );

  if (!player) {
    return (
      <main className="h-screen w-screen">
        <section className="center h-full">
          <span className="loading loading-bars" />
        </section>
      </main>
    );
  }

  return (
    <main className="divide-base-content/10 flex h-screen w-screen flex-col divide-y">
      {/* PLAYER CARD */}
      <section className="flex">
        <figure className="border-base-content/10 flex h-[246px] w-1/5 items-end justify-center overflow-hidden border-b p-0">
          <Image
            src={player.avatar || 'resources://avatars/empty.png'}
            className="mt-auto h-[390px] w-auto max-w-none object-contain"
          />
        </figure>

        <table className="table table-fixed">
          <thead>
            <tr>
              <th>Name</th>
              <th>Country</th>
              <th>Team</th>
              <th>Age</th>
            </tr>
          </thead>

          <tbody>
            <tr className="border-base-content/10 border-l">
              <td className="truncate">{player.name}</td>
              <td>
                <span className={cx('fp', 'mr-2', player.country.code.toLowerCase())} />
                {player.country.name}
              </td>
              <td className="truncate">
                {player.team ? (
                  <>
                    <img src={player.team.blazon} className="inline-block size-6" />
                    <span>&nbsp;{player.team.name}</span>
                  </>
                ) : (
                  'Free Agent'
                )}
              </td>
              <td>{player.age ? `${player.age} years` : 'N/A'}</td>
            </tr>
          </tbody>

          <thead>
            <tr>
              <th colSpan={3}>Stats</th>
              <th className="text-right">
                {majorWinCount > 0 && (
                  <span className="badge border-yellow-300 bg-yellow-500/20 px-4 py-3 font-semibold text-yellow-200">
                    {majorWinCount}x Major winner
                  </span>
                )}
              </th>
            </tr>
          </thead>

          <tbody>
            <tr>
              <td colSpan={4} className="px-4 py-2">
                <XPBar
                  className="w-full"
                  title="Total XP"
                  value={Bot.Exp.getTotalXP(player.xp)}
                  max={100}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="border-base-content/10 flex min-h-12 items-center gap-4 border-t px-4 py-2">
        {Object.keys(honorGroups).length === 0 && <span className="text-sm opacity-60">No honors yet.</span>}
        {Object.values(honorGroups).map((honor) => {
          const seasonsList = [...honor.seasons]
            .sort((a, b) => a - b)
            .map((season) => `Season ${season}`)
            .join(', ');

          return (
            <div key={honor.key} className="tooltip flex items-center gap-2" data-tip={seasonsList}>
              <Image
                className="h-12 w-12 object-contain"
                src={Util.getCompetitionLogo(honor.tierSlug, honor.federationSlug)}
              />
              <span className="text-base font-bold">x{honor.count}</span>
            </div>
          );
        })}
      </section>

      <section className="flex-1 overflow-y-scroll">
        <table className="table table-fixed table-pin-rows">
          <thead>
            <tr>
              <th className="w-4/12">Time period</th>
              <th className="w-5/12">Team</th>
              <th className="w-3/12">Honors</th>
            </tr>
          </thead>

          <tbody>
            {teamHistory.length === 0 && (
              <tr>
                <td colSpan={3} className="py-8 text-center opacity-60">
                  No team history available.
                </td>
              </tr>
            )}

            {teamHistory.map((stint) => {
              const stintHonors = honors.filter(
                (honor) =>
                  honor.teamId === stint.teamId &&
                  isWithinStint(honor.date, stint.startedAt, stint.endedAt),
              );

              return (
                <tr key={stint.id}>
                  <td className="truncate">
                    {formatStintDate(stint.startedAt)} -{' '}
                    {stint.endedAt ? formatStintDate(stint.endedAt) : 'Present'}
                  </td>
                  <td>
                    {stint.team ? (
                      <div className="flex items-center gap-2">
                        <img src={stint.team.blazon} className="inline-block size-6" />
                        <span>{stint.team.name}</span>
                      </div>
                    ) : (
                      <span className="opacity-70">Free Agent</span>
                    )}
                  </td>

                  <td>
                    {stintHonors.length === 0 ? (
                      <span className="opacity-60">—</span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1">
                        {stintHonors.map((honor, idx) => (
                          <div
                            key={`${stint.id}-${honor.key}-${honor.season}-${idx}`}
                            className="tooltip"
                            data-tip={`Season ${honor.season}`}
                          >
                            <Image
                              className="h-9 w-9 object-contain"
                              src={Util.getCompetitionLogo(honor.tierSlug, honor.federationSlug)}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}
