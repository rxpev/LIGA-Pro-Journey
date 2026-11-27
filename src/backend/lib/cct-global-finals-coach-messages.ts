import { FederationSlug } from '@liga/shared';

export type CctGlobalFinalsRegion = 'Europe' | 'Americas' | 'Asia' | 'Oceania';
export type CctGlobalFinalsCoachOutcome =
  | 'start'
  | 'quarterfinal_loss'
  | 'semifinal_loss'
  | 'champion';

const MESSAGES: Readonly<
  Record<CctGlobalFinalsCoachOutcome, Readonly<Record<CctGlobalFinalsRegion, string>>>
> = {
  start: {
    Europe:
      "Our CCT Global Finals campaign gets underway tomorrow here in CITY. We've earned our place through some strong performances in the CCT Series, and I believe we have the quality to challenge for the trophy. With a single elimination format, we'll need to be sharp from the very first match. Let's approach this tournament with confidence and give ourselves every chance of coming away with an international LAN title.",
    Americas:
      "I'm looking forward to seeing what we can achieve at the CCT Global Finals tomorrow. We've done well to earn our place here, and this is a great opportunity to test ourselves against teams from other regions. I believe we're capable of making a good run through the bracket, but we'll need to be at our best from the outset. Let's make the most of our time here in CITY and see if we can bring home a trophy.",
    Asia:
      "It's been a couple of months since we won our CCT Series, and now we get to compete on the international stage where it really counts. I'm excited to see how we measure up against the other teams here. With the single elimination format, our stay could be a short one, but I don't want you to put any unnecessary pressure on yourself. Enjoy the LAN experience, play with confidence and let's see how far we can get.",
    Oceania:
      "Winning our CCT Series a couple of months ago has earned us a fantastic opportunity to compete internationally here in CITY. We don't get enough chances to test ourselves against opposition from other regions, so I really want us to make the most of this tournament. There's no pressure on us to win the whole thing. Let's give our opponents a proper challenge, enjoy the experience and hopefully put together a run we can be proud of.",
  },
  quarterfinal_loss: {
    Europe:
      "I'm disappointed that our tournament has come to an end so quickly. I genuinely believed we had the quality to make a deep run here in CITY, but the single elimination format doesn't give us a second chance. We'll need to look at where we fell short today and take what we can from the experience.",
    Americas:
      "It's a shame we couldn't get past the quarterfinals, as I was hoping we'd have a few more opportunities to compete here. I believe we're capable of more than what we've shown today, but that's the nature of a single elimination tournament. Let's take the lessons from this experience and move forward.",
    Asia:
      "Unfortunately, our time at the CCT Global Finals has come to an early end. I would have loved to see us go a little further, but I'm still pleased we earned the opportunity to compete internationally after winning our regional series. Let's take what we've learned here and use it to continue developing as a team.",
    Oceania:
      "It's a shame our stay here in CITY has been so short, but I hope you've enjoyed the opportunity to compete on LAN against international opposition. We knew the format would be unforgiving, and unfortunately, things didn't go our way today. Keep your head up and take as much as you can from the experience.",
  },
  semifinal_loss: {
    Europe:
      "It's disappointing that we couldn't secure a place in the grand final. I genuinely believed we had a good chance of winning this tournament, but unfortunately, it wasn't to be. There are still positives to take from our performances here in CITY, and I hope we can build on them in our upcoming tournaments.",
    Americas:
      "I would have loved to see us take another step forward and reach the grand final, but I'm pleased with how we've competed throughout the tournament. Reaching the semi-finals against international opposition is a good achievement for this team. Let's take some confidence from that and keep working on our game.",
    Asia:
      "It's a shame our run ends here, but I'm really pleased that we've managed to reach the semi-finals. Following up our regional CCT victory with a respectable performance at the Global Finals is something we should be proud of. I hope you've enjoyed the LAN experience and gained some confidence from competing internationally.",
    Oceania:
      "Of course, it would have been fantastic to reach the grand final, but I'm delighted with what we've accomplished here in CITY. Reaching the semi-finals against teams from other regions is a really encouraging result for us. We've gained some valuable international experience, and I hope you're leaving this tournament with a little more belief in what we're capable of.",
  },
  champion: {
    Europe:
      "Fantastic work! We're CCT Global Finals champions! I came here believing we had the quality to win this tournament, and I'm delighted that we've managed to deliver. Winning an international LAN against teams from across the world is a brilliant achievement for us. I'm really pleased with how we've performed throughout the event. Enjoy the celebrations tonight!",
    Americas:
      "WE DID IT! We're leaving CITY with the CCT Global Finals trophy! What a fantastic performance from everyone throughout the tournament. We've shown that we can compete internationally and come out on top, which should give us an enormous amount of confidence moving forward. I'm incredibly proud of what we've accomplished together. Go and enjoy tonight!",
    Asia:
      "WE'RE CCT GLOBAL FINALS CHAMPIONS! A couple of months ago, we celebrated winning our regional series, and now we've gone and won the entire international tournament! I couldn't have asked for a better outcome here in CITY. You've shown that we can compete against teams from other regions and bring home a trophy. I'm incredibly proud of you and the rest of the team. Enjoy every moment of the celebrations!",
    Oceania:
      "WE'RE BRINGING THE TROPHY HOME! What an incredible achievement for this team. Coming here after winning our regional CCT Series and going on to win the Global Finals is something I could hardly have imagined. We don't often get opportunities to compete internationally, and you've certainly made the most of this one. I'm absolutely delighted with what we've accomplished here in CITY. Enjoy tonight with your teammates, you've more than earned it!",
  },
};

export function getCctGlobalFinalsRegion(
  federationSlug: string | null | undefined,
): CctGlobalFinalsRegion | null {
  if (federationSlug === FederationSlug.ESPORTS_EUROPA) return 'Europe';
  if (federationSlug === FederationSlug.ESPORTS_AMERICAS) return 'Americas';
  if (federationSlug === FederationSlug.ESPORTS_ASIA) return 'Asia';
  if (federationSlug === FederationSlug.ESPORTS_OCE) return 'Oceania';
  return null;
}

export function getCctGlobalFinalsCoachMessage(params: {
  region: CctGlobalFinalsRegion;
  outcome: CctGlobalFinalsCoachOutcome;
  city?: string | null;
}) {
  return MESSAGES[params.outcome][params.region]
    .split('CITY')
    .join(params.city || 'the CCT Global Finals host city');
}

export function getCctGlobalFinalsCoachSubject(season: number) {
  return `CCT Global Finals — Season ${season}`;
}
