import { FederationSlug, TierSlug } from '@liga/shared';

export type IemKrakowQualifierCoachOutcome = 'start' | 'eliminated' | 'winner';

type CoachTier =
  | TierSlug.LEAGUE_OPEN
  | TierSlug.LEAGUE_INTERMEDIATE
  | TierSlug.LEAGUE_MAIN
  | TierSlug.LEAGUE_ADVANCED
  | TierSlug.LEAGUE_PRO;

const MESSAGES: Readonly<Record<CoachTier, Readonly<Record<IemKrakowQualifierCoachOutcome, string>>>> = {
  [TierSlug.LEAGUE_OPEN]: {
    start:
      "We've got the IEM Krakow Open Qualifier coming up tomorrow. With only one spot available, qualifying would be an incredible achievement for us, but there's absolutely no pressure to get there. I want you to enjoy the competition, gain some valuable experience and see how far we can take this.",
    eliminated:
      "Unfortunately, our run in the IEM Krakow Qualifier ends here. With only one spot available, we knew qualifying would be an incredibly difficult task for us. I hope you've enjoyed the opportunity to compete against some stronger teams and taken something valuable from the experience. Keep your head up!",
    winner:
      "WE'RE GOING TO KRAKOW! Out of all the teams competing for that one spot, we're the ones who managed to secure it. I genuinely couldn't have imagined that coming into this qualifier. You're going to be competing against some of the best players in the world at IEM Krakow! Whatever happens at the tournament itself, you've already exceeded every expectation I had of us. Absolutely incredible work!",
  },
  [TierSlug.LEAGUE_INTERMEDIATE]: {
    start:
      "Tomorrow's qualifier gives us another opportunity to test ourselves against some stronger opposition. Getting to IEM Krakow will be extremely difficult with only one spot available, but I'd love to see us put together a good run. Don't be intimidated by the teams we come up against. Play with confidence and see what we can achieve.",
    eliminated:
      "It's a shame we couldn't go a little further in the qualifier, but we always knew how difficult it would be to secure a place at IEM Krakow. These tournaments are a great opportunity for us to develop as a team. Let's take what we've learned and keep working towards becoming more competitive.",
    winner:
      "What a fantastic achievement! With only one spot available, I knew it would take something exceptional from us to qualify, and that's exactly what you've delivered. We're going to IEM Krakow! I'm incredibly proud of how we've performed throughout the qualifier, and I can't wait to see what we can achieve against international opposition. Enjoy this moment with your teammates!",
  },
  [TierSlug.LEAGUE_MAIN]: {
    start:
      "The IEM Krakow Open Qualifier gets underway tomorrow, and I'm interested to see how we measure up against the competition. With only the winner qualifying, we'll need some exceptional performances to make it through. I believe we're capable of making a deep run, though. Let's approach each match with the right mentality and give ourselves a chance to achieve something special.",
    eliminated:
      "I'm disappointed that our run in the qualifier has come to an end. I believed we were capable of making a good impression, even if winning the entire qualifier was an ambitious objective. We'll need to look at our performances and identify where we can improve against stronger opposition. I believe there's still plenty more to come from this team.",
    winner:
      "Absolutely outstanding work securing our place at IEM Krakow! I believed we were capable of making a deep run, but coming away with the only qualification spot is a remarkable achievement for this team. We've given ourselves a fantastic opportunity to compete against some of the world's best teams. I'm extremely pleased with our progress, and I'm excited to see how we handle the challenge awaiting us in Krakow.",
  },
  [TierSlug.LEAGUE_ADVANCED]: {
    start:
      "We've got a great opportunity ahead of us tomorrow. Securing the only available spot at IEM Krakow won't be easy, but I genuinely believe we have the quality to challenge for it. We'll need to be sharp from the opening match and maintain that level throughout the qualifier. Trust your teammates, stay composed and let's make a serious push for qualification.",
    eliminated:
      "It's frustrating that we couldn't secure our place at IEM Krakow. With only one spot available, we knew we'd need to perform exceptionally well throughout the qualifier, but I genuinely believed we had a chance. We'll review where things went wrong and work towards making sure we're better prepared for our next opportunity. I know we're capable of qualifying for tournaments of this calibre.",
    winner:
      "Fantastic work throughout the qualifier! I knew we had the quality to challenge for that one spot, and I'm delighted that we've managed to secure it. Qualifying for IEM Krakow is another significant step forward for this team. Let's make the most of the time we have to prepare, because I genuinely believe we can make a good impression against some of the stronger teams attending the tournament.",
  },
  [TierSlug.LEAGUE_PRO]: {
    start:
      "Our objective tomorrow is to secure our place at IEM Krakow. With only one spot available, we can't afford any lapses in concentration throughout the qualifier. I expect us to be among the teams competing for that spot, and I'm confident we have the quality to come out on top. Approach every opponent professionally, maintain our standards and let's get ourselves to Krakow.",
    eliminated:
      "I'm disappointed that we won't be competing at IEM Krakow. Despite the limited qualification spots, I expected us to make a serious challenge for a place at the tournament. We have the quality to be attending events of this calibre, and missing out is frustrating for everyone involved. We need to reflect on what prevented us from getting through and make sure we capitalise on our next opportunity.",
    winner:
      "Well done on securing our place at IEM Krakow. With only one spot available, we knew we'd need to maintain a high standard throughout the qualifier, and I'm pleased with how we've handled that pressure. These are the tournaments we want to be attending regularly. Now our focus shifts towards preparing for Krakow, where I want us to make a serious run and demonstrate what this team is capable of.",
  },
};

export function getIemKrakowQualifierCoachMessage(params: {
  teamTierSlug: string | null | undefined;
  outcome: IemKrakowQualifierCoachOutcome;
}) {
  return MESSAGES[params.teamTierSlug as CoachTier]?.[params.outcome] ?? null;
}

export function getIemKrakowQualifierCoachSubject(params: {
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
  return region ? `${region} IEM Krakow Open Qualifier — Season ${params.season}` : null;
}
