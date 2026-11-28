export type EseaAsiaOpenCoachOutcome =
  | 'start'
  | 'missed_playoffs_and_cct'
  | 'missed_playoffs_cct_qualified'
  | 'playoff_qualified'
  | 'quarterfinal_loss'
  | 'semifinal_loss'
  | 'final_loss'
  | 'champion';

const MESSAGES: Record<EseaAsiaOpenCoachOutcome, string> = {
  start:
    "Our ESEA season gets underway tomorrow! A good regular season could be particularly rewarding for us, as finishing in the top four of our group would secure a place in the CCT Series at the end of May, even if we miss out on the playoffs. Of course, it would be great to challenge for promotion to Advanced as well, but let's focus on picking up some good results and improving as a team for now. I'm looking forward to seeing how we get on!",
  missed_playoffs_and_cct:
    "It's a shame we couldn't finish high enough in our group to qualify for either the playoffs or the CCT Series. I was hoping we'd manage to secure at least one of those, but unfortunately, we didn't quite deliver this season. Let's take what we've learnt, keep working on our game and aim for a better result next time.",
  missed_playoffs_cct_qualified:
    "It's a shame we couldn't make it to the playoffs, but finishing in the top four of our group means we've secured a place in the CCT Series at the end of May! I'm pleased that we've managed to get something out of our regular season. It'll be a good opportunity to gain some more experience and test ourselves against stronger opposition.",
  playoff_qualified:
    "Great work! We've made it to the playoffs and secured a spot in the CCT Series at the end of May. I'm really pleased with how our season has gone so far. Remember, only the two finalists earn promotion to Advanced, so there's still some work ahead of us. Let's keep playing with confidence and see if we can finish the season on a high!",
  quarterfinal_loss:
    "It's a shame our playoff run ends here, but I think we've had a decent season overall. We've still got the CCT Series to look forward to at the end of May, so let's use that opportunity to gain some more experience and continue improving as a team.",
  semifinal_loss:
    "It's frustrating to come just one series short of earning promotion to Advanced. I thought we had a good chance of making it this season, but unfortunately, it wasn't quite enough. We can still be pleased with how far we've come, though, and I'm looking forward to seeing what we can do in the upcoming CCT Series.",
  final_loss:
    "It would have been lovely to finish the season with a trophy, but we've achieved our main objective – we're going up to Advanced! I'm really pleased with what we've accomplished together this season. We've also got the CCT Series coming up at the end of May, which will be a good opportunity to familiarise ourselves with stronger opposition before next season. Congratulations on earning promotion!",
  champion:
    "Brilliant work! We've won ESEA Open and earned promotion to Advanced! I'm really pleased with how we've performed throughout the season, and it's great to see our hard work pay off. We've also got the CCT Series coming up at the end of May, which should give us a good idea of what to expect against stronger opposition next season. Exciting times ahead for this team. Enjoy the victory!",
};

export function getEseaAsiaOpenCoachMessage(outcome: EseaAsiaOpenCoachOutcome) {
  return MESSAGES[outcome];
}

export function getEseaAsiaOpenRegularSeasonOutcome(params: {
  groupPosition: number | null | undefined;
  overallPosition: number | null | undefined;
}) {
  if (params.overallPosition != null && params.overallPosition <= 8) {
    return 'playoff_qualified' as const;
  }
  if (params.groupPosition != null && params.groupPosition <= 4) {
    return 'missed_playoffs_cct_qualified' as const;
  }
  return 'missed_playoffs_and_cct' as const;
}

export function getEseaAsiaOpenCoachSubject(season: number) {
  return `Asia ESEA Open — Season ${season}`;
}

