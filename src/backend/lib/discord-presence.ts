import log from 'electron-log';

const DiscordRPC = require('discord-rpc');

const CLIENT_ID = '1516863057278537728';
const RECONNECT_DELAY_MS = 30_000;

export enum PresenceMode {
  CAREER = 'career',
  CUSTOM_GAMES = 'custom-games',
  MAIN_MENU = 'main-menu',
}

type PresenceUpdate = {
  mode: PresenceMode;
  date?: string | null;
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
const startedAt = Date.now();

function getDetails(update: PresenceUpdate): string {
  if (update.mode === PresenceMode.CUSTOM_GAMES) {
    return 'In Custom Games';
  }

  if (update.mode === PresenceMode.CAREER) {
    return update.date ? `In Career - ${update.date}` : 'In Career';
  }

  return 'In Main Menu';
}

function clearReconnectTimer(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(): void {
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

  if (!connected || !client) {
    connect().catch((error) => log.debug('Discord Rich Presence connection failed', error));
    return;
  }

  await client.setActivity({
    details: getDetails(update),
    startTimestamp: startedAt,
    instance: false,
  });
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
