import log from 'electron-log';
import { Constants } from '@liga/shared';
import DatabaseClient from './database-client';
import { sendEmail } from './worldgen';

export const FACEIT_PLACEMENT_MESSAGE_DELAY_MS = 10_000;

export function getFaceitPlacementMessage(
  federationSlug: string,
  faceitElo: number,
  username: string,
) {
  const greeting = `Hey ${username}!`;

  if (federationSlug === Constants.FederationSlug.ESPORTS_EUROPA) {
    return faceitElo >= 2001
      ? `${greeting}

Congrats on reaching FACEIT level 10! That's a huge milestone, especially here in Europe where the competition is tough.

Teams usually want a longer run of results before they make a move, so keep performing over your next five matches and build your reputation. If you stay consistent, I'm sure it won't be long before a team reaches out!`
      : `${greeting}

I've been keeping an eye on your FACEIT progress. Keep grinding, you're getting there! Just remember, here in Europe teams won't seriously consider you until you're at least level 10, and they'll want to see that level hold up over more matches.

Keep climbing and stay consistent. I'm sure you'll get there!`;
  }

  if (federationSlug === Constants.FederationSlug.ESPORTS_AMERICAS) {
    if (faceitElo >= 2200) {
      return `${greeting}

That's an exceptional placement! You've put yourself in range of Main-level interest here in the Americas, but scouts will want a few more results before they make a move.

Keep this level up over your next three matches and you could start getting real interest!`;
    }
    if (faceitElo >= 1900) {
      return `${greeting}

Nice placement! You're already in range to attract more than just Open teams here in the Americas if your performances stay strong.

Teams will start getting a clearer picture after your next three matches, so keep grinding and show them this is your real level!`;
    }
    return `${greeting}

Your FACEIT rank is in - nice work! Here in the Americas, you don't need to reach level 10 before teams start watching. Open teams care more about the performances you put together once you're ranked.

Keep playing well over your next three matches and you could start attracting interest!`;
  }

  if (
    federationSlug === Constants.FederationSlug.ESPORTS_ASIA ||
    federationSlug === Constants.FederationSlug.ESPORTS_OCE
  ) {
    const isOce = federationSlug === Constants.FederationSlug.ESPORTS_OCE;
    const region = isOce ? 'OCE' : 'Asia';
    const remainingMatches = isOce ? 'two' : 'three';

    return faceitElo >= 2200
      ? `${greeting}

That's a massive placement! At 2200+ ELO, you've put yourself directly on the radar of Advanced teams here in ${region}.

They'll still want to see a little more match history, so keep performing over your next ${remainingMatches} matches. If you stay consistent, a serious offer could arrive quickly!`
      : `${greeting}

Your FACEIT rank is in - nice work! Here in ${region}, you don't need level 10 before teams start watching. Open teams will care most about how consistently you perform now that you're ranked.

Keep playing well over your next ${remainingMatches} matches and you could start attracting interest. If you eventually push beyond 2200 ELO, Advanced teams can enter the picture too!`;
  }

  return `${greeting}

Your FACEIT rank is in - nice work! Keep playing consistently and building your reputation now that teams can start tracking your results.

Stay focused and make every match count!`;
}

async function sendFaceitPlacementMessage(profileId: number, expectedElo: number) {
  const [profile, openingEmail] = await Promise.all([
    DatabaseClient.prisma.profile.findUnique({
      where: { id: profileId },
      include: {
        player: {
          include: {
            country: {
              include: { continent: { include: { federation: true } } },
            },
          },
        },
      },
    }),
    DatabaseClient.prisma.email.findFirst({
      where: { subject: { startsWith: 'FACEIT friend request from ' } },
      orderBy: { id: 'desc' },
      include: { from: true },
    }),
  ]);

  // The active save may have changed during the real-time delay.
  if (!profile?.player || profile.faceitElo !== expectedElo || !openingEmail) return;

  const federationSlug = profile.player.country.continent.federation.slug;
  const content = getFaceitPlacementMessage(federationSlug, profile.faceitElo, profile.player.name);

  await sendEmail(openingEmail.subject, content, openingEmail.from, profile.date);
}

export function scheduleFaceitPlacementMessage(profileId: number, placementElo: number) {
  setTimeout(() => {
    void sendFaceitPlacementMessage(profileId, placementElo).catch((error) =>
      log.error('Could not send the FACEIT placement follow-up.', error),
    );
  }, FACEIT_PLACEMENT_MESSAGE_DELAY_MS);
}
