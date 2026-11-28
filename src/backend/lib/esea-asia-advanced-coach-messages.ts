export type EseaAsiaAdvancedCoachOutcome =
  | 'start'
  | 'missed_playoffs'
  | 'relegated'
  | 'playoff_qualified'
  | 'lower_round_1_loss'
  | 'lower_round_2_loss'
  | 'lower_semifinal_loss'
  | 'lower_final_loss'
  | 'final_loss'
  | 'champion';

const MESSAGES: Record<EseaAsiaAdvancedCoachOutcome, string> = {
  start:
    "Our ESEA season gets underway tomorrow! There's plenty to play for this season, with opportunities to qualify for some bigger tournaments and potentially earn promotion to ESL Pro League. Let's focus on finding our rhythm early on and putting ourselves in a good position for the playoffs. I'm excited to see what we can achieve!",
  missed_playoffs:
    "It's a shame we couldn't make it to the playoffs, especially as we've also missed out on the CCT Series. I was hoping for a stronger season from us, but at least we've managed to retain our place in Advanced. Let's work on where we fell short and aim to be more competitive next season.",
  relegated:
    "I'm disappointed with how our season has turned out. Finishing bottom of our group and dropping back to Open is a difficult result to accept, but our performances simply haven't been good enough. We'll need to address our weaknesses and rebuild our confidence. Let's make earning promotion back to Advanced our priority next season.",
  playoff_qualified:
    "Great work securing a playoff spot and qualifying for the CCT Series! With three promotion spots to ESL Pro League up for grabs, we've put ourselves in a good position. Let's keep up the good work and give ourselves every chance of getting there.",
  lower_round_1_loss:
    "I'm disappointed that our playoff run has ended so early. I was hoping we'd put up a better fight and give ourselves a chance of challenging for promotion to ESL Pro League. The silver lining is that we've still got the CCT Series coming up at the end of May. Let's work on our shortcomings and aim for a better showing there.",
  lower_round_2_loss:
    "It's a shame we couldn't build a little more momentum through the lower bracket. I felt we had the potential to make a deeper run, but unfortunately, we've fallen short. At least our competitive schedule isn't over just yet, with the CCT Series giving us another opportunity to achieve something this season.",
  lower_semifinal_loss:
    "It's particularly frustrating to come within one series of securing promotion to ESL Pro League. I really felt we were capable of taking that next step, but it wasn't to be this time. We've had a respectable season overall, and there's still plenty to play for in the upcoming CCT Series. Let's take confidence from how close we came and turn our attention towards that tournament.",
  lower_final_loss:
    "It's a shame we couldn't make it through to the grand final, but let's not forget what we've achieved – we've secured promotion to ESL Pro League! Finishing among the top three is a brilliant result for this team, and I'm really pleased with our progress. We've got the CCT Series at the end of May and EPL in August to look forward to. There's plenty to be excited about!",
  final_loss:
    "I would have loved to see us lift the trophy and secure that additional spot at ESL Challenger, so losing the grand final is certainly disappointing. However, earning promotion to ESL Pro League is a fantastic achievement in itself, and I don't want today's result to overshadow that. We've got an exciting few months ahead of us. I'm proud of what we've accomplished together this season. Congratulations on earning promotion!",
  champion:
    "WE'VE DONE IT! We're ESEA Advanced champions and we're going to ESL Pro League! I'm incredibly pleased with how we've performed this season, and finishing it with a trophy is a fantastic reward for all the work we've put in together.\n\nWe've got a busy few months ahead of us, with the CCT Series at the end of May, ESL Challenger in CITY at the end of June and ESL Pro League in August. These are brilliant opportunities for us to gain international experience and show what we're capable of outside our region.\n\nThere's a lot to look forward to, but for now, enjoy being champions. You've earned it!",
};

export function getEseaAsiaAdvancedCoachMessage(params: {
  outcome: EseaAsiaAdvancedCoachOutcome;
  city?: string | null;
}) {
  return MESSAGES[params.outcome]
    .split('CITY')
    .join(params.city || 'the ESL Challenger host city');
}

export function getEseaAsiaAdvancedRegularSeasonOutcome(
  groupPosition: number | null | undefined,
) {
  if (groupPosition != null && groupPosition <= 4) return 'playoff_qualified' as const;
  if (groupPosition === 10) return 'relegated' as const;
  return 'missed_playoffs' as const;
}

export function getEseaAsiaAdvancedCoachSubject(season: number) {
  return `Asia ESEA Advanced — Season ${season}`;
}

