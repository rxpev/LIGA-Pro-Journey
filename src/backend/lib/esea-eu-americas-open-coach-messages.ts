import { FederationSlug } from '@liga/shared';

export type EseaEuAmericasOpenRegion = 'Europe' | 'Americas';
export type EseaEuAmericasOpenCoachOutcome =
  | 'start'
  | 'missed_playoffs'
  | 'playoff_qualified'
  | 'round_of_16_loss'
  | 'quarterfinal_loss'
  | 'semifinal_loss'
  | 'final_loss'
  | 'champion';

const MESSAGES: Record<EseaEuAmericasOpenCoachOutcome, string> = {
  start:
    "Our ESEA season gets underway tomorrow! I'd love to see us put together a good run in the regular season and give ourselves a chance of earning promotion to Intermediate. There's also the opportunity to qualify for the CCT Series if we do well in the playoffs, so there's plenty to play for. Let's focus on getting off to a good start, improving as a team and enjoying the competition. Good luck!",
  missed_playoffs:
    "It's a shame we couldn't make it to the playoffs. I thought we had a decent chance of getting through our group, so I'm a little disappointed with how the season turned out. Let's keep working on our game and give ourselves a better chance of challenging for promotion next season.",
  playoff_qualified:
    "Great work making it to the playoffs! I'm really pleased with how our regular season has gone. We're now just two matches away from earning promotion to Intermediate, which would be a fantastic achievement for us. Let's keep playing with confidence and give it our best shot!",
  round_of_16_loss:
    "It's a shame our playoff run has ended so early. I was hoping we'd get a little further, but making the playoffs is still something we can build on. Let's keep working on our game and come back stronger next season.",
  quarterfinal_loss:
    "It's frustrating to fall just one match short of promotion to Intermediate and qualification for the CCT Series. We've shown some promising signs throughout the season, though, and I believe we're heading in the right direction. Hopefully, we can go a step further next time.",
  semifinal_loss:
    "Although it's disappointing to miss out on the grand final, we can be really pleased with what we've achieved this season. We've secured promotion to Intermediate and qualified for the CCT Series at the end of May! I'm looking forward to seeing how we handle the step up in competition. Well done!",
  final_loss:
    "I would have loved to finish our season with a trophy, but we shouldn't let today's defeat take away from what we've achieved. We've earned promotion to Intermediate and secured our place in the upcoming CCT Series. It's been a really encouraging season overall, and I'm proud of the progress we've made together.",
  champion:
    "WE'RE CHAMPIONS! What a brilliant way to finish our ESEA Open campaign. Not only have we earned promotion to Intermediate, but we've also secured our place in the CCT Series at the end of May. I'm really pleased with the progress we've made together this season, and I'm excited to see how we perform against stronger opposition. For now, enjoy the victory. Well done, champion!",
};

export function getEseaEuAmericasOpenRegion(
  federationSlug: string | null | undefined,
): EseaEuAmericasOpenRegion | null {
  if (federationSlug === FederationSlug.ESPORTS_EUROPA) return 'Europe';
  if (federationSlug === FederationSlug.ESPORTS_AMERICAS) return 'Americas';
  return null;
}

export function getEseaEuAmericasOpenCoachMessage(
  outcome: EseaEuAmericasOpenCoachOutcome,
) {
  return MESSAGES[outcome];
}

export function getEseaEuAmericasOpenCoachSubject(params: {
  region: EseaEuAmericasOpenRegion;
  season: number;
}) {
  return `${params.region} ESEA Open — Season ${params.season}`;
}

