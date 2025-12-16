/**
 * World generation.
 *
 * @module
 */
import * as Sqrl from 'squirrelly';
import * as Autofill from './autofill';
import * as Simulator from './simulator';
import * as WindowManager from './window-manager';
import * as Engine from './engine';
import Tournament from '@liga/shared/tournament';
import DatabaseClient from './database-client';
import getLocale from './locale';
import { addDays, addWeeks, addYears, differenceInDays, format, setDay } from 'date-fns';
import { compact, differenceBy, flatten, groupBy, random, sample, shuffle } from 'lodash';
import { Calendar, Prisma } from '@prisma/client';
import { Constants, Chance, Bot, Eagers, Util } from '@liga/shared';

/**
 * Bumps the current season number by one.
 *
 * @function
 */
export async function bumpSeasonNumber() {
  const profile = await DatabaseClient.prisma.profile.findFirst();
  return DatabaseClient.prisma.profile.update({
    where: {
      id: profile.id,
    },
    data: {
      season: {
        increment: 1,
      },
    },
  });
}

/**
 * Creates competitions at the start of a new season.
 *
 * @function
 */
export async function createCompetitions() {
  // grab current profile
  const profile = await DatabaseClient.prisma.profile.findFirst();
  const today = profile?.date || new Date();

  // loop through autofill entries and create competitions
  const autofill = Autofill.Items.filter(
    (item) => item.on === Constants.CalendarEntry.SEASON_START,
  );
  const tiers = await DatabaseClient.prisma.tier.findMany({
    where: {
      slug: {
        in: autofill.map((item) => item.tierSlug),
      },
    },
    include: Eagers.tier.include,
  });

  return Promise.all(
    autofill.map(async (item) => {
      const tier = tiers.find((tier) => tier.slug === item.tierSlug);
      return Promise.all(
        tier.league.federations.map(async (federation) => {
          // collect teams and create the competition
          const teams = await Autofill.parse(item, tier, federation);
          const competition = await DatabaseClient.prisma.competition.create({
            data: {
              status: Constants.CompetitionStatus.SCHEDULED,
              season: profile.season,
              federation: {
                connect: {
                  id: federation.id,
                },
              },
              tier: {
                connect: {
                  id: tier.id,
                },
              },
              competitors: {
                create: teams.map((team) => ({ teamId: team.id })),
              },
            },
            include: {
              tier: true,
            },
          });

          // bail early if this competition relies on
          // a trigger to schedule its start date
          if (competition.tier.triggerOffsetDays) {
            return Promise.resolve();
          }

          // create the calendar entry for when this competition starts
          Engine.Runtime.Instance.log.debug(
            'Scheduling start date for %s - %s...',
            federation.name,
            tier.name,
          );

          return DatabaseClient.prisma.calendar.create({
            data: {
              date: addDays(today, tier.league.startOffsetDays).toISOString(),
              type: Constants.CalendarEntry.COMPETITION_START,
              payload: competition.id.toString(),
            },
          });
        }),
      );
    }),
  );
}

/**
 * Creates matchdays.
 *
 * @param matches     The array of matches to create matchdays for.
 * @param tournament  The tournament object the matches belong to.
 * @param competition The competition the matches belong to.
 * @param mapName     The round's map name.
 * @function
 */
async function createMatchdays(
  matches: Clux.Match[],
  tournament: Tournament,
  competition: Prisma.CompetitionGetPayload<{
    include: { tier: { include: { league: true } }; competitors: true };
  }>,
  mapName?: string,
) {
  // grab current profile
  const profile = await DatabaseClient.prisma.profile.findFirst();
  const today = profile?.date || new Date();

  // grab user seed (teamless players will not match any competitor)
  const userCompetitorId =
    profile?.teamId != null
      ? competition.competitors.find((competitor) => competitor.teamId === profile.teamId)
      : undefined;
  const userSeed = tournament.getSeedByCompetitorId(userCompetitorId?.id);

  // create the matchdays
  const totalRounds = tournament.$base.rounds().length;

  return Promise.all(
    matches.map(async (match) => {
      // build competitors list
      const competitors = compact(
        match.p.map(
          (seed) =>
            seed > 0 && {
              seed,
              teamId: competition.competitors.find(
                (competitor) => tournament.getCompetitorBySeed(seed) === competitor.id,
              ).teamId,
            },
        ),
      );

      // are both teams ready?
      let status: Constants.MatchStatus;

      switch (competitors.length) {
        case 0:
          status = Constants.MatchStatus.LOCKED;
          break;
        case 1:
          status = Constants.MatchStatus.WAITING;
          break;
        default:
          status = Constants.MatchStatus.READY;
          break;
      }

      // if one of the seeds is `-1` then this is
      // a BYE and the match will not be played
      if (match.p.includes(-1)) {
        status = Constants.MatchStatus.COMPLETED;
      }

      // if there's an existing matchday record then we only need
      // update its status and add competitors if necessary
      const existingMatch = await DatabaseClient.prisma.match.findFirst({
        ...Eagers.match,
        where: {
          payload: JSON.stringify(match.id),
          competitionId: Number(competition.id),
        },
      });

      if (existingMatch) {
        const existingEntry = await DatabaseClient.prisma.calendar.findFirst({
          where: { payload: String(existingMatch.id) },
        });
        if (userSeed != null && match.p.includes(userSeed)) {
          Engine.Runtime.Instance.log.debug(
            'User has new match(id=%d) on %s',
            existingEntry.id,
            format(existingEntry.date, Constants.Application.CALENDAR_DATE_FORMAT),
          );
        }
        return DatabaseClient.prisma.$transaction([
          DatabaseClient.prisma.calendar.update({
            where: { id: existingEntry.id },
            data: {
              type:
                userSeed != null && match.p.includes(userSeed)
                  ? Constants.CalendarEntry.MATCHDAY_USER
                  : Constants.CalendarEntry.MATCHDAY_NPC,
            },
          }),
          DatabaseClient.prisma.match.update({
            where: { id: existingMatch.id },
            data: {
              status,
              competitors: {
                create: differenceBy(competitors, existingMatch.competitors, 'teamId'),
              },
              games: {
                update: existingMatch.games.map((game) => ({
                  where: { id: game.id },
                  data: {
                    teams: {
                      create: differenceBy(competitors, existingMatch.competitors, 'teamId'),
                    },
                  },
                })),
              },
            },
          }),
        ]);
      }

      // generate day of week for match
      const dayOfWeek = Chance.roll(Constants.MatchDayWeights[competition.tier.league.slug]);
      const week = addWeeks(today, match.id.r);
      const matchday = setDay(week, Number(dayOfWeek), { weekStartsOn: 1 });

      // assign map to match
      if (!match.data) {
        match.data = { map: mapName };
      } else {
        match.data['map'] = mapName;
      }

      // how many games in this series?
      let num = 1;

      if (Constants.TierMatchConfig[competition.tier.slug]) {
        num = Constants.TierMatchConfig[competition.tier.slug][totalRounds - match.id.r] || num;
      }

      // create match record
      const newMatch = await DatabaseClient.prisma.match.create({
        data: {
          status,
          totalRounds,
          round: match.id.r,
          date: matchday.toISOString(),
          payload: JSON.stringify(match.id),
          competition: {
            connect: {
              id: competition.id,
            },
          },
          competitors: {
            create: competitors,
          },
          games: {
            create: Array.from({ length: num }).map((_, idx) => ({
              status,
              map: mapName,
              num: idx,
              teams: {
                create: competitors,
              },
            })),
          },
        },
      });

      // don't schedule the match if it's already
      // been completed (e.g.: BYE week)
      if (status === Constants.MatchStatus.COMPLETED) {
        return Promise.resolve();
      }

      // register matchday in the calendar
      return DatabaseClient.prisma.calendar.create({
        data: {
          type:
            userSeed != null && match.p.includes(userSeed)
              ? Constants.CalendarEntry.MATCHDAY_USER
              : Constants.CalendarEntry.MATCHDAY_NPC,
          date: matchday.toISOString(),
          payload: String(newMatch.id),
        },
      });
    }),
  );
}

/**
 * Sends a welcome e-mail to the user upon creating a new career.
 *
 * A new career is determined by comparing the current
 * year with the profile's current year.
 *
 * @function
 */
export async function createWelcomeEmail() {
  const profile = await DatabaseClient.prisma.profile.findFirst(Eagers.profile);

  // Teamless player: skip team-based welcome email.
  if (!profile || profile.teamId == null || !profile.team) {
    return Promise.resolve();
  }

  const locale = getLocale(profile);

  if (new Date().getFullYear() === profile.date.getFullYear()) {
    const [persona] = profile.team.personas;
    await sendEmail(
      locale.templates.WelcomeEmail.SUBJECT,
      Sqrl.render(locale.templates.WelcomeEmail.CONTENT, {
        profile,
        persona,
      }),
      persona,
      profile.date,
      false,
    );
  }

  return Promise.resolve();
}

/**
 * Distributes prize pool on competition end.
 *
 * @param competition         The competition database record.
 * @param preloadedTournament Tournament instance, if already loaded.
 * @function
 */
export async function distributePrizePool(
  competition: Prisma.CompetitionGetPayload<{ include: { competitors: true; tier: true } }>,
  preloadedTournament?: Tournament,
) {
  // bail if competition is not done yet
  const tournament = preloadedTournament || Tournament.restore(JSON.parse(competition.tournament));

  if (!tournament.$base.isDone()) {
    return Promise.resolve();
  }

  // bail if no prize pool
  const prizePool = Constants.PrizePool[competition.tier.slug];

  if (!prizePool || !prizePool.total || !prizePool.distribution.length) {
    return Promise.resolve();
  }

  // loop through positions and assign their award
  const winners: Array<[number, number]> = [];

  for (const competitorId of tournament.competitors) {
    const competitor = tournament.$base.resultsFor(tournament.getSeedByCompetitorId(competitorId));
    const pos = (competitor.gpos || competitor.pos) - 1;
    const prizeMoney = prizePool.total * ((prizePool.distribution[pos] || 0) / 100);
    if (prizeMoney > 0) {
      winners.push([competitorId, prizeMoney]);
    }
  }

  if (!winners.length) {
    return Promise.resolve();
  }

  // assign prize winnings to team earnings
  const transaction = winners.map(([id, prizeMoney]) =>
    DatabaseClient.prisma.competitionToTeam.update({
      where: {
        id,
      },
      data: {
        team: {
          update: {
            earnings: {
              increment: prizeMoney,
            },
          },
        },
      },
    }),
  );

  return DatabaseClient.prisma.$transaction(transaction);
}

/**
 * Parses a sponsorship offer from the sponsor's perspective.
 *
 * @param sponsorship The sponsorship offer to parse.
 * @param locale      The locale.
 * @function
 */
export function parseSponsorshipOffer(
  sponsorship: Prisma.SponsorshipGetPayload<typeof Eagers.sponsorship>,
  locale: LocaleData,
): {
  dialogue: Partial<Prisma.DialogueGetPayload<{ include: { from: true } }>>;
  sponsorship: Partial<Prisma.SponsorshipGetPayload<typeof Eagers.sponsorship>>;
  paperwork?: Array<Promise<unknown>>;
} {
  // who will be sending the response e-mail
  const persona = sponsorship.team.personas.find(
    (persona) =>
      persona.role === Constants.PersonaRole.MANAGER ||
      persona.role === Constants.PersonaRole.ASSISTANT,
  );

  // bail early if tier requirement not met
  const contract = Constants.SponsorContract[sponsorship.sponsor.slug as Constants.SponsorSlug];

  if (!contract.tiers.includes(Constants.Prestige[sponsorship.team.tier])) {
    Engine.Runtime.Instance.log.info(
      '%s rejected the offer. Reason: Tier requirement not met.',
      sponsorship.sponsor.name,
    );

    return {
      dialogue: {
        from: persona,
        content: locale.templates.SponsorshipRejectedTier.CONTENT,
      },
      sponsorship: {
        status: Constants.SponsorshipStatus.SPONSOR_REJECTED,
      },
    };
  }

  // got this far -- offer accepted!
  Engine.Runtime.Instance.log.info('%s has accepted the offer.', sponsorship.sponsor.name);
  return {
    dialogue: {
      from: persona,
      content: locale.templates.SponsorshipAccepted.CONTENT,
    },
    paperwork: [sponsorshipInvite(sponsorship.id, Constants.SponsorshipStatus.SPONSOR_ACCEPTED)],
    sponsorship: {
      status: Constants.SponsorshipStatus.SPONSOR_ACCEPTED,
    },
  };
}

/**
 * Parses a sponsorship offer from the team's perspective.
 *
 * @param sponsorship The sponsorship offer to parse.
 * @param locale      The locale.
 * @param status      Force accepts or rejects the offer.
 * @function
 */
export function parseTeamSponsorshipOffer(
  sponsorship: Prisma.SponsorshipGetPayload<typeof Eagers.sponsorship>,
  locale: LocaleData,
  status?: Constants.SponsorshipStatus,
): ReturnType<typeof parseSponsorshipOffer> {
  // who will be sending the response e-mail
  const persona = sponsorship.team.personas.find(
    (persona) =>
      persona.role === Constants.PersonaRole.MANAGER ||
      persona.role === Constants.PersonaRole.ASSISTANT,
  );

  // bail early if offer was rejected
  if (typeof status === 'number' && status === Constants.SponsorshipStatus.TEAM_REJECTED) {
    return {
      dialogue: {
        from: persona,
        content: locale.templates.SponsorhipRenewRejectedUser.CONTENT,
      },
      sponsorship: {
        status,
      },
    };
  }

  return {
    dialogue: {
      from: persona,
      content: locale.templates.SponsorhipRenewAcceptedUser.CONTENT,
    },
    paperwork: [sponsorshipInvite(sponsorship.id, Constants.SponsorshipStatus.TEAM_ACCEPTED)],
    sponsorship: {
      status: Constants.SponsorshipStatus.TEAM_ACCEPTED,
    },
  };
}

export async function acceptUserPlayerTransfer(transferId: number) {
  const profile = await DatabaseClient.prisma.profile.findFirst(Eagers.profile);
  if (!profile) return Promise.resolve();

  const transfer = await DatabaseClient.prisma.transfer.findFirst({
    where: { id: transferId },
    include: {
      ...Eagers.transfer.include,
      offers: { orderBy: { id: "desc" } },
    },
  });

  if (!transfer) return Promise.resolve();

  const fromTeamId = transfer.from?.id;
  if (!fromTeamId) {
    Engine.Runtime.Instance.log.warn(
      "acceptUserPlayerTransfer: transfer %d has no from team loaded. Skipping.",
      transferId
    );
    return Promise.resolve();
  }

  // Only handle invites that target our user player.
  if (transfer.playerId !== profile.playerId) {
    Engine.Runtime.Instance.log.warn(
      "acceptUserPlayerTransfer: transfer %d does not target user player. Skipping.",
      transferId
    );
    return Promise.resolve();
  }

  const [offer] = transfer.offers;

  // Update transfer & this offer to accepted.
  await DatabaseClient.prisma.transfer.update({
    where: { id: transfer.id },
    data: {
      status: Constants.TransferStatus.PLAYER_ACCEPTED,
      offers: {
        update: {
          where: { id: offer.id },
          data: {
            status: Constants.TransferStatus.PLAYER_ACCEPTED,
          },
        },
      },
    },
  });

  // 1) Compute simple 1-year contract end.
  const years = offer.contractYears ?? 1;
  const contractEnd = addYears(profile.date, years);

  // 2) Connect the player to the new team.
  await DatabaseClient.prisma.player.update({
    where: { id: transfer.playerId },
    data: {
      transferListed: false,
      starter: true,
      team: { connect: { id: fromTeamId } },
      contractEnd,
    },
  });

  // 3) Update profile.teamId so the game knows you're now on a team.
  const updatedProfile = await DatabaseClient.prisma.profile.update({
    where: { id: profile.id },
    data: {
      team: {
        connect: { id: fromTeamId },
      },
    },
    include: { player: true, team: true },
  });

  // 4) Notify renderer so UI updates immediately.
  const mainWindow = WindowManager.get(Constants.WindowIdentifier.Main, false)?.webContents;
  if (mainWindow) {
    mainWindow.send(Constants.IPCRoute.PROFILES_CURRENT, updatedProfile);
  }

  // 5) Schedule contract expiry event in the calendar.
  await DatabaseClient.prisma.calendar.create({
    data: {
      type: Constants.CalendarEntry.PLAYER_CONTRACT_EXPIRE,
      date: contractEnd.toISOString(),
      payload: String(transfer.playerId),
    },
  });

  // 6) Mark future matches for this team as user matchdays.
  const today = profile.date;
  const futureMatches = await DatabaseClient.prisma.match.findMany({
    where: {
      date: { gte: today.toISOString() },
      competitors: {
        some: { teamId: fromTeamId },
      },
    },
  });

  if (futureMatches.length) {
    const matchIds = futureMatches.map((m) => String(m.id));

    await DatabaseClient.prisma.calendar.updateMany({
      where: {
        payload: { in: matchIds },
        date: { gte: today.toISOString() },
        type: {
          in: [
            Constants.CalendarEntry.MATCHDAY_NPC,
            Constants.CalendarEntry.MATCHDAY_USER,
          ],
        },
      },
      data: { type: Constants.CalendarEntry.MATCHDAY_USER },
    });
  }

  // 7) Reject any other pending offers for this player.
  const otherTransfers = await DatabaseClient.prisma.transfer.findMany({
    where: {
      id: { not: transfer.id },
      playerId: transfer.playerId,
      status: {
        in: [
          Constants.TransferStatus.TEAM_PENDING,
          Constants.TransferStatus.PLAYER_PENDING,
        ],
      },
    },
  });

  if (otherTransfers.length) {
    await Promise.all([
      DatabaseClient.prisma.transfer.updateMany({
        where: { id: { in: otherTransfers.map((t) => t.id) } },
        data: { status: Constants.TransferStatus.PLAYER_REJECTED },
      }),
      DatabaseClient.prisma.offer.updateMany({
        where: { transferId: { in: otherTransfers.map((t) => t.id) } },
        data: { status: Constants.TransferStatus.PLAYER_REJECTED },
      }),
    ]);
  }

  // 8) Welcome email.
  const updatedPlayer = await DatabaseClient.prisma.player.findFirst({
    where: { id: transfer.playerId },
  });
  const locale = getLocale(profile);
  const persona =
    transfer.from?.personas?.find(
      (p) =>
        p.role === Constants.PersonaRole.MANAGER ||
        p.role === Constants.PersonaRole.ASSISTANT,
    ) ?? transfer.from?.personas?.[0];
  if (!persona) return Promise.resolve();

  await sendEmail(
    Sqrl.render(locale.templates.OfferAcceptedUser.SUBJECT, { transfer, profile, player: updatedPlayer }),
    Sqrl.render(locale.templates.OfferAcceptedUser.CONTENT, { transfer, profile, player: updatedPlayer }),
    persona,
    profile.date,
    true
  );

  Engine.Runtime.Instance.log.info(
    "%s joined %s via player-career invite.",
    profile.name,
    transfer.from.name
  );

  return Promise.resolve();
}

/**
 * Reject a transfer offer that targets the user player (Player Career invite).
 */
export async function rejectUserPlayerTransfer(transferId: number) {
  const profile = await DatabaseClient.prisma.profile.findFirst(Eagers.profile);
  if (!profile) return Promise.resolve();

  const transfer = await DatabaseClient.prisma.transfer.findFirst({
    where: { id: transferId },
    include: {
      ...Eagers.transfer.include,
      offers: { orderBy: { id: "desc" } },
    },
  });

  if (!transfer) return Promise.resolve();

  if (transfer.playerId !== profile.playerId) {
    Engine.Runtime.Instance.log.warn(
      "rejectUserPlayerTransfer: transfer %d does not target user player. Skipping.",
      transferId
    );
    return Promise.resolve();
  }

  const [offer] = transfer.offers;

  await DatabaseClient.prisma.transfer.update({
    where: { id: transfer.id },
    data: {
      status: Constants.TransferStatus.PLAYER_REJECTED,
      offers: {
        update: {
          where: { id: offer.id },
          data: {
            status: Constants.TransferStatus.PLAYER_REJECTED,
          },
        },
      },
    },
  });

  const persona =
    transfer.from.personas.find(
      (p) =>
        p.role === Constants.PersonaRole.MANAGER ||
        p.role === Constants.PersonaRole.ASSISTANT
    ) ?? transfer.from.personas[0];

  await sendEmail(
    `Re: Offer from ${transfer.from.name}`,
    `You have declined the offer from ${transfer.from.name}.`,
    persona,
    profile.date,
    false
  );

  Engine.Runtime.Instance.log.info(
    "User rejected invite from %s (transfer %d).",
    transfer.from.name,
    transfer.id
  );

  return Promise.resolve();
}


/**
 * Records the match results for the day by updating
 * their respective tournament object entries.
 *
 * Also checks whether any competitions are set to start
 * after the completion of a dependent competition and
 * creates their calendar entry database record.
 *
 * @function
 */
export async function recordMatchResults() {
  // get today's match results
  const profile = await DatabaseClient.prisma.profile.findFirst();
  const today = profile?.date || new Date();
  const allMatches = await DatabaseClient.prisma.match.findMany({
    where: {
      date: today.toISOString(),
      status: Constants.MatchStatus.COMPLETED,
    },
    include: {
      competitors: true,
      competition: {
        include: {
          competitors: true,
          tier: { include: { league: true } },
          federation: true,
        },
      },
    },
  });

  // group them together by competition id
  const groupedMatches = groupBy(allMatches, 'competitionId');
  const competitionIds = Object.keys(groupedMatches);

  // record results for all competitions
  return Promise.all(
    competitionIds.map(async (competitionId) => {
      // restore tournament object
      const matches = groupedMatches[competitionId];
      const competition = matches[0].competition;
      const tournamentData = JSON.parse(competition.tournament);
      const tournament = Tournament.restore(tournamentData as ReturnType<Tournament['save']>);

      // record match results with tourney
      matches.forEach((match) => {
        const cluxMatch = tournament.$base.findMatch(JSON.parse(match.payload));

        // skip if this match is a BYE
        if (cluxMatch.p.includes(-1)) {
          return;
        }

        // get home and away scores based off of their seeds since
        // the competitors array is not in the correct order
        const [home, away] = cluxMatch.p;
        const homeScore = match.competitors.find((competitor) => home === competitor.seed);
        const awayScore = match.competitors.find((competitor) => away === competitor.seed);

        // record the score
        tournament.$base.score(cluxMatch.id, [homeScore.score, awayScore.score]);
      });

      // check if a new cup round must be generated
      //
      // this is done by checking if all
      // matches have not been scored
      const newMatches = tournament.$base.currentRound(Constants.BracketIdentifier.UPPER);
      const newRound = Array.isArray(newMatches) && newMatches.every((match) => !match.m);

      if (tournament.brackets && newRound) {
        Engine.Runtime.Instance.log.info('Generating next round of matches...');
        await createMatchdays(newMatches, tournament, competition);
      }

      // check if competition is done and a start date must
      // be scheduled for a dependent competition
      if (tournament.$base.isDone() && competition.tier.triggerTierSlug) {
        const triggeredCompetition = await DatabaseClient.prisma.competition.findFirst({
          where: {
            season: competition.season,
            tier: {
              slug: competition.tier.triggerTierSlug,
            },
            federation: {
              OR: [
                { slug: competition.federation.slug },
                { slug: Constants.FederationSlug.ESPORTS_WORLD },
              ],
            },
          },
          include: {
            federation: true,
            tier: true,
          },
        });

        if (triggeredCompetition) {
          const date = addDays(today, triggeredCompetition.tier.triggerOffsetDays);
          const existingEntry = await DatabaseClient.prisma.calendar.findFirst({
            where: {
              date: {
                gte: today.toISOString(),
                lte: date.toISOString(),
              },
              type: Constants.CalendarEntry.COMPETITION_START,
              payload: triggeredCompetition.id.toString(),
            },
          });

          if (existingEntry) {
            return Promise.resolve();
          }

          Engine.Runtime.Instance.log.debug(
            'Scheduling start date for %s on %s...',
            triggeredCompetition.tier.name,
            format(date, Constants.Application.CALENDAR_DATE_FORMAT),
          );

          try {
            await DatabaseClient.prisma.calendar.create({
              data: {
                date: date.toISOString(),
                type: Constants.CalendarEntry.COMPETITION_START,
                payload: triggeredCompetition.id.toString(),
              },
            });
          } catch (_) {
            Engine.Runtime.Instance.log.warn(
              'Existing start date for %s found. Skipping...',
              triggeredCompetition.tier.name,
            );
          }
        }
      }

      // awards and prize pool distribution
      await Promise.all([
        sendUserAward(competition, tournament),
        distributePrizePool(competition, tournament),
      ]);

      // update the competition database record
      return DatabaseClient.prisma.competition.update({
        where: { id: Number(competitionId) },
        data: {
          status: tournament.$base.isDone()
            ? Constants.CompetitionStatus.COMPLETED
            : Constants.CompetitionStatus.STARTED,
          tournament: JSON.stringify(tournament.save()),
          competitors: {
            update: tournament.competitors.map((id) => {
              const competitor = tournament.$base.resultsFor(tournament.getSeedByCompetitorId(id));
              return {
                where: { id },
                data: {
                  position: competitor.gpos || competitor.pos,
                  win: competitor.wins,
                  loss: competitor.losses,
                  draw: competitor.draws,
                },
              };
            }),
          },
        },
      });
    }),
  );
}

/**
 * Resets the player training gains at the end of the season.
 *
 * @function
 */
async function resetTrainingGains() {
  return DatabaseClient.prisma.player.updateMany({
    data: {},
  });
}

/**
 * Creates a calendar entry to start
 * the next season a year from today.
 *
 * @function
 */
export async function scheduleNextSeasonStart() {
  const profile = await DatabaseClient.prisma.profile.findFirst();
  return DatabaseClient.prisma.calendar.create({
    data: {
      date: addYears(profile.date, 1).toISOString(),
      type: Constants.CalendarEntry.SEASON_START,
    },
  });
}

/**
 * Sends an e-mail to the user and notifies the main
 * window process to render a toast notification.
 *
 * @param subject   The subject.
 * @param content   The content.
 * @param persona   The persona.
 * @param sentAt    The sent at date.
 * @param notify    Notify the main window.
 * @function
 */
export async function sendEmail(
  subject: string,
  content: string,
  persona: Prisma.PersonaGetPayload<unknown>,
  sentAt: Date,
  notify = true,
) {
  const dialogues: Prisma.EmailUpsertArgs['create']['dialogues'] = {
    create: {
      sentAt,
      content,
      from: {
        connect: { id: persona.id },
      },
    },
  };
  const email = await DatabaseClient.prisma.email.upsert({
    where: { subject },
    update: {
      dialogues,
      read: false,
    },
    create: {
      subject,
      dialogues,
      sentAt,
      from: {
        connect: {
          id: persona.id,
        },
      },
    },
    include: Eagers.email.include,
  });

  // let the renderer know a new e-mail came in
  if (notify) {
    const mainWindow = WindowManager.get(Constants.WindowIdentifier.Main).webContents;
    mainWindow.send(Constants.IPCRoute.EMAILS_NEW, email);
  }

  return Promise.resolve(email);
}

/**
 * Determine whether to send the user an award.
 *
 * @param competition         The competition database record.
 * @param preloadedTournament Tournament instance, if already loaded.
 * @function
 */
export async function sendUserAward(
  competition: Prisma.CompetitionGetPayload<{ include: { competitors: true; tier: true } }>,
  preloadedTournament?: Tournament,
) {
  const profile = await DatabaseClient.prisma.profile.findFirst(Eagers.profile);

  // Teamless player: no user awards.
  if (!profile || profile.teamId == null || !profile.team) {
    return Promise.resolve();
  }

  // bail if competition is not done yet
  const tournament = preloadedTournament || Tournament.restore(JSON.parse(competition.tournament));

  if (!tournament.$base.isDone()) {
    return Promise.resolve();
  }

  // check if user is participating in competition
  const userCompetitorId = competition.competitors.find(
    (competitor) => competitor.teamId === profile.teamId,
  );
  const userSeed = tournament.getSeedByCompetitorId(userCompetitorId?.id);

  if (!userSeed) {
    return Promise.resolve();
  }

  // check if competition has any awards
  const awards = Constants.Awards.filter(
    (award) =>
      award.target === competition.tier.slug &&
      award.on === Constants.CalendarEntry.COMPETITION_END,
  );

  if (!awards.length) {
    return Promise.resolve();
  }

  // now check if user placed
  const result = tournament.$base.resultsFor(userSeed);
  const position = result.gpos || result.pos;
  const [award] = awards.filter((award) =>
    !award.end ? position === award.start : position > award.start && position <= award.end,
  );

  if (!award || !award.action) {
    return Promise.resolve();
  }

  // figure out the type of e-mail to send
  const locale = getLocale(profile);
  let email: (typeof locale.templates)[keyof typeof locale.templates];

  switch (award.type) {
    case Constants.AwardType.CHAMPION:
      email = locale.templates.AwardTypeChampion;
      break;
    case Constants.AwardType.PROMOTION:
      email = locale.templates.AwardTypePromotion;
      break;
    case Constants.AwardType.QUALIFY:
      email = locale.templates.AwardTypeQualify;
      break;
    default:
      Engine.Runtime.Instance.log.warn('Award type %s not implemented.', award.type);
      break;
  }

  // run the actions (email, confetti, etc)
  return Promise.all(
    award.action.map((action) => {
      switch (action) {
        case Constants.AwardAction.EMAIL:
          return sendEmail(
            Sqrl.render(email.SUBJECT, { profile }),
            Sqrl.render(email.CONTENT, {
              profile,
              competition: Constants.IdiomaticTier[competition.tier.slug],
            }),
            profile.team.personas[0],
            profile.date,
          );
        case Constants.AwardAction.CONFETTI:
          WindowManager.get(Constants.WindowIdentifier.Main).webContents?.send(
            Constants.IPCRoute.CONFETTI_START,
          );
          return Promise.resolve();
        default:
          return Promise.resolve();
      }
    }),
  );
}

/**
 * Creates a team invite (transfer) targeting the user player when they are teamless.
 *
 * This is used by Player Career after FACEIT PUGs.
 */
export async function sendPlayerInviteForUser() {
  const profile = await DatabaseClient.prisma.profile.findFirst(Eagers.profile);

  // Only if we have a profile and the user is teamless.
  if (!profile || profile.teamId != null || !profile.player) {
    return Promise.resolve();
  }

  const prisma = DatabaseClient.prisma;

  // Pick a random team for now
  const teams = await prisma.team.findMany({
    include: { personas: true },
  });

  if (!teams.length) return Promise.resolve();

  const from = sample(teams); // lodash.sample
  const target = profile.player;

  // Basic wages/cost – for now just reuse whatever the player currently has.
  const wages = target.wages ?? 0;
  const cost = target.cost ?? 0;

  const transfer = await prisma.transfer.create({
    data: {
      status: Constants.TransferStatus.PLAYER_PENDING,
      from: { connect: { id: from.id } },
      target: { connect: { id: target.id } },
      offers: {
        create: [
          {
            status: Constants.TransferStatus.PLAYER_PENDING,
            wages,
            cost,
          },
        ],
      },
    },
    include: Eagers.transfer.include,
  });

  const locale = getLocale(profile);

  const persona =
    from.personas.find(
      (p) =>
        p.role === Constants.PersonaRole.MANAGER ||
        p.role === Constants.PersonaRole.ASSISTANT,
    ) ?? from.personas[0];

  await sendEmail(
    // SUBJECT with template
    Sqrl.render(locale.templates.OfferIncoming.SUBJECT, { transfer, profile }),
    // CONTENT with buttons, also template
    Sqrl.render(locale.templates.OfferIncoming.CONTENT, { transfer, profile }),
    persona,
    profile.date,
    true,
  );

  WindowManager.sendAll(Constants.IPCRoute.TRANSFER_UPDATE);

  Engine.Runtime.Instance.log.info(
    "%s sent a player-career invite to %s",
    from.name,
    target.name,
  );

  return Promise.resolve(transfer);
}

/**
 * Checks if the user has met the contract
 * conditions for their sponsorships.
 *
 * @function
 */
export async function sponsorshipCheck() {
  // grab sponsorship info
  const profile = await DatabaseClient.prisma.profile.findFirst(Eagers.profile);

  // Teamless player: no user sponsorship checks.
  if (!profile || profile.teamId == null || !profile.team) {
    return Promise.resolve();
  }

  const sponsorships = await DatabaseClient.prisma.sponsorship.findMany({
    where: {
      teamId: profile.teamId,
      status: {
        in: [
          Constants.SponsorshipStatus.SPONSOR_ACCEPTED,
          Constants.SponsorshipStatus.TEAM_ACCEPTED,
        ],
      },
    },
    include: {
      ...Eagers.sponsorship.include,
      offers: { orderBy: { id: 'desc' } },
    },
  });

  // bail early if user has no sponsorships
  if (!sponsorships.length) {
    return;
  }

  // who will be sending the response e-mail
  const persona = profile.team.personas.find(
    (persona) =>
      persona.role === Constants.PersonaRole.MANAGER ||
      persona.role === Constants.PersonaRole.ASSISTANT,
  );

  // grab the user's league position for last season
  const competition = await DatabaseClient.prisma.competition.findFirst({
    where: {
      season: profile.season - 1,
      competitors: {
        some: {
          teamId: profile.teamId,
        },
      },
      tier: {
        slug: Constants.Prestige[profile.team.tier],
        league: {
          slug: Constants.LeagueSlug.ESPORTS_LEAGUE,
        },
      },
    },
    include: {
      competitors: true,
    },
  });
  const userTeamPosition = competition?.competitors.find(
    (competitor) => competitor.teamId === profile.teamId,
  );

  // if we couldn't find a position, there is nothing to evaluate
  if (!userTeamPosition) {
    return;
  }

  // check contract conditions
  const locale = getLocale(profile);

  return flatten(
    await Promise.all(
      sponsorships.map((sponsorship): Promise<unknown> => {
        let earnings = 0;
        const contract =
          Constants.SponsorContract[sponsorship.sponsor.slug as Constants.SponsorSlug];
        const requirements = contract.requirements
          .map((requirement) => {
            switch (requirement.type) {
              case Constants.SponsorshipRequirement.PLACEMENT:
              case Constants.SponsorshipRequirement.RELEGATION:
                if (userTeamPosition.position > (requirement.condition as number)) {
                  return Util.formatContractCondition(requirement);
                }
                return '';
              default:
                return '';
            }
          })
          .filter(Boolean);
        const bonuses = contract.bonuses
          .map((bonus) => {
            switch (bonus.type) {
              case Constants.SponsorshipBonus.PLACEMENT:
              case Constants.SponsorshipBonus.TOURNAMENT_WIN:
                if (userTeamPosition.position < (bonus.condition as number)) {
                  earnings += bonus.amount;
                  return `${Util.formatContractCondition(bonus)} (${Util.formatCurrency(bonus.amount)})`;
                }
                return '';
              default:
                return '';
            }
          })
          .filter(Boolean);

        // stop here if user failed to meet any requirements
        if (requirements.length) {
          return Promise.all([
            sendEmail(
              Sqrl.render(locale.templates.SponsorshipTerminated.SUBJECT, { sponsorship }),
              Sqrl.render(locale.templates.SponsorshipTerminated.CONTENT, {
                sponsorship,
                profile,
                requirements,
              }),
              persona,
              profile.date,
            ),
            DatabaseClient.prisma.sponsorship.update({
              where: { id: sponsorship.id },
              data: {
                status: Constants.SponsorshipStatus.SPONSOR_TERMINATED,
                offers: {
                  update: {
                    where: {
                      id: sponsorship.offers[0].id,
                    },
                    data: {
                      status: Constants.SponsorshipStatus.SPONSOR_TERMINATED,
                    },
                  },
                },
              },
            }),
          ]);
        }

        // stop here if no achieved bonuses
        if (!bonuses.length) {
          return Promise.all([sponsorshipRenew(sponsorship.id), sponsorshipInvite(sponsorship.id)]);
        }

        // distribute end-of-season bonuses
        return Promise.all([
          sponsorshipRenew(sponsorship.id),
          sponsorshipInvite(sponsorship.id),
          sendEmail(
            Sqrl.render(locale.templates.SponsorshipBonuses.SUBJECT, { sponsorship }),
            Sqrl.render(locale.templates.SponsorshipBonuses.CONTENT, {
              sponsorship,
              profile,
              bonuses,
            }),
            persona,
            profile.date,
          ),
          DatabaseClient.prisma.team.update({
            where: {
              id: profile.teamId,
            },
            data: {
              earnings: {
                increment: earnings,
              },
            },
          }),
        ]);
      }),
    ),
  );
}

/**
 * Sends sponsor tournament invites out the user.
 *
 * @param id      The sponsorhip id.
 * @param status  Sponsorship status override.
 * @function
 */
export async function sponsorshipInvite(id: number, status?: Constants.SponsorshipStatus) {
  // load user locale
  const profile = await DatabaseClient.prisma.profile.findFirst(Eagers.profile);

  // Teamless player: no user sponsorship invites.
  if (!profile || profile.teamId == null || !profile.team) {
    return;
  }

  const locale = getLocale(profile);

  // load sponsorship contract info
  const sponsorship = await DatabaseClient.prisma.sponsorship.findFirst({
    where: { id },
    include: {
      ...Eagers.sponsorship.include,
      offers: { orderBy: { id: 'desc' } },
    },
  });
  const contract = Constants.SponsorContract[sponsorship.sponsor.slug as Constants.SponsorSlug];

  // bail if no tournament
  if (!contract.tournament) {
    Engine.Runtime.Instance.log.info(
      '%s has no tournament. skipping invite...',
      sponsorship.sponsor.name,
    );
    return;
  }

  // bail if sponsorship status is not active
  if (
    (status ?? sponsorship.status) !== Constants.SponsorshipStatus.SPONSOR_ACCEPTED &&
    (status ?? sponsorship.status) !== Constants.SponsorshipStatus.TEAM_ACCEPTED
  ) {
    Engine.Runtime.Instance.log.warn(
      'contract between %s and %s is not active. skipping invite...',
      sponsorship.sponsor.name,
      profile.name,
    );
    return;
  }

  // bail if sponsorship is set to expire
  const [offer] = sponsorship.offers;

  if (profile.date.toISOString() >= offer.end.toISOString()) {
    Engine.Runtime.Instance.log.warn('contract expired. skipping invite');
    return;
  }

  // load sponsorship tier info
  const tier = await DatabaseClient.prisma.tier.findFirst({
    where: {
      slug: contract.tournament,
    },
  });

  if (!tier) {
    Engine.Runtime.Instance.log.warn(
      'could not load tier information for %s. skipping invite...',
      sponsorship.sponsor.name,
    );
    return;
  }

  // build competition query and modify as needed if this
  // sponsor's tournament is triggered by another's
  // in which case we'd want the "root" tournament
  const competitionQuery: Prisma.CompetitionFindFirstArgs = {
    where: {
      season: profile.season,
      status: {
        not: Constants.CompetitionStatus.STARTED,
      },
      tier: {
        slug: contract.tournament,
      },
    },
  };

  if (tier.triggerOffsetDays) {
    // here we get the "root" tourney's start date instead
    const triggeringTier = await DatabaseClient.prisma.tier.findFirst({
      where: {
        triggerOffsetDays: null,
        league: {
          slug: Constants.LeagueSlug.SPONSORS,
        },
      },
    });

    if (!triggeringTier) {
      Engine.Runtime.Instance.log.warn(
        'could not find root tournament for %s. skipping invite...',
        sponsorship.sponsor.name,
      );
      return;
    }

    competitionQuery.where.tier.slug = triggeringTier.slug;
  }

  // bail if competition is not found or already started
  const competition = await DatabaseClient.prisma.competition.findFirst(competitionQuery);

  if (!competition) {
    Engine.Runtime.Instance.log.warn(
      '%s already started their tournament or was not found. skipping invite...',
      sponsorship.sponsor.name,
    );
    return;
  }

  // grab when tournament is supposed to start and
  // we'll send an invite between now and then
  const entry = await DatabaseClient.prisma.calendar.findFirst({
    where: {
      completed: false,
      payload: competition.id.toString(),
      type: Constants.CalendarEntry.COMPETITION_START,
    },
  });

  if (!entry) {
    Engine.Runtime.Instance.log.warn(
      'could not find start date for %s',
      Constants.IdiomaticTier[contract.tournament],
    );
    return;
  }

  // grab the number of days we have to send an invite
  const days = differenceInDays(entry.date, profile.date);

  if (days <= 0) {
    Engine.Runtime.Instance.log.warn(
      '%s already started their tournament: %s (days left = %d)',
      sponsorship.sponsor.name,
      Constants.IdiomaticTier[contract.tournament],
      days,
    );
    return;
  }

  // send an invite between today and start date
  const inviteDate = addDays(profile.date, random(1, days));
  return DatabaseClient.prisma.calendar.create({
    data: {
      type: Constants.CalendarEntry.EMAIL_SEND,
      date: inviteDate,
      payload: JSON.stringify([
        Sqrl.render(locale.templates.SponsorshipInvite.SUBJECT, { sponsorship }),
        Sqrl.render(locale.templates.SponsorshipInvite.CONTENT, {
          sponsorship,
          profile,
          idiomaticTier: Constants.IdiomaticTier[contract.tournament],
        }),
        profile.team.personas[0],
        inviteDate,
        true,
      ]),
    },
  });
}

/**
 * Sponsorship contract renewal check.
 *
 * @param id The sponsorhip id.
 * @function
 */
export async function sponsorshipRenew(id: number) {
  // grab latest offer
  const sponsorship = await DatabaseClient.prisma.sponsorship.findFirst({
    where: {
      id,
    },
    include: {
      ...Eagers.sponsorship.include,
      offers: { orderBy: { id: 'desc' } },
    },
  });
  const [offer] = sponsorship.offers;

  // load user locale
  const profile = await DatabaseClient.prisma.profile.findFirst(Eagers.profile);

  // Teamless player: no user sponsorship renewals.
  if (!profile || profile.teamId == null || !profile.team) {
    return;
  }

  const locale = getLocale(profile);

  // bail early if sponsorship not expired
  if (profile.date.toISOString() < offer.end.toISOString()) {
    return;
  }

  // who will be sending the response e-mail
  const persona = profile.team.personas.find(
    (persona) =>
      persona.role === Constants.PersonaRole.MANAGER ||
      persona.role === Constants.PersonaRole.ASSISTANT,
  );

  return Promise.all([
    DatabaseClient.prisma.sponsorship.update({
      where: {
        id: sponsorship.id,
      },
      data: {
        status: Constants.SponsorshipStatus.CONTRACT_EXPIRED,
        offers: {
          update: {
            where: {
              id: offer.id,
            },
            data: {
              status: Constants.SponsorshipStatus.CONTRACT_EXPIRED,
            },
          },
        },
      },
    }),
    sendEmail(
      Sqrl.render(locale.templates.SponsorshipGeneric.SUBJECT, { sponsorship }),
      Sqrl.render(locale.templates.SponsorshipRenew.CONTENT, { profile, sponsorship }),
      persona,
      profile.date,
    ),
  ]);
}

/**
 * Sync teams to their current tier.
 *
 * By the time this function runs, the new season's league
 * competitions should have already been started and the
 * teams placed in their corresponding tier.
 *
 * @function
 */
export async function syncTiers() {
  // get the current season's league competitions
  const profile = await DatabaseClient.prisma.profile.findFirst();
  const competitions = await DatabaseClient.prisma.competition.findMany({
    where: {
      season: profile.season,
      tier: {
        league: {
          slug: Constants.LeagueSlug.ESPORTS_LEAGUE,
        },
      },
    },
    include: {
      competitors: true,
      tier: true,
    },
  });

  // build a transaction for all the updates
  const transaction = competitions.map((competition) =>
    DatabaseClient.prisma.team.updateMany({
      where: {
        id: { in: competition.competitors.map((competitor) => competitor.teamId) },
      },
      data: {
        tier: Constants.Prestige.findIndex((prestige) => prestige === competition.tier.slug),
      },
    }),
  );

  // run the transaction
  return DatabaseClient.prisma.$transaction(transaction);
}

/**
 * Sync player wages.
 *
 * Currently, only the user's players can gain XP throughout the season
 * but this may change in the future. At which point this function
 * would be a mirror of the `061-wages.ts` seeder.
 *
 * @todo move the transaction logic to a shared function
 * @function
 */
export async function syncWages() {
  // get the user's squad
  const profile = await DatabaseClient.prisma.profile.findFirst(Eagers.profile);

  // Teamless player: no user squad wage syncing.
  if (!profile || profile.teamId == null || !profile.team) {
    return Promise.resolve();
  }

  // build a transaction for all the updates
  const transaction = profile.team.players.map((player) => {
    const xp = new Bot.Exp(player);
    const tier = Constants.Prestige[xp.getBotTemplate().prestige];
    const wageConfigs = Constants.PlayerWages[tier as keyof typeof Constants.PlayerWages];

    if (!wageConfigs) {
      return DatabaseClient.prisma.player.update({
        where: { id: player.id },
        data: { cost: 0, wages: 0 },
      });
    }

    // build probability weights
    const wagePbxWeight = {} as Parameters<typeof Chance.roll>[number];
    wageConfigs.forEach((weight, idx) => (wagePbxWeight[idx] = weight.percent));

    // pick the wage range for the player
    const wageConfigIdx = Chance.roll(wagePbxWeight);
    const wageConfig = wageConfigs[Number(wageConfigIdx)];

    // calculate cost from wage
    const wages = random(wageConfig.low, wageConfig.high);
    const cost = wages * wageConfig.multiplier;

    return DatabaseClient.prisma.player.update({
      where: { id: player.id },
      data: { cost, wages },
    });
  });

  // run the transaction
  return DatabaseClient.prisma.$transaction(transaction);
}

/**
 * Engine loop handler.
 *
 * Starts the provided competition.
 *
 * @param entry Engine loop input data.
 * @function
 */
export async function onCompetitionStart(entry: Calendar) {
  // find the competition for this calendar entry item
  let competition = await DatabaseClient.prisma.competition.findFirst({
    where: {
      id: parseInt(entry.payload),
    },
    include: Eagers.competition.include,
  });

  Engine.Runtime.Instance.log.debug('Starting %s...', competition.tier.name);

  // if autofill was triggered then we must reload the competition
  // model with the updated competitor relationships
  const autofill = Autofill.Items.filter(
    (item) =>
      item.on === Constants.CalendarEntry.COMPETITION_START &&
      item.tierSlug === competition.tier.slug,
  );
  const tiers = await DatabaseClient.prisma.tier.findMany({
    where: {
      slug: competition.tier.slug,
    },
    include: Eagers.tier.include,
  });
  const teams = flatten(
    await Promise.all(
      autofill.map(async (item) => {
        const tier = tiers.find((tier) => tier.slug === item.tierSlug);
        return Autofill.parse(item, tier, competition.federation);
      }),
    ),
  );

  if (teams.length > 0) {
    competition = await DatabaseClient.prisma.competition.update({
      where: { id: competition.id },
      data: {
        competitors: {
          create: teams.map((team) => ({ teamId: team.id })),
        },
      },
      include: Eagers.competition.include,
    });
  }

  // create and start the tournament
  const tournament = new Tournament(competition.tier.size, {
    groupSize: competition.tier.groupSize,
    meetTwice: false,
    short: true,
  });
  tournament.addCompetitors(shuffle(competition.competitors).map((competitor) => competitor.id));
  tournament.start();

  // collect map pool
  const profile = await DatabaseClient.prisma.profile.findFirst();
  const mapPool = await DatabaseClient.prisma.mapPool.findMany({
    where: {
      gameVersion: {
        slug: Util.loadSettings(profile.settings).general.game,
      },
      position: {
        not: null,
      },
    },
    include: Eagers.mapPool.include,
  });

  // register matches
  await Promise.all(
    tournament.$base.rounds().map((round) => {
      return createMatchdays(round, tournament, competition, sample(mapPool).gameMap.name);
    }),
  );

  // grab last match day to record competition end day
  const lastMatchDay = await DatabaseClient.prisma.match.findFirst({
    where: {
      competitionId: competition.id,
    },
    orderBy: {
      date: 'desc',
    },
  });

  await DatabaseClient.prisma.calendar.create({
    data: {
      date: lastMatchDay.date,
      type: Constants.CalendarEntry.COMPETITION_END,
      payload: competition.id.toString(),
    },
  });

  // update the competition database record
  return DatabaseClient.prisma.competition.update({
    where: { id: competition.id },
    data: {
      status: Constants.CompetitionStatus.STARTED,
      tournament: JSON.stringify(tournament.save()),
      competitors: {
        update: tournament.competitors.map((id) => ({
          where: { id },
          data: {
            seed: tournament.getSeedByCompetitorId(id),
            group: tournament.getGroupByCompetitorId(id),
          },
        })),
      },
    },
  });
}

/**
 * Engine loop handler.
 *
 * Sends a scheduled e-mail.
 *
 * @param entry Engine loop input data.
 * @function
 */
export async function onEmailSend(entry: Calendar) {
  const payload = JSON.parse(entry.payload) as Parameters<typeof sendEmail>;
  return sendEmail(...payload);
}

/**
 * Engine loop handler.
 *
 * Runs all actionable items that are required
 * when starting a new season.
 *
 * @function
 */
export async function onSeasonStart() {
  Engine.Runtime.Instance.log.info('Starting the season...');
  return createWelcomeEmail()
    .then(scheduleNextSeasonStart)
    .then(bumpSeasonNumber)
    .then(createCompetitions)
    .then(resetTrainingGains)
    .then(sponsorshipCheck)
    .then(syncTiers)
    .then(syncWages);
}

/**
 * Engine loop handler.
 *
 * Simulates an NPC match.
 *
 * @param entry Engine loop input data.
 * @function
 */
export async function onMatchdayNPC(entry: Calendar) {
  const match = await DatabaseClient.prisma.match.findFirst({
    where: {
      id: Number(entry.payload),
    },
    include: {
      competitors: {
        include: {
          team: { include: { players: true } },
        },
      },
      competition: {
        include: {
          tier: true,
        },
      },
    },
  });

  if (entry.type === Constants.CalendarEntry.MATCHDAY_USER) {
    Engine.Runtime.Instance.log.debug('Found match(id=%d) with status: %s', match.id, match.status);
  }

  if (match.status !== Constants.MatchStatus.READY) {
    Engine.Runtime.Instance.log.warn(
      'Cannot simulate match. Invalid match state: %s. Skipping.',
      match.status,
    );
    return Promise.resolve();
  }

  // load sim settings if this is a user matchday
  const simulator = new Simulator.Score();

  if (entry.type === Constants.CalendarEntry.MATCHDAY_USER) {
    const profile = await DatabaseClient.prisma.profile.findFirst();
    const settings = Util.loadSettings(profile.settings);
    simulator.mode = settings.general.simulationMode;
    simulator.userPlayerId = profile.playerId;
    simulator.userTeamId = profile.teamId;
  }

  // are draws allowed?
  if (!match.competition.tier.groupSize) {
    simulator.allowDraw = false;
  }

  // sim the game
  const [home, away] = match.competitors;
  const simulationResult = simulator.generate([home.team, away.team]);

  // check if we need to award earnings to user for a win (only if user has a team)
  if (
    entry.type === Constants.CalendarEntry.MATCHDAY_USER &&
    simulator.userTeamId != null &&
    Simulator.getMatchResult(simulator.userTeamId, simulationResult) === Constants.MatchResult.WIN
  ) {
    const profile = await DatabaseClient.prisma.profile.findFirst();
    if (profile.teamId != null) {
      await DatabaseClient.prisma.team.update({
        where: {
          id: profile.teamId,
        },
        data: {
          earnings: {
            increment: Constants.GameSettings.WIN_AWARD_AMOUNT,
          },
        },
      });
    }
  }

  // apply elo deltas
  const homeExpectedScore = Util.getEloWinProbability(home.team.elo, away.team.elo);
  const homeActualScore =
    Constants.EloScore[Simulator.getMatchResult(home.team.id, simulationResult)];
  const awayExpectedScore = 1 - homeExpectedScore;
  const awayActualScore =
    Constants.EloScore[Simulator.getMatchResult(away.team.id, simulationResult)];
  const deltas = [
    Util.getEloRatingDelta(homeActualScore, homeExpectedScore),
    Util.getEloRatingDelta(awayActualScore, awayExpectedScore),
  ];

  return Promise.all([
    ...deltas.map((delta, teamIdx) =>
      DatabaseClient.prisma.team.update({
        where: {
          id: match.competitors[teamIdx].team.id,
        },
        data: {
          elo: {
            increment: delta,
          },
        },
      }),
    ),
    DatabaseClient.prisma.match.update({
      where: {
        id: Number(entry.payload),
      },
      data: {
        status: Constants.MatchStatus.COMPLETED,
        competitors: {
          update: match.competitors.map((competitor) => ({
            where: { id: competitor.id },
            data: {
              score: simulationResult[competitor.team.id],
              result: Simulator.getMatchResult(competitor.team.id, simulationResult),
            },
          })),
        },
      },
    }),
  ]);
}

export async function onPlayerContractExpire(entry: Calendar) {
  const playerId = Number(entry.payload);
  const profile = await DatabaseClient.prisma.profile.findFirst(Eagers.profile);
  if (!profile) return Promise.resolve();

  const player = await DatabaseClient.prisma.player.findFirst({
    where: { id: playerId },
    include: { team: { include: { personas: true } } },
  });
  if (!player) return Promise.resolve();

  if (player.id !== profile.playerId) return Promise.resolve();

  const oldTeamId = player.teamId;
  const today = profile.date;

  // Make user free agent again
  await DatabaseClient.prisma.player.update({
    where: { id: player.id },
    data: { teamId: null, contractEnd: null },
  });

  const updatedProfile = await DatabaseClient.prisma.profile.update({
    where: { id: profile.id },
    data: { teamId: null },
    include: { player: true, team: true },
  });

  // Revert remaining USER matchdays for the old team back to NPC
  if (oldTeamId != null) {
    const futureMatches = await DatabaseClient.prisma.match.findMany({
      where: {
        date: { gte: today.toISOString() },
        competitors: { some: { teamId: oldTeamId } },
      },
      select: { id: true },
    });

    const matchIds = futureMatches.map((m) => String(m.id));

    if (matchIds.length) {
      await DatabaseClient.prisma.calendar.updateMany({
        where: {
          payload: { in: matchIds },
          date: { gte: today.toISOString() },
          type: Constants.CalendarEntry.MATCHDAY_USER,
        },
        data: { type: Constants.CalendarEntry.MATCHDAY_NPC },
      });
    }
  }

  // Push profile update to renderer
  const mainWindow = WindowManager.get(Constants.WindowIdentifier.Main, false)?.webContents;
  if (mainWindow) {
    mainWindow.send(Constants.IPCRoute.PROFILES_CURRENT, updatedProfile);
  }

  const locale = getLocale(profile);
  const team = player.team;
  const persona = team?.personas?.[0];

  if (persona && team) {
    await sendEmail(
      Sqrl.render(locale.templates.ContractExpiredPlayer.SUBJECT, {
        profile,
        player,
        team,
      }),
      Sqrl.render(locale.templates.ContractExpiredPlayer.CONTENT, {
        profile,
        player,
        team,
      }),
      persona,
      profile.date,
      true,
    );
  }

  return Promise.resolve();
}

/**
 * Engine loop handler.
 *
 * Stops the engine loop when the user has a
 * match to play and lets the renderer know.
 *
 * @param entry Engine loop input data.
 * @function
 */
export async function onMatchdayUser(entry: Calendar) {
  // Load profile (still useful for logging / future logic).
  const profile = await DatabaseClient.prisma.profile.findFirst();
  if (!profile) {
    return Promise.resolve();
  }

  // Skip if this match has already been played.
  const match = await DatabaseClient.prisma.match.findFirst({
    where: {
      id: Number(entry.payload),
    },
  });

  if (!match || match.status === Constants.MatchStatus.COMPLETED) {
    return Promise.resolve();
  }

  Engine.Runtime.Instance.log.info(
    'User matchday detected on %s (player career). Stopping engine loop...',
    format(entry.date, Constants.Application.CALENDAR_DATE_FORMAT),
  );

  // Returning false tells the engine loop to halt and hand control to the renderer.
  return Promise.resolve(false);
}

/**
 * Engine loop handler.
 *
 * Parses a sponsorship offer.
 *
 * @param entry Engine loop input data.
 * @function
 */
export async function onSponsorshipOffer(entry: Partial<Calendar>) {
  // Teamless player: no user sponsorship parsing.
  const profile = await DatabaseClient.prisma.profile.findFirst(Eagers.profile);
  if (!profile || profile.teamId == null || !profile.team) {
    return Promise.resolve();
  }

  // parse payload
  const [sponsorshipId, sponsorshipStatus] = isNaN(Number(entry.payload))
    ? JSON.parse(entry.payload)
    : [Number(entry.payload)];

  // load user locale
  const locale = getLocale(profile);

  // grab latest offer
  const sponsorship = await DatabaseClient.prisma.sponsorship.findFirst({
    where: {
      id: sponsorshipId,
    },
    include: {
      ...Eagers.sponsorship.include,
      offers: { orderBy: { id: 'desc' } },
    },
  });
  const [offer] = sponsorship.offers;

  // who's parsing the offer?
  let result: ReturnType<typeof parseSponsorshipOffer>;

  switch (offer.status) {
    case Constants.SponsorshipStatus.SPONSOR_PENDING:
      result = parseSponsorshipOffer(sponsorship, locale);
      break;
    case Constants.SponsorshipStatus.TEAM_PENDING:
      result = parseTeamSponsorshipOffer(sponsorship, locale, sponsorshipStatus);
      break;
    default:
      return Promise.resolve();
  }

  // handle additional paperwork to finalize sponsorship
  if (result.paperwork) {
    await Promise.all(result.paperwork);
  }

  // update existing sponsorship and current offer
  await DatabaseClient.prisma.sponsorship.update({
    where: { id: sponsorship.id },
    data: {
      status: result.sponsorship.status,
      offers: {
        update: {
          where: { id: offer.id },
          data: {
            status: result.sponsorship.status,
          },
        },
      },
    },
  });

  // send response e-mail
  const email = await sendEmail(
    Sqrl.render(locale.templates.SponsorshipGeneric.SUBJECT, { sponsorship }),
    Sqrl.render(result.dialogue.content, { sponsorship, profile }),
    result.dialogue.from,
    profile.date,
  );

  // update existing dialogues attached to this sponsorship
  // and toggle their action as completed
  await DatabaseClient.prisma.dialogue.updateMany({
    where: {
      emailId: email.id,
    },
    data: {
      completed: true,
    },
  });

  // unless the offer was accepted, we have nothing else to do
  if (
    result.sponsorship.status !== Constants.SponsorshipStatus.SPONSOR_ACCEPTED &&
    result.sponsorship.status !== Constants.SponsorshipStatus.TEAM_ACCEPTED
  ) {
    return Promise.resolve();
  }

  // setup the scheduled payments
  const payments: Array<Prisma.PrismaPromise<typeof entry>> = [];

  while (offer.start <= offer.end) {
    if (offer.start < profile.date) {
      offer.start = addWeeks(offer.start, offer.frequency);
      continue;
    }

    payments.push(
      DatabaseClient.prisma.calendar.create({
        data: {
          type: Constants.CalendarEntry.SPONSORSHIP_PAYMENT,
          date: offer.start.toISOString(),
          payload: sponsorship.id.toString(),
        },
      }),
    );

    offer.start = addWeeks(offer.start, offer.frequency);
  }

  return DatabaseClient.prisma.$transaction(payments);
}

/**
 * Engine loop handler.
 *
 * Distributes a scheduled sponsorship payment.
 *
 * @param entry Engine loop input data.
 * @function
 */
export async function onSponsorshipPayment(entry: Partial<Calendar>) {
  // grab latest offer
  const sponsorship = await DatabaseClient.prisma.sponsorship.findFirst({
    where: {
      id: Number(entry.payload),
    },
    include: {
      ...Eagers.sponsorship.include,
      offers: { orderBy: { id: 'desc' } },
    },
  });
  const [offer] = sponsorship.offers;

  // update sponsorship team earnings (NPC-safe, not tied to profile.teamId)
  return DatabaseClient.prisma.team.update({
    where: {
      id: sponsorship.teamId,
    },
    data: {
      earnings: {
        increment: offer.amount,
      },
    },
  });
}
