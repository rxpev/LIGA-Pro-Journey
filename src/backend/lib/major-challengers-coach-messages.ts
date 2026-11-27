import { FederationSlug, TierSlug } from '@liga/shared';
import {
  MAJOR_CHALLENGERS_ELIMINATION_MESSAGES,
  MAJOR_CHALLENGERS_QUALIFIED_MESSAGES,
} from './major-challengers-coach-message-outcomes';

export type MajorChallengersRegion = 'Europe' | 'Americas' | 'Asia' | 'Oceania';
export type MajorChallengersCoachOutcome = 'start' | 'qualified' | 'eliminated';

type ChallengersStanding = {
  wins?: number | null;
  losses?: number | null;
};

type CoachTier =
  | TierSlug.LEAGUE_OPEN
  | TierSlug.LEAGUE_INTERMEDIATE
  | TierSlug.LEAGUE_MAIN
  | TierSlug.LEAGUE_ADVANCED
  | TierSlug.LEAGUE_PRO;

const ALL_COACH_TIERS: readonly CoachTier[] = [
  TierSlug.LEAGUE_OPEN,
  TierSlug.LEAGUE_INTERMEDIATE,
  TierSlug.LEAGUE_MAIN,
  TierSlug.LEAGUE_ADVANCED,
  TierSlug.LEAGUE_PRO,
];

const MESSAGES: Readonly<
  Record<MajorChallengersRegion, Partial<Record<CoachTier, string>>>
> = {
  Europe: {
    [TierSlug.LEAGUE_OPEN]:
      "It's still difficult to believe that we're here in CITY competing at a Major. Everything we've accomplished to get here has gone far beyond what I could have imagined for this team. I don't want you to feel any pressure to achieve a particular result throughout this stage. Enjoy the occasion, take in the atmosphere and play with the same confidence that got us here. Whatever happens, you've already made me incredibly proud.",
    [TierSlug.LEAGUE_INTERMEDIATE]:
      "We've earned the opportunity to compete on the biggest stage in Counter-Strike, and that's something I want you to fully embrace. We're going to face some incredibly talented teams, but we've already shown throughout our qualifying campaign that we're capable of surprising people. There's no expectation on us to reach the Legends Stage. I'd love to see us pick up a win or two and make this an experience we'll remember for a long time.",
    [TierSlug.LEAGUE_MAIN]:
      "We've done exceptionally well to get here, but I don't want us to arrive in CITY feeling that our journey is already complete. I believe we're capable of competing against some of the teams in this stage, and a few strong performances could put us in a very interesting position. Reaching the Legends Stage would be a fantastic achievement. Let's take each match as it comes and give ourselves every opportunity to get there.",
    [TierSlug.LEAGUE_ADVANCED]:
      "I believe we have a genuine opportunity to progress through the Challengers Stage. We've already demonstrated our ability to compete against strong European opposition, and there's no reason why we can't carry that level of performance into the Major. We'll need to be consistent, disciplined and composed throughout the Swiss stage. Have confidence in yourself and the work we've put in. I want us to leave this stage having secured a place among the final sixteen.",
    [TierSlug.LEAGUE_PRO]:
      "Our first objective here in CITY is to secure our place in the Legends Stage. I'm confident we have the quality and experience to achieve that, and I expect us to approach every match with the appropriate level of professionalism. The Swiss format can be unforgiving if we allow our standards to drop, so it's important that we're sharp from the outset. Our ambitions for this Major extend well beyond the Challengers Stage.",
  },
  Americas: {
    [TierSlug.LEAGUE_OPEN]:
      "Take a moment to appreciate where we are. We're actually competing at a Major, representing our region alongside some of the best players in the world. I couldn't have asked for anything more from you throughout this campaign. Whatever results we manage to achieve here will be a bonus. Play without fear, enjoy every opportunity you get on the server and make the most of this incredible experience.",
    [TierSlug.LEAGUE_INTERMEDIATE]:
      "Making it all the way to CITY is an achievement that everyone within this team should be immensely proud of. We're going to be tested against a level of competition we rarely encounter, and I'm excited to see how we respond to that challenge. I'd love for us to get a result here and show that we haven't qualified by coincidence. Stay confident and don't allow the occasion to affect your game.",
    [TierSlug.LEAGUE_MAIN]:
      "Coming into this Major, I think we have an opportunity to surprise a few teams. The international competition will be considerably stronger than what we're accustomed to, but I believe we have enough quality to make ourselves competitive. I'd like us to pick up some wins and see whether we can put ourselves in contention for the Legends Stage. Trust your abilities and don't give our opponents more respect than they deserve.",
    [TierSlug.LEAGUE_ADVANCED]:
      "We've come here to CITY with the intention of making a meaningful impact at this Major. Reaching the Legends Stage will be a difficult challenge, particularly against some of the stronger international teams, but I don't consider it beyond our capabilities. We'll need to make the most of our opportunities and maintain a high level of performance throughout the stage. I believe in this roster, and I want us to demonstrate why we've earned our place here.",
    [TierSlug.LEAGUE_PRO]:
      "Qualifying for the Legends Stage is the objective I've set for us heading into this tournament. We know the standard of international competition we're going to face, and we'll need to be at our best to achieve what we came here to do. I have confidence in our ability to get through this stage, provided we remain disciplined and execute what we've prepared. Let's give our region something to be proud of.",
  },
  Asia: {
    [TierSlug.LEAGUE_OPEN]:
      "I never imagined we'd find ourselves here in CITY representing our region at a Major. To have come this far together is an absolutely incredible achievement, and I want you to enjoy everything that comes with it. We're going to be playing against teams and individuals we've previously only had the opportunity to watch. Don't worry about expectations or results. Go out there, play your game and make some memories.",
    [TierSlug.LEAGUE_ADVANCED]:
      "We've earned the opportunity to represent our region against some of the strongest international competition in Counter-Strike. I know how difficult the Challengers Stage is going to be for us, but I'm excited to see how we measure up against these teams. I'd like us to pick up a few results and demonstrate the quality of Counter-Strike our region has to offer. Progressing to the Legends Stage would be a remarkable achievement, and we shouldn't rule ourselves out before we've even played.",
    [TierSlug.LEAGUE_PRO]:
      "We've come here to CITY as one of the leading teams in our region, and I want our performances to reflect that. I believe we have the individual quality to compete against some of the stronger international teams, although reaching the Legends Stage will require a consistently high level of performance from everyone. Getting through this stage is the objective I've set for us. Let's show the international scene how far Asian Counter-Strike has come.",
  },
  Oceania: {
    [TierSlug.LEAGUE_OPEN]:
      "From competing at the Open level back home to standing here in CITY at a Major, what an incredible journey this has been. I hope you realise just how special an opportunity you've earned for yourself. There are absolutely no expectations on us regarding results at this tournament. I simply want you to enjoy playing against the best, learn as much as you can and give yourself an experience you'll never forget.",
    [TierSlug.LEAGUE_ADVANCED]:
      "I'm incredibly pleased that we've made it here to represent Oceania on the biggest stage in Counter-Strike. We don't often get the opportunity to test ourselves against international competition of this calibre, and I want us to make the most of it. Reaching the Legends Stage would be an exceptional achievement, but I'm not going to measure our success solely by whether we get there. Let's make ourselves difficult to play against, give every opponent a proper challenge and show that we deserve our place at this Major.",
    [TierSlug.LEAGUE_PRO]:
      "I'm delighted that we're here in CITY representing Oceania, but I don't want us to be satisfied with simply attending the Major. I know how challenging international competition can be for teams from our region, but I genuinely believe we have the experience and quality to challenge for a place in the Legends Stage. We'll need to make the most of every opportunity the Swiss format presents us with. Stay composed, trust your teammates and let's show everyone what we're capable of.",
  },
};

function isCoachTier(value: string | null | undefined): value is CoachTier {
  return ALL_COACH_TIERS.includes(value as CoachTier);
}

export function getMajorChallengersRegion(
  federationSlug: string | null | undefined,
): MajorChallengersRegion | null {
  switch (federationSlug) {
    case FederationSlug.ESPORTS_EUROPA:
      return 'Europe';
    case FederationSlug.ESPORTS_AMERICAS:
      return 'Americas';
    case FederationSlug.ESPORTS_ASIA:
      return 'Asia';
    case FederationSlug.ESPORTS_OCE:
      return 'Oceania';
    default:
      return null;
  }
}

export function getMajorChallengersCoachMessage(params: {
  region: MajorChallengersRegion;
  teamTierSlug: string | null | undefined;
  city?: string | null;
}) {
  if (!isCoachTier(params.teamTierSlug)) return null;
  const message = MESSAGES[params.region][params.teamTierSlug];
  return message?.split('CITY').join(params.city || 'the Major host city') ?? null;
}

export function getMajorChallengersCoachOutcome(params: {
  standing: ChallengersStanding | null | undefined;
  lostThisBatch: boolean;
}): Exclude<MajorChallengersCoachOutcome, 'start'> | null {
  if (!params.standing) return null;
  if ((params.standing.wins ?? 0) >= 3) return 'qualified';
  if (params.lostThisBatch && (params.standing.losses ?? 0) >= 3) return 'eliminated';
  return null;
}

export function getMajorChallengersCoachOutcomeMessage(params: {
  region: MajorChallengersRegion;
  teamTierSlug: string | null | undefined;
  outcome: Exclude<MajorChallengersCoachOutcome, 'start'>;
  wins?: number | null;
}) {
  if (!isCoachTier(params.teamTierSlug)) return null;
  if (params.outcome === 'qualified') {
    return MAJOR_CHALLENGERS_QUALIFIED_MESSAGES[params.region][params.teamTierSlug] ?? null;
  }
  return (
    MAJOR_CHALLENGERS_ELIMINATION_MESSAGES[params.region][params.teamTierSlug]?.[
      Math.min(Math.max(params.wins ?? 0, 0), 2)
    ] ?? null
  );
}

export function getMajorChallengersCoachSubject(season: number) {
  return `Major Challengers Stage — Season ${season}`;
}
