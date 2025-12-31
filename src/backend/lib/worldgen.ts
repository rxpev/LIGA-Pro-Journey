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
import { addDays, addWeeks, addYears, differenceInDays, format, setDay, subDays } from 'date-fns';
import { compact, differenceBy, flatten, groupBy, random, sample, shuffle } from 'lodash';
import { Calendar, Prisma } from '@prisma/client';
import { Constants, Chance, Bot, Eagers, Util, UserOfferSettings, TierSlug } from '@liga/shared';
import { computeLifetimeStats } from "./faceitstats";
import * as LeagueStats from "./leaguestats";
import * as XpEconomy from "@liga/backend/lib/xp-economy";

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

async function closeOpenCareerStints(prisma: typeof DatabaseClient.prisma, playerId: number, endedAt: Date) {
  await prisma.careerStint.updateMany({
    where: { playerId, endedAt: null },
    data: { endedAt },
  });
}

async function startCareerStint(prisma: typeof DatabaseClient.prisma, params: {
  playerId: number;
  teamId: number | null;
  tier: number | null;
  startedAt: Date;
}) {
  const { playerId, teamId, tier, startedAt } = params;

  await prisma.careerStint.create({
    data: {
      playerId,
      teamId,
      tier,
      startedAt,
    },
  });
}
function getTeamTierSlug(teamTierIdx: number | null | undefined): TierSlug | null {
  if (typeof teamTierIdx !== "number") return null;
  if (teamTierIdx < 0 || teamTierIdx >= Constants.Prestige.length) return null;
  return Constants.Prestige[teamTierIdx] as TierSlug;
}

function getTeamTierName(teamTierIdx: number | null | undefined): string {
  const slug = getTeamTierSlug(teamTierIdx);
  if (!slug) return "Unknown";
  return (Constants as any).IdiomaticTier?.[slug] ?? slug;
}
function normalizeRole(r: unknown): string {
  return String(r ?? "").toUpperCase();
}

function daysLeftOrHuge(contractEnd: Date | null | undefined, now: Date): number {
  if (!contractEnd) return 999999;
  return Math.max(0, differenceInDays(contractEnd, now));
}

/**
 * - AWPER => bench starter SNIPER
 * - IGL/RIFLER => bench starter RIFLER, preferring low XP; tie-break with shorter contract
 */
async function benchVictim(params: {
  prisma: typeof DatabaseClient.prisma;
  teamId: number;
  userRole: unknown;
  now: Date;
  incomingPlayerId: number;
}) {
  const { prisma, teamId, userRole, now, incomingPlayerId } = params;

  const destTeam = await prisma.team.findFirst({
    where: { id: teamId },
    include: {
      players: {
        select: {
          id: true,
          role: true,
          starter: true,
          xp: true,
          contractEnd: true,
          transferListed: true,
        },
      },
    },
  });

  if (!destTeam) return;

  const uRole = normalizeRole(userRole);
  const wantsSniperSlot = uRole === "AWPER";

  const desiredVictimRole = wantsSniperSlot ? "SNIPER" : "RIFLER";

  // Candidates: starters with the desired role (excluding the incoming player defensively)
  let candidates = destTeam.players.filter(
    (p) => p.starter && p.id !== incomingPlayerId && normalizeRole(p.role) === desiredVictimRole,
  );

  // Fallback: if no role-matching starter exists, pick any starter (excluding incoming)
  if (!candidates.length) {
    candidates = destTeam.players.filter((p) => p.starter && p.id !== incomingPlayerId);
  }

  if (!candidates.length) return;

  // Selection rule:
  // Find min XP among candidates
  // Allow a small XP tolerance; within tolerance pick the shortest contract remaining
  const XP_TOLERANCE = 5;
  const minXp = Math.min(...candidates.map((c) => c.xp ?? 0));
  const nearMin = candidates.filter((c) => (c.xp ?? 0) <= minXp + XP_TOLERANCE);

  nearMin.sort((a, b) => {
    const aDays = daysLeftOrHuge(a.contractEnd as any, now);
    const bDays = daysLeftOrHuge(b.contractEnd as any, now);

    // Primary: shorter contract first
    if (aDays !== bDays) return aDays - bDays;

    // Secondary: lower XP
    return (a.xp ?? 0) - (b.xp ?? 0);
  });

  const victim = nearMin[0];
  if (!victim) return;

  await prisma.player.update({
    where: { id: victim.id },
    data: {
      starter: false,
      transferListed: true,
    },
  });

  Engine.Runtime.Instance.log.info(
    "Bench victim: teamId=%d victimId=%d victimRole=%s (xp=%d) transferListed=true",
    teamId,
    victim.id,
    normalizeRole(victim.role),
    victim.xp ?? 0,
  );
}

/**
 * Promotes a benched/transfer-listed player to starter to fill the vacancy.
 *
 * - If outgoing user is AWPER => promote highest XP SNIPER
 * - Otherwise => promote highest XP RIFLER
 *
 * Prefer transferListed players first
 * fallback to any non-starter of the desired role.
 */
async function promoteReplacement(params: {
  prisma: typeof DatabaseClient.prisma;
  teamId: number;
  outgoingUserRole: unknown;
  now: Date;
  outgoingPlayerId: number;
  outgoingWasStarter: boolean;
}) {
  const { prisma, teamId, outgoingUserRole, now, outgoingPlayerId, outgoingWasStarter } = params;

  // No vacancy if the outgoing player wasn't a starter
  if (!outgoingWasStarter) return;

  const team = await prisma.team.findFirst({
    where: { id: teamId },
    include: {
      players: {
        select: {
          id: true,
          role: true,
          starter: true,
          xp: true,
          contractEnd: true,
          transferListed: true,
        },
      },
    },
  });

  if (!team) return;

  const uRole = normalizeRole(outgoingUserRole);
  const outgoingWasAwper = uRole === "AWPER";

  const desiredRole = outgoingWasAwper ? "SNIPER" : "RIFLER";

  let candidates = team.players.filter(
    (p) =>
      p.id !== outgoingPlayerId &&
      !p.starter &&
      p.transferListed &&
      normalizeRole(p.role) === desiredRole,
  );

  if (!candidates.length) {
    candidates = team.players.filter(
      (p) =>
        p.id !== outgoingPlayerId &&
        !p.starter &&
        normalizeRole(p.role) === desiredRole,
    );
  }
  if (!candidates.length) {
    candidates = team.players.filter(
      (p) => p.id !== outgoingPlayerId && !p.starter && p.transferListed,
    );
  }

  if (!candidates.length) return;

  // Selection rule:
  // Highest XP first; tie-break with longer contract remaining
  candidates.sort((a, b) => {
    const aXp = a.xp ?? 0;
    const bXp = b.xp ?? 0;
    if (aXp !== bXp) return bXp - aXp;

    const aDays = daysLeftOrHuge(a.contractEnd as any, now);
    const bDays = daysLeftOrHuge(b.contractEnd as any, now);
    return bDays - aDays;
  });

  const promoted = candidates[0];
  if (!promoted) return;

  await prisma.player.update({
    where: { id: promoted.id },
    data: {
      starter: true,
      transferListed: false,
    },
  });

  Engine.Runtime.Instance.log.info(
    "Promoted replacement: teamId=%d promotedId=%d promotedRole=%s (xp=%d) starter=true transferListed=false",
    teamId,
    promoted.id,
    normalizeRole(promoted.role),
    promoted.xp ?? 0,
  );
}

/**
 * Accepts a transfer offer that targets the user player.
 *
 * @param transferId The transfer offer to parse.
 * @param locale      The locale.
 * @param status      Force accepts or rejects the offer.
 * @function
 */
export async function acceptTransferOffer(transferId: number) {
  const profile = await DatabaseClient.prisma.profile.findFirst(Eagers.profile);
  if (!profile) return Promise.resolve();
  const oldTeamId = profile.teamId;

  const transfer = await DatabaseClient.prisma.transfer.findFirst({
    where: { id: transferId },
    include: {
      ...Eagers.transfer.include,
      offers: { orderBy: { id: "desc" } },
    },
  });

  if (!transfer) return Promise.resolve();

  const latestPending = transfer.offers.find(
    (o) => o.status === Constants.TransferStatus.PLAYER_PENDING
  );

  if (
    latestPending?.expiresAt &&
    latestPending.expiresAt <= profile.date
  ) {
    await onTransferOfferExpiryCheck({
      ...({} as any),
      payload: String(transfer.id),
    } as any);
    return Promise.resolve();
  }

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

  // Extension detection:
  // If the offer comes from the user's CURRENT team, we treat it as a contract extension.
  const isExtension =
    profile.teamId != null &&
    fromTeamId === profile.teamId;

  const mainWindow = WindowManager.get(Constants.WindowIdentifier.Main, false)?.webContents;

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

  // NOTE: For extensions we extend from max(now, current contract end).
  // For new signings we use "now".
  const years = offer.contractYears ?? 1;

  if (isExtension) {
    // Extension path: do NOT bench anyone, do NOT move teams, do NOT write a new stint.
    // We only extend the contract and reschedule contract-related calendar entries.

    // Load current player to base the extension on the current contract end (if still active).
    const currentPlayer = await DatabaseClient.prisma.player.findFirst({
      where: { id: transfer.playerId },
      select: {
        id: true,
        teamId: true,
        contractEnd: true,
        wages: true,
        cost: true,
      },
    });

    if (!currentPlayer) return Promise.resolve();

    if (currentPlayer.teamId !== profile.teamId) {
      Engine.Runtime.Instance.log.warn(
        "acceptTransferOffer: extension offer mismatch (player.teamId=%s profile.teamId=%s). Skipping.",
        String(currentPlayer.teamId),
        String(profile.teamId),
      );
      return Promise.resolve();
    }

    const baseDate =
      currentPlayer.contractEnd && currentPlayer.contractEnd > profile.date
        ? currentPlayer.contractEnd
        : profile.date;

    const contractEnd = addYears(baseDate, years);

    await DatabaseClient.prisma.player.update({
      where: { id: transfer.playerId },
      data: {
        contractEnd,
        // keep current starter/transferListed/teamId as-is for an extension
      },
    });

    // Schedule contract expiry event in the calendar.
    await DatabaseClient.prisma.calendar.deleteMany({
      where: {
        type: Constants.CalendarEntry.PLAYER_CONTRACT_EXPIRE,
        completed: false,
        payload: String(transfer.playerId),
        date: { gte: profile.date.toISOString() },
      },
    });
    await DatabaseClient.prisma.calendar.create({
      data: {
        type: Constants.CalendarEntry.PLAYER_CONTRACT_EXPIRE,
        date: contractEnd.toISOString(),
        payload: String(transfer.playerId),
      },
    });

    const EXT_DAYS = Constants.PlayerContractSettings.EXTENSION_EVAL_DAYS_BEFORE_END;
    const extensionEvalDate = addDays(contractEnd, -EXT_DAYS);
    if (extensionEvalDate > profile.date) {
      await DatabaseClient.prisma.calendar.deleteMany({
        where: {
          type: Constants.CalendarEntry.PLAYER_CONTRACT_EXTENSION_EVAL,
          completed: false,
          payload: String(transfer.playerId),
          date: { gte: profile.date.toISOString() },
        },
      });
      await DatabaseClient.prisma.calendar.create({
        data: {
          type: Constants.CalendarEntry.PLAYER_CONTRACT_EXTENSION_EVAL,
          date: extensionEvalDate.toISOString(),
          payload: String(transfer.playerId),
        },
      });
    }

    // Schedule weekly contract review (bench/kick evaluation)
    const firstReviewDate = addDays(profile.date, 7);
    await DatabaseClient.prisma.calendar.deleteMany({
      where: {
        type: Constants.CalendarEntry.PLAYER_CONTRACT_REVIEW,
        completed: false,
        payload: String(transfer.playerId),
        date: { gte: profile.date.toISOString() },
      },
    });
    await DatabaseClient.prisma.calendar.create({
      data: {
        type: Constants.CalendarEntry.PLAYER_CONTRACT_REVIEW,
        date: firstReviewDate.toISOString(),
        payload: String(transfer.playerId),
      },
    });

    // Reject any other pending offers for this player.
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

    // Extension accepted email.
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

    const team = transfer.from;
    const contractEndDate = format(contractEnd, Constants.Application.CALENDAR_DATE_FORMAT);

    await sendEmail(
      Sqrl.render(locale.templates.ContractExtensionAccepted.SUBJECT, { profile, team }),
      Sqrl.render(locale.templates.ContractExtensionAccepted.CONTENT, {
        profile,
        team,
        years,
        contractEndDate,
      }),
      persona,
      profile.date,
      true
    );

    const refreshedProfile = await DatabaseClient.prisma.profile.findFirst(Eagers.profile);
    mainWindow?.send(Constants.IPCRoute.PROFILES_CURRENT, refreshedProfile);

    WindowManager.sendAll(Constants.IPCRoute.TRANSFER_UPDATE);


    Engine.Runtime.Instance.log.info(
      "%s accepted a contract extension at %s (years=%d).",
      profile.name,
      transfer.from.name,
      years
    );

    return Promise.resolve();
  }

  // Normal signing path
  const contractEnd = addYears(profile.date, years);

  await benchVictim({
    prisma: DatabaseClient.prisma,
    teamId: fromTeamId,
    userRole: (profile as any)?.player?.role,
    now: profile.date,
    incomingPlayerId: transfer.playerId,
  });

  //Connect the player to the new team.
  await DatabaseClient.prisma.player.update({
    where: { id: transfer.playerId },
    data: {
      transferListed: false,
      starter: true,
      team: { connect: { id: fromTeamId } },
      contractEnd,
    },
  });

  // Update profile.teamId so the game knows you're now on a team.
  const updatedProfile = await DatabaseClient.prisma.profile.update({
    where: { id: profile.id },
    data: {
      team: {
        connect: { id: fromTeamId },
      },
    },
    include: { player: true, team: true },
  });

  // Notify renderer so UI updates immediately.
  if (mainWindow) {
    mainWindow.send(Constants.IPCRoute.PROFILES_CURRENT, updatedProfile);
  }

  const now = profile.date;
  const destTeam = await DatabaseClient.prisma.team.findFirst({
    where: { id: fromTeamId },
    select: { tier: true },
  });
  const destTierIdx = typeof destTeam?.tier === "number" ? destTeam.tier : null;

  await closeOpenCareerStints(DatabaseClient.prisma, transfer.playerId, now);
  await startCareerStint(DatabaseClient.prisma, {
    playerId: transfer.playerId,
    teamId: fromTeamId,
    tier: destTierIdx,
    startedAt: now,
  });

  // Schedule contract expiry event in the calendar.
  await DatabaseClient.prisma.calendar.deleteMany({
    where: {
      type: Constants.CalendarEntry.PLAYER_CONTRACT_EXPIRE,
      completed: false,
      payload: String(transfer.playerId),
      date: { gte: profile.date.toISOString() },
    },
  });
  await DatabaseClient.prisma.calendar.create({
    data: {
      type: Constants.CalendarEntry.PLAYER_CONTRACT_EXPIRE,
      date: contractEnd.toISOString(),
      payload: String(transfer.playerId),
    },
  });

  const EXT_DAYS = Constants.PlayerContractSettings.EXTENSION_EVAL_DAYS_BEFORE_END;
  const extensionEvalDate = addDays(contractEnd, -EXT_DAYS);
  if (extensionEvalDate > profile.date) {
    await DatabaseClient.prisma.calendar.deleteMany({
      where: {
        type: Constants.CalendarEntry.PLAYER_CONTRACT_EXTENSION_EVAL,
        completed: false,
        payload: String(transfer.playerId),
        date: { gte: profile.date.toISOString() },
      },
    });
    await DatabaseClient.prisma.calendar.create({
      data: {
        type: Constants.CalendarEntry.PLAYER_CONTRACT_EXTENSION_EVAL,
        date: extensionEvalDate.toISOString(),
        payload: String(transfer.playerId),
      },
    });
  }

  // Schedule weekly contract review (bench/kick evaluation)
  const firstReviewDate = addDays(profile.date, 7);
  await DatabaseClient.prisma.calendar.deleteMany({
    where: {
      type: Constants.CalendarEntry.PLAYER_CONTRACT_REVIEW,
      completed: false,
      payload: String(transfer.playerId),
      date: { gte: profile.date.toISOString() },
    },
  });
  await DatabaseClient.prisma.calendar.create({
    data: {
      type: Constants.CalendarEntry.PLAYER_CONTRACT_REVIEW,
      date: firstReviewDate.toISOString(),
      payload: String(transfer.playerId),
    },
  });

  const scoutingDate = addDays(profile.date, 7);
  // Remove any existing future scouting checks for this player
  await DatabaseClient.prisma.calendar.deleteMany({
    where: {
      type: Constants.CalendarEntry.PLAYER_SCOUTING_CHECK,
      completed: false,
      payload: String(profile.playerId),
      date: { gte: profile.date.toISOString() },
    },
  });
  // Create the first scouting check
  await DatabaseClient.prisma.calendar.create({
    data: {
      type: Constants.CalendarEntry.PLAYER_SCOUTING_CHECK,
      date: scoutingDate.toISOString(),
      payload: String(profile.playerId),
    },
  });

  // Mark future matches for this team as user matchdays.
  const today = profile.date;
  const futureMatches = await DatabaseClient.prisma.match.findMany({
    where: {
      date: { gte: today.toISOString() },
      competitors: {
        some: { teamId: fromTeamId },
      },
    },
  });

  // If we switched teams, revert the old teams remaining USER matchdays back to NPC
  if (oldTeamId != null && oldTeamId !== fromTeamId) {
    const oldFutureMatches = await DatabaseClient.prisma.match.findMany({
      where: {
        date: { gte: today.toISOString() },
        competitors: { some: { teamId: oldTeamId } },
      },
      select: { id: true },
    });

    const oldMatchIds = oldFutureMatches.map((m) => String(m.id));

    if (oldMatchIds.length) {
      await DatabaseClient.prisma.calendar.updateMany({
        where: {
          payload: { in: oldMatchIds },
          date: { gte: today.toISOString() },
          type: Constants.CalendarEntry.MATCHDAY_USER,
        },
        data: { type: Constants.CalendarEntry.MATCHDAY_NPC },
      });
    }
  }

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

  // Reject any other pending offers for this player.
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

  // Welcome email
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
 * Reject a transfer offer that targets the user player.
 */
export async function rejectTransferOffer(transferId: number) {
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

  const latestPending = transfer.offers.find(
    (o) => o.status === Constants.TransferStatus.PLAYER_PENDING
  );

  if (
    latestPending?.expiresAt &&
    latestPending.expiresAt <= profile.date
  ) {
    await onTransferOfferExpiryCheck({
      ...({} as any),
      payload: String(transfer.id),
    } as any);
    return Promise.resolve();
  }

  if (transfer.playerId !== profile.playerId) {
    Engine.Runtime.Instance.log.warn(
      "rejectUserPlayerTransfer: transfer %d does not target user player. Skipping.",
      transferId
    );
    return Promise.resolve();
  }

  // Extension detection:
  // If the offer comes from the user's CURRENT team, we treat it as a contract extension.
  const fromTeamId = transfer.from?.id;
  const isExtension =
    profile.teamId != null &&
    fromTeamId != null &&
    fromTeamId === profile.teamId;

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

  // Different email content for extensions vs new-team offers.
  const locale = getLocale(profile);

  if (isExtension) {
    if ((locale.templates as any).ContractExtensionRejected) {
      await sendEmail(
        Sqrl.render((locale.templates as any).ContractExtensionRejected.SUBJECT, {
          transfer,
          profile,
        }),
        Sqrl.render((locale.templates as any).ContractExtensionRejected.CONTENT, {
          transfer,
          profile,
          offer,
        }),
        persona,
        profile.date,
        false
      );
    }

    Engine.Runtime.Instance.log.info(
      "User rejected contract extension from %s (transfer %d).",
      transfer.from.name,
      transfer.id
    );

    return Promise.resolve();
  }
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
 * Benches the user player
 * - starter=false, transferListed=true
 * - convert future MATCHDAY_USER -> MATCHDAY_NPC for this team
 * - send PlayerBenched email (tier name + KD + team standing/form + reason)
 */
export async function benchUserPlayer(params: {
  teamId: number;
  playerId: number;
  now: Date;
  reason?: string;
}) {
  const { teamId, playerId, now, reason } = params;
  const prisma = DatabaseClient.prisma;

  const profile = await prisma.profile.findFirst(Eagers.profile);
  if (!profile) return Promise.resolve();

  // Safety: only act on the user player + current team context
  if (profile.playerId !== playerId) return Promise.resolve();
  if (profile.teamId !== teamId) return Promise.resolve();

  // Load team for tier/personas
  const team = await prisma.team.findFirst({
    where: { id: teamId },
    include: { personas: true },
  });
  if (!team) return Promise.resolve();

  const outgoing = await prisma.player.findFirst({
    where: { id: playerId },
    select: { starter: true, role: true },
  });

  // Update player status
  await prisma.player.update({
    where: { id: playerId },
    data: {
      starter: false,
      transferListed: true,
    },
  });

  await promoteReplacement({
    prisma,
    teamId,
    outgoingUserRole: outgoing?.role ?? (profile as any)?.player?.role,
    now,
    outgoingPlayerId: playerId,
    outgoingWasStarter: !!outgoing?.starter,
  });

  // Convert future matchdays for this team from USER -> NPC
  const futureMatches = await prisma.match.findMany({
    where: {
      date: { gte: now.toISOString() },
      competitors: { some: { teamId } },
    },
    select: { id: true },
  });

  const matchIds = futureMatches.map((m) => String(m.id));
  if (matchIds.length) {
    await prisma.calendar.updateMany({
      where: {
        payload: { in: matchIds },
        date: { gte: now.toISOString() },
        type: Constants.CalendarEntry.MATCHDAY_USER,
      },
      data: { type: Constants.CalendarEntry.MATCHDAY_NPC },
    });
  }

  const tierName = getTeamTierName(team.tier);

  let kd = 1;
  let matchesPlayed = 0;
  try {
    const leagueRecent = await LeagueStats.computeLeagueLifetimeStats(teamId, playerId, 30);
    kd = leagueRecent.kdRatio ?? 1;
    matchesPlayed = leagueRecent.matchesPlayed ?? 0;
  } catch (_) {
    // If stats fail, email still sends with defaults.
  }

  const standingScore = await computeTeamStandingScore({ ...profile, teamId });
  const formScore = await computeTeamFormScore({ ...profile, teamId }, 5);

  // Email
  const locale = getLocale(profile);
  const persona =
    team.personas.find(
      (p) =>
        p.role === Constants.PersonaRole.MANAGER ||
        p.role === Constants.PersonaRole.ASSISTANT,
    ) ?? team.personas[0];

  const kdFmt = Number.isFinite(kd) ? Number(kd).toFixed(2) : "1.00";

  if (persona && (locale.templates as any).PlayerBenched) {
    await sendEmail(
      Sqrl.render((locale.templates as any).PlayerBenched.SUBJECT, {
        profile,
        team,
      }),
      Sqrl.render((locale.templates as any).PlayerBenched.CONTENT, {
        profile,
        team,
        tierName,
        kd: kdFmt,
      }),
      persona,
      now,
      true,
    );
  }

  const refreshedProfile = await prisma.profile.findFirst(Eagers.profile);
  const mainWindow = WindowManager.get(Constants.WindowIdentifier.Main, false)?.webContents;
  if (mainWindow && refreshedProfile) {
    mainWindow.send(Constants.IPCRoute.PROFILES_CURRENT, refreshedProfile);
  }

  Engine.Runtime.Instance.log.info(
    "benchUserPlayer: playerId=%d teamId=%d tier=%s kd=%s standing=%s form=%s reason=%s",
    playerId,
    teamId,
    tierName,
    Number(kd).toFixed(2),
    Number(standingScore).toFixed(2),
    Number(formScore).toFixed(2),
    reason ?? "",
  );

  return Promise.resolve();
}

/**
 * Kicks the user player
 * - profile.teamId=null
 * - close open career stints
 * - revert future matchdays for old team to NPC
 * - delete future contract calendar entries
 */
export async function kickUserPlayer(params: {
  teamId: number;
  playerId: number;
  now: Date;
  currentEntryId?: number;
  reason?: string;
}) {
  const { teamId, playerId, now, reason } = params;
  const prisma = DatabaseClient.prisma;

  const profile = await prisma.profile.findFirst(Eagers.profile);
  if (!profile) return Promise.resolve();

  // Safety: only act on the user player + current team context
  if (profile.playerId !== playerId) return Promise.resolve();
  if (profile.teamId !== teamId) return Promise.resolve();

  // Load team context for email/persona before we detach
  const team = await prisma.team.findFirst({
    where: { id: teamId },
    include: { personas: true },
  });

  const tierName = team ? getTeamTierName(team.tier) : "Unknown";

  const outgoing = await prisma.player.findFirst({
    where: { id: playerId },
    select: { starter: true, role: true },
  });

  // Detach player from team and wipe contract
  await prisma.player.update({
    where: { id: playerId },
    data: {
      teamId: null,
      contractEnd: null,
      transferListed: true,
      starter: false,
    },
  });

  await promoteReplacement({
    prisma,
    teamId,
    outgoingUserRole: outgoing?.role ?? (profile as any)?.player?.role,
    now,
    outgoingPlayerId: playerId,
    outgoingWasStarter: !!outgoing?.starter,
  });

  // Update profile teamId
  const updatedProfile = await prisma.profile.update({
    where: { id: profile.id },
    data: { teamId: null },
    include: { player: true, team: true },
  });

  // Close open career stints
  await closeOpenCareerStints(prisma, playerId, now);

  // Revert future matchdays for old team back to NPC
  const oldFutureMatches = await prisma.match.findMany({
    where: {
      date: { gte: now.toISOString() },
      competitors: { some: { teamId } },
    },
    select: { id: true },
  });

  const oldMatchIds = oldFutureMatches.map((m) => String(m.id));
  if (oldMatchIds.length) {
    await prisma.calendar.updateMany({
      where: {
        payload: { in: oldMatchIds },
        date: { gte: now.toISOString() },
        type: Constants.CalendarEntry.MATCHDAY_USER,
      },
      data: { type: Constants.CalendarEntry.MATCHDAY_NPC },
    });
  }

  // Delete any future contract-related calendar entries for this player
  const nowIso = now.toISOString();
  await prisma.calendar.updateMany({
    where: {
      completed: false,
      payload: String(playerId),
      type: {
        in: [
          Constants.CalendarEntry.PLAYER_CONTRACT_EXPIRE,
          Constants.CalendarEntry.PLAYER_CONTRACT_EXTENSION_EVAL,
          Constants.CalendarEntry.PLAYER_CONTRACT_REVIEW,
        ],
      },
      date: { gt: nowIso },
    },
    data: { completed: true },
  });

  // Push profile update to renderer
  const mainWindow = WindowManager.get(Constants.WindowIdentifier.Main, false)?.webContents;
  if (mainWindow) {
    mainWindow.send(Constants.IPCRoute.PROFILES_CURRENT, updatedProfile);
  }

  // Email
  let kd = 1;
  let matchesPlayed = 0;
  let standingScore = 0.5;
  let formScore = 0.5;

  try {
    const leagueRecent = await LeagueStats.computeLeagueLifetimeStats(teamId, playerId, 30);
    kd = leagueRecent.kdRatio ?? 1;
    matchesPlayed = leagueRecent.matchesPlayed ?? 0;
  } catch (_) { }

  try {
    standingScore = await computeTeamStandingScore({ ...profile, teamId });
    formScore = await computeTeamFormScore({ ...profile, teamId }, 5);
  } catch (_) { }

  if (team?.personas?.length) {
    const persona =
      team.personas.find(
        (p) =>
          p.role === Constants.PersonaRole.MANAGER ||
          p.role === Constants.PersonaRole.ASSISTANT,
      ) ?? team.personas[0];

    const locale = getLocale(profile);

    const tpl =
      (locale.templates as any).PlayerKicked ??
      (locale.templates as any).ContractTerminatedEarly;

    if (persona && tpl) {
      await sendEmail(
        Sqrl.render(tpl.SUBJECT, { profile, team, tierName }),
        Sqrl.render(tpl.CONTENT, {
          profile,
          team,
          tierName,
        }),
        persona,
        now,
        true,
      );
    }
  }

  Engine.Runtime.Instance.log.info(
    "kickUserPlayer: playerId=%d oldTeamId=%d tier=%s kd=%s standing=%s form=%s reason=%s",
    playerId,
    teamId,
    tierName,
    Number(kd).toFixed(2),
    Number(standingScore).toFixed(2),
    Number(formScore).toFixed(2),
  );

  return Promise.resolve();
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function kdToScore(kd: number) {
  const lo = 0.8;
  const hi = 1.8;
  const clamped = Math.max(lo, Math.min(hi, kd));
  return clamp01((clamped - lo) / (hi - lo));
}

async function computeTeamStandingScore(profile: any) {
  const prisma = DatabaseClient.prisma;

  // Find the active league competition that includes the user's team
  const competition = await prisma.competition.findFirst({
    where: {
      season: profile.season,
      status: {
        in: [Constants.CompetitionStatus.STARTED, Constants.CompetitionStatus.COMPLETED],
      },
      tier: {
        league: { slug: Constants.LeagueSlug.ESPORTS_LEAGUE },
      },
      competitors: {
        some: { teamId: profile.teamId },
      },
    },
    include: {
      competitors: true,
      tier: true,
    },
    orderBy: { id: "desc" },
  });

  if (!competition || !competition.competitors?.length) {
    return 0.5;
  }

  const me = competition.competitors.find((c) => c.teamId === profile.teamId);
  if (!me || !me.position) {
    return 0.5;
  }

  const teamCount = competition.competitors.length;
  if (teamCount <= 1) return 0.5;

  const pos = me.position;
  const standing = 1 - (pos - 1) / (teamCount - 1);
  return clamp01(standing);
}

async function computeTeamFormScore(profile: any, take = 5) {
  const prisma = DatabaseClient.prisma;

  const matches = await prisma.match.findMany({
    where: {
      status: Constants.MatchStatus.COMPLETED,
      competitionId: { not: null },
      competitors: { some: { teamId: profile.teamId } },
    },
    include: { competitors: true },
    orderBy: { date: "desc" },
    take,
  });

  if (!matches.length) return 0.5;

  let sum = 0;
  for (const m of matches) {
    const me = m.competitors.find((c) => c.teamId === profile.teamId);
    if (!me) continue;

    if (me.result === Constants.MatchResult.WIN) sum += 1;
    else if (me.result === Constants.MatchResult.DRAW) sum += 0.5;
    else sum += 0;
  }

  return clamp01(sum / matches.length);
}

/**
 * Attempts to scout the user player periodically.
 */
export async function onPlayerScoutingCheck(entry: Calendar) {
  const playerId = Number(entry.payload);

  const prisma = DatabaseClient.prisma;
  const [profile] = await prisma.profile.findMany({
    take: 1,
    include: {
      team: true,
      player: {
        include: {
          country: {
            include: { continent: true },
          },
        },
      },
    },
  });
  if (!profile) return Promise.resolve();
  if (profile.playerId !== playerId) return Promise.resolve();

  // Load user player snapshot.
  const player = await prisma.player.findFirst({
    where: { id: profile.playerId },
    select: {
      id: true,
      teamId: true,
      starter: true,
      transferListed: true,
      wages: true,
      cost: true,
      contractEnd: true,
      countryId: true,
      lastOfferAt: true,
    },
  });
  if (!player) return Promise.resolve();

  // If teamless, try to use most recent stint team for league stats & context.
  const cutoff = addDays(profile.date, -180);
  const lastStintWithTeam = await prisma.careerStint.findFirst({
    where: {
      playerId: profile.playerId,
      teamId: { not: null },
      tier: { not: null },
      OR: [{ endedAt: null }, { endedAt: { gte: cutoff } }],
    },
    orderBy: [{ endedAt: "desc" }, { startedAt: "desc" }],
    select: { teamId: true, tier: true },
  });

  const effectiveTeamId = profile.teamId ?? lastStintWithTeam?.teamId ?? null;

  // Resolve tier index boundaries from your Prestige ordering
  const idxOpen = Constants.Prestige.findIndex((t) => t === TierSlug.LEAGUE_OPEN);
  const idxInter = Constants.Prestige.findIndex((t) => t === TierSlug.LEAGUE_INTERMEDIATE);
  const idxMain = Constants.Prestige.findIndex((t) => t === TierSlug.LEAGUE_MAIN);
  const idxAdv = Constants.Prestige.findIndex((t) => t === TierSlug.LEAGUE_ADVANCED);
  const idxPrem = Constants.Prestige.findIndex((t) => t === TierSlug.LEAGUE_PREMIER);

  // Current tier from team; if teamless fall back to last stint tier; otherwise Open.
  const currentTierIdx =
    typeof (profile as any)?.team?.tier === "number"
      ? (profile as any).team.tier
      : typeof lastStintWithTeam?.tier === "number"
        ? lastStintWithTeam.tier
        : idxOpen;

  // Recent peak tier from CareerStints (last 180 days, includes ongoing stints)
  const stints = await prisma.careerStint.findMany({
    where: {
      playerId: profile.playerId,
      OR: [{ endedAt: null }, { endedAt: { gte: cutoff } }],
      tier: { not: null },
    },
    select: { tier: true, startedAt: true, endedAt: true },
    orderBy: { startedAt: "desc" },
  });

  let recentPeakTierIdx = currentTierIdx;
  for (const s of stints) {
    if (typeof s.tier === "number") {
      recentPeakTierIdx = Math.max(recentPeakTierIdx, s.tier);
    }
  }

  const baselineTierIdx = Math.max(currentTierIdx, recentPeakTierIdx);

  // If teamless, only allow scouting if the player recently played ADVANCED/PREMIER.
  // (Open/Intermediate/Main free agents should primarily be handled by FACEIT/offers.)
  const isTeamless = profile.teamId == null;
  if (isTeamless && baselineTierIdx < idxAdv) {
    // Schedule next weekly check (recurring)
    const nextDate = addDays(profile.date, 7);
    await prisma.calendar.create({
      data: {
        type: Constants.CalendarEntry.PLAYER_SCOUTING_CHECK,
        date: nextDate.toISOString(),
        payload: String(playerId),
      },
    });
    return Promise.resolve();
  }

  // Need an effective team to compute league stats + context.
  if (!effectiveTeamId) {
    const nextDate = addDays(profile.date, 7);
    await prisma.calendar.create({
      data: {
        type: Constants.CalendarEntry.PLAYER_SCOUTING_CHECK,
        date: nextDate.toISOString(),
        payload: String(playerId),
      },
    });
    return Promise.resolve();
  }

  // League performance inputs (per-player + team context)
  const leagueRecent = await LeagueStats.computeLeagueLifetimeStats(
    effectiveTeamId,
    profile.playerId,
    30,
  );

  const kd = leagueRecent.kdRatio ?? 1;
  const playerScore = kdToScore(kd);

  // Team context score (standing + form)
  const standingScore = await computeTeamStandingScore({ ...profile, teamId: effectiveTeamId });
  const formScore = await computeTeamFormScore({ ...profile, teamId: effectiveTeamId }, 5);

  // Weighting: KD matters most
  const teamContextScore = clamp01(0.6 * standingScore + 0.4 * formScore);
  const leagueSignal = clamp01(0.8 * playerScore + 0.2 * teamContextScore);

  Engine.Runtime.Instance.log.debug(
    "PlayerScoutingCheck: kd=%s playerScore=%s standing=%s form=%s leagueSignal=%s",
    kd.toFixed(2),
    playerScore.toFixed(2),
    standingScore.toFixed(2),
    formScore.toFixed(2),
    leagueSignal.toFixed(2),
  );

  // Helper: add tier idx safely
  const eligible = new Set<number>();
  const addTier = (idx: number) => {
    if (typeof idx !== "number") return;
    if (idx < 0) return;
    if (idx >= Constants.Prestige.length) return;
    eligible.add(idx);
  };

  // Always: lateral at baseline
  addTier(baselineTierIdx);

  // Premier: always premier offers 
  if (currentTierIdx >= idxPrem) addTier(idxPrem);

  // Upward movement rules
  // - If baseline/current >= MAIN: allow MAIN lateral + occasional ADVANCED
  // - If baseline/current >= ADVANCED: allow ADVANCED lateral + rare low-ranked PREMIER
  // - If current tier OPEN/INTERMEDIATE: allow MAIN only on exceptional performance
  let premierLowRankOnly = false;

  const isLowTier = currentTierIdx <= idxInter;
  if (isLowTier) {
    const exceptional = leagueSignal >= 0.90;
    if (exceptional) addTier(idxMain);
  } else {
    if (baselineTierIdx >= idxMain && baselineTierIdx < idxAdv) {
      if (leagueSignal >= 0.75) addTier(idxAdv);
    }
    if (baselineTierIdx >= idxAdv && baselineTierIdx < idxPrem) {
      if (leagueSignal >= 0.85) {
        addTier(idxPrem);
        premierLowRankOnly = true;
      }
    }
  }

  // Downward offers if performance isn't good
  if (leagueSignal <= 0.45) addTier(baselineTierIdx - 1);
  if (leagueSignal <= 0.30) addTier(baselineTierIdx - 2);

  const eligibleTierIdxs = Array.from(eligible).sort((a, b) => a - b);
  const eligibleTierSlugs = eligibleTierIdxs.map((i) => Constants.Prestige[i]);

  Engine.Runtime.Instance.log.debug(
    "PlayerScoutingCheck: currentTier=%s recentPeak=%s baseline=%s eligible=%s premierLowRankOnly=%s",
    Constants.Prestige[currentTierIdx],
    Constants.Prestige[recentPeakTierIdx],
    Constants.Prestige[baselineTierIdx],
    eligibleTierSlugs.join(","),
    premierLowRankOnly ? "true" : "false",
  );

  try {
    // Cooldown: different rules if teamless vs in a team
    const cooldownDays = isTeamless
      ? UserOfferSettings.TEAMLESS_OFFER_COOLDOWN_DAYS
      : UserOfferSettings.TEAM_OFFER_COOLDOWN_DAYS;

    if (player.lastOfferAt) {
      const daysSinceLast = differenceInDays(profile.date, player.lastOfferAt);
      if (daysSinceLast < cooldownDays) {
        Engine.Runtime.Instance.log.debug(
          "PlayerScoutingCheck: cooldown active (daysSinceLast=%d < cooldown=%d).",
          daysSinceLast,
          cooldownDays,
        );
        return Promise.resolve();
      }
    }

    // Eligibility checks: pending cap
    const pendingCount = await prisma.transfer.count({
      where: {
        playerId: profile.playerId,
        status: Constants.TransferStatus.PLAYER_PENDING,
      },
    });

    if (pendingCount >= UserOfferSettings.TEAMLESS_MAX_PENDING_OFFERS) {
      Engine.Runtime.Instance.log.debug(
        "PlayerScoutingCheck: pending offer cap hit (%d).",
        pendingCount,
      );
      return Promise.resolve();
    }

    // Contract gating
    const CONTRACT_SOFT_GATE_DAYS =
      (UserOfferSettings as any).CONTRACT_SOFT_GATE_DAYS ?? 180;
    const CONTRACT_HOT_WINDOW_DAYS =
      (UserOfferSettings as any).CONTRACT_HOT_WINDOW_DAYS ?? 120;

    let contractMult = 1.0;
    if (player.contractEnd) {
      const daysLeft = differenceInDays(player.contractEnd as any, profile.date);
      if (daysLeft > CONTRACT_SOFT_GATE_DAYS) contractMult = 0.25;
      else if (daysLeft <= CONTRACT_HOT_WINDOW_DAYS) contractMult = 1.25;
    }

    // Starter / transferListed modifiers
    const starterMult = player.starter ? 1.0 : 0.85;
    const listedMult = player.transferListed ? 0.90 : 1.0;

    // Pick a target tier (weighted among eligible tiers)
    const tierWeights: Record<string, number> = {};
    for (const tIdx of eligibleTierIdxs) {
      const delta = tIdx - baselineTierIdx;
      let w = 0;

      if (delta === 0) w = 70;
      else if (delta === -1) w = 20;
      else if (delta <= -2) w = 10;
      else if (delta === 1) w = 10;
      else if (delta >= 2) w = 4;

      // Performance shaping
      if (delta > 0) w = Math.round(w * Math.max(0.15, leagueSignal));
      if (delta < 0) w = Math.round(w * Math.max(0.15, 1 - leagueSignal + 0.10));

      // Non-starter: rarely move up; more likely "rescue" down
      if (!player.starter && delta > 0) w = Math.round(w * 0.35);
      if (!player.starter && delta < 0) w = Math.round(w * 1.25);

      // Transfer-listed: reduce upward, slightly increase downward
      if (player.transferListed && delta > 0) w = Math.round(w * 0.60);
      if (player.transferListed && delta < 0) w = Math.round(w * 1.15);

      if (w < 1) w = 1;
      tierWeights[String(tIdx)] = w;
    }

    const pickedTierIdx = Number(Chance.roll(tierWeights));
    const pickedTierSlug = Constants.Prestige[pickedTierIdx] as TierSlug;

    // Probability model (weekly)
    const basePbxByTier: Partial<Record<TierSlug, number>> = {
      [TierSlug.LEAGUE_OPEN]: 35,
      [TierSlug.LEAGUE_INTERMEDIATE]: 28,
      [TierSlug.LEAGUE_MAIN]: 18,
      [TierSlug.LEAGUE_ADVANCED]: 12,
      [TierSlug.LEAGUE_PREMIER]: 8,
    };

    const base = basePbxByTier[pickedTierSlug] ?? 12;

    let pbx = base * (0.75 + leagueSignal * 0.75);
    pbx *= contractMult;
    pbx *= starterMult;
    pbx *= listedMult;

    // Teamless Advanced/Premier scouting should be a bit rarer than contracted scouting
    if (isTeamless) pbx *= 0.85;

    pbx = Math.max(1, Math.min(95, Math.round(pbx)));

    Engine.Runtime.Instance.log.debug(
      "PlayerScoutingCheck: pickedTier=%s base=%d pbx=%d contractMult=%s starter=%s listed=%s",
      pickedTierSlug,
      base,
      pbx,
      contractMult.toFixed(2),
      player.starter ? "true" : "false",
      player.transferListed ? "true" : "false",
    );

    if (!Chance.rollD2(pbx)) {
      Engine.Runtime.Instance.log.debug("PlayerScoutingCheck: roll failed (pbx=%d).", pbx);
      return Promise.resolve();
    }

    // User federation (prefer the profile include; fallback to country lookup)
    let userFedId: number | null =
      (profile as any)?.player?.country?.continent?.federationId ?? null;

    if (!userFedId && player.countryId) {
      const country = await prisma.country.findFirst({
        where: { id: player.countryId },
        include: { continent: true },
      });
      userFedId = country?.continent?.federationId ?? null;
    }

    // If we cannot determine federation, safest is to skip (prevents invalid cross-region offers)
    if (!userFedId) {
      Engine.Runtime.Instance.log.debug("PlayerScoutingCheck: userFedId missing; skipping offer.");
      return Promise.resolve();
    }

    // Cross-federation chance depends on user's level (baseline tier)
    // - Open/Intermediate/Main: never
    // - Advanced: 5%
    // - Premier: 10%
    const crossFedPbx =
      pickedTierIdx >= idxPrem ? 10 :
        pickedTierIdx >= idxAdv ? 5 :
          0;

    const wantCrossFederation = crossFedPbx > 0 && Chance.rollD2(crossFedPbx);

    const teamWhere: any = {
      tier: pickedTierIdx,
      profile: null,
    };

    // Don't offer from the current team when user is contracted
    if (profile.teamId) {
      teamWhere.id = { not: profile.teamId };
    }

    // Federation restriction:
    // - default: same federation
    // - rare: other federations ONLY
    teamWhere.country = {
      continent: {
        federationId: wantCrossFederation ? { not: userFedId } : userFedId,
      },
    };

    const teams = await prisma.team.findMany({
      where: teamWhere,
      include: { personas: true },
    });

    if (!teams.length) {
      Engine.Runtime.Instance.log.debug(
        "PlayerScoutingCheck: no teams found for tier=%s (crossFed=%s)",
        pickedTierSlug,
        wantCrossFederation ? "true" : "false",
      );
      return Promise.resolve();
    }

    let pool = teams;

    if (premierLowRankOnly && pickedTierIdx === idxPrem) {
      const sortedAsc = [...teams].sort((a, b) => (a.elo ?? 0) - (b.elo ?? 0));
      const bottomCount = Math.max(3, Math.floor(sortedAsc.length * 0.30));
      pool = sortedAsc.slice(0, bottomCount);
    } else {
      // Strong performance: bias toward top teams in that tier
      if (leagueSignal >= 0.75) {
        const sortedDesc = [...teams].sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0));
        const topCount = Math.max(3, Math.floor(sortedDesc.length * 0.25));
        pool = sortedDesc.slice(0, topCount);
      }
    }

    const from = sample(pool);
    if (!from) return Promise.resolve();

    // Create transfer + offer
    let contractYears = rollContractYears(pickedTierSlug);
    const offerExpiresAt = addDays(profile.date, 7);
    if (!player.starter && contractYears > 1) contractYears -= 1;
    if (player.transferListed && contractYears > 1) contractYears -= 1;

    const baseWages = player.wages ?? 0;
    const baseCost = player.cost ?? 0;

    let wageMult = 0.90 + leagueSignal * 0.25; // 0.90..1.15
    if (!player.starter) wageMult *= 0.90;
    if (player.transferListed) wageMult *= 0.85;

    const wages = Math.max(0, Math.round(baseWages * wageMult));
    const cost = Math.max(0, Math.round(baseCost * (0.95 + leagueSignal * 0.15)));

    const transfer = await prisma.transfer.create({
      data: {
        status: Constants.TransferStatus.PLAYER_PENDING,
        from: { connect: { id: from.id } },
        target: { connect: { id: player.id } },
        offers: {
          create: [
            {
              status: Constants.TransferStatus.PLAYER_PENDING,
              wages,
              cost,
              contractYears,
              expiresAt: offerExpiresAt,
            },
          ],
        },
      },
      include: Eagers.transfer.include,
    });

    await prisma.calendar.create({
      data: {
        type: Constants.CalendarEntry.TRANSFER_OFFER_EXPIRY_CHECK,
        date: offerExpiresAt.toISOString(),
        payload: String(transfer.id),
      },
    });

    await prisma.player.update({
      where: { id: player.id },
      data: { lastOfferAt: profile.date },
    });

    const locale = getLocale(profile);
    const persona =
      from.personas.find(
        (p) =>
          p.role === Constants.PersonaRole.MANAGER ||
          p.role === Constants.PersonaRole.ASSISTANT,
      ) ?? from.personas[0];
    const fromTierName = getTeamTierName(transfer.from?.tier);

    await sendEmail(
      Sqrl.render(locale.templates.OfferIncoming.SUBJECT, { transfer, profile }),
      Sqrl.render(locale.templates.OfferIncoming.CONTENT, { transfer, profile, fromTierName }),
      persona,
      profile.date,
      true,
    );

    WindowManager.sendAll(Constants.IPCRoute.TRANSFER_UPDATE);

    await scheduleOfferPauseAndExpiry(transfer.id, offerExpiresAt);
    Engine.Runtime.Instance.stop();

    Engine.Runtime.Instance.log.info(
      "League-based offer: %s -> %s (tier=%s years=%d wages=%d cost=%d pbx=%d)",
      from.name,
      (profile as any)?.player?.name ?? "USER",
      pickedTierSlug,
      contractYears,
      wages,
      cost,
      pbx,
    );

    return Promise.resolve(transfer);
  } finally {
    // Schedule next weekly check (recurring)
    const nextDate = addDays(profile.date, 7);
    await prisma.calendar.create({
      data: {
        type: Constants.CalendarEntry.PLAYER_SCOUTING_CHECK,
        date: nextDate.toISOString(),
        payload: String(playerId),
      },
    });
  }
}

/**
 * Weekly contract review (bench + kick) for the user player.
 *
 * Payload: playerId (stringified)
 */
export async function onPlayerContractReview(entry: Calendar) {
  const prisma = DatabaseClient.prisma;
  const playerId = Number(entry.payload);

  // Load profile with team+player context (must exist and match payload)
  const profile = await prisma.profile.findFirst(Eagers.profile);
  if (!profile) return Promise.resolve();
  if (profile.playerId !== playerId) return Promise.resolve();

  // Must currently be on a team
  if (!profile.teamId || !profile.team) {
    return Promise.resolve();
  }

  const now = profile.date;
  const teamId = profile.teamId;

  // Load the user player state to prevent repeated benching + repeated emails.
  const userPlayer = await prisma.player.findFirst({
    where: { id: playerId },
    select: {
      id: true,
      teamId: true,
      starter: true,
      transferListed: true,
    },
  });

  if (!userPlayer) return Promise.resolve();

  // Safety: ensure we're still evaluating the same team context
  if (userPlayer.teamId !== teamId) return Promise.resolve();

  // If already benched/transfer-listed, do NOT bench again
  const isBenched = userPlayer.transferListed === true;

  // Tier slug from team tier idx
  const tierSlug = getTeamTierSlug(profile.team.tier);
  if (!tierSlug) {
    Engine.Runtime.Instance.log.warn(
      "onPlayerContractReview: could not resolve tierSlug (team.tier=%s). Skipping.",
      String(profile.team.tier),
    );
    // still reschedule
    const nextDate = addDays(now, 7);
    await prisma.calendar.create({
      data: {
        type: Constants.CalendarEntry.PLAYER_CONTRACT_REVIEW,
        date: nextDate.toISOString(),
        payload: String(playerId),
      },
    });
    return Promise.resolve();
  }

  // Load active stint (contract start proxy)
  const activeStint = await prisma.careerStint.findFirst({
    where: { playerId, endedAt: null },
    orderBy: { startedAt: "desc" },
    select: { startedAt: true, teamId: true, tier: true },
  });

  // If we cannot find an active stint, we still can run logic but we lose the kick window condition.
  const contractStart = activeStint?.startedAt ?? now;
  const daysInContract = differenceInDays(now, contractStart);

  // League stats for the last 30 league matches
  let kd = 0;
  let matchesPlayed = 0;
  try {
    const leagueRecent = await LeagueStats.computeLeagueLifetimeStats(
      teamId,
      playerId,
      30,
      contractStart,
    );
    kd = leagueRecent.kdRatio ?? 0;
    matchesPlayed = leagueRecent.matchesPlayed ?? 0;
  } catch (e) {
    Engine.Runtime.Instance.log.warn(
      "onPlayerContractReview: failed to compute league stats (teamId=%d playerId=%d).",
      teamId,
      playerId,
    );
  }

  // Team context scores
  const standingScore = await computeTeamStandingScore(profile);
  const formScore = await computeTeamFormScore(profile, 5);

  // Settings
  const S = Constants.PlayerContractSettings;

  const benchMinMatches = S.BENCH_MIN_LEAGUE_MATCHES;
  const kickWindowDays = S.KICK_WINDOW_DAYS;
  const kickMinMatches = S.KICK_MIN_LEAGUE_MATCHES;
  const benchKdMin =
    (S.BENCH_KD_MIN_BY_TIER as Record<string, number>)[tierSlug];
  const benchBasePbx =
    (S.BENCH_PBX_BY_TIER as Record<string, number>)[tierSlug];

  const kickKdMax =
    (S.KICK_KD_MAX_BY_TIER as Record<string, number>)[tierSlug];
  const kickBasePbx =
    (S.KICK_PBX_BY_TIER as Record<string, number>)[tierSlug];

  // Probability shaping based on form: (1 + (0.5 - formScore)) => [~0.5..~1.5] if formScore in [0..1]
  const formMult = 1 + (0.5 - formScore);

  Engine.Runtime.Instance.log.debug(
    `onPlayerContractReview: teamId=${teamId} tier=${tierSlug} daysInContract=${daysInContract} ` +
    `kd=${kd.toFixed(2)} matches=${matchesPlayed} standing=${standingScore.toFixed(2)} form=${formScore.toFixed(2)}`
  );

  // Off-season / inactivity block: require at least 3 matches in the last 30 days
  const reviewMinRecentMatches = S.REVIEW_MIN_MATCHES_LAST_30_DAYS ?? 3;

  // Use a true last-30-days window (optionally clamped to contractStart)
  const since30d = subDays(now, 30);
  const activitySince = contractStart > since30d ? contractStart : since30d;

  let matchesPlayed30d = 0;
  try {
    matchesPlayed30d = await prisma.match.count({
      where: {
        status: Constants.MatchStatus.COMPLETED,
        competitionId: { not: null },
        date: { gte: activitySince.toISOString() },
        competitors: { some: { teamId } },
        events: {
          some: {
            OR: [
              { attackerId: playerId },
              { victimId: playerId },
              { assistId: playerId },
            ],
          },
        },
      },
    });
  } catch (_) {
    matchesPlayed30d = 0;
  }
  const hasRecentActivity = matchesPlayed30d >= reviewMinRecentMatches;

  if (!hasRecentActivity) {
    Engine.Runtime.Instance.log.debug(
      "onPlayerContractReview: skipping kick/bench; only %d user-played matches in last 30 days (min=%d).",
      matchesPlayed30d,
      reviewMinRecentMatches,
    );
  } else {
    // Kick logic
    const inKickWindow = daysInContract <= kickWindowDays;
    const eligibleForKick =
      !isBenched &&
      inKickWindow &&
      matchesPlayed >= kickMinMatches &&
      kd <= kickKdMax;

    if (eligibleForKick) {
      let pbx = kickBasePbx * formMult;
      pbx = Math.max(1, Math.min(95, Math.round(pbx)));

      Engine.Runtime.Instance.log.debug(
        `onPlayerContractReview: kick check eligible (kd<=${kickKdMax.toFixed(
          2,
        )}, matches>=${kickMinMatches}, days<=${kickWindowDays}). pbx=${pbx}`,
      );

      if (Chance.rollD2(pbx)) {
        await kickUserPlayer({
          teamId,
          playerId,
          now,
          reason: `Performance below standard (KD ${kd.toFixed(
            2,
          )} <= ${kickKdMax.toFixed(2)}) within first ${kickWindowDays} days. Form=${formScore.toFixed(
            2,
          )}.`,
        });

        return Promise.resolve();
      }
    }

    // Bench logic
    const eligibleForBench =
      !isBenched && matchesPlayed >= benchMinMatches && kd < benchKdMin;

    if (eligibleForBench) {
      let pbx = benchBasePbx * formMult;
      pbx = Math.max(1, Math.min(95, Math.round(pbx)));

      Engine.Runtime.Instance.log.debug(
        "onPlayerContractReview: bench check eligible (kd<%.2f, matches>=%d). pbx=%d",
        benchKdMin,
        benchMinMatches,
        pbx,
      );

      if (Chance.rollD2(pbx)) {
        await benchUserPlayer({
          teamId,
          playerId,
          now,
          reason: `Underperforming (KD ${kd.toFixed(2)} < ${benchKdMin.toFixed(
            2,
          )}) after ${matchesPlayed} matches. Form=${formScore.toFixed(2)}.`,
        });
        // Continue through to reschedule (bench does not remove contract)
      }
    }
  }

  // Reschedule weekly review if still on a team
  const freshProfile = await prisma.profile.findFirst(Eagers.profile);
  if (freshProfile?.playerId === playerId && freshProfile.teamId) {
    const nextDate = addDays(now, 7);
    await prisma.calendar.create({
      data: {
        type: Constants.CalendarEntry.PLAYER_CONTRACT_REVIEW,
        date: nextDate.toISOString(),
        payload: String(playerId),
      },
    });
  }

  return Promise.resolve();
}

/**
 * One-shot contract extension evaluation.
 *
 * Payload: playerId (stringified)
 */
export async function onPlayerContractExtensionEval(entry: Calendar) {
  const prisma = DatabaseClient.prisma;
  const playerId = Number(entry.payload);

  const profile = await prisma.profile.findFirst(Eagers.profile);
  if (!profile) return Promise.resolve();
  if (profile.playerId !== playerId) return Promise.resolve();

  // Must be on a team
  if (!profile.teamId || !profile.team) return Promise.resolve();

  const now = profile.date;
  const teamId = profile.teamId;

  // Load the current player to check contract end
  const player = await prisma.player.findFirst({
    where: { id: playerId },
    select: {
      id: true,
      teamId: true,
      contractEnd: true,
      starter: true,
      transferListed: true,
      wages: true,
      cost: true,
    },
  });
  if (!player) return Promise.resolve();
  if (player.teamId !== teamId) return Promise.resolve();
  if (!player.contractEnd) return Promise.resolve();
  if (player.transferListed) {
    Engine.Runtime.Instance.log.debug(
      "onPlayerContractExtensionEval: playerId=%d is transferListed; skipping extension offer.",
      playerId,
    );
    return Promise.resolve();
  }

  // Window check: 0 < daysLeft <= 30
  const daysLeft = differenceInDays(player.contractEnd, now);
  if (!(daysLeft > 0 && daysLeft <= (Constants.PlayerContractSettings.EXTENSION_EVAL_DAYS_BEFORE_END ?? 30))) {
    return Promise.resolve();
  }

  // Determine tier slug
  const tierSlug = getTeamTierSlug(profile.team.tier);
  if (!tierSlug) return Promise.resolve();

  // Prevent duplicate extension offers (pending)
  const existingPendingExtension = await prisma.transfer.findFirst({
    where: {
      playerId,
      status: Constants.TransferStatus.PLAYER_PENDING,
      teamIdFrom: teamId,
      offers: {
        some: {
          status: Constants.TransferStatus.PLAYER_PENDING,
        },
      },
    },
    select: { id: true },
  });

  if (existingPendingExtension) {
    Engine.Runtime.Instance.log.debug(
      "onPlayerContractExtensionEval: pending extension offer already exists (transferId=%d).",
      existingPendingExtension.id,
    );
    return Promise.resolve();
  }

  // Pull league stats
  let kd = 0;
  let matchesPlayed = 0;
  try {
    const leagueRecent = await LeagueStats.computeLeagueLifetimeStats(teamId, playerId, 30);
    kd = leagueRecent.kdRatio ?? 0;
    matchesPlayed = leagueRecent.matchesPlayed ?? 0;
  } catch (_) {
    // If stats fail, do not offer an extension.
    return Promise.resolve();
  }

  // Team context
  const standingScore = await computeTeamStandingScore(profile);
  const formScore = await computeTeamFormScore(profile, 5);

  const S = Constants.PlayerContractSettings;

  const extMinMatches = S.EXTENSION_MIN_MATCHES ?? 7;

  // Tier-indexed extension thresholds
  const extOkKd =
    ((S.EXTENSION_PLAYER_OK_KD_BY_TIER as Record<string, number>)[tierSlug]) ?? 1.00;

  // "Good team" and "good/ok player"
  const goodTeam = formScore >= 0.5; // optionally also check standingScore >= 0.5
  const goodPlayer = matchesPlayed >= extMinMatches && kd >= extOkKd;

  // "Ok player" bucket (for the goodTeam+okPlayer case)
  // Slightly below "good", but not bench-worthy.
  const okKdFloor = extOkKd * 0.95;
  const okPlayer = matchesPlayed >= extMinMatches && kd >= okKdFloor;

  // Choose probability bucket
  let pbx = 0;

  if (goodTeam && goodPlayer) {
    pbx = S.EXTENSION_PBX_GOOD_TEAM_GOOD_PLAYER ?? 85;
  } else if (!goodTeam && goodPlayer) {
    pbx = S.EXTENSION_PBX_BAD_TEAM_GOOD_PLAYER ?? 45;
  } else if (goodTeam && okPlayer) {
    pbx = S.EXTENSION_PBX_GOOD_TEAM_OK_PLAYER ?? 55;
  } else {
    pbx = 0;
  }

  // Additional small decline chance even when conditions are good
  const declinePbx = S.EXTENSION_DECLINE_PBX_EVEN_IF_GOOD ?? 10;
  if (pbx > 0 && declinePbx > 0 && Chance.rollD2(declinePbx)) {
    Engine.Runtime.Instance.log.debug(
      "onPlayerContractExtensionEval: declined to offer despite eligibility (declinePbx=%d).",
      declinePbx,
    );
    return Promise.resolve();
  }

  if (pbx <= 0) return Promise.resolve();

  // Roll whether we offer
  pbx = Math.max(1, Math.min(95, Math.round(pbx)));
  if (!Chance.rollD2(pbx)) {
    Engine.Runtime.Instance.log.debug(
      "onPlayerContractExtensionEval: offer roll failed (pbx=%d).",
      pbx,
    );
    return Promise.resolve();
  }

  const contractYears = rollContractYears(tierSlug);
  const rawExpiry = addDays(now, 30);
  const offerExpiresAt = player.contractEnd
    ? (player.contractEnd < rawExpiry ? player.contractEnd : rawExpiry)
    : rawExpiry;

  // Create transfer-like "extension offer"
  const transfer = await prisma.transfer.create({
    data: {
      status: Constants.TransferStatus.PLAYER_PENDING,
      from: { connect: { id: teamId } },
      target: { connect: { id: playerId } },
      offers: {
        create: [
          {
            status: Constants.TransferStatus.PLAYER_PENDING,
            wages: player.wages ?? 0,
            cost: player.cost ?? 0,
            contractYears,
            expiresAt: offerExpiresAt,
          },
        ],
      },
    },
    include: Eagers.transfer.include,
  });

  await prisma.calendar.create({
    data: {
      type: Constants.CalendarEntry.TRANSFER_OFFER_EXPIRY_CHECK,
      date: offerExpiresAt.toISOString(),
      payload: String(transfer.id),
    },
  });

  // Email
  const locale = getLocale(profile);
  const persona =
    profile.team.personas.find(
      (p) =>
        p.role === Constants.PersonaRole.MANAGER ||
        p.role === Constants.PersonaRole.ASSISTANT,
    ) ?? profile.team.personas[0];

  const tierName = getTeamTierName(profile.team.tier);

  if ((locale.templates as any).ContractExtensionOffer) {
    await sendEmail(
      Sqrl.render((locale.templates as any).ContractExtensionOffer.SUBJECT, {
        profile,
        transfer,
        tierName,
      }),
      Sqrl.render((locale.templates as any).ContractExtensionOffer.CONTENT, {
        profile,
        transfer,
        daysLeft,
        contractYears,
      }),
      persona,
      now,
      true,
    );
  }

  WindowManager.sendAll(Constants.IPCRoute.TRANSFER_UPDATE);

  await scheduleOfferPauseAndExpiry(transfer.id, offerExpiresAt);
  Engine.Runtime.Instance.stop();

  Engine.Runtime.Instance.log.info(
    "Contract extension offer created: teamId=%d playerId=%d tier=%s years=%d pbx=%d kd=%.2f matches=%d form=%.2f standing=%.2f daysLeft=%d",
    teamId,
    playerId,
    tierSlug,
    contractYears,
    pbx,
    kd,
    matchesPlayed,
    formScore,
    standingScore,
    daysLeft,
  );

  return Promise.resolve();
}

function isExtensionOffer(params: {
  profile: Prisma.ProfileGetPayload<typeof Eagers.profile>;
  transfer: Prisma.TransferGetPayload<typeof Eagers.transfer>;
}) {
  const { profile, transfer } = params;

  const fromTeamId = transfer.from?.id ?? null;
  if (!fromTeamId) return false;

  // Must currently be on a team and the offer must come from that same team.
  if (!profile.teamId) return false;
  if (fromTeamId !== profile.teamId) return false;

  const playerTeamId = (profile as any)?.player?.teamId ?? null;
  if (playerTeamId != null && playerTeamId !== profile.teamId) return false;

  return true;
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

  const from = sample(teams);
  const target = profile.player;

  // Basic wages/cost – for now we just reuse whatever the player currently has.
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

// Blend helper (80% recent, 20% lifetime)
function blendFaceitMetric(recent: number, lifetime: number) {
  return recent * 0.8 + lifetime * 0.2;
}

type ContractYearWeight = { years: number; weight: number };
const ContractYearsWeights =
  UserOfferSettings.CONTRACT_YEARS_WEIGHTS as Partial<Record<TierSlug, ContractYearWeight[]>>;

function rollContractYears(tier: TierSlug): number {
  const options: ContractYearWeight[] =
    ContractYearsWeights[tier] ?? [{ years: 1, weight: 100 }];

  const pbx: Record<string, number> = {};
  options.forEach((o: ContractYearWeight, idx: number) => {
    pbx[String(idx)] = o.weight;
  });
  const pickedIdx = Number(Chance.roll(pbx));
  return options[pickedIdx]?.years ?? 1;
}

function getFaceitOfferChanceByMatchCount(matchCount: number) {
  const idx = Math.min(
    matchCount,
    UserOfferSettings.FACEIT_OFFER_PBX_BY_MATCH_INDEX.length - 1,
  );
  return UserOfferSettings.FACEIT_OFFER_PBX_BY_MATCH_INDEX[idx] ?? 0;
}

function tierFromElo(elo: number): TierSlug | null {
  if (elo < UserOfferSettings.FACEIT_ELO_THRESHOLDS.OPEN_MAX) return TierSlug.LEAGUE_OPEN;
  if (elo < UserOfferSettings.FACEIT_ELO_THRESHOLDS.INTERMEDIATE_MAX)
    return TierSlug.LEAGUE_INTERMEDIATE;

  return null;
}

export async function sendUserFaceitOffer() {
  const prisma = DatabaseClient.prisma;

  const [profile] = await prisma.profile.findMany({
    take: 1,
    include: {
      player: {
        include: {
          country: {
            include: { continent: true },
          },
        },
      },
    },
  });

  if (!profile || !profile.player) return Promise.resolve();
  if (profile.teamId != null) return Promise.resolve();

  // Pending offers cap
  const pendingCount = await prisma.transfer.count({
    where: {
      playerId: profile.playerId,
      status: Constants.TransferStatus.PLAYER_PENDING,
    },
  });

  if (pendingCount >= UserOfferSettings.TEAMLESS_MAX_PENDING_OFFERS) {
    return Promise.resolve();
  }

  const last = profile.player.lastOfferAt;
  if (last) {
    if (differenceInDays(profile.date, last) < UserOfferSettings.TEAMLESS_OFFER_COOLDOWN_DAYS) {
      return Promise.resolve();
    }
  }

  const lifetime = await computeLifetimeStats(profile.id, profile.playerId);
  const recent20 = await computeLifetimeStats(profile.id, profile.playerId, 20);

  const lifetimeMatches = lifetime.matchesPlayed ?? 0;
  const recentMatches = recent20.matchesPlayed ?? 0;
  const matchCount = Math.max(lifetimeMatches, recentMatches);

  if (matchCount < UserOfferSettings.FACEIT_MIN_MATCHES_BEFORE_OFFERS) {
    return Promise.resolve();
  }

  // Ramp in the first window (3–10). After that still allow offers but much rarer
  const maxWindow = UserOfferSettings.FACEIT_MAX_MATCHES_FIRST_WINDOW;

  const pbxBase = getFaceitOfferChanceByMatchCount(Math.min(matchCount, maxWindow));

  const lifetimeKd = lifetime.kdRatio ?? 1;
  const recentKd = recent20.kdRatio ?? 1;
  const kd = blendFaceitMetric(recentKd, lifetimeKd);

  const lifetimeWinratePct = lifetime.winRate ?? 50;
  const recentWinratePct = recent20.winRate ?? 50;
  const winratePct = blendFaceitMetric(recentWinratePct, lifetimeWinratePct);
  const winrate = winratePct / 100;

  const perfMult = Math.max(
    0.85,
    Math.min(1.30, 1 + (kd - 1) * 0.15 + (winrate - 0.5) * 0.2),
  );
  let pbx = Math.round(pbxBase * perfMult);

  if (matchCount > maxWindow) {
    pbx = Math.round(pbx * 0.10);
  }

  // Clamp to sane bounds
  pbx = Math.max(1, Math.min(95, pbx));

  const elo = profile.faceitElo ?? 0;
  const targetTier = tierFromElo(elo);
  if (!targetTier) return Promise.resolve();

  const isHotProspect =
    matchCount >= 25 &&
    kd >= 2.0 &&
    elo >= 1800 &&
    targetTier === TierSlug.LEAGUE_OPEN;

  if (isHotProspect) {
    pbx = Math.max(pbx, 90); // boost strongly
  }

  if (!Chance.rollD2(pbx)) {
    return Promise.resolve();
  }

  if (!UserOfferSettings.FACEIT_ELIGIBLE_DIVISIONS.includes(targetTier)) return Promise.resolve();

  // Federation restriction (own federation)
  const userFedId = profile.player.country?.continent?.federationId ?? null;

  const prestigeIdx = Constants.Prestige.findIndex((p) => p === targetTier);

  const teams = await prisma.team.findMany({
    where: {
      tier: prestigeIdx,
      profile: null,
      ...(userFedId
        ? { country: { continent: { federationId: userFedId } } }
        : {}),
    },
    include: { personas: true },
  });

  if (!teams.length) return Promise.resolve();

  let pool = teams;

  if (isHotProspect) {
    const sorted = [...teams].sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0));
    const topCount = Math.max(3, Math.floor(sorted.length * 0.2)); // top 20%, min 3
    pool = sorted.slice(0, topCount);
  }

  const from = sample(pool);
  if (!from) return Promise.resolve();

  const contractYears = rollContractYears(targetTier);

  // Create transfer + offer
  const target = profile.player;
  const wages = target.wages ?? 0;
  const cost = target.cost ?? 0;
  const offerExpiresAt = addDays(profile.date, 7);

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
            contractYears,
            expiresAt: offerExpiresAt,
          },
        ],
      },
    },
    include: Eagers.transfer.include,
  });

  await prisma.calendar.create({
    data: {
      type: Constants.CalendarEntry.TRANSFER_OFFER_EXPIRY_CHECK,
      date: offerExpiresAt.toISOString(),
      payload: String(transfer.id),
    },
  });

  await prisma.player.update({
    where: { id: profile.playerId! },
    data: { lastOfferAt: profile.date },
  });

  const locale = getLocale(profile);

  const persona =
    from.personas.find(
      (p) =>
        p.role === Constants.PersonaRole.MANAGER ||
        p.role === Constants.PersonaRole.ASSISTANT,
    ) ?? from.personas[0];
  const fromTierName = getTeamTierName(transfer.from?.tier);

  await sendEmail(
    Sqrl.render(locale.templates.OfferIncoming.SUBJECT, { transfer, profile }),
    Sqrl.render(locale.templates.OfferIncoming.CONTENT, { transfer, profile, fromTierName }),
    persona,
    profile.date,
    true,
  );

  WindowManager.sendAll(Constants.IPCRoute.TRANSFER_UPDATE);

  await scheduleOfferPauseAndExpiry(transfer.id, offerExpiresAt);
  Engine.Runtime.Instance.stop();

  Engine.Runtime.Instance.log.info(
    "%s sent FACEIT-based offer to %s (tier=%s, years=%d, pbx=%d)",
    from.name,
    target.name,
    targetTier,
    contractYears,
    pbx,
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

async function incrementAgesSeasonal() {
  const res = await DatabaseClient.prisma.player.updateMany({
    where: { age: { not: null } },
    data: { age: { increment: 1 } },
  });

  Engine.Runtime.Instance.log.info("Season start: incremented age for %d players.", res.count);
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
    .then(incrementAgesSeasonal)
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

  await XpEconomy.applyMatchXpFromSim({
    matchId: match.id,
    homeTeam: home.team,
    awayTeam: away.team,
    simulationResult,
    allowDraw: simulator.allowDraw,
    profile: entry.type === Constants.CalendarEntry.MATCHDAY_USER
      ? { teamId: simulator.userTeamId, playerId: simulator.userPlayerId }
      : undefined,
  });

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

  await closeOpenCareerStints(DatabaseClient.prisma, player.id, today);

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

export async function onTransferOfferExpiryCheck(entry: Calendar) {
  const prisma = DatabaseClient.prisma;

  const profile = await prisma.profile.findFirst(Eagers.profile);
  if (!profile) return Promise.resolve();

  const now = profile.date;
  const transferId = Number(entry.payload || 0);
  if (!transferId) return Promise.resolve();

  const transfer = await prisma.transfer.findFirst({
    where: { id: transferId },
    include: {
      ...Eagers.transfer.include,
      offers: { orderBy: { id: "desc" } },
      from: { include: { personas: true } },
    },
  });
  if (!transfer) return Promise.resolve();

  // Only handle user-targeted pending transfers
  if (transfer.playerId !== profile.playerId) return Promise.resolve();
  if (transfer.status !== Constants.TransferStatus.PLAYER_PENDING) return Promise.resolve();

  const pendingOffer = transfer.offers.find(
    (o) => o.status === Constants.TransferStatus.PLAYER_PENDING
  );
  if (!pendingOffer?.expiresAt) return Promise.resolve();

  const daysLeft = differenceInDays(pendingOffer.expiresAt, now);

  if (daysLeft > 1) return Promise.resolve();

  // Exactly 1 day before expiry: pause the calendar loop
  if (daysLeft === 1) {
    Engine.Runtime.Instance.stop();
    return Promise.resolve();
  }

  const isExtension = profile.teamId != null && transfer.from?.id === profile.teamId;

  await prisma.$transaction(async (tx) => {
    await tx.offer.updateMany({
      where: {
        id: pendingOffer.id,
        status: Constants.TransferStatus.PLAYER_PENDING,
      },
      data: { status: Constants.TransferStatus.EXPIRED },
    });

    await tx.transfer.updateMany({
      where: {
        id: transfer.id,
        status: Constants.TransferStatus.PLAYER_PENDING,
      },
      data: { status: Constants.TransferStatus.EXPIRED },
    });
  });

  const locale = getLocale(profile);

  const persona =
    transfer.from?.personas?.find(
      (p) =>
        p.role === Constants.PersonaRole.MANAGER ||
        p.role === Constants.PersonaRole.ASSISTANT
    ) ?? transfer.from?.personas?.[0];

  if (persona) {
    const subject = isExtension
      ? Sqrl.render((locale.templates as any).ContractExtensionOffer.SUBJECT, { profile, transfer })
      : Sqrl.render(locale.templates.OfferIncoming.SUBJECT, { profile, transfer });

    const content = isExtension
      ? Sqrl.render((locale.templates as any).ContractExtensionExpired.CONTENT, { profile, transfer })
      : Sqrl.render((locale.templates as any).OfferExpiredUser.CONTENT, { profile, transfer });

    await sendEmail(subject, content, persona, now, true);
  }

  WindowManager.sendAll(Constants.IPCRoute.TRANSFER_UPDATE);
  return Promise.resolve();
}

async function scheduleOfferPauseAndExpiry(transferId: number, expiresAt: Date) {
  const prisma = DatabaseClient.prisma;

  const type = Constants.CalendarEntry.TRANSFER_OFFER_EXPIRY_CHECK;
  const payload = String(transferId);

  const pauseAt = addDays(expiresAt, -1);

  await prisma.calendar.upsert({
    where: {
      date_type_payload: {
        date: pauseAt.toISOString(),
        type,
        payload,
      },
    },
    update: {},
    create: {
      date: pauseAt.toISOString(),
      type,
      payload,
    },
  });

  await prisma.calendar.upsert({
    where: {
      date_type_payload: {
        date: expiresAt.toISOString(),
        type,
        payload,
      },
    },
    update: {},
    create: {
      date: expiresAt.toISOString(),
      type,
      payload,
    },
  });
}
