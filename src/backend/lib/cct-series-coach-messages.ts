import { FederationSlug, TierSlug } from '@liga/shared';
import { CCT_SERIES_COACH_MESSAGES } from './cct-series-coach-message-data';

export type CctSeriesRegion = 'Europe' | 'Americas' | 'Asia' | 'Oceania';
export type CctSeriesCoachOutcome =
  | 'start'
  | 'swiss_eliminated'
  | 'group_eliminated'
  | 'playoff_qualified'
  | 'quarterfinal_loss'
  | 'semifinal_loss'
  | 'final_loss'
  | 'champion';
type CoachTier = TierSlug.LEAGUE_OPEN | TierSlug.LEAGUE_INTERMEDIATE | TierSlug.LEAGUE_MAIN;

const OCEANIA_MESSAGES = {
  start: {
    [TierSlug.LEAGUE_OPEN]:
      "We've got the CCT Series coming up tomorrow, and I'm really looking forward to seeing how we measure up against some of the stronger teams in our region. Reaching the playoffs would be a fantastic achievement for us, especially considering most of the teams come from Advanced. There's only one spot at the Global Finals, so qualifying would be something truly special. For now, let's enjoy the competition, play without pressure and see how far we can get!",
    [TierSlug.LEAGUE_ADVANCED]:
      "Our CCT Series campaign gets underway tomorrow, and I believe we've got a good opportunity to qualify for an international LAN. With only the winner advancing to the Global Finals, we'll need to maintain a high standard throughout the tournament. Opportunities to compete internationally don't come around too often for us, so I want everyone to approach this tournament with real ambition. I believe we have the quality to win it. Let's give ourselves every chance of making that happen.",
  },
  group_eliminated: {
    [TierSlug.LEAGUE_OPEN]:
      "It's a shame we couldn't make it through to the playoffs, but we knew competing against some of the best Advanced teams in our region would be challenging. These matches have given us some valuable experience and a better understanding of where we need to improve. Keep your head up and let's continue working on our development.",
    [TierSlug.LEAGUE_ADVANCED]:
      "I'm disappointed that our CCT Series campaign has ended in the group stage. I genuinely believed we had the quality to challenge for the title, and missing out on an opportunity to compete internationally is particularly frustrating. I expected a stronger showing from us here. Let's review our performances and make sure we're better prepared when another opportunity comes around.",
  },
  playoff_qualified: {
    [TierSlug.LEAGUE_OPEN]:
      "Fantastic work reaching the playoffs! Getting through the group stage against teams from Advanced is a great achievement for us. Let's keep playing with confidence and see how much further we can go!",
    [TierSlug.LEAGUE_ADVANCED]:
      "Good work getting through the group stage. We're now two series away from securing a trip to the Global Finals. Let's maintain our focus and give ourselves every chance of winning this tournament.",
  },
  semifinal_loss: {
    [TierSlug.LEAGUE_OPEN]:
      "It's a shame we couldn't make it through to the grand final, but I'm really pleased with what we've accomplished. Reaching the semi-finals against some of the strongest teams in our region is a fantastic result for us. I hope you're taking plenty of confidence from this tournament.",
    [TierSlug.LEAGUE_ADVANCED]:
      "I'm disappointed that our run ends here. I genuinely believed we had a good chance of winning this tournament, and missing out on an opportunity to compete internationally is frustrating. We'll need to reflect on where we fell short and make sure we're ready to take advantage of the next opportunity.",
  },
  final_loss: {
    [TierSlug.LEAGUE_OPEN]:
      "I genuinely can't believe how close we came to earning ourselves a trip to an international LAN! I know losing the final hurts, but finishing second against some of the best Advanced teams in our region is an incredible achievement for us. You've exceeded my expectations considerably, and I'm really proud of what we've accomplished together.",
    [TierSlug.LEAGUE_ADVANCED]:
      "It's particularly frustrating to come within one series of qualifying for the Global Finals and fall short. Opportunities to compete internationally don't come around too often for us, and I genuinely believed we could make this one count. Nevertheless, we've had a strong tournament overall and earned ourselves some prize money. Let's take confidence from our performances and make sure we're ready to go one step further next time.",
  },
  champion: {
    [TierSlug.LEAGUE_OPEN]:
      "WE ACTUALLY WON IT! I never imagined we'd go all the way and win the entire CCT Series against teams from Advanced. This is an incredible achievement for us, and now we're heading to the Global Finals! I'm unbelievably proud of how we've performed throughout the tournament. What a fantastic moment for this team. Enjoy it, you've absolutely earned it!",
    [TierSlug.LEAGUE_ADVANCED]:
      "Fantastic work! We're CCT Series champions! I genuinely believed we had the quality to win this tournament, and I'm delighted that we've managed to deliver. Securing the trophy and earning ourselves a place at the Global Finals is a brilliant achievement for this team. Opportunities like this don't come around too often, so let's enjoy the victory and start looking forward to the challenge ahead.",
  },
} as const;

const ASIA_MESSAGES = {
  start: {
    [TierSlug.LEAGUE_OPEN]:
      "We've got the CCT Series coming up tomorrow, and I think this presents us with a great opportunity. We'll be competing against some familiar teams from Open as well as a few stronger sides from Advanced. I'd love to see us put together a good run and reach the playoffs. Qualifying for the Global Finals would be an incredible achievement for us, but there's no pressure to get there. Let's play with confidence and see how far we can go!",
    [TierSlug.LEAGUE_ADVANCED]:
      "After the disappointment of missing out on promotion to ESL Pro League, we've got a great opportunity to give ourselves something to celebrate. I consider us one of the stronger teams in this CCT Series, and our objective should be to win the tournament and secure a place at the Global Finals. Opportunities to compete internationally are particularly valuable for us, so let's approach every match seriously and make the most of this chance. I'm confident we have the quality to get there.",
  },
  swiss_eliminated: {
    [TierSlug.LEAGUE_OPEN]: {
      0: "I'm a little disappointed that we couldn't pick up a win throughout the CCT Series. I was hoping we'd make a better impression, especially against some of the teams we're familiar with from Open. Nevertheless, these tournaments are a good opportunity for us to develop. Let's look at where we can improve and keep working on our game.",
      1: "It's a shame our run ends here. I would have liked to see us pick up another win or two and give ourselves a chance of reaching the playoffs. There were some encouraging moments throughout the tournament, though, and I think there's plenty for us to build on. Keep your head up!",
      2: "It's disappointing to come within one series of reaching the playoffs and fall short. I think we've put together a respectable run, though, and shown that we're capable of competing against some good teams in our region. I'm pleased with the progress we're making, and I hope we can take that next step at our upcoming tournaments.",
    },
    [TierSlug.LEAGUE_ADVANCED]: {
      0: "I'm very disappointed with our performance throughout the CCT Series. Considering the level of competition, I expected us to be challenging for the title, not leaving without a single win. After missing out on promotion to ESL Pro League, this was a great opportunity to bounce back. We've fallen well below our standards, and we need to understand why.",
      1: "Failing to reach the playoffs is a disappointing outcome for us. I genuinely believed we had the quality to win this tournament, but our performances haven't reflected that. We've missed a valuable opportunity to compete internationally, and I expected considerably more from this team. Let's review where things went wrong and make sure we respond well.",
      2: "It's frustrating that we couldn't even make it through to the playoffs. We came into this tournament with genuine ambitions of winning it, and unfortunately, we've fallen short of those expectations. Opportunities to compete internationally are particularly valuable for us, which makes this result all the more disappointing. I know we're capable of better, and I want us to demonstrate that moving forward.",
    },
  },
  playoff_qualified: {
    [TierSlug.LEAGUE_OPEN]:
      "Great work reaching the playoffs! I'm really pleased with how we've performed throughout the Swiss stage. Let's carry that confidence into the quarterfinals and see if we can surprise a few more teams!",
    [TierSlug.LEAGUE_ADVANCED]:
      "Well done getting through the Swiss stage. Now it's time to focus on winning the tournament. I believe we have the quality to go all the way, so let's maintain our standards and make the most of this opportunity.",
  },
  quarterfinal_loss: {
    [TierSlug.LEAGUE_OPEN]:
      "It's a shame we couldn't extend our run into the semi-finals, but I'm pleased with how we've performed throughout the tournament. Reaching the playoffs was a good achievement for us, and we've shown some encouraging signs along the way. Let's take the positives from this experience and continue developing as a team.",
    [TierSlug.LEAGUE_ADVANCED]:
      "I'm disappointed that our tournament ends in the quarterfinals. Considering the level of competition, I genuinely expected us to make a much deeper run. We'd given ourselves a good opportunity to compete for the title, but unfortunately, we haven't made the most of it. We'll need to look at where we fell short today.",
  },
  semifinal_loss: {
    [TierSlug.LEAGUE_OPEN]:
      "I would have loved to see us reach the grand final, but finishing among the top four is a fantastic result for this team. We've shown that we're capable of competing against some of the stronger teams in our region, and I'm really pleased with the progress we're making. Take plenty of confidence from this run!",
    [TierSlug.LEAGUE_ADVANCED]:
      "It's frustrating to fall short of the grand final, especially given what was at stake in this tournament. I genuinely believed we had the quality to go all the way and earn ourselves an opportunity to compete internationally. We've had some good performances, but ultimately, we haven't achieved what we set out to do. I know we're capable of more.",
  },
  final_loss: {
    [TierSlug.LEAGUE_OPEN]:
      "We were just one series away from qualifying for an international LAN! I know it's disappointing to come this close and fall short, but finishing second is an outstanding achievement for us. You've exceeded my expectations, picked up some prize money and shown just how much potential there is within this team. I'm really proud of what we've accomplished together.",
    [TierSlug.LEAGUE_ADVANCED]:
      "It's incredibly frustrating to come this close to securing a trip to CITY and fall at the final hurdle. After missing out on promotion to ESL Pro League, I really wanted us to make this opportunity count. Finishing second and picking up some prize money is still a respectable result, but we all know what we were hoping to achieve. Let's take confidence from our overall performance and come back determined to win the next one.",
  },
  champion: {
    [TierSlug.LEAGUE_OPEN]:
      "WE'VE WON THE CCT SERIES! What an incredible achievement for this team. Coming into the tournament, I was hoping we could put together a good run, but winning the whole thing is beyond anything I expected from us. You've beaten some excellent teams, earned some prize money and secured a place at the Global Finals. I'm incredibly proud of what we've accomplished together. Enjoy this moment, you've absolutely earned it!",
    [TierSlug.LEAGUE_ADVANCED]:
      "Fantastic work! We're CCT Series champions! After the disappointment of missing out on ESL Pro League, this is exactly the response I wanted to see from us. We've shown our quality throughout the tournament, earned some prize money and secured ourselves a place at the Global Finals. I'm really pleased with how we've handled ourselves from start to finish. Enjoy the win, and let's start looking forward to the challenge ahead.",
  },
} as const;

const TIERS: readonly CoachTier[] = [
  TierSlug.LEAGUE_OPEN,
  TierSlug.LEAGUE_INTERMEDIATE,
  TierSlug.LEAGUE_MAIN,
];

export function getCctSeriesRegion(federationSlug: string | null | undefined): CctSeriesRegion | null {
  if (federationSlug === FederationSlug.ESPORTS_EUROPA) return 'Europe';
  if (federationSlug === FederationSlug.ESPORTS_AMERICAS) return 'Americas';
  if (federationSlug === FederationSlug.ESPORTS_ASIA) return 'Asia';
  if (federationSlug === FederationSlug.ESPORTS_OCE) return 'Oceania';
  return null;
}

export function getCctSeriesCoachMessage(params: {
  region: CctSeriesRegion;
  teamTierSlug: string | null | undefined;
  outcome: CctSeriesCoachOutcome;
  wins?: number | null;
  city?: string | null;
}) {
  if (params.region === 'Asia') {
    if (
      params.teamTierSlug !== TierSlug.LEAGUE_OPEN &&
      params.teamTierSlug !== TierSlug.LEAGUE_ADVANCED
    ) {
      return null;
    }
    if (params.outcome === 'group_eliminated') return null;
    if (params.outcome === 'swiss_eliminated') {
      return ASIA_MESSAGES.swiss_eliminated[params.teamTierSlug][
        Math.min(Math.max(params.wins ?? 0, 0), 2) as 0 | 1 | 2
      ];
    }
    return ASIA_MESSAGES[params.outcome][params.teamTierSlug]
      .split('CITY')
      .join(params.city || 'the CCT Global Finals host city');
  }
  if (params.region === 'Oceania') {
    if (
      params.teamTierSlug !== TierSlug.LEAGUE_OPEN &&
      params.teamTierSlug !== TierSlug.LEAGUE_ADVANCED
    ) {
      return null;
    }
    if (params.outcome === 'swiss_eliminated' || params.outcome === 'quarterfinal_loss') return null;
    const messages = OCEANIA_MESSAGES[params.outcome];
    return messages[params.teamTierSlug];
  }
  if (!TIERS.includes(params.teamTierSlug as CoachTier)) return null;
  if (params.outcome === 'group_eliminated') return null;
  let message: string | undefined;
  if (params.outcome === 'swiss_eliminated') {
    const messages = CCT_SERIES_COACH_MESSAGES.swiss_eliminated as unknown as Record<
      CctSeriesRegion,
      Partial<Record<CoachTier, Partial<Record<number, string>>>>
    >;
    message =
      messages[params.region][params.teamTierSlug as CoachTier]?.[
        Math.min(Math.max(params.wins ?? 0, 0), 2)
      ];
  } else {
    const messages = CCT_SERIES_COACH_MESSAGES[params.outcome] as Record<
      CctSeriesRegion,
      Partial<Record<CoachTier, string>>
    >;
    message = messages[params.region][params.teamTierSlug as CoachTier];
  }
  return message?.split('CITY').join(params.city || 'the CCT Global Finals host city') ?? null;
}

export function getCctSeriesSwissOutcome(params: {
  wins?: number | null;
  losses?: number | null;
  lostThisBatch: boolean;
}): Extract<CctSeriesCoachOutcome, 'swiss_eliminated' | 'playoff_qualified'> | null {
  if ((params.wins ?? 0) >= 3) return 'playoff_qualified';
  if (params.lostThisBatch && (params.losses ?? 0) >= 3) return 'swiss_eliminated';
  return null;
}

export function getCctOceaniaGroupOutcome(params: {
  wins?: number | null;
  losses?: number | null;
  lostThisBatch: boolean;
}): Extract<CctSeriesCoachOutcome, 'group_eliminated' | 'playoff_qualified'> | null {
  if ((params.wins ?? 0) >= 2) return 'playoff_qualified';
  if (params.lostThisBatch && (params.losses ?? 0) >= 2) return 'group_eliminated';
  return null;
}

export function getCctSeriesCoachSubject(params: { region: CctSeriesRegion; season: number }) {
  return `${params.region} CCT Series — Season ${params.season}`;
}
