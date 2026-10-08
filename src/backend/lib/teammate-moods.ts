import { differenceInDays } from 'date-fns';
import { Constants, Eagers } from '@liga/shared';
import DatabaseClient from './database-client';
import * as WindowManager from './window-manager';

export type TeammateMoraleSummary = {
  playerId: number;
  confidence: number;
  roleSatisfaction: number;
  trust: number;
  morale: 'Very Happy' | 'Happy' | 'Content' | 'Unhappy' | 'Very Unhappy';
  moraleScore: number;
  performanceModifier: number;
};

type MoodMessageKey =
  | 'joined'
  | 'benched'
  | 'promoted'
  | 'win'
  | 'win-streak'
  | 'loss'
  | 'loss-streak'
  | 'high-confidence'
  | 'low-confidence'
  | 'high-trust'
  | 'low-trust'
  | 'role-unhappy';

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

function getMorale(confidence: number, roleSatisfaction: number, trust: number) {
  const score = clamp(confidence * 0.45 + roleSatisfaction * 0.35 + trust * 0.2);
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
  'role-unhappy': {
    open: `I'm trying to make the current role work, but it doesn't feel like I'm being used properly.`,
    reserved: `I am not satisfied with my current role. I would like it to be reviewed.`,
    intense: `This role is holding me back. I need more freedom or we need to rethink the lineup.`,
  },
};

function tone(personality: string | null): 'open' | 'reserved' | 'intense' {
  if (/^A|Entry/i.test(personality || '')) return 'intense';
  if (/^P/i.test(personality || '')) return 'reserved';
  return 'open';
}

function replyButtons(playerId: number) {
  const route = Constants.IPCRoute.TEAMMATE_MORALE_REPLY;
  return `\n\n<button data-ipc-route="${route}" data-payload="${playerId}:supportive">Support them</button> <button data-ipc-route="${route}" data-payload="${playerId}:direct">Be direct</button> <button data-ipc-route="${route}" data-payload="${playerId}:dismissive">Dismiss it</button>`;
}

async function sendMoodMessage(
  mood: { id: number; playerId: number; lastMessageKey: string | null; lastMessageAt: Date | null },
  player: { id: number; name: string; personality: string | null; avatar: string | null },
  key: MoodMessageKey,
  date: Date,
) {
  if (mood.lastMessageKey === key) return;
  if (mood.lastMessageAt && differenceInDays(date, mood.lastMessageAt) < 5) return;

  const role = `Teammate [player:${player.id}]${player.avatar ? ` [avatar:${encodeURIComponent(player.avatar)}]` : ''}`;
  const persona = await DatabaseClient.prisma.persona.upsert({
    where: { name: player.name },
    update: { role },
    create: { name: player.name, role },
  });
  const subject = `Teammate chat with ${player.name}`;
  const content = messages[key][tone(player.personality)] + replyButtons(player.id);
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
            roleSatisfaction:
              existing.lastStarter === player.starter
                ? existing.roleSatisfaction
                : clamp(existing.roleSatisfaction + (player.starter ? 20 : -25)),
            lastStarter: player.starter,
          },
        })
      : await DatabaseClient.prisma.teammateMood.create({
          data: {
            profileId: profile.id,
            playerId: player.id,
            teamId: profile.teamId,
            lastStarter: player.starter,
            roleSatisfaction: player.starter ? 65 : 35,
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
  const profile = await DatabaseClient.prisma.profile.findFirst();
  if (!profile?.teamId || !profile.playerId || profile.trialTeamId) return;
  const match = await DatabaseClient.prisma.match.findUnique({
    where: { id: matchId },
    include: { competitors: true },
  });
  const own = match?.competitors.find((competitor) => competitor.teamId === profile.teamId);
  if (!own || own.result == null) return;
  const won = own.result === Constants.MatchResult.WIN;
  const lost = own.result === Constants.MatchResult.LOSS;
  if (!won && !lost) return;

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
        roleSatisfaction: clamp(mood.roleSatisfaction + (mood.lastStarter ? 1 : -2)),
        winStreak: nextWinStreak,
        lossStreak: nextLossStreak,
      },
    });
    const player = await DatabaseClient.prisma.player.findUnique({ where: { id: mood.playerId } });
    if (!player) continue;
    let key: MoodMessageKey | null = null;
    if (nextLossStreak >= 3) key = 'loss-streak';
    else if (nextWinStreak >= 3) key = 'win-streak';
    else if (updated.confidence <= 25) key = 'low-confidence';
    else if (updated.confidence >= 80) key = 'high-confidence';
    else if (updated.roleSatisfaction <= 25) key = 'role-unhappy';
    else if (updated.trust <= 25) key = 'low-trust';
    else if (updated.trust >= 80) key = 'high-trust';
    else if ((won && nextWinStreak === 1) || (lost && nextLossStreak === 1))
      key = won ? 'win' : 'loss';
    const willBeBenched =
      !player.transferListed && updated.roleSatisfaction <= 15 && updated.trust <= 25;
    if (willBeBenched) {
      await DatabaseClient.prisma.player.update({
        where: { id: player.id },
        data: { transferListed: true, starter: false },
      });
    }
    if (key && player.starter && !willBeBenched && canSendMoodMessage(updated, key, profile.date)) {
      messageCandidates.push({ mood: updated, player, key });
    }
  }

  if (messageCandidates.length) {
    const selected = messageCandidates[Math.floor(Math.random() * messageCandidates.length)];
    await sendMoodMessage(selected.mood, selected.player, selected.key, profile.date);
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
    const { morale, score } = getMorale(mood.confidence, mood.roleSatisfaction, mood.trust);
    return {
      playerId: mood.playerId,
      confidence: mood.confidence,
      roleSatisfaction: mood.roleSatisfaction,
      trust: mood.trust,
      morale,
      moraleScore: score,
      performanceModifier: Math.max(-0.03, Math.min(0.03, (score - 50) / 1000)),
    };
  });
}

export async function replyToTeammateMood(payload: string) {
  const [rawPlayerId, choice] = String(payload).split(':');
  const playerId = Number(rawPlayerId);
  if (!Number.isInteger(playerId) || !['supportive', 'direct', 'dismissive'].includes(choice)) {
    throw new Error('Invalid teammate mood reply.');
  }
  const profile = await DatabaseClient.prisma.profile.findFirst();
  if (!profile?.teamId || profile.trialTeamId) throw new Error('Teammate morale is unavailable.');
  const mood = await DatabaseClient.prisma.teammateMood.findFirst({
    where: { profileId: profile.id, playerId, teamId: profile.teamId },
    include: { player: true },
  });
  if (!mood) throw new Error('Teammate mood not found.');
  const deltas =
    choice === 'supportive'
      ? { trust: 8, confidence: 5, role: 4 }
      : choice === 'direct'
        ? { trust: 3, confidence: 2, role: 1 }
        : { trust: -10, confidence: -4, role: -5 };
  await DatabaseClient.prisma.teammateMood.update({
    where: { id: mood.id },
    data: {
      trust: clamp(mood.trust + deltas.trust),
      confidence: clamp(mood.confidence + deltas.confidence),
      roleSatisfaction: clamp(mood.roleSatisfaction + deltas.role),
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
    const content =
      choice === 'supportive'
        ? `I've got your back. We'll work through it together.`
        : choice === 'direct'
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
