import log from 'electron-log';

const DiscordRPC = require('discord-rpc');

const CLIENT_ID = '1516863057278537728';
const RECONNECT_DELAY_MS = 30_000;

export enum PresenceMode {
  CAREER = 'career',
  CUSTOM_GAMES = 'custom-games',
  LIVE_MATCH = 'live-match',
  MAIN_MENU = 'main-menu',
}

export type LiveMatchType = 'league' | 'faceit' | 'custom';

export type PresenceUpdate = {
  mode: PresenceMode;
  date?: string | null;
  map?: string | null;
  matchType?: LiveMatchType;
  role?: string | null;
  score?: [number, number];
  spectating?: boolean;
  teams?: [string, string];
};

type DiscordClient = {
  destroy?: () => Promise<void> | void;
  login: (options: { clientId: string }) => Promise<unknown>;
  setActivity: (activity: Record<string, unknown>) => Promise<unknown>;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  removeAllListeners: () => void;
};

let client: DiscordClient | null = null;
let connected = false;
let connecting: Promise<void> | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let lastUpdate: PresenceUpdate = { mode: PresenceMode.MAIN_MENU };
let lastNonLiveUpdate: PresenceUpdate = lastUpdate;
let enabled = true;
const startedAt = Date.now();

function truncatePresenceText(text: string): string {
  return text.length > 128 ? `${text.slice(0, 125)}...` : text;
}

function getMatchLabel(update: PresenceUpdate): string {
  return update.matchType === 'faceit'
    ? 'FACEIT Pug'
    : update.matchType === 'custom'
      ? 'Custom Game'
      : 'Match';
}

function getScoreText(update: PresenceUpdate): string | null {
  return update.score ? `${update.score[0]}-${update.score[1]}` : null;
}

function getRoleLabel(role?: string | null): string | null {
  switch (role) {
    case 'AWPER':
    case 'SNIPER':
      return 'AWPer';
    case 'IGL':
      return 'IGL';
    case 'RIFLER':
      return 'Rifler';
    default:
      return null;
  }
}

function getDetails(update: PresenceUpdate): string {
  if (update.mode === PresenceMode.LIVE_MATCH) {
    const verb = update.spectating ? 'Watching' : 'Playing';
    const details = [`${verb} ${getMatchLabel(update)}`];

    if (update.map) {
      details.push(update.map);
    }

    return truncatePresenceText(details.join(' | '));
  }

  if (update.mode === PresenceMode.CUSTOM_GAMES) {
    return 'In Custom Games';
  }

  if (update.mode === PresenceMode.CAREER) {
    const role = getRoleLabel(update.role);
    if (role) {
      return `In Career - ${role}`;
    }

    return update.date ? `In Career - ${update.date}` : 'In Career';
  }

  return 'In Main Menu';
}

function getState(update: PresenceUpdate): string | undefined {
  if (update.mode !== PresenceMode.LIVE_MATCH) {
    return undefined;
  }

  const score = getScoreText(update);
  const parts: string[] = [];

  if (update.matchType !== 'faceit' && update.teams) {
    parts.push(`${update.teams[0]} vs ${update.teams[1]}`);
  }

  if (score) {
    parts.push(score);
  }

  return parts.length ? truncatePresenceText(parts.join(' | ')) : undefined;
}

function clearReconnectTimer(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(): void {
  if (!enabled) {
    return;
  }

  if (reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect().catch((error) => log.debug('Discord Rich Presence reconnect failed', error));
  }, RECONNECT_DELAY_MS);
  reconnectTimer.unref();
}

async function connect(): Promise<void> {
  if (!enabled) {
    return;
  }

  if (connected || connecting) {
    return connecting;
  }

  clearReconnectTimer();
  client = new DiscordRPC.Client({ transport: 'ipc' });
  client.on('ready', () => {
    connected = true;
    update(lastUpdate).catch((error) => log.debug('Discord Rich Presence update failed', error));
  });
  client.on('disconnected', () => {
    connected = false;
    connecting = null;
    scheduleReconnect();
  });

  connecting = client
    .login({ clientId: CLIENT_ID })
    .then((): void => undefined)
    .catch((error) => {
      connected = false;
      connecting = null;
      log.debug('Discord Rich Presence unavailable', error);
      scheduleReconnect();
    });

  return connecting;
}

export async function start(): Promise<void> {
  return connect();
}

export async function update(update: PresenceUpdate): Promise<void> {
  lastUpdate = update;

  if (update.mode !== PresenceMode.LIVE_MATCH) {
    lastNonLiveUpdate = update;
  }

  if (!enabled) {
    return;
  }

  if (!connected || !client) {
    connect().catch((error) => log.debug('Discord Rich Presence connection failed', error));
    return;
  }

  await client.setActivity({
    details: getDetails(update),
    state: getState(update),
    startTimestamp: startedAt,
    instance: false,
  });
}

export async function restoreNonLive(): Promise<void> {
  await update(lastNonLiveUpdate);
}

export async function setEnabled(value: boolean): Promise<void> {
  enabled = value;

  if (!enabled) {
    await stop();
    return;
  }

  await start();
}

export async function stop(): Promise<void> {
  clearReconnectTimer();
  connected = false;
  connecting = null;

  if (!client) {
    return;
  }

  const activeClient = client;
  client = null;
  activeClient.removeAllListeners();
  await activeClient.destroy?.();
}
