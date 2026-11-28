import { TierSlug } from '@liga/shared';

export type EseaOceaniaCoachOutcome =
  | 'start'
  | 'regular_eliminated'
  | 'relegation_required'
  | 'relegation_won'
  | 'relegated'
  | 'playoff_qualified'
  | 'quarterfinal_loss'
  | 'quarterfinal_loss_cct'
  | 'semifinal_loss'
  | 'final_loss'
  | 'champion';

const OPEN_MESSAGES: Partial<Record<EseaOceaniaCoachOutcome, string>> = {
  start:
    "Our ESEA season gets underway tomorrow! I'm looking forward to seeing how we get on over the coming weeks. Let's try to pick up some good results, improve as a team and hopefully put ourselves in contention for a playoff spot. Most importantly, keep a positive attitude and enjoy playing together. Good luck!",
  regular_eliminated:
    "It's a shame we couldn't make it to the playoffs. Looking at our group before the season started, I thought we had a decent chance of getting through, so I'm a little disappointed with how things turned out. Nevertheless, there's plenty we can learn from this season. Let's keep working on our game and aim for a better result next time.",
  playoff_qualified:
    "Great work making it to the playoffs! I'm really pleased with how we've performed throughout the regular season. Remember, only the two finalists earn promotion to Advanced, so we've still got some work ahead of us. Let's keep playing with confidence, take it one match at a time and see if we can get there!",
  quarterfinal_loss:
    "It's a shame our season ends here. I was hoping we could make a deeper run in the playoffs, but reaching them in the first place is a good achievement for us. Let's keep working on our game and give ourselves a better chance of earning promotion next season.",
  semifinal_loss:
    "It's frustrating to come just one match short of earning promotion to Advanced. I genuinely thought we had a good chance of getting there, especially after how we'd performed this season. Nevertheless, we've shown that we're capable of challenging for promotion. Let's build on that and hopefully take the next step next season.",
  final_loss:
    "Of course, it would have been nice to finish the season by winning Open, but we've achieved something more important – we're going up to Advanced! I'm really pleased with the progress we've made together throughout the season. We've also earned ourselves a spot in the CCT Series at the end of May, which will be a great opportunity to test ourselves against some stronger teams before next season. Great work, and congratulations on earning promotion!",
  champion:
    "Brilliant work! We've won ESEA Open and secured promotion to Advanced! I'm really pleased with how much we've improved throughout the season, and it's great to see our efforts rewarded. As a bonus, we've also qualified for the CCT Series at the end of May. I'm looking forward to seeing how we measure up against some of the stronger teams in our region. For now, enjoy the win, you've earned it!",
};

const ADVANCED_MESSAGES: Partial<Record<EseaOceaniaCoachOutcome, string>> = {
  start:
    "Our ESEA Advanced campaign gets underway tomorrow! With only one promotion spot available for ESL Pro League, we know it's going to be a challenging season. That doesn't mean we can't give ourselves a chance, though. Let's focus on putting together some consistent performances, keep improving as a team and see where that takes us. I'm looking forward to getting started!",
  regular_eliminated:
    "It's a shame we couldn't make it through to the playoffs. I was hoping we'd be a little more competitive this season, but at least we've managed to secure our place in Advanced without having to worry about relegation. We've got a solid foundation to build on, so let's work on our weaknesses and aim for a playoff spot next season.",
  relegation_required:
    "Unfortunately, our performances this season haven't been good enough, and we now find ourselves having to fight for our place in Advanced. We've got one more series to make things right, and I'm confident we can do that. Let's prepare properly, stay composed and make sure we're still playing in Advanced next season.",
  relegation_won:
    "Good work securing our place in Advanced! It's certainly not the way I wanted our season to end, but staying in the division is a silver lining after a difficult campaign. We've given ourselves another chance to prove that we belong at this level. Let's make sure we're better prepared for next season.",
  relegated:
    "I'm really disappointed that we've been relegated to Open. Our performances throughout the season simply weren't good enough, and unfortunately, we couldn't put things right in the relegation match either. We'll need to take a good look at where things went wrong. Our focus now should be on rebuilding our confidence and earning promotion back to Advanced next season.",
  playoff_qualified:
    "Great work making it to the playoffs! We've put ourselves in a position to challenge for promotion to ESL Pro League. Only the winner goes through, so there's still a tough road ahead of us. Let's take it one series at a time and see if we can make something special happen this season.",
  quarterfinal_loss_cct:
    "It's a shame our playoff run ends here, as I was hoping we could go a little further. On the positive side, we've secured a spot in the CCT Series at the end of May. That gives us another opportunity to achieve something this season, and I'm looking forward to seeing how we get on.",
  quarterfinal_loss:
    "I'm a little disappointed that our season ends here, especially as we've also missed out on a spot in the CCT Series. Nevertheless, reaching the playoffs is a respectable result. Let's use the time before next season to work on our weaknesses and come back as a stronger team.",
  semifinal_loss:
    "It's disappointing to fall short of the grand final, but I think we've had a good season overall. We're showing that we can compete with some of the stronger teams in our region, which is encouraging. We've also qualified for the CCT Series at the end of May, so there's still something to look forward to before our next ESEA campaign.",
  final_loss:
    "It's tough to come within one series of earning promotion to ESL Pro League and fall short. I know how much that would have meant to everyone on this team. Nevertheless, I'm really pleased with what we've accomplished this season, and I believe we can take plenty of confidence from this run. We've still got the CCT Series coming up at the end of May, so let's regroup and give ourselves another chance to achieve something special.",
  champion:
    "WE'RE GOING TO ESL PRO LEAGUE! What a fantastic achievement for this team. With only one promotion spot available, winning Advanced is something we can all be incredibly proud of.\n\nWe've got an exciting few months ahead of us now. We'll be competing in the CCT Series at the end of May, followed by ESL Challenger, an eight-team LAN in CITY at the end of June. Then, in August, we'll be competing against some of the best teams in the world at ESL Pro League.\n\nIt's going to be a busy schedule and a significant step up in competition, but I'm really looking forward to experiencing it all together. For now, enjoy what we've accomplished. Congratulations, champion!",
};

export function getEseaOceaniaCoachMessage(params: {
  tierSlug: string | null | undefined;
  outcome: EseaOceaniaCoachOutcome;
  city?: string | null;
}) {
  const messages =
    params.tierSlug === TierSlug.LEAGUE_OPEN ||
    params.tierSlug === TierSlug.LEAGUE_OPEN_PLAYOFFS
      ? OPEN_MESSAGES
      : params.tierSlug === TierSlug.LEAGUE_ADVANCED ||
          params.tierSlug === TierSlug.LEAGUE_ADVANCED_PLAYOFFS
        ? ADVANCED_MESSAGES
        : null;
  const message = messages?.[params.outcome];
  return message?.split('CITY').join(params.city || 'the ESL Challenger host city') ?? null;
}

export function getEseaOceaniaCoachSubject(season: number) {
  return `Oceania ESEA Season ${season}`;
}

