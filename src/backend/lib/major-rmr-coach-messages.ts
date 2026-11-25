import { TierSlug } from '@liga/shared';

export type MajorRmrCoachOutcome = 'start' | 'qualified' | 'eliminated';

type CoachTier =
  | TierSlug.LEAGUE_OPEN
  | TierSlug.LEAGUE_INTERMEDIATE
  | TierSlug.LEAGUE_MAIN
  | TierSlug.LEAGUE_ADVANCED
  | TierSlug.LEAGUE_PRO;

type RmrRegion = 'Europe' | 'Americas' | 'Asia & Oceania';

export type MajorRmrConfig = {
  region: RmrRegion;
  qualificationPlaces: number;
  qualificationWins?: number;
  eliminationLosses: number;
  supportedCoachTiers: readonly CoachTier[];
};

type RmrStanding = {
  gpos?: number | null;
  pos?: number | null;
  wins?: number | null;
  losses?: number | null;
};

const ALL_COACH_TIERS: readonly CoachTier[] = [
  TierSlug.LEAGUE_OPEN,
  TierSlug.LEAGUE_INTERMEDIATE,
  TierSlug.LEAGUE_MAIN,
  TierSlug.LEAGUE_ADVANCED,
  TierSlug.LEAGUE_PRO,
];

const ASIA_OCEANIA_COACH_TIERS: readonly CoachTier[] = [
  TierSlug.LEAGUE_OPEN,
  TierSlug.LEAGUE_ADVANCED,
];

export const MAJOR_RMR_CONFIG: Readonly<Partial<Record<TierSlug, MajorRmrConfig>>> = {
  [TierSlug.MAJOR_EUROPE_RMR_A]: {
    region: 'Europe',
    qualificationPlaces: 8,
    qualificationWins: 3,
    eliminationLosses: 3,
    supportedCoachTiers: ALL_COACH_TIERS,
  },
  [TierSlug.MAJOR_EUROPE_RMR_B]: {
    region: 'Europe',
    qualificationPlaces: 8,
    qualificationWins: 3,
    eliminationLosses: 3,
    supportedCoachTiers: ALL_COACH_TIERS,
  },
  [TierSlug.MAJOR_AMERICAS_RMR]: {
    region: 'Americas',
    qualificationPlaces: 5,
    qualificationWins: 3,
    eliminationLosses: 2,
    supportedCoachTiers: ALL_COACH_TIERS,
  },
  [TierSlug.MAJOR_ASIA_RMR]: {
    region: 'Asia & Oceania',
    qualificationPlaces: 3,
    eliminationLosses: 2,
    supportedCoachTiers: ASIA_OCEANIA_COACH_TIERS,
  },
};

const START_MESSAGES: Readonly<Record<RmrRegion, Partial<Record<CoachTier, string>>>> = {
  Europe: {
    [TierSlug.LEAGUE_OPEN]:
      "It's incredible to think that we're actually here in CITY competing at an RMR. We've already achieved something far beyond what anyone expected of us, and I don't want you to feel any pressure regarding the outcome of this tournament. Enjoy the occasion, learn from the players around you and give it everything you've got. You've earned your place here just as much as anyone else.",
    [TierSlug.LEAGUE_INTERMEDIATE]:
      "I'm extremely proud that we've made it all the way to CITY. We're going to be competing against some of the best teams in the world, and that's an experience I want you to make the most of. Qualifying for the Major would be an extraordinary achievement, but our priority is to put in performances we can be proud of. Don't be afraid to challenge these teams.",
    [TierSlug.LEAGUE_MAIN]:
      "We've done exceptionally well to get ourselves here to CITY, but I'd like us to show that we're capable of competing at this level too. The opposition will be incredibly strong, and securing a Major spot is going to be a difficult task. Nevertheless, I believe we can make life difficult for some of these teams. Let's approach every match with confidence and see how far we can take this.",
    [TierSlug.LEAGUE_ADVANCED]:
      "We've come here to CITY with an opportunity to achieve something significant for this team. I'm under no illusion about the level of competition we're facing, but I believe we have the quality to be competitive throughout this tournament. Qualifying for the Major is an ambitious but worthwhile objective. Stay composed, trust our preparation and don't give our opponents any more respect than they deserve.",
    [TierSlug.LEAGUE_PRO]:
      "We've come here to CITY with one clear objective: qualifying for the Major. We know how competitive the European RMR can be, and there will be very little room for error throughout the tournament. However, I'm confident in the quality and experience we have within this team. I expect everyone to maintain our usual standards, remain composed under pressure and deliver when it matters.",
  },
  Americas: {
    [TierSlug.LEAGUE_OPEN]:
      "Look how far we've come. Being here in CITY competing for a place at the Major is something we could only have dreamed of at the beginning of our journey. Regardless of what happens throughout this tournament, I'm incredibly proud of what we've accomplished. Enjoy playing on LAN, believe in yourself and make the most of every moment.",
    [TierSlug.LEAGUE_INTERMEDIATE]:
      "Making it here to CITY is a fantastic achievement for this team. We're undoubtedly going to face some difficult opponents, but I'd love to see us surprise a few people throughout this tournament. There's no expectation on us to qualify for the Major, so don't allow the occasion to overwhelm you. Play with confidence and show everyone what you're capable of.",
    [TierSlug.LEAGUE_MAIN]:
      "I'm very pleased that we've made it here to CITY, and I don't think our journey necessarily has to end here. There are some strong teams attending this RMR, but I believe we're capable of picking up results and potentially putting ourselves in contention for a Major spot. Let's take it one match at a time and give ourselves every opportunity to achieve something special.",
    [TierSlug.LEAGUE_ADVANCED]:
      "We've come here to CITY with a genuine ambition of qualifying for the Major. I believe we have the quality to compete for one of the available spots, provided we perform consistently throughout the tournament. I want you to approach every match with that same belief. Stay disciplined, remain confident in our approach and make sure we take advantage of the opportunities presented to us.",
    [TierSlug.LEAGUE_PRO]:
      "Our purpose here in CITY is to secure our place at the Major. I consider us capable of being one of the stronger teams at this tournament, and I expect our performances to reflect that. We can't afford to become complacent or underestimate any of our opponents. Trust our preparation, maintain our standards and let's make sure we leave here having achieved our objective.",
  },
  'Asia & Oceania': {
    [TierSlug.LEAGUE_OPEN]:
      "I still find it incredible that we've made it all the way to CITY to compete at an RMR. This is a massive achievement for everyone involved, and I want you to take a moment to appreciate how far we've come. There's absolutely no pressure on you to qualify for the Major. Enjoy the occasion, play without fear and take everything you can from this experience. Anything we achieve from here is a bonus.",
    [TierSlug.LEAGUE_ADVANCED]:
      "We've made it here to CITY, and now we're within reach of something we've been working towards for a long time. Qualifying for the Major won't be easy, particularly with so few spots available, but I genuinely believe we have what it takes to compete for one of them. We'll need to be disciplined and make the most of every opportunity. Have confidence in yourself and the team. We're here to compete, not just to participate.",
  },
};

const QUALIFIED_MESSAGES: Readonly<Record<RmrRegion, Partial<Record<CoachTier, string>>>> = {
  Europe: {
    [TierSlug.LEAGUE_OPEN]:
      "I genuinely don't know where to begin. WE'RE GOING TO THE MAJOR! To make it through a European RMR at our level is absolutely incredible, and I couldn't be prouder of you and the rest of the team. Never in my wildest dreams did I imagine we'd be heading to CITY in September. Regardless of what happens from here, you've achieved something truly remarkable. Enjoy every second of this!",
    [TierSlug.LEAGUE_INTERMEDIATE]:
      "What an unbelievable achievement! We've gone up against some of the strongest competition in the world and somehow come away with a spot at the Major. You should be incredibly proud of what you've accomplished. We'll be heading to CITY in September, and I still can't quite believe I'm saying that. Take some time to celebrate with the team. You've more than earned it.",
    [TierSlug.LEAGUE_MAIN]:
      "Absolutely outstanding work throughout the RMR! I knew we had the potential to challenge some of these teams, but securing a spot at the Major is beyond what I could have reasonably expected from us. We're going to CITY! September is going to be a special month for everyone involved with this team. I'm extremely proud of the progress we've made together.",
    [TierSlug.LEAGUE_ADVANCED]:
      "Congratulations on an exceptional performance throughout the RMR. Qualifying through Europe is no small achievement, and I'm particularly pleased with how we handled the pressure against some very strong opposition. We've proven that we deserve to compete at this level. With the Major in CITY awaiting us in September, we have something very exciting to prepare for. Fantastic work!",
    [TierSlug.LEAGUE_PRO]:
      "Congratulations on securing our spot at the Major. We came into this RMR with a clear objective, and I'm very pleased with how professionally we went about achieving it. Qualifying through Europe is never something to take for granted. Enjoy the achievement, but remember that our ambitions extend beyond simply attending the Major. Let's make sure we're in the best possible shape when we arrive in CITY in September.",
  },
  Americas: {
    [TierSlug.LEAGUE_OPEN]:
      "WE DID IT! We're going to CITY in September to compete at the Major! Just thinking about how far we've come together makes this achievement even more incredible. You've accomplished something that countless players spend their entire careers dreaming about. I couldn't be happier for you and the rest of the team. Whatever happens at the Major, nobody can take this achievement away from us.",
    [TierSlug.LEAGUE_INTERMEDIATE]:
      "I hope you realise just how special an achievement this is. Coming into the RMR, I was hoping we could surprise a few people, but we've gone well beyond that. We're officially going to the Major! I can't wait to see what September has in store for us in CITY. I'm incredibly proud of everyone involved, and I hope you're just as proud of yourself.",
    [TierSlug.LEAGUE_MAIN]:
      "Fantastic work! I believed we could put ourselves in contention for a Major spot, and you've gone out there and made it happen. I'm particularly pleased with the confidence and determination we've shown throughout the tournament. We'll be competing on the biggest stage in Counter-Strike this September in CITY. That's something you should be immensely proud of.",
    [TierSlug.LEAGUE_ADVANCED]:
      "Excellent work securing our place at the Major. I came into this RMR believing we had the quality to qualify, and I'm delighted that we've been able to turn that belief into reality. This is an important milestone for us as a team, and I'm excited to see what we can achieve in CITY. We have until September to prepare ourselves for an even greater challenge. Enjoy the moment, you've earned it.",
    [TierSlug.LEAGUE_PRO]:
      "Well done on getting the job done. Qualifying for the Major was our objective coming into this tournament, and I'm pleased we've delivered on that expectation. We can now turn our attention towards CITY in September, where I want us to make a real impact. Take some satisfaction from what we've achieved here, but there's still a lot more I believe we can accomplish together.",
  },
  'Asia & Oceania': {
    [TierSlug.LEAGUE_OPEN]:
      "I can hardly believe what we've just accomplished. We're actually going to the Major! From competing at the Open level to representing our region on the biggest stage in Counter-Strike, this is an absolutely incredible journey. CITY in September awaits us, and I couldn't be more excited to share that experience with you and the rest of the team. This is a moment we'll remember for the rest of our careers.",
    [TierSlug.LEAGUE_ADVANCED]:
      "What a fantastic achievement for this team! With so few Major spots available in our region, we knew we'd have to make the most of every opportunity, and I'm delighted with how we rose to the occasion. We'll be representing our region in CITY this September, and that's a responsibility we should all be proud to carry. Enjoy this achievement with your teammates. We've earned our place among the best, and I'm looking forward to seeing what we can do on that stage.",
  },
};

const EUROPE_ELIMINATION_MESSAGES: Readonly<Record<CoachTier, readonly string[]>> = {
  [TierSlug.LEAGUE_OPEN]: [
    "I know it wasn't particularly enjoyable losing all of our matches, but please don't let that overshadow what we've achieved by getting here in the first place. We've had the opportunity to compete against some of the best players in the world, and that's an invaluable experience at this stage of your career. I'm still incredibly proud of you and the rest of the team.",
    "Of course, it's a shame our journey ends here, but the fact that we managed to pick up a win at a European RMR is something I find remarkable. We've exceeded every expectation I had of us coming into this campaign. I hope you're leaving this tournament with more confidence in your own abilities and motivation to see how much further we can go together.",
    "To think we were just one win away from qualifying for the Major is absolutely incredible. I know it hurts to come this close, but I never imagined we'd find ourselves in this position. You've given me every reason to believe that we can achieve something special with this team in the future. I couldn't be prouder of what you've accomplished.",
  ],
  [TierSlug.LEAGUE_INTERMEDIATE]: [
    "It's unfortunate that we couldn't pick up a win throughout the tournament. I would have loved to see us put up a stronger showing, but we have to remember the level of competition we were facing. Getting here was already a fantastic achievement. We'll take the experience we've gained and use it to become a more competitive team going forward.",
    "I think we can leave this tournament with our heads held high. We managed to get a result against opposition at this level, and there were encouraging signs throughout our campaign. Naturally, I would have liked to see us go a little further, but I'm pleased with what we've achieved. There's certainly something for us to build on here.",
    "It's difficult not to feel disappointed when we've come this close to something so special. At the same time, if someone had told me before the RMR that we'd be one match away from qualifying for the Major, I'd have struggled to believe them. You've shown that you're capable of competing at a much higher level than perhaps even you realised. I'm extremely proud of our performance.",
  ],
  [TierSlug.LEAGUE_MAIN]: [
    "I'm disappointed that we couldn't get a single result throughout the tournament. I knew the opposition would be incredibly challenging, but I genuinely believed we could make ourselves more competitive than we did. We shouldn't overlook the achievement of getting here, but we also need to understand what separates us from teams at this level and work towards closing that gap.",
    "I think there are positives to take away from our performance, although I would have liked to see a little more from us overall. We've shown that we're capable of competing against strong opposition, but we haven't managed to do so consistently enough. I'd like us to use this experience as a reference point for where we need to improve.",
    "Coming this close to qualifying for the Major and falling short is a difficult feeling. I'm disappointed we couldn't take that final step, but I'm also extremely encouraged by what we've shown throughout this tournament. We've proven that we can compete with some of the strongest teams in Europe. Let's make sure this isn't the closest we ever come to qualifying for a Major.",
  ],
  [TierSlug.LEAGUE_ADVANCED]: [
    "I'm very disappointed with how our tournament has played out. I was aware of the challenge we were facing, but I expected us to be considerably more competitive than this. Leaving the RMR without a single win doesn't reflect the quality I believe we have within this team. We'll need to carefully evaluate our performances and address the areas in which we fell short.",
    "Unfortunately, we haven't managed to deliver the level of performance I was hoping for throughout this tournament. There were moments where we demonstrated our ability to compete, but those moments were too few and far between. If we're serious about establishing ourselves at this level, we need to become more consistent against stronger opposition. I believe we're capable of doing that.",
    "This one is going to hurt for a while. We put ourselves in a fantastic position to qualify for the Major, and it's incredibly frustrating that we couldn't capitalise on it. Nevertheless, I'm proud of the determination we've shown throughout the tournament. We've demonstrated that qualifying through Europe is a realistic objective for this team. Next time, we need to make sure we take that final step.",
  ],
  [TierSlug.LEAGUE_PRO]: [
    "I'm extremely disappointed with our performance throughout this RMR. Coming into the tournament with the expectation of qualifying for the Major and leaving without a single win is simply unacceptable for a team of our calibre. We've fallen well below our standards, and everyone involved, myself included, needs to take responsibility for that. We'll need to have some serious discussions about our performances and how we move forward.",
    "Failing to qualify for the Major is a significant disappointment, particularly given the quality and experience we have within this roster. We haven't performed consistently enough throughout the tournament, and ultimately, we've paid the price for it. I expected considerably more from us here. We need to identify why we haven't been able to deliver when it matters and make sure we address those issues moving forward.",
    "It's incredibly frustrating to miss out on the Major having come within one match of qualifying. While there were encouraging aspects to our performances, qualifying was our objective, and unfortunately, we haven't achieved it. At our level, coming close isn't enough. I know how much effort everyone has put into this campaign, which makes the outcome all the more disappointing. We'll need to learn from this and ensure we're better equipped to deliver under pressure next time.",
  ],
};

const AMERICAS_ELIMINATION_MESSAGES: Readonly<Record<CoachTier, readonly string[]>> = {
  [TierSlug.LEAGUE_OPEN]: [
    "It's a shame our time at the RMR was so short, but I don't want you to be disappointed in yourself. Getting here was an incredible achievement in its own right, and we knew how difficult it would be to get results against these teams. I hope you've enjoyed the experience of competing on LAN at this level. I'm incredibly proud of how far we've come together.",
    "Unfortunately, our journey ends here, but we can leave knowing we managed to win a match at an RMR! That's something I certainly wouldn't have expected from us not too long ago. You've shown that you can hold your own against some very talented players, and I hope that gives you plenty of confidence going forward.",
    "Can you believe how close we actually came to making it to the Major? With only five spots available, the fact that we were even in contention is absolutely remarkable. I know it's difficult to appreciate that right now, but you've achieved something incredible with this team. I couldn't be prouder of you.",
  ],
  [TierSlug.LEAGUE_INTERMEDIATE]: [
    "I would have loved for our time at the RMR to last a little longer, but unfortunately, the format doesn't give us much room for error. We knew we were coming here as outsiders, and there's no shame in falling short against stronger opposition. Let's take what we've learned from these matches and continue working on our development.",
    "It's disappointing that we couldn't extend our run a little further, especially after proving we were capable of picking up a win. Nevertheless, I think we've represented ourselves well at this tournament. There's a lot of potential within this team, and experiences like these will help us realise it.",
    "It's difficult to accept that our Major campaign ends here after coming so close. I certainly didn't expect us to be in contention for one of the five available spots when we arrived. You've exceeded my expectations considerably, and I hope this experience leaves you hungry for more. I'm extremely pleased with what we've accomplished together.",
  ],
  [TierSlug.LEAGUE_MAIN]: [
    "I'm disappointed that our tournament has ended so quickly. I believed we were capable of picking up some results here, but unfortunately, we didn't give ourselves enough of a chance. With such an unforgiving format, we needed to be sharper from the outset. We'll have to look at where we fell short and make sure we're better prepared for opportunities like this in the future.",
    "I think we had more to offer than what we've shown at this tournament. Getting a win was encouraging, but we weren't consistent enough to put ourselves in genuine contention for a Major spot. It's disappointing, particularly knowing the potential we have within this roster. There's still plenty of work ahead of us.",
    "It's a difficult result to accept when we were so close to achieving something special. I came into this tournament believing we could challenge for a Major spot, and we've proven that wasn't an unrealistic ambition. I'm disappointed we couldn't finish the job, but I'm encouraged by the progress we've made. I want us to build on this and come back even stronger.",
  ],
  [TierSlug.LEAGUE_ADVANCED]: [
    "I'm very disappointed with how quickly our Major campaign has come to an end. We came here with genuine ambitions of qualifying, and leaving without a single win falls considerably short of what I expected from us. We knew how little room for error this format would allow, yet we failed to make the most of our opportunities. We need to seriously evaluate our performances.",
    "Unfortunately, we haven't done enough to justify the ambitions we came here with. I genuinely believed we had the quality to compete for one of the five Major spots, but we haven't demonstrated that consistently enough. It's frustrating to see an opportunity like this pass us by. I expect us to learn from it and address the shortcomings in our performances.",
    "This is a particularly painful one. We worked ourselves into a position where qualifying for the Major was within reach, and unfortunately, we couldn't take that final step. I'm pleased with several aspects of our performance, but that doesn't make the outcome any easier to accept. We have the quality to make it to a Major, and next time, we need to make sure we finish the job.",
  ],
  [TierSlug.LEAGUE_PRO]: [
    "I'm extremely disappointed with what we've delivered at this tournament. For a team of our calibre to leave the RMR without winning a single match is unacceptable. We came here expecting to secure one of the five Major spots, and instead, our campaign is over almost as quickly as it began. Everyone involved, myself included, needs to take responsibility for this outcome. We have some serious work ahead of us.",
    "This is a significant setback for us as a team. Qualifying for the Major was a clear expectation, and we haven't come close to delivering the level of performance required to achieve it. We were fully aware of how unforgiving this tournament would be, which makes our inability to perform consistently all the more frustrating. We need to have a serious discussion about what went wrong and how we intend to respond.",
    "Missing out on the Major by such a narrow margin is incredibly frustrating. We had our opportunities to secure one of the five spots, and ultimately, we failed to capitalise on them. I know how much qualifying meant to everyone within this team, and I share your disappointment. However, at our level, coming close cannot be considered a successful campaign. We need to reflect on the decisions and performances that cost us qualification and make sure we're better equipped to deliver when it matters most.",
  ],
};

const ASIA_OCEANIA_ELIMINATION_MESSAGES: Readonly<Partial<Record<CoachTier, readonly string[]>>> = {
  [TierSlug.LEAGUE_OPEN]: [
    "It's a shame our time at the RMR has come to an end so quickly, but I don't want that to take anything away from what we've accomplished. Being among the eight teams competing for a place at the Major is an incredible achievement for us. I hope you've enjoyed the experience of playing on LAN against some of the best players in our region. I'm incredibly proud of how far we've come together.",
    "Unfortunately, our journey ends here, but I'm delighted that we managed to get a win at this tournament. Coming into the RMR, I wasn't sure how competitive we'd be against some of these teams, and you've given me plenty of reasons to be optimistic about our future. I hope you're leaving this tournament with a greater belief in your own abilities. You've done exceptionally well to get this far.",
    "We were genuinely one match away from playing at a Major! I still find it difficult to believe how far we've managed to come. I know losing with qualification within touching distance is painful, but what you've accomplished throughout this campaign is nothing short of incredible. To finish among the four best teams at our RMR, considering where we started, is something we should all be immensely proud of. I couldn't have asked for more from you.",
  ],
  [TierSlug.LEAGUE_ADVANCED]: [
    "I'm very disappointed that our tournament has ended this early. We came here believing we could compete for one of the three Major spots, and unfortunately, we haven't come close to demonstrating what we're capable of. I expected us to put up a much stronger challenge against the other teams in our region. We'll need to take a serious look at our preparation and performances to understand why we fell so far short of our objective.",
    "It's frustrating to see our Major campaign come to an end at this stage. I believed we had enough quality to make a deeper run through the bracket, but ultimately, we haven't performed consistently enough. With only three spots available, we knew we couldn't afford to let opportunities slip away. I'm disappointed we couldn't deliver more, and I want us to use this experience to identify what we need to improve before our next attempt.",
    "It's incredibly difficult to accept that we'll be the team finishing just outside the qualification spots. We were one match away from representing our region at the Major, and unfortunately, we couldn't get the job done. I'm pleased with the determination we've shown to reach this stage, but knowing how close we came makes the outcome particularly painful. We've demonstrated that qualifying is well within our capabilities. Next time, I want us to be the team securing that final spot.",
  ],
};

function isCoachTier(value: string | null | undefined): value is CoachTier {
  return ALL_COACH_TIERS.includes(value as CoachTier);
}

function withCity(message: string | undefined, city?: string | null) {
  return message?.split('CITY').join(city || 'the host city') ?? null;
}

export function getMajorRmrConfig(rmrTierSlug: string): MajorRmrConfig | null {
  return MAJOR_RMR_CONFIG[rmrTierSlug as TierSlug] ?? null;
}

export function getMajorRmrCoachOutcome(params: {
  rmrTierSlug: string;
  standing: RmrStanding | null | undefined;
  lostThisBatch: boolean;
}): Exclude<MajorRmrCoachOutcome, 'start'> | null {
  const config = getMajorRmrConfig(params.rmrTierSlug);
  if (!config || !params.standing) return null;

  const wins = params.standing.wins ?? 0;
  const losses = params.standing.losses ?? 0;
  const position = params.standing.gpos || params.standing.pos;
  const qualified =
    config.qualificationWins != null
      ? wins >= config.qualificationWins
      : position != null && position <= config.qualificationPlaces;

  if (qualified) return 'qualified';
  if (params.lostThisBatch && losses >= config.eliminationLosses) return 'eliminated';
  return null;
}

export function getMajorRmrCoachMessage(params: {
  rmrTierSlug: string;
  teamTierSlug: string | null | undefined;
  outcome: MajorRmrCoachOutcome;
  wins?: number | null;
  city?: string | null;
}): string | null {
  const config = getMajorRmrConfig(params.rmrTierSlug);
  if (
    !config ||
    !isCoachTier(params.teamTierSlug) ||
    !config.supportedCoachTiers.includes(params.teamTierSlug)
  ) {
    return null;
  }

  if (params.outcome === 'start') {
    return withCity(START_MESSAGES[config.region][params.teamTierSlug], params.city);
  }
  if (params.outcome === 'qualified') {
    return withCity(QUALIFIED_MESSAGES[config.region][params.teamTierSlug], params.city);
  }

  const messages =
    config.region === 'Europe'
      ? EUROPE_ELIMINATION_MESSAGES[params.teamTierSlug]
      : config.region === 'Americas'
        ? AMERICAS_ELIMINATION_MESSAGES[params.teamTierSlug]
        : ASIA_OCEANIA_ELIMINATION_MESSAGES[params.teamTierSlug];
  return messages?.[Math.min(Math.max(params.wins ?? 0, 0), 2)] ?? null;
}

export function getMajorRmrCoachSubject(params: { rmrTierSlug: string; season: number }) {
  const config = getMajorRmrConfig(params.rmrTierSlug);
  return config ? `${config.region} RMR — Season ${params.season}` : null;
}
