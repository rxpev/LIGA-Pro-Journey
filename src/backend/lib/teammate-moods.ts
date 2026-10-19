import { differenceInDays } from 'date-fns';
import { Constants, Eagers, Util } from '@liga/shared';
import firstResultMessages from './teammate-first-result-messages.json';
import firstResultReplies from './teammate-first-result-replies.json';
import DatabaseClient from './database-client';
import * as WindowManager from './window-manager';

export type TeammateMoraleSummary = {
  playerId: number;
  confidence: number;
  trust: number;
  morale: 'Very Happy' | 'Happy' | 'Content' | 'Unhappy' | 'Very Unhappy';
  moraleScore: number;
  performanceModifier: number;
};

type MoodMessageKey =
  | 'joined'
  | 'benched'
  | 'promoted'
  | 'first-win'
  | 'first-loss'
  | 'win'
  | 'win-streak'
  | 'loss'
  | 'loss-streak'
  | 'high-confidence'
  | 'low-confidence'
  | 'high-trust'
  | 'low-trust';

const pendingWelcomeEmails = new Map<number, { profileId: number; teamId: number }>();

export function queueTeammateWelcome(emailId: number, profileId: number, teamId: number) {
  pendingWelcomeEmails.set(emailId, { profileId, teamId });
}

export function takeQueuedTeammateWelcome(emailId: number) {
  const pending = pendingWelcomeEmails.get(emailId) ?? null;
  pendingWelcomeEmails.delete(emailId);
  return pending;
}

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function getMorale(confidence: number, trust: number) {
  const score = clamp(confidence * 0.6 + trust * 0.4);
  const morale: TeammateMoraleSummary['morale'] =
    score >= 80
      ? 'Very Happy'
      : score >= 65
        ? 'Happy'
        : score >= 45
          ? 'Content'
          : score >= 30
            ? 'Unhappy'
            : 'Very Unhappy';
  return { morale, score };
}

const messages: Record<MoodMessageKey, { open: string; reserved: string; intense: string }> = {
  joined: {
    open: `Good to have you here. I think this lineup can really work. Want to put in some extra prep together?`,
    reserved: `Welcome to the team. Let me know what you need from me in the server.`,
    intense: `Finally—we have a lineup that can do some damage. Let's get to work.`,
  },
  benched: {
    open: `I wanted to tell you directly: being taken out of the lineup has hit me hard. I need to know whether you still believe I have a place here.`,
    reserved: `I understand the lineup decision, but I am disappointed. I would like some clarity about my role.`,
    intense: `I don't agree with being benched. I need an honest answer about where I stand.`,
  },
  promoted: {
    open: `Thanks for giving me another chance in the five. I won't waste it.`,
    reserved: `I appreciate being restored to the lineup. I am ready.`,
    intense: `This is where I belong. Let's prove the decision was right.`,
  },
  'first-win': {
    open: `First W together, let's go! GG man.`,
    reserved: `GG! Feels good to get that first win out of the way.`,
    intense: `First win on the board! Let's keep this momentum going.`,
  },
  'first-loss': {
    open: `Unlucky first game, gg. We'll get them next time.`,
    reserved: `GG man, think we just need a bit more practice together.`,
    intense: `First game together and already taking an L haha. Only up from here.`,
  },
  win: {
    open: `Nice win. The communication felt good today—let's keep building on it.`,
    reserved: `Good result today. The team looked composed.`,
    intense: `That's more like it. If we keep playing with that confidence, teams should be worried.`,
  },
  'win-streak': {
    open: `We're starting to look like a real team. I trust the way you're playing and communicating right now.`,
    reserved: `The recent run is encouraging. Our structure is becoming much more natural.`,
    intense: `We're on a roll. I don't want us taking our foot off the gas now.`,
  },
  loss: {
    open: `That one hurt, but I don't want us turning on each other. We can fix it.`,
    reserved: `Poor result. We should review the mistakes before the next match.`,
    intense: `We threw too many rounds away. We need more urgency next time.`,
  },
  'loss-streak': {
    open: `I'm struggling with confidence after this run. I could use some reassurance that we're still moving in the right direction.`,
    reserved: `The run of losses is becoming a concern. We need a clear plan to change it.`,
    intense: `This cannot keep happening. Something about our approach has to change now.`,
  },
  'high-confidence': {
    open: `I'm feeling really sharp at the moment. Give me responsibility and I'll make it count.`,
    reserved: `My game feels strong right now. I am comfortable taking on more responsibility.`,
    intense: `I'm in great form. Put me in the important rounds and let me take over.`,
  },
  'low-confidence': {
    open: `I haven't felt like myself lately. I'm second-guessing decisions I normally make without thinking.`,
    reserved: `My confidence is low. A simpler role for the next match may help.`,
    intense: `Nothing is working for me right now. I need help getting out of this slump.`,
  },
  'high-trust': {
    open: `I wanted you to know that I trust you in the server. Your attitude has helped this team.`,
    reserved: `Your approach has earned my trust. I value having you in this lineup.`,
    intense: `I've got your back. If you make the call, I'm following it.`,
  },
  'low-trust': {
    open: `I feel like we haven't been on the same page lately. Can we clear the air?`,
    reserved: `Our communication has not been productive. I think we need an honest conversation.`,
    intense: `I'm losing faith in how we're handling things. Tell me why I should believe this will improve.`,
  },
};

const firstWinMessages = {
  igl: {
    easy: [
      `First win already, and that was way too easy lol. Nice calls!`,
      `Good calling today, they honestly had no idea what we were doing.`,
      `If every game goes like this, I'm gonna love having you as IGL.`,
      `First W in the books! You made that look pretty effortless.`,
      `Clean calls, clean rounds, easy win. Keep it up!`,
    ],
    tough: [
      `That was way too close for comfort. Your calls really saved us there, gg!`,
      `First win and already giving me heart attacks lol. Great mid-round calls though.`,
      `Not gonna lie, I was getting worried. Good job keeping us together.`,
      `Those last few rounds were insane. Huge calls from you to close it out!`,
      `What a way to get our first W. Your adjustments made all the difference.`,
    ],
    normal: [
      `First win together, nice! Your calls felt really solid today.`,
      `Good stuff today, felt pretty comfortable playing around your calls.`,
      `First W secured! Looking forward to seeing what we can do with you leading.`,
      `Nice calling for our first game, think we're starting to build some chemistry.`,
      `GG! Good first win, let's keep improving our coordination.`,
    ],
  },
  player: {
    good: [
      `First win and you're already popping off? Love to see it!`,
      `Bro you were absolutely farming them today lol. Huge first W!`,
      `Great game man, those entries made our lives so much easier.`,
      `If you keep playing like that, we're gonna win a lot of games together.`,
      `First win and you carried hard. Guess we know who to rely on now haha.`,
    ],
    bad: [
      `First W secured! Don't worry about your stats, we'll get you going next game.`,
      `Not your best game, but a win's a win. We'll take those!`,
      `GG! Rough first map for you, but I'm sure you'll bounce back.`,
      `At least we got the win haha. Plenty of games left to find your rhythm.`,
      `First win together! Don't stress about today, we all have games like that.`,
    ],
    normal: [
      `First W together, let's go! GG man.`,
      `Nice first game, think we've got a pretty solid team here.`,
      `GG! Feels good to get that first win out of the way.`,
      `Good stuff today, looking forward to playing more games with you.`,
      `First win on the board! Let's keep this momentum going.`,
    ],
  },
} as const;

const firstLossMessages = {
  igl: {
    easy: [
      `Well, that was rough lol. Think we need to rethink some of our strats.`,
      `They read us like a book today. Gotta switch things up next time.`,
      `Not the start we wanted, but we'll figure it out. Don't stress too much about the calls.`,
      `That was painful haha. We definitely need some better coordination.`,
      `Rough first game. Felt like nothing we called was working, but we'll bounce back.`,
    ],
    tough: [
      `Damn, we were so close. Good calls though, just couldn't close it out.`,
      `Unlucky first game. Honestly think your calling was solid, just a few mistakes.`,
      `That one hurts. We had some really good rounds under your leadership though.`,
      `GG, tough loss. Liked how you adapted throughout the game, we'll get the next one.`,
      `Can't believe we threw that lead. Still, good calling overall. We'll learn from it.`,
    ],
    normal: [
      `Unfortunate first game, but I think your calls were pretty decent overall.`,
      `GG, not the best start. We'll need some time to get used to each other's playstyles.`,
      `First L out of the way haha. Let's review what went wrong and go again.`,
      `Think we had some good ideas today, just need to work on the execution.`,
      `Not the result we wanted, but I trust we'll get better with your calling.`,
    ],
  },
  player: {
    good: [
      `Bro you were actually carrying us and we still lost. Unlucky.`,
      `Rough loss, but you played really well. Keep that up and we'll start winning.`,
      `Honestly feel bad we couldn't get you the win after that performance lol.`,
      `You were hitting some crazy shots today. Shame we couldn't capitalize on it.`,
      `At least you showed up today haha. Let's hope the rest of us step up next game.`,
    ],
    bad: [
      `Rough first game man, hopefully you can find your rhythm next match.`,
      `Not gonna lie, we needed a bit more from you today. But it's only game one.`,
      `Happens to everyone, don't worry too much about it. Just come back stronger.`,
      `Yeah that wasn't your best showing haha. Shake it off, we've got plenty more games.`,
      `Tough start for you today. Don't let it get in your head, we'll need you next match.`,
    ],
    normal: [
      `Unlucky first game, gg. We'll get them next time.`,
      `Not the start we wanted, but I think we've got potential as a team.`,
      `GG man, think we just need a bit more practice together.`,
      `First game together and already taking an L haha. Only up from here.`,
      `Shame we couldn't get the win, but I think we had some decent moments.`,
    ],
  },
} as const;

type FirstResultMatch = {
  games: Array<{
    num: number;
    teams: Array<{ teamId: number | null; score: number | null }>;
  }>;
};

type ResultBucket = 'easy' | 'tough' | 'normal';
type PerformanceBucket = 'good' | 'bad' | 'normal';

function getFinalMapScore(match: FirstResultMatch, teamId: number) {
  return [...match.games]
    .sort((a, b) => b.num - a.num)
    .find((game) => game.teams.some((team) => team.teamId === teamId))
    ?.teams.find((team) => team.teamId === teamId)?.score;
}

function getIglResultBucket(match: FirstResultMatch, teamId: number, won: boolean): ResultBucket {
  const ownScore = getFinalMapScore(match, teamId);
  const game = [...match.games]
    .sort((a, b) => b.num - a.num)
    .find((candidate) => candidate.teams.some((team) => team.teamId === teamId));
  const opponentScore = game?.teams.find(
    (team) => team.teamId != null && team.teamId !== teamId,
  )?.score;
  const relevantScore = won ? opponentScore : ownScore;
  return relevantScore != null && relevantScore <= 5
    ? 'easy'
    : relevantScore != null && relevantScore >= 10
      ? 'tough'
      : 'normal';
}

function getPerformanceBucket(rating: number | null): PerformanceBucket {
  return rating != null && rating >= 1.7
    ? 'good'
    : rating != null && rating <= 0.85
      ? 'bad'
      : 'normal';
}

function pickMessage(pool: readonly string[], random = Math.random()) {
  const roll = Math.max(0, Math.min(0.999999999, random));
  return pool[Math.floor(roll * pool.length)];
}

export function getFirstWinMessage(options: {
  isIgl: boolean;
  match: FirstResultMatch;
  teamId: number;
  rating: number | null;
  random?: number;
}) {
  let pool: readonly string[];
  if (options.isIgl) {
    const bucket = getIglResultBucket(options.match, options.teamId, true);
    pool = firstWinMessages.igl[bucket];
  } else {
    const bucket = getPerformanceBucket(options.rating);
    pool = firstWinMessages.player[bucket];
  }
  return pickMessage(pool, options.random);
}

export function getFirstLossMessage(options: {
  isIgl: boolean;
  match: FirstResultMatch;
  teamId: number;
  rating: number | null;
  random?: number;
}) {
  let pool: readonly string[];
  if (options.isIgl) {
    const bucket = getIglResultBucket(options.match, options.teamId, false);
    pool = firstLossMessages.igl[bucket];
  } else {
    const bucket = getPerformanceBucket(options.rating);
    pool = firstLossMessages.player[bucket];
  }
  return pickMessage(pool, options.random);
}

export function getFirstLossToWinMessage(options: {
  isIgl: boolean;
  debutMatch: FirstResultMatch;
  winMatch: FirstResultMatch;
  teamId: number;
  debutRating: number | null;
  winRating: number | null;
  random?: number;
}) {
  if (options.isIgl) {
    const lossBucket = getIglResultBucket(options.debutMatch, options.teamId, false);
    const winBucket = getIglResultBucket(options.winMatch, options.teamId, true);
    const key = `${lossBucket}-${winBucket}` as keyof typeof firstResultMessages.lossToWin.igl;
    return pickMessage(firstResultMessages.lossToWin.igl[key], options.random);
  }
  const lossBucket = getPerformanceBucket(options.debutRating);
  const winBucket = getPerformanceBucket(options.winRating);
  const key = `${lossBucket}-${winBucket}` as keyof typeof firstResultMessages.lossToWin.player;
  return pickMessage(firstResultMessages.lossToWin.player[key], options.random);
}

export function getFirstWinToLossMessage(options: {
  isIgl: boolean;
  debutMatch: FirstResultMatch;
  lossMatch: FirstResultMatch;
  teamId: number;
  debutRating: number | null;
  lossRating: number | null;
  random?: number;
}) {
  if (options.isIgl) {
    const winBucket = getIglResultBucket(options.debutMatch, options.teamId, true);
    const lossBucket = getIglResultBucket(options.lossMatch, options.teamId, false);
    const key = `${winBucket}-${lossBucket}` as keyof typeof firstResultMessages.winToLoss.igl;
    return pickMessage(firstResultMessages.winToLoss.igl[key], options.random);
  }
  const winBucket = getPerformanceBucket(options.debutRating);
  const lossBucket = getPerformanceBucket(options.lossRating);
  const key = `${winBucket}-${lossBucket}` as keyof typeof firstResultMessages.winToLoss.player;
  return pickMessage(firstResultMessages.winToLoss.player[key], options.random);
}

function tone(personality: string | null): 'open' | 'reserved' | 'intense' {
  if (/^A|Entry/i.test(personality || '')) return 'intense';
  if (/^P/i.test(personality || '')) return 'reserved';
  return 'open';
}

type FirstResultReplyScenario = keyof typeof firstResultReplies;
type FirstResultReplyActor = 'igl' | 'player';
type FirstResultReplyBucket = ResultBucket | PerformanceBucket;

function getFirstResultReplySet(replySetId: string) {
  const [scenario, actor, bucket] = replySetId.split('|') as [
    FirstResultReplyScenario,
    FirstResultReplyActor,
    FirstResultReplyBucket,
  ];
  const scenarioSets = firstResultReplies[scenario];
  if (!scenarioSets || !['igl', 'player'].includes(actor)) return null;
  const actorSets = scenarioSets[actor] as Record<
    string,
    Array<{ label: string; content: string; trust: number; confidence: number }>
  >;
  return actorSets?.[bucket] ?? null;
}

function getFirstResultReplySetId(
  scenario: FirstResultReplyScenario,
  isIgl: boolean,
  match: FirstResultMatch,
  teamId: number,
  won: boolean,
  rating: number | null,
) {
  const actor: FirstResultReplyActor = isIgl ? 'igl' : 'player';
  const bucket = isIgl ? getIglResultBucket(match, teamId, won) : getPerformanceBucket(rating);
  return `${scenario}|${actor}|${bucket}`;
}

function replyButtons(playerId: number, replySetId?: string) {
  const route = Constants.IPCRoute.TEAMMATE_MORALE_REPLY;
  if (replySetId) {
    const replies = getFirstResultReplySet(replySetId);
    if (replies) {
      return `\n\n${replies
        .map(
          (reply, index) =>
            `<button class="btn ${index === 0 ? 'btn-primary' : 'btn-ghost'}" data-ipc-route="${route}" data-payload="${playerId}|${replySetId}|${index}">${reply.label}</button>`,
        )
        .join(' ')}`;
    }
  }
  return `\n\n<button data-ipc-route="${route}" data-payload="${playerId}:supportive">Support them</button> <button data-ipc-route="${route}" data-payload="${playerId}:direct">Be direct</button> <button data-ipc-route="${route}" data-payload="${playerId}:dismissive">Dismiss it</button>`;
}

async function sendMoodMessage(
  mood: { id: number; playerId: number; lastMessageKey: string | null; lastMessageAt: Date | null },
  player: { id: number; name: string; personality: string | null; avatar: string | null },
  key: MoodMessageKey,
  date: Date,
  contentOverride?: string,
  replySetId?: string,
) {
  if (mood.lastMessageKey === key) return;
  if (
    key !== 'first-win' &&
    key !== 'first-loss' &&
    mood.lastMessageAt &&
    differenceInDays(date, mood.lastMessageAt) < 5
  )
    return;

  const role = `Teammate [player:${player.id}]${player.avatar ? ` [avatar:${encodeURIComponent(player.avatar)}]` : ''}`;
  const persona = await DatabaseClient.prisma.persona.upsert({
    where: { name: player.name },
    update: { role },
    create: { name: player.name, role },
  });
  const subject = `Teammate chat with ${player.name}`;
  const content =
    (contentOverride ?? messages[key][tone(player.personality)]) +
    replyButtons(player.id, replySetId);
  const previousEmail = await DatabaseClient.prisma.email.findUnique({
    where: { subject },
    select: { id: true },
  });
  if (previousEmail) {
    await DatabaseClient.prisma.dialogue.updateMany({
      where: { emailId: previousEmail.id },
      data: { completed: true },
    });
  }
  const email = await DatabaseClient.prisma.email.upsert({
    where: { subject },
    update: {
      read: false,
      sentAt: date,
      dialogues: { create: { content, sentAt: date, fromId: persona.id } },
    },
    create: {
      subject,
      sentAt: date,
      fromId: persona.id,
      dialogues: { create: { content, sentAt: date, fromId: persona.id } },
    },
    include: Eagers.email.include,
  });
  await DatabaseClient.prisma.teammateMood.update({
    where: { id: mood.id },
    data: { lastMessageKey: key, lastMessageAt: date },
  });
  WindowManager.get(Constants.WindowIdentifier.Main, false)?.webContents.send(
    Constants.IPCRoute.EMAILS_NEW,
    email,
  );
}

function canSendMoodMessage(
  mood: { lastMessageKey: string | null; lastMessageAt: Date | null },
  key: MoodMessageKey,
  date: Date,
) {
  if (mood.lastMessageKey === key) return false;
  if (key === 'first-win' || key === 'first-loss') return true;
  return !mood.lastMessageAt || differenceInDays(date, mood.lastMessageAt) >= 5;
}

export async function syncCurrentTeamMoods(options: { announceChanges?: boolean } = {}) {
  const profile = await DatabaseClient.prisma.profile.findFirst({
    include: { team: { include: { players: true } }, player: true },
  });
  if (!profile?.teamId || !profile.team || !profile.playerId || profile.trialTeamId) {
    if (profile) {
      await DatabaseClient.prisma.teammateMood.deleteMany({ where: { profileId: profile.id } });
    }
    return [];
  }

  const teammates = profile.team.players.filter(
    (player) => player.id !== profile.playerId && !player.userControlled,
  );
  await DatabaseClient.prisma.teammateMood.deleteMany({
    where: { profileId: profile.id, playerId: { notIn: teammates.map((player) => player.id) } },
  });

  const results = [];
  for (const player of teammates) {
    const existing = await DatabaseClient.prisma.teammateMood.findUnique({
      where: { profileId_playerId: { profileId: profile.id, playerId: player.id } },
    });
    const mood = existing
      ? await DatabaseClient.prisma.teammateMood.update({
          where: { id: existing.id },
          data: {
            teamId: profile.teamId,
            lastStarter: player.starter,
          },
        })
      : await DatabaseClient.prisma.teammateMood.create({
          data: {
            profileId: profile.id,
            playerId: player.id,
            teamId: profile.teamId,
            lastStarter: player.starter,
          },
        });
    results.push(mood);
    if (options.announceChanges) {
      const key =
        existing && existing.lastStarter !== player.starter
          ? player.starter
            ? 'promoted'
            : 'benched'
          : null;
      if (key) await sendMoodMessage(mood, player, key, profile.date);
    }
  }
  return results;
}

export async function sendRandomTeammateWelcome(expectedProfileId: number, expectedTeamId: number) {
  const profile = await DatabaseClient.prisma.profile.findFirst({
    include: { team: { include: { players: true } } },
  });
  if (
    !profile?.playerId ||
    profile.id !== expectedProfileId ||
    profile.teamId !== expectedTeamId ||
    profile.trialTeamId ||
    !profile.team
  ) {
    return;
  }

  const moods = await syncCurrentTeamMoods();
  if (moods.some((mood) => mood.lastMessageKey === 'joined')) return;

  const moodByPlayerId = new Map(moods.map((mood) => [mood.playerId, mood]));
  const candidates = profile.team.players.flatMap((player) => {
    const mood = moodByPlayerId.get(player.id);
    return player.id !== profile.playerId && !player.userControlled && player.starter && mood
      ? [{ mood, player }]
      : [];
  });
  if (!candidates.length) return;

  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  await sendMoodMessage(selected.mood, selected.player, 'joined', profile.date);
}

export async function processCompletedMatch(matchId: number) {
  const profile = await DatabaseClient.prisma.profile.findFirst({
    include: { player: { include: { careerStints: true } } },
  });
  if (!profile?.teamId || !profile.playerId || profile.trialTeamId) return;
  const currentStintStartedAt = profile.player?.careerStints
    .filter((stint) => stint.teamId === profile.teamId && !stint.isTrial)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0]?.startedAt;
  const match = await DatabaseClient.prisma.match.findUnique({
    where: { id: matchId },
    include: { competitors: true, games: { include: { teams: true } } },
  });
  const own = match?.competitors.find((competitor) => competitor.teamId === profile.teamId);
  if (!own || own.result == null) return;
  const won = own.result === Constants.MatchResult.WIN;
  const lost = own.result === Constants.MatchResult.LOSS;
  if (!won && !lost) return;

  const previousMatchingResults = await DatabaseClient.prisma.match.count({
    where: {
      id: { not: match.id },
      status: Constants.MatchStatus.COMPLETED,
      ...(currentStintStartedAt ? { date: { gte: currentStintStartedAt } } : {}),
      competitors: {
        some: { teamId: profile.teamId, result: own.result },
      },
      players: { some: { id: profile.playerId } },
    },
  });
  const isFirstTeamWin = won && previousMatchingResults === 0;
  const isFirstTeamLoss = lost && previousMatchingResults === 0;
  const playerStats =
    isFirstTeamWin || isFirstTeamLoss
      ? await DatabaseClient.prisma.matchPlayerGameStat.findMany({
          where: { matchId: match.id, playerId: profile.playerId },
        })
      : [];
  const playerRating = playerStats.length
    ? playerStats.reduce(
        (sum, stat) => sum + Util.getPlayerRating(stat.kills, stat.deaths, stat.assists),
        0,
      ) / playerStats.length
    : null;
  const debutMatch =
    isFirstTeamWin || isFirstTeamLoss
      ? await DatabaseClient.prisma.match.findFirst({
          where: {
            status: Constants.MatchStatus.COMPLETED,
            ...(currentStintStartedAt ? { date: { gte: currentStintStartedAt } } : {}),
            competitors: { some: { teamId: profile.teamId } },
            players: { some: { id: profile.playerId } },
          },
          orderBy: [{ date: 'asc' }, { id: 'asc' }],
          include: { competitors: true, games: { include: { teams: true } } },
        })
      : null;
  const debutWasLoss = debutMatch?.competitors.some(
    (competitor) =>
      competitor.teamId === profile.teamId && competitor.result === Constants.MatchResult.LOSS,
  );
  const debutWasWin = debutMatch?.competitors.some(
    (competitor) =>
      competitor.teamId === profile.teamId && competitor.result === Constants.MatchResult.WIN,
  );
  const debutStats =
    ((isFirstTeamWin && debutWasLoss) || (isFirstTeamLoss && debutWasWin)) && debutMatch
      ? await DatabaseClient.prisma.matchPlayerGameStat.findMany({
          where: { matchId: debutMatch.id, playerId: profile.playerId },
        })
      : [];
  const debutRating = debutStats.length
    ? debutStats.reduce(
        (sum, stat) => sum + Util.getPlayerRating(stat.kills, stat.deaths, stat.assists),
        0,
      ) / debutStats.length
    : null;
  const firstWinContent = isFirstTeamWin
    ? debutWasLoss && debutMatch
      ? getFirstLossToWinMessage({
          isIgl: profile.player?.role === Constants.UserRole.IGL,
          debutMatch,
          winMatch: match,
          teamId: profile.teamId,
          debutRating,
          winRating: playerRating,
        })
      : getFirstWinMessage({
          isIgl: profile.player?.role === Constants.UserRole.IGL,
          match,
          teamId: profile.teamId,
          rating: playerRating,
        })
    : null;
  const firstLossContent = isFirstTeamLoss
    ? debutWasWin && debutMatch
      ? getFirstWinToLossMessage({
          isIgl: profile.player?.role === Constants.UserRole.IGL,
          debutMatch,
          lossMatch: match,
          teamId: profile.teamId,
          debutRating,
          lossRating: playerRating,
        })
      : getFirstLossMessage({
          isIgl: profile.player?.role === Constants.UserRole.IGL,
          match,
          teamId: profile.teamId,
          rating: playerRating,
        })
    : null;

  const moods = await syncCurrentTeamMoods();
  const messageCandidates: Array<{
    mood: (typeof moods)[number];
    player: NonNullable<Awaited<ReturnType<typeof DatabaseClient.prisma.player.findUnique>>>;
    key: MoodMessageKey;
  }> = [];
  for (const mood of moods) {
    const nextWinStreak = won ? mood.winStreak + 1 : 0;
    const nextLossStreak = lost ? mood.lossStreak + 1 : 0;
    const updated = await DatabaseClient.prisma.teammateMood.update({
      where: { id: mood.id },
      data: {
        confidence: clamp(mood.confidence + (won ? 5 : -6)),
        trust: clamp(mood.trust + (won ? 2 : -2)),
        winStreak: nextWinStreak,
        lossStreak: nextLossStreak,
      },
    });
    const player = await DatabaseClient.prisma.player.findUnique({ where: { id: mood.playerId } });
    if (!player) continue;
    let key: MoodMessageKey | null = null;
    if (nextLossStreak >= 3) key = 'loss-streak';
    else if (nextWinStreak >= 3) key = 'win-streak';
    else if (isFirstTeamWin) key = 'first-win';
    else if (isFirstTeamLoss) key = 'first-loss';
    else if (updated.confidence <= 25) key = 'low-confidence';
    else if (updated.confidence >= 80) key = 'high-confidence';
    else if (updated.trust <= 25) key = 'low-trust';
    else if (updated.trust >= 80) key = 'high-trust';
    else if ((won && nextWinStreak === 1) || (lost && nextLossStreak === 1))
      key = won ? 'win' : 'loss';
    if (key && player.starter && canSendMoodMessage(updated, key, profile.date)) {
      messageCandidates.push({ mood: updated, player, key });
    }
  }

  if (messageCandidates.length) {
    const selected = messageCandidates[Math.floor(Math.random() * messageCandidates.length)];
    const isIgl = profile.player?.role === Constants.UserRole.IGL;
    const replySetId =
      selected.key === 'first-win'
        ? getFirstResultReplySetId(
            debutWasLoss ? 'loss-to-win' : 'first-win',
            isIgl,
            match,
            profile.teamId,
            true,
            playerRating,
          )
        : selected.key === 'first-loss'
          ? getFirstResultReplySetId(
              debutWasWin ? 'win-to-loss' : 'first-loss',
              isIgl,
              match,
              profile.teamId,
              false,
              playerRating,
            )
          : undefined;
    await sendMoodMessage(
      selected.mood,
      selected.player,
      selected.key,
      profile.date,
      selected.key === 'first-win'
        ? (firstWinContent ?? undefined)
        : selected.key === 'first-loss'
          ? (firstLossContent ?? undefined)
          : undefined,
      replySetId,
    );
  }
}

export async function getCurrentTeamMoodSummaries(): Promise<TeammateMoraleSummary[]> {
  const profile = await DatabaseClient.prisma.profile.findFirst();
  if (!profile?.teamId || !profile.playerId || profile.trialTeamId) return [];
  await syncCurrentTeamMoods({ announceChanges: true });
  const moods = await DatabaseClient.prisma.teammateMood.findMany({
    where: { profileId: profile.id, teamId: profile.teamId },
  });
  return moods.map((mood) => {
    const { morale, score } = getMorale(mood.confidence, mood.trust);
    return {
      playerId: mood.playerId,
      confidence: mood.confidence,
      trust: mood.trust,
      morale,
      moraleScore: score,
      performanceModifier: Math.max(-0.03, Math.min(0.03, (score - 50) / 1000)),
    };
  });
}

export async function replyToTeammateMood(payload: string) {
  const rawPayload = String(payload);
  const contextualParts = rawPayload.split('|');
  const [legacyPlayerId, legacyChoice] = rawPayload.split(':');
  const rawPlayerId = contextualParts.length >= 5 ? contextualParts[0] : legacyPlayerId;
  const playerId = Number(rawPlayerId);
  const replySetId = contextualParts.length >= 5 ? contextualParts.slice(1, -1).join('|') : null;
  const replyIndex = contextualParts.length >= 5 ? Number(contextualParts.at(-1)) : -1;
  const contextualReply = replySetId
    ? (getFirstResultReplySet(replySetId)?.[replyIndex] ?? null)
    : null;
  const isLegacyReply = ['supportive', 'direct', 'dismissive'].includes(legacyChoice);
  if (!Number.isInteger(playerId) || (!contextualReply && !isLegacyReply)) {
    throw new Error('Invalid teammate mood reply.');
  }
  const profile = await DatabaseClient.prisma.profile.findFirst();
  if (!profile?.teamId || profile.trialTeamId) throw new Error('Teammate morale is unavailable.');
  const mood = await DatabaseClient.prisma.teammateMood.findFirst({
    where: { profileId: profile.id, playerId, teamId: profile.teamId },
    include: { player: true },
  });
  if (!mood) throw new Error('Teammate mood not found.');
  const deltas = contextualReply
    ? { trust: contextualReply.trust, confidence: contextualReply.confidence }
    : legacyChoice === 'supportive'
      ? { trust: 5, confidence: 4 }
      : legacyChoice === 'direct'
        ? { trust: 3, confidence: 2 }
        : { trust: -5, confidence: -4 };
  await DatabaseClient.prisma.teammateMood.update({
    where: { id: mood.id },
    data: {
      trust: clamp(mood.trust + deltas.trust),
      confidence: clamp(mood.confidence + deltas.confidence),
    },
  });
  const playerPersona = await DatabaseClient.prisma.persona.upsert({
    where: { name: `__player_profile_${profile.id}` },
    update: { role: 'Player' },
    create: { name: `__player_profile_${profile.id}`, role: 'Player' },
  });
  const email = await DatabaseClient.prisma.email.findUnique({
    where: { subject: `Teammate chat with ${mood.player.name}` },
  });
  if (email) {
    const content = contextualReply
      ? contextualReply.content
      : legacyChoice === 'supportive'
        ? `I've got your back. We'll work through it together.`
        : legacyChoice === 'direct'
          ? `I understand, but I need you focused on what the team needs next.`
          : `You're overthinking it. Just concentrate on playing.`;
    await DatabaseClient.prisma.dialogue.create({
      data: { content, sentAt: profile.date, emailId: email.id, fromId: playerPersona.id },
    });
  }
  return getCurrentTeamMoodSummaries();
}

export async function getTeamTrustModifier() {
  const moods = await getCurrentTeamMoodSummaries();
  if (!moods.length) return 0;
  const average = moods.reduce((sum, mood) => sum + mood.trust, 0) / moods.length;
  return Math.max(-10, Math.min(10, Math.round((average - 50) / 5)));
}

export async function getMoodPerformanceModifiers() {
  return new Map(
    (await getCurrentTeamMoodSummaries()).map((mood) => [mood.playerId, mood.performanceModifier]),
  );
}
