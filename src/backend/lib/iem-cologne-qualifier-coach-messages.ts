import { FederationSlug, TierSlug } from '@liga/shared';

export type IemCologneQualifierCoachOutcome = 'start' | 'eliminated' | 'winner';

type CoachTier =
  | TierSlug.LEAGUE_OPEN
  | TierSlug.LEAGUE_INTERMEDIATE
  | TierSlug.LEAGUE_MAIN
  | TierSlug.LEAGUE_ADVANCED
  | TierSlug.LEAGUE_PRO;

const MESSAGES: Readonly<Record<CoachTier, Readonly<Record<IemCologneQualifierCoachOutcome, string>>>> = {
  [TierSlug.LEAGUE_OPEN]: {
    start:
      "The IEM Cologne Open Qualifier is coming up tomorrow. With only one spot available, qualifying would be an extraordinary achievement for a team at our level. I don't want you to put any pressure on yourself regarding the result. Let's enjoy the competition, test ourselves against some stronger teams and see how far we can get.",
    eliminated:
      "It's a shame our run in the IEM Cologne Qualifier has come to an end, but we knew how difficult securing that one spot would be. Competing against teams at a higher level is always a valuable experience for us. I hope you've taken something positive from it, and let's keep working on our development.",
    winner:
      "WE'RE GOING TO COLOGNE! I genuinely can't believe what we've just accomplished. With only one spot available in the entire qualifier, I never imagined we'd be the team to secure it. You're going to have the opportunity to compete at one of the most prestigious tournaments in Counter-Strike. I'm incredibly proud of you and the rest of the team. Whatever happens in Cologne, we've already achieved something extraordinary!",
  },
  [TierSlug.LEAGUE_INTERMEDIATE]: {
    start:
      "We've got the IEM Cologne Open Qualifier tomorrow, and I'm looking forward to seeing what we can achieve. With only one team making it to Cologne, we know how difficult qualifying will be. Nevertheless, I'd love to see us put together a decent run and surprise a few of the stronger teams along the way. Play with confidence and make the most of the opportunity.",
    eliminated:
      "Unfortunately, we won't be making the trip to Cologne. With only one spot available, qualifying was always going to be a difficult task for a team at our level. I'd have loved to see us go a little further, but there's no reason to be discouraged. Let's take what we've learned from this qualifier and build on it.",
    winner:
      "What an incredible achievement! To come through a qualifier with only one spot available and secure our place at IEM Cologne is absolutely remarkable for a team at our level. You've exceeded my expectations considerably, and I'm incredibly excited to see how we measure up against the teams awaiting us in Cologne. Enjoy this moment with your teammates. You've more than earned it!",
  },
  [TierSlug.LEAGUE_MAIN]: {
    start:
      "Tomorrow's IEM Cologne Open Qualifier presents us with a good opportunity to measure ourselves against some strong opposition. Securing the only available spot will be extremely difficult, but I believe we're capable of making a respectable run through the bracket. Let's approach every match seriously, play to our strengths and see whether we can put ourselves in contention.",
    eliminated:
      "It's disappointing that our run in the qualifier ends here. I believed we had the potential to make a good impression, even if securing the only available spot was always going to be a considerable challenge. We need to use opportunities like these to understand where we stand against stronger opposition and identify what we can improve.",
    winner:
      "Absolutely fantastic work throughout the qualifier! I believed we could put together a strong run, but securing the only available spot is an exceptional achievement for this team. We're going to IEM Cologne! I'm extremely pleased with the level we've demonstrated, and I'm looking forward to seeing how we handle the challenge of competing against some of the world's best teams.",
  },
  [TierSlug.LEAGUE_ADVANCED]: {
    start:
      "We've got an exciting opportunity ahead of us with tomorrow's IEM Cologne Open Qualifier. I know securing the only available spot is an ambitious objective, but I believe we have enough quality within this team to make a genuine push for it. We'll need to be consistent throughout the qualifier and make the most of every opportunity. Trust our preparation and don't underestimate what we're capable of achieving.",
    eliminated:
      "I'm disappointed that we couldn't secure a place at IEM Cologne. I knew winning the qualifier would be a difficult task, but I genuinely believed we had the quality to challenge for that spot. Unfortunately, we haven't managed to make the most of this opportunity. Let's review our performances and make sure we're better equipped when the next qualifier comes around.",
    winner:
      "Congratulations on a fantastic performance throughout the qualifier! With only one spot available, we knew we'd have to be at our best, and I'm delighted that we've managed to deliver. Qualifying for IEM Cologne is a significant achievement for this team and a great indication of the progress we're making. Let's enjoy the result and make sure we're well prepared to give the top teams a proper challenge when we get there.",
  },
  [TierSlug.LEAGUE_PRO]: {
    start:
      "Our focus tomorrow is on securing a place at IEM Cologne. With only one qualification spot available, we know there's very little room for error, and we're likely to face some strong competition along the way. Nevertheless, I consider us capable of winning this qualifier, and I expect everyone to approach it with that intention. Stay disciplined, maintain our usual standards and let's give ourselves every chance of making it to Cologne.",
    eliminated:
      "It's frustrating to miss out on IEM Cologne. I was fully aware of how competitive this qualifier would be with only one spot available, but I believed we had the quality and experience to come out on top. We'll need to reflect on where we fell short and make sure we're ready to capitalise on our next opportunity.",
    winner:
      "Excellent work securing our place at IEM Cologne. Getting through a qualifier with only one available spot is never something to take for granted, and I'm particularly pleased with how we've handled the pressure throughout. Cologne is one of the most prestigious events on the calendar, and I'm excited that we'll be competing there. Let's turn our attention towards preparing for the tournament and give ourselves the best possible chance of making a deep run.",
  },
};

export function getIemCologneQualifierCoachMessage(params: {
  teamTierSlug: string | null | undefined;
  outcome: IemCologneQualifierCoachOutcome;
}) {
  return MESSAGES[params.teamTierSlug as CoachTier]?.[params.outcome] ?? null;
}

export function getIemCologneQualifierCoachSubject(params: {
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
  return region ? `${region} IEM Cologne Open Qualifier — Season ${params.season}` : null;
}
