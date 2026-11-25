import { Constants, TierSlug } from '@liga/shared';

export type MajorOpenQualifierCoachOutcome = 'start' | 'loss' | 'qualified';

type CoachTier =
  | TierSlug.LEAGUE_OPEN
  | TierSlug.LEAGUE_INTERMEDIATE
  | TierSlug.LEAGUE_MAIN
  | TierSlug.LEAGUE_ADVANCED
  | TierSlug.LEAGUE_PRO;

type QualifierFormat = 'europe' | 'rest-of-world';
type QualifierRegion = 'Europe' | 'Americas' | 'Asia' | 'China' | 'Oceania';

export type MajorOpenQualifierConfig = {
  format: QualifierFormat;
  qualifierNumber: number;
  region: QualifierRegion;
  totalQualifiers: number;
  qualificationPlaces: number;
  supportedCoachTiers: readonly CoachTier[];
};

const ALL_COACH_TIERS: readonly CoachTier[] = [
  TierSlug.LEAGUE_OPEN,
  TierSlug.LEAGUE_INTERMEDIATE,
  TierSlug.LEAGUE_MAIN,
  TierSlug.LEAGUE_ADVANCED,
  TierSlug.LEAGUE_PRO,
];

// Asia and Oceania do not run Intermediate or Main divisions.
const ASIA_OCEANIA_COACH_TIERS: readonly CoachTier[] = [
  TierSlug.LEAGUE_OPEN,
  TierSlug.LEAGUE_ADVANCED,
  TierSlug.LEAGUE_PRO,
];

const config = (
  region: QualifierRegion,
  qualifierNumber: number,
  qualificationPlaces: number,
  supportedCoachTiers: readonly CoachTier[] = ALL_COACH_TIERS,
): MajorOpenQualifierConfig => ({
  format: region === 'Europe' ? 'europe' : 'rest-of-world',
  qualifierNumber,
  region,
  totalQualifiers: region === 'Europe' ? 4 : 2,
  qualificationPlaces,
  supportedCoachTiers,
});

/**
 * The message system is keyed by the concrete tournament tier so each regional
 * qualifier can define its own attempt number, RMR quota, and available league
 * levels without scattering regional conditionals through calendar handling.
 */
export const MAJOR_OPEN_QUALIFIER_CONFIG: Readonly<
  Partial<Record<TierSlug, MajorOpenQualifierConfig>>
> = {
  [TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1]: config('Europe', 1, 4),
  [TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_2]: config('Europe', 2, 4),
  [TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3]: config('Europe', 3, 4),
  [TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_4]: config('Europe', 4, 4),
  [TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_1]: config('Americas', 1, 4),
  [TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_2]: config('Americas', 2, 4),
  [TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_1]: config('Asia', 1, 2, ASIA_OCEANIA_COACH_TIERS),
  [TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_2]: config('Asia', 2, 2, ASIA_OCEANIA_COACH_TIERS),
  [TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_1]: config('China', 1, 1, ASIA_OCEANIA_COACH_TIERS),
  [TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_2]: config('China', 2, 1, ASIA_OCEANIA_COACH_TIERS),
  [TierSlug.MAJOR_OCE_OPEN_QUALIFIER_1]: config('Oceania', 1, 1, ASIA_OCEANIA_COACH_TIERS),
  [TierSlug.MAJOR_OCE_OPEN_QUALIFIER_2]: config('Oceania', 2, 1, ASIA_OCEANIA_COACH_TIERS),
};

const QUALIFIED_MESSAGES: Readonly<Record<CoachTier, string>> = {
  [TierSlug.LEAGUE_OPEN]:
    "What an incredible achievement! Qualifying for the RMR from where we started is something I could hardly have imagined. Regardless of how things go at the RMR, you and the rest of the team have already accomplished something exceptional. I'm incredibly proud of what we've achieved together. Enjoy this moment, you've earned it.",
  [TierSlug.LEAGUE_INTERMEDIATE]:
    "Fantastic work throughout the qualifier. Making it to the RMR is a massive achievement for a team at our level, and you should be proud of the part you played in getting us there. We've already exceeded expectations, and anything we achieve from here will be a bonus. Let's make the most of this opportunity.",
  [TierSlug.LEAGUE_MAIN]:
    "Congratulations on a strong performance throughout the qualifier. I'm very pleased with how you and the team handled yourselves, and securing a spot at the RMR is a great testament to our progress. We'll be facing some serious competition now, and I'm looking forward to seeing how far we can push some of the top teams.",
  [TierSlug.LEAGUE_ADVANCED]:
    "I'm very pleased with the composure you showed throughout the qualifier, particularly when the pressure was on. Securing our spot at the RMR is an important step, but there's still plenty of work ahead of us. Let's shift our focus towards preparing for the LAN and making sure we arrive at the RMR ready to compete.",
  [TierSlug.LEAGUE_PRO]:
    "Good work securing our spot at the RMR. Qualifying was the expectation, but I'm pleased with the professionalism and composure you showed throughout the qualifier. Our focus now shifts to preparing for the LAN. We have the quality to compete at the Major, and it's up to us to make sure we get there.",
};

const EUROPE_START_MESSAGES: Readonly<Record<CoachTier, readonly string[]>> = {
  [TierSlug.LEAGUE_OPEN]: [
    "Today is a great opportunity for us to test ourselves against a higher level of competition. I don't want you to put too much pressure on yourself regarding the result. Play your game, trust your teammates and enjoy the experience. You never know how far we might go.",
    "We've got another opportunity to show what we're capable of. I want you to take what you've learned from the previous qualifier and bring that experience into today's matches. Don't be intimidated by the opposition. Give yourself every chance to make an impact.",
    "We've still got two opportunities to achieve something special. I know we're not among the favourites, but that doesn't mean we can't cause a few surprises. Stay confident in your abilities and take each match as it comes. Let's see how far we can go.",
    "This is our final opportunity to qualify for the RMR. Whatever happens today, I want you to walk away knowing you've given it everything. We have nothing to lose and potentially something incredible to gain. Believe in yourself and let's give it one last shot.",
  ],
  [TierSlug.LEAGUE_INTERMEDIATE]: [
    "I'm looking forward to seeing what we can achieve in this qualifier. I think we have enough quality within the team to put together a decent run and make life difficult for some of the stronger opponents. Approach every match with confidence and show what you're capable of.",
    "Today gives us another chance to demonstrate our potential. I'd like to see us build on the experience we gained from the first qualifier and put together a stronger performance. Stay composed, communicate well and trust the work we've been putting in.",
    "With two qualifiers remaining, I'd really like to see us make the most of today's opportunity. I believe we're capable of making a deeper run than we've managed so far. Don't let the pressure affect your decision-making, and keep your focus on the match in front of you.",
    "We're heading into our final opportunity to keep our Major campaign alive. It's going to be a difficult challenge, but I believe we have enough quality to give ourselves a chance. Stay composed, play with confidence and make sure we leave nothing behind today.",
  ],
  [TierSlug.LEAGUE_MAIN]: [
    "I believe we have the quality to make a genuine push for an RMR spot. It's going to require a strong collective performance, and I want you to be fully focused from the opening match. Trust our preparation, play with confidence and let's set the standard early.",
    "We have another opportunity to put ourselves in contention for the RMR. I expect us to have learned from our previous attempt and to show more consistency throughout today's matches. We're capable of competing with the teams in this qualifier, so let's make sure our performances reflect that.",
    "We're beginning to run out of opportunities, and it's important that we make today count. I know what this team is capable of when everyone is performing at their best. I need you to stay focused, maintain your composure and contribute as much as you can towards getting us through.",
    "Everything comes down to today's qualifier now. I still believe we're capable of securing a spot at the RMR, but we'll need to be at our best throughout the day. Don't allow the importance of the occasion to distract you from your responsibilities. Trust yourself, trust the team and let's get the job done.",
  ],
  [TierSlug.LEAGUE_ADVANCED]: [
    "Qualifying for the RMR is one of the objectives I've set for this team, and today is our first opportunity to achieve it. I'm confident in our preparation and the quality we have within the roster. I expect us to approach every opponent seriously and play with the intention of qualifying.",
    "I want us to respond well to what happened in the first qualifier. We have the ability to secure an RMR spot, but we need to translate that ability into results. Stay disciplined, trust our approach and make sure we're performing at the level we expect from ourselves.",
    "We're heading into an important qualifier today. With only two opportunities remaining, we need to start delivering the results we're capable of. I have confidence in you and the rest of the team, but I expect everyone to demonstrate that same belief through their performances. Let's take control of our situation.",
    "This is our last chance to keep our Major campaign alive, and we all understand what's at stake. I don't want the pressure to prevent you from playing your natural game, but I need complete focus and commitment from you today. We have the quality to qualify. Now it's about proving it when it matters most.",
  ],
  [TierSlug.LEAGUE_PRO]: [
    "Our objective today is straightforward: secure our spot at the RMR. We have the experience and quality to get through this qualifier, and I expect us to approach every match with the professionalism that reflects our level. Don't underestimate anyone, maintain our standards and let's get the job done.",
    "We missed an opportunity in the first qualifier, and I expect a strong response from everyone today. There's no question in my mind about whether we're good enough to qualify. It's about maintaining our focus, executing what we've prepared and delivering the performance that's expected of us.",
    "The situation is becoming increasingly serious, and we can't continue letting these opportunities pass us by. I expect everyone to be mentally prepared and fully committed from the moment we enter the server. We know what we're capable of as a team. It's time we demonstrate it and secure our place at the RMR.",
    "I'm sure you're aware of the importance of today's qualifier. We have no further opportunities to put things right after this, and missing out on the Major is not an outcome we're prepared to accept. I need your full concentration and commitment throughout every match. Believe in your abilities, trust your teammates and make sure we deliver when it matters.",
  ],
};

const REST_OF_WORLD_START_MESSAGES: Readonly<Record<CoachTier, readonly string[]>> = {
  [TierSlug.LEAGUE_OPEN]: [
    "Today gives us an exciting opportunity to compete against teams we wouldn't normally encounter. I want you to approach it with an open mind and plenty of confidence. There's no pressure on us to qualify, so let's enjoy the challenge and see what we can achieve together.",
    "This is our last opportunity to make something special happen. I know the odds aren't necessarily in our favour, but I don't want that to influence how you approach today's matches. Play without fear, trust your abilities and give it everything you've got. Let's make the most of this experience.",
  ],
  [TierSlug.LEAGUE_INTERMEDIATE]: [
    "With only two opportunities to qualify, I'd like us to make a strong impression from the outset. I believe we're capable of putting together a good run if we play to our strengths. Stay confident, support your teammates and don't let the reputation of our opponents influence your performance.",
    "We've got one more opportunity to show what we're capable of. I'd love to see us make a serious run today and give ourselves a chance of reaching the RMR. Don't get caught up thinking about the end result. Focus on what's in front of you and approach every match with belief.",
  ],
  [TierSlug.LEAGUE_MAIN]: [
    "I believe securing an RMR spot is within our capabilities if we perform at our best. With only two qualifiers available to us, it's important that we approach today's matches with the right level of seriousness. Trust our preparation, stay composed and let's give ourselves the best possible chance of qualifying.",
    "This is our final opportunity to progress towards the Major, and I want us to approach it with the determination that deserves. I believe we have the quality to compete for a spot at the RMR, but we'll need everyone performing at their best today. Stay focused on your responsibilities and have confidence in the work we've put in.",
  ],
  [TierSlug.LEAGUE_ADVANCED]: [
    "I've set qualifying for the RMR as a clear objective for this team. With only two opportunities available, I'd like us to take care of business today rather than leave ourselves in a difficult position. I'm confident in our ability to get through this qualifier, and I expect everyone to approach it with the same conviction.",
    "Our Major campaign depends on what we deliver today. We know we have the quality to qualify, and now we need to demonstrate that under pressure. I expect discipline, composure and complete commitment from everyone throughout the qualifier. Trust our preparation and let's make sure we achieve what we came here to do.",
  ],
  [TierSlug.LEAGUE_PRO]: [
    "I expect us to secure our place at the RMR today. Given the limited number of opportunities we have, there's no reason for us to make this process more complicated than it needs to be. Approach every match professionally, maintain our usual standards and make sure we deliver a convincing performance.",
    "We shouldn't be in a position where our entire Major campaign depends on today's qualifier, but this is the situation we find ourselves in. I need everyone to understand the seriousness of the occasion without allowing it to negatively affect their performance. We have the experience and quality to get through this. I expect us to demonstrate that today and secure our place at the RMR.",
  ],
};

const EUROPE_LOSS_MESSAGES: Readonly<Record<CoachTier, readonly string[]>> = {
  [TierSlug.LEAGUE_OPEN]: [
    "It was always going to be a difficult task given the level of competition we're up against. There were some encouraging signs, though, and we still have three more opportunities to give this a go. Keep your head up and take what you can from the experience.",
    "It's a shame we couldn't make it further this time around, but every opportunity to compete at this level is valuable for us. I want you to keep approaching these qualifiers with confidence. We still have two more chances to surprise a few people.",
    "Unfortunately, we're down to our last opportunity now. I know qualifying was always going to be a long shot for us, but I'd love to see what we can achieve if everything comes together. Let's give it everything we've got in the final qualifier.",
    "It's disappointing that our Major journey ends here, but I don't want you to be discouraged by it. Qualifying would have been an extraordinary achievement for a team at our level. There's plenty we can take away from these experiences, and I'm looking forward to seeing how we develop from here.",
  ],
  [TierSlug.LEAGUE_INTERMEDIATE]: [
    "Not quite the result we were hoping for, but there's no reason to be discouraged at this stage. I think we're capable of making a decent run in these qualifiers. Let's address what went wrong and come back better prepared for the next one.",
    "I'm disappointed we couldn't build on our previous attempt. I believe we have more to offer than what we've shown so far, and I'd like to see that reflected in our next performance. We still have two opportunities to make something happen.",
    "It's frustrating to see another opportunity slip away from us. We're capable of more, and I hope we can demonstrate that in the final qualifier. There's nothing to lose at this point, so let's approach it with confidence and give ourselves a proper chance.",
    "It's a disappointing way to end our Major campaign. I knew qualifying would be difficult, but I was hoping we could make a stronger run than we did. There's still a lot of potential within this team, and we'll use what we've learned here to continue developing.",
  ],
  [TierSlug.LEAGUE_MAIN]: [
    "I'm disappointed with the result, but we have plenty of opportunities left to put things right. I believe we're capable of competing for an RMR spot if we perform at our best. We'll review our performance and make the necessary adjustments before the next qualifier.",
    'Another missed opportunity, unfortunately. I know the quality we have within this team, which makes these results particularly frustrating. We need to find more consistency in our performances if we want to give ourselves a realistic chance of qualifying.',
    "I'm disappointed that we've put ourselves in a position where everything comes down to the final qualifier. We haven't shown enough of what we're capable of so far. I expect us to approach this last opportunity with determination and a much greater level of focus.",
    "I had hoped we'd be able to make a genuine push for an RMR spot, so it's disappointing to see our Major campaign end here. We need to take an honest look at our performances and understand why we fell short. I believe we're capable of achieving more than this.",
  ],
  [TierSlug.LEAGUE_ADVANCED]: [
    "Not the start we were looking for. I consider qualifying for the RMR a realistic objective for this team, and we need to perform accordingly. There are still three opportunities ahead of us, so let's identify where we fell short and make sure we respond well.",
    "I'm concerned by our inability to get through the first two qualifiers. We have the individual quality and collective ability to compete for a spot, but our performances haven't been convincing enough. I expect to see a noticeable improvement in the next attempt.",
    "This is becoming increasingly frustrating. We shouldn't be heading into the final qualifier with our Major campaign still on the line. I need everyone to be fully committed to our preparation from this point onwards. We can't afford another performance below our usual standards.",
    "I'm very disappointed that we've failed to qualify for the RMR. I genuinely believed we had the quality to get there, and falling short across four opportunities is difficult to accept. We'll need to evaluate our performances carefully and address the shortcomings that prevented us from achieving our objective.",
  ],
  [TierSlug.LEAGUE_PRO]: [
    "This is not the result I expect from a team of our calibre. We should be getting through these qualifiers, and I'm disappointed we couldn't get the job done today. Fortunately, we have three more opportunities to correct this. I expect a much stronger showing next time.",
    "Failing to qualify for a second time is concerning. We have the experience and quality to get through these qualifiers, but we're not delivering when it matters. We need to address this immediately and make sure we're better prepared for the next opportunity.",
    "I'm extremely disappointed that our Major campaign has come down to the final open qualifier. This is not a position a team of our standing should find itself in. I expect complete focus and commitment from everyone going into our last opportunity. Missing out on the Major would be a significant setback for us.",
    "Failing to reach the Major is a massive disappointment and falls well below the expectations we set for ourselves. Having had four opportunities to qualify makes this particularly difficult to accept. Everyone, myself included, needs to take responsibility for this outcome. We'll need to have some serious discussions about how we move forward.",
  ],
};

const REST_OF_WORLD_LOSS_MESSAGES: Readonly<Record<CoachTier, readonly string[]>> = {
  [TierSlug.LEAGUE_OPEN]: [
    "It was always going to be a tough challenge for us, but I'm glad we had the opportunity to test ourselves against this level of competition. We still have one more chance to make something special happen. Keep your confidence and let's give it our best shot.",
    "It's a shame our Major journey ends here, but there's no reason to hang your head. Qualifying would have been an incredible achievement for a team at our level. I hope you've taken something valuable from the experience, and I'm looking forward to continuing our development together.",
  ],
  [TierSlug.LEAGUE_INTERMEDIATE]: [
    "It's disappointing that we couldn't make it further in the qualifier. I think we're capable of putting together a stronger performance, and we still have one opportunity to prove that. Let's take what we've learned here and give ourselves the best possible chance next time.",
    "I'm disappointed that our Major campaign has come to an end. Although qualifying was always going to be difficult, I would have liked to see us make a deeper run. There are lessons to be learned from both qualifiers, and I want us to use them to become a stronger team.",
  ],
  [TierSlug.LEAGUE_MAIN]: [
    "I'm disappointed with the outcome, especially considering what I believe this team is capable of. With only one qualifier remaining, we need to make the most of our preparation. I want to see a more convincing performance from us next time around.",
    "It's frustrating to see our Major campaign end without securing an RMR spot. I believed we were capable of making a genuine push for qualification, but ultimately, we didn't do enough. We need to understand where we fell short and work towards making sure we're more competitive when the next opportunity comes around.",
  ],
  [TierSlug.LEAGUE_ADVANCED]: [
    'This is a disappointing result and puts us in a difficult position going into the final qualifier. Qualifying for the RMR is a realistic objective for this team, and we need to start performing like it. I expect everyone to approach our preparation with the seriousness this situation demands.',
    "I'm very disappointed that we've failed to secure a spot at the RMR. We had the quality to qualify, but we haven't managed to deliver when it mattered. Missing out on the Major is a considerable setback for this team, and we need to seriously evaluate what prevented us from reaching our objective.",
  ],
  [TierSlug.LEAGUE_PRO]: [
    "I'm very disappointed with this result. Getting through the open qualifier is something I expect from a team of our calibre, and we've now put our entire Major campaign at risk. We have one opportunity left to put things right, and I expect everyone to be fully focused on getting the job done.",
    "Missing out on the Major at this stage is simply not good enough for a team of our standing. We came into these qualifiers expecting to progress, and we've fallen well short of that objective. This is a significant setback for everyone involved, and we'll need to collectively take responsibility for our failure to qualify.",
  ],
};

function isCoachTier(value: string | null | undefined): value is CoachTier {
  return ALL_COACH_TIERS.includes(value as CoachTier);
}

export function getMajorOpenQualifierConfig(
  qualifierTierSlug: string,
): MajorOpenQualifierConfig | null {
  return MAJOR_OPEN_QUALIFIER_CONFIG[qualifierTierSlug as TierSlug] ?? null;
}

export function getCoachTierFromTeamTier(teamTier: number | null | undefined): CoachTier | null {
  const tierSlug = teamTier == null ? null : Constants.Prestige[teamTier];
  return isCoachTier(tierSlug) ? tierSlug : null;
}

export function hasSecuredMajorOpenQualifierPlace(
  standing: { gpos?: number | null; pos?: number | null } | null | undefined,
  qualificationPlaces: number,
) {
  const position = standing?.gpos || standing?.pos;
  return position != null && position <= qualificationPlaces;
}

export function getMajorOpenQualifierCoachMessage(params: {
  qualifierTierSlug: string;
  teamTierSlug: string | null | undefined;
  outcome: MajorOpenQualifierCoachOutcome;
}): string | null {
  const qualifier = getMajorOpenQualifierConfig(params.qualifierTierSlug);
  if (
    !qualifier ||
    !isCoachTier(params.teamTierSlug) ||
    !qualifier.supportedCoachTiers.includes(params.teamTierSlug)
  ) {
    return null;
  }

  if (params.outcome === 'qualified') {
    return QUALIFIED_MESSAGES[params.teamTierSlug];
  }

  const messages =
    params.outcome === 'start'
      ? qualifier.format === 'europe'
        ? EUROPE_START_MESSAGES
        : REST_OF_WORLD_START_MESSAGES
      : qualifier.format === 'europe'
        ? EUROPE_LOSS_MESSAGES
        : REST_OF_WORLD_LOSS_MESSAGES;

  return messages[params.teamTierSlug][qualifier.qualifierNumber - 1] ?? null;
}

export function getMajorOpenQualifierCoachSubject(params: {
  qualifierTierSlug: string;
  season: number;
}): string | null {
  const qualifier = getMajorOpenQualifierConfig(params.qualifierTierSlug);
  if (!qualifier) return null;
  return `${qualifier.region} RMR Open Qualifier ${qualifier.qualifierNumber}/${qualifier.totalQualifiers} — Season ${params.season}`;
}
