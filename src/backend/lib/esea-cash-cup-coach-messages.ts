import { FederationSlug, TierSlug } from '@liga/shared';

export type EseaCashCupCoachOutcome = 'start' | 'eliminated' | 'winner';

const OPEN_MESSAGES: Readonly<Record<EseaCashCupCoachOutcome, string>> = {
  start:
    "The ESEA Cash Cup gets underway tomorrow. It'll be a good opportunity for us to get some additional match experience outside of our league games. Let's enjoy the competition and see how far we can get!",
  eliminated:
    "It's a shame our Cash Cup run has come to an end, but it was a good opportunity to get some additional match experience. We've got the IEM Krakow Qualifier coming up on October 21st, so let's turn our attention towards that and see what we can achieve there.",
  winner:
    "Fantastic work! Winning the Cash Cup is a really nice achievement for a team at our level, and picking up some prize money makes it even sweeter. I'm really pleased with how we've performed. Let's enjoy the win and carry this confidence into the IEM Krakow Qualifier on October 21st!",
};

const UPPER_TIER_MESSAGES: Readonly<Record<EseaCashCupCoachOutcome, string>> = {
  start:
    "We've got the ESEA Cash Cup coming up tomorrow. I think we have a good chance of putting together a decent run, and I'd love to see us challenge for some prize money. Let's approach it with confidence and make the most of the opportunity.",
  eliminated:
    "That was an unfortunate match, but it's not a result we need to dwell on. We've got a more important opportunity ahead of us with the IEM Krakow Qualifier starting on October 21st. Let's use the time between now and then to prepare ourselves and make sure we're ready for the challenge.",
  winner:
    "Well done on winning the Cash Cup! It's always nice to come away with some prize money, and I'm pleased we've made the most of this opportunity. Let's build on these performances and carry our momentum into the IEM Krakow Qualifier on October 21st.",
};

export function getEseaCashCupCoachMessage(params: {
  federationSlug: string | null | undefined;
  teamTierSlug: string | null | undefined;
  outcome: EseaCashCupCoachOutcome;
}) {
  if (params.teamTierSlug === TierSlug.LEAGUE_OPEN) {
    return OPEN_MESSAGES[params.outcome];
  }

  const isEuropeOrAmericas = [
    FederationSlug.ESPORTS_EUROPA,
    FederationSlug.ESPORTS_AMERICAS,
  ].includes(params.federationSlug as FederationSlug);
  const supportedUpperTier = isEuropeOrAmericas
    ? TierSlug.LEAGUE_INTERMEDIATE
    : TierSlug.LEAGUE_ADVANCED;

  return params.teamTierSlug === supportedUpperTier ? UPPER_TIER_MESSAGES[params.outcome] : null;
}

export function getEseaCashCupCoachSubject(params: {
  federationSlug: string | null | undefined;
  season: number;
}) {
  const region =
    params.federationSlug === FederationSlug.ESPORTS_EUROPA
      ? 'Europe'
      : params.federationSlug === FederationSlug.ESPORTS_AMERICAS
        ? 'Americas'
        : params.federationSlug === FederationSlug.ESPORTS_ASIA
          ? 'Asia'
          : params.federationSlug === FederationSlug.ESPORTS_OCE
            ? 'Oceania'
            : null;
  return region ? `${region} ESEA Cash Cup — Season ${params.season}` : null;
}
