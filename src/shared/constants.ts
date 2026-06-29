/**
 * Shared constants and enums between main and renderer process.
 *
 * It is important to be careful with not importing any packages
 * specific to either platform as it may cause build failures.
 *
 * @module
 */

/**
 * Generic settings and configuration.
 *
 * @enum
 */
export enum Application {
  CUSTOM_DIR = 'custom',
  DATABASE_NAME_FORMAT = 'save_%s.db',
  DATABASES_DIR = 'saves',
  LOCALE_DIR = 'locale',
  GH_API_BODY_LIMIT = 65536,
  LOGGING_LEVEL = 'debug',
  MAP_POOL_LENGTH = 7,
  PLUGINS_DIR = 'plugins',
  SQUAD_MIN_LENGTH = 5,
  SEASON_START_DAY = 1,
  SEASON_START_MONTH = 6,
  SIMULATION_SCALING_FACTOR = 200,
  TRAINING_FREQUENCY = 7,
}

export const NewSaveSeasonStartDate = '2026-01-01T00:00:00.000Z';

export type CustomGameOptions = {
  mode: 'classic' | 'deathmatch';
  deathmatch?: {
    gameTime: number;
    headshotOnly: boolean;
    pistolsOnly: boolean;
    forceBuy: boolean;
  };
};

/** @enum */
export enum AwardAction {
  CONFETTI,
  EMAIL,
}

/** @enum */
export enum AwardType {
  CHAMPION,
  PROMOTION,
  QUALIFY,
}

/**
 * XP bonus types.
 *
 * @enum
 */
export enum BonusType {
  MAP,
  SERVER,
  FACILITY,
}

/**
 * Idiomatic bot difficulty names.
 *
 * @enum
 */
export enum BotDifficulty {
  ABYSMAL = 'Abysmal',
  NOTGOOD = 'NotGood',
  WORSE = 'Worse',
  REALLYBAD = 'ReallyBad',
  POOR = 'Poor',
  BAD = 'Bad',
  LOW = 'Low',
  AVG = 'Avg',
  MEDIUM = 'Medium',
  SOLID = 'Solid',
  FRAGGER = 'Fragger',
  STAR = 'Star',
}
export enum PlayerRole {
  RIFLER = 'RIFLER',
  SNIPER = 'SNIPER',
}
export enum UserRole {
  RIFLER = 'RIFLER',
  IGL = 'IGL',
  AWPER = 'AWPER',
}
export enum PersonalityTemplate {
  LURK = 'LurkPersonality',
  ALURK = 'ALurkPersonality',
  PLURK = 'PLurkPersonality',
  ASNIPER = 'ASniperPersonality',
  SNIPER = 'SniperPersonality',
  PSNIPER = 'PSniperPersonality',
  ARIFLE = 'ARiflePersonality',
  RIFLE = 'RiflePersonality',
  PRIFLE = 'PRiflePersonality',
  ENTRY = 'EntryPersonality',
}

/**
 * Upper and lower bracket identifiers.
 *
 * @enum
 */
export enum BracketIdentifier {
  UPPER = 1,
  LOWER = 2,
}

/**
 * Bracket round friendly names.
 *
 * @enum
 */
export enum BracketRoundName {
  RO32 = 'RO32',
  RO16 = 'RO16',
  QF = 'Quarterfinals',
  SF = 'Semifinals',
  GF = 'Grand Final',
}

/**
 * Calendar loop entry types.
 *
 * @enum
 */
export enum CalendarEntry {
  COMPETITION_END = '/competition/end',
  COMPETITION_START = '/competition/start',
  EMAIL_SEND = '/email/send',
  MATCHDAY_NPC = '/matchday/npc',
  MATCHDAY_USER = '/matchday/user',
  SEASON_START = '/season/start',
  TRANSFER_PARSE = '/transfer/parse',
  PLAYER_SCOUTING_CHECK = '/player/scouting/check',
  PLAYER_CONTRACT_EXPIRE = '/player/contract-expire',
  PLAYER_CONTRACT_REVIEW = '/player/contract-review',
  PLAYER_CONTRACT_EXTENSION_EVAL = '/player/contract-extension-eval',
  TRANSFER_OFFER_EXPIRY_CHECK = '/transfer/offer-expiry-check',
}

/**
 * How often something occurs based off of number of weeks.
 *
 * @enum
 */
export enum CalendarFrequency {
  WEEKLY = 1,
  BI_WEEKLY = 2,
  MONTHLY = 4,
  QUARTERLY = 12,
  YEARLY = 52,
}

/**
 * Calendar units.
 *
 * @enum
 */
export enum CalendarUnit {
  DAY = 'days',
  WEEK = 'weeks',
  MONTH = 'months',
  YEAR = 'years',
}

/**
 * Calendar Date Format types.
 *
 * @enum
 */
export enum CalendarDateFormat {
  EU = 'dd/MM/yyyy',
  US = 'MM/dd/yyyy',
}

/**
 * The possible status for a competition.
 *
 * @enum
 */
export enum CompetitionStatus {
  SCHEDULED,
  STARTED,
  COMPLETED,
}

/** @enum */
export enum ErrorCode {
  EABANDONED = 'EABANDONED',
  ENOENT = 'ENOENT',
  ERUNNING = 'ERUNNING',
  EINVAL = 'EINVAL',
}

/**
 * Federation unique identifiers.
 *
 * @enum
 */
export enum FederationSlug {
  ESPORTS_AMERICAS = 'americas',
  ESPORTS_ASIA = 'asia',
  ESPORTS_EUROPA = 'europa',
  ESPORTS_OCE = 'oceania',
  ESPORTS_WORLD = 'world',
}

/**
 * Game variants.
 *
 * @enum
 */
export enum Game {
  CSGO = 'csgo',
}

/**
 * League unique identifiers.
 *
 * @enum
 */
export enum LeagueSlug {
  ESPORTS_LEAGUE = 'esl',
  ESPORTS_PRO_LEAGUE = 'espl',
  ESPORTS_MAJOR = 'major',
  ESPORTS_BLAST = 'blast',
  ESPORTS_CCT = 'cct',
  ESPORTS_CCT_GLOBAL = 'cct-global',
  ESPORTS_IEM_COLOGNE_QUALIFIER = 'iem-cologne-qualifier',
  ESPORTS_IEM_COLOGNE = 'iem-cologne',
  ESPORTS_ESL_CHALLENGER = 'esl-challenger',
  ESPORTS_ESEA_CASH_CUP = 'esea-cash-cup',
  ESPORTS_IEM_KRAKOW_QUALIFIER = 'iem-krakow-qualifier',
  ESPORTS_IEM_KRAKOW = 'iem-krakow',
}

/**
 * Electron log level.
 *
 * @enum
 */
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  VERBOSE = 'verbose',
  DEBUG = 'debug',
  SILLY = 'silly',
}

/**
 * Support locale types.
 *
 * @enum
 */
export enum LocaleIdentifier {
  EN = 'en',
  ES = 'es',
  FR = 'fr',
  IT = 'it',
  PT = 'pt',
}

/**
 * IPC listener route names.
 *
 * @enum
 */
export enum IPCRoute {
  APP_DETECT_GAME = '/app/detect/game',
  APP_DETECT_DEDICATED_SERVER = '/app/detect/dedicated-server',
  APP_DETECT_STEAM = '/app/detect/steam',
  APP_DIALOG = '/app/dialog',
  APP_EXTERNAL = '/app/external',
  APP_LOCALE = '/app/locale',
  APP_MESSAGE_BOX = '/app/messageBox',
  APP_INFO = '/app/info',
  APP_PRESENCE_UPDATE = '/app/presence/update',
  APP_QUIT = '/app/quit',
  APP_ARENA_MODE_INSTALL = '/app/arena-mode/install',
  APP_ARENA_MODE_STATUS = '/app/arena-mode/status',
  APP_ARENA_MODE_UNINSTALL = '/app/arena-mode/uninstall',
  APP_STATUS = '/app/status',
  APP_UPLOAD = '/app/upload',
  APP_WHATS_NEW = '/app/whatsNew',
  BLAZONRY_ALL = '/blazonry/all',
  BONUS_ALL = '/bonus/all',
  BONUS_BUY = '/bonus/buy',
  CALENDAR_CONFIRM_CLOSE = '/calendar/confirm-close',
  CALENDAR_CREATE = '/calendar/create',
  CALENDAR_FIND = '/calendar/find',
  CALENDAR_REQUEST_MAIN_MENU = '/calendar/request-main-menu',
  CALENDAR_SIM = '/calendar/sim',
  CALENDAR_START = '/calendar/start',
  CALENDAR_STOP = '/calendar/stop',
  COMPETITIONS_ALL = '/competitions/all',
  COMPETITIONS_FIND = '/competitions/find',
  COMPETITIONS_PARTICIPANT_LINEUP = '/competitions/participant-lineup',
  COMPETITIONS_WINNERS = '/competitions/winners',
  CONFETTI_START = '/confetti/start',
  CONTINENTS_ALL = '/continents/all',
  DATABASE_CONNECT = '/database/connect',
  DATABASE_DISCONNECT = '/database/disconnect',
  DATABASE_CURRENT = '/database/current',
  EMAILS_ALL = '/emails/all',
  EMAILS_DELETE = '/emails/delete',
  EMAILS_NEW = '/emails/new',
  EMAILS_UPDATE_DIALOGUE = '/emails/update/dialogue',
  EMAILS_UPDATE_MANY = '/emails/update/many',
  FEDERATIONS_ALL = '/federarions/all',
  ISSUES_ALL = '/issues/all',
  ISSUES_CREATE = '/issues/create',
  ISSUES_COMMENTS = '/issues/comments',
  ISSUES_COMMENTS_CREATE = '/issues/comments/create',
  ISSUES_FIND = '/issues/find',
  MAP_POOL_FIND = '/mapPool/find',
  MAP_POOL_UPDATE = '/mapPool/update',
  MAP_POOL_UPDATE_MANY = '/mapPool/updateMany',
  MATCH_FIND = '/match/find',
  MATCH_FIND_VETO_LIST = '/match/find/veto-list',
  MATCH_UPDATE_MAP_LIST = '/match/update/map-list',
  MATCH_UPDATE_VETO_LIST = '/match/update/veto-list',
  MATCHES_ALL = '/matches/all',
  MATCHES_COUNT = '/matches/count',
  MATCHES_GLOBAL_PLAYER_STATS = '/matches/global-player-stats',
  MATCHES_PLAYER_RATING_GAMES = '/matches/player-rating-games',
  MATCHES_PREVIOUS = '/matches/previous',
  MATCHES_RECENT_PLAYER_RATINGS = '/matches/recent-player-ratings',
  MATCHES_UPCOMING = '/matches/upcoming',
  MODS_ALL = '/mods/all',
  MODS_DELETE = '/mods/delete',
  MODS_DOWNLOAD = '/mods/download',
  MODS_DOWNLOAD_PROGRESS = '/mods/download-progress',
  MODS_DOWNLOADING = '/mods/downloading',
  MODS_ERROR = '/mods/error',
  MODS_FINISHED = '/mods/finished',
  MODS_GET_INSTALLED = '/mods/get-installed',
  MODS_INSTALLING = '/mods/installing',
  PLAY_EXHIBITION = '/play/exhibition',
  PLAY_EXHIBITION_FEDERATIONS = '/play/exhibition/federations',
  PLAY_EXHIBITION_TEAMS = '/play/exhibition/teams',
  PLAY_EXHIBITION_PLAYERS = '/play/exhibition/players',
  PLAY_PROGRESS = '/play/progress',
  PLAY_START = '/play/start',
  PLAYERS_ALL = '/players/all',
  PLAYERS_COUNT = '/players/count',
  PLAYERS_FIND = '/players/find',
  PLUGINS_CHECKING = '/plugins/checking',
  PLUGINS_DOWNLOADING = '/plugins/downloading',
  PLUGINS_DOWNLOAD_PROGRESS = '/plugins/download-progress',
  PLUGINS_ERROR = '/plugins/error',
  PLUGINS_FINISHED = '/plugins/finished',
  PLUGINS_INSTALLING = '/plugins/installing',
  PLUGINS_NO_UPDATE = '/plugins/noUpdate',
  PLUGINS_START = '/plugins/start',
  PROFILES_CREATE = '/profiles/create',
  PROFILES_CURRENT = '/profiles/current',
  PROFILES_NPC_MATCH_STATS_BACKFILL = '/profiles/npc-match-stats/backfill',
  PROFILES_NPC_MATCH_STATS_BACKFILL_PROGRESS = '/profiles/npc-match-stats/backfill-progress',
  PROFILES_TRAIN = '/profiles/train',
  PROFILES_UPDATE = '/profiles/update',
  SAVES_ALL = '/saves/all',
  SAVES_DELETE = '/saves/delete',
  SHORTLIST_ALL = '/shortlist/all',
  SHORTLIST_CREATE = '/shortlist/create',
  SHORTLIST_DELETE = '/shortlist/delete',
  SHORTLIST_UPDATE = '/shortlist/update',
  SQUAD_ALL = '/squad/all',
  SQUAD_UPDATE = '/squad/update',
  SQUAD_RELEASE_PLAYER = '/squad/release/player',
  TEAM_RANKING = '/team/ranking',
  TEAM_TRANSFERS = '/team/transfers',
  TEAMS_ALL = '/teams/all',
  TEAMS_CREATE = '/teams/create',
  TEAMS_UPDATE = '/teams/update',
  TIERS_ALL = '/tiers/all',
  TRANSFER_ACCEPT = '/transfer/accept',
  TRANSFER_ALL = '/transfer/all',
  TRANSFER_CREATE = '/transfer/create',
  TRANSFER_REJECT = '/transfer/reject',
  TRANSFER_UPDATE = '/transfer/update',
  UPDATER_CHECKING = '/updater/checking',
  UPDATER_DOWNLOADING = '/updater/downloading',
  UPDATER_FINISHED = '/updater/finished',
  UPDATER_INSTALL = '/updater/install',
  UPDATER_NO_UPDATE = '/updater/noUpdate',
  UPDATER_START = '/updater/start',
  WINDOW_CLOSE = '/window/close',
  WINDOW_SEND = '/window/send',
  WINDOW_OPEN = '/window/open',
  WINDOW_SET_FULLSCREEN = '/window/set-fullscreen',
}

/** @enum */
export enum IssueType {
  BUG,
  FEATURE,
}

/** @enum */
export enum MapVetoAction {
  BAN = 'ban',
  PICK = 'pick',
  DECIDER = 'decider',
}

/**
 * The possible outcomes for a match between two teams.
 *
 * @enum
 */
export enum MatchResult {
  WIN,
  DRAW,
  LOSS,
}

/**
 * The possible status for a match.
 *
 * @enum
 */
export enum MatchStatus {
  // the two matches leading to this one are not completed yet
  LOCKED,

  // one team is ready and waiting for the other one
  WAITING,

  // both teams are ready to start
  READY,

  // the match is completed
  COMPLETED,

  // the match is being played
  PLAYING,
}

/**
 * Persona role names.
 *
 * @enum
 */
export enum PersonaRole {
  ASSISTANT = 'Assistant Manager',
  MANAGER = 'Manager',
}

/**
 * Score simulation modes.
 *
 * @enum
 */
export enum SimulationMode {
  DEFAULT = 'default',
  DRAW = 'draw',
  LOSE = 'lose',
  WIN = 'win',
}

/**
 * Tier unique identifiers.
 *
 * @enum
 */
export enum TierSlug {
  BLAST_FINALS = 'blast:finals',
  CCT_GLOBAL_FINALS = 'cct:global-finals',
  CCT_OCE_PLAYOFFS = 'cct:oceania:playoffs',
  CCT_OCE_SERIES = 'cct:oceania:series',
  CCT_SERIES = 'cct:series',
  CCT_SERIES_PLAYOFFS = 'cct:series:playoffs',
  ESEA_CASH_CUP = 'esea:cash-cup',
  ESL_CHALLENGER = 'esl-challenger:group-stage',
  ESL_CHALLENGER_PLAYOFFS = 'esl-challenger:playoffs',
  EXHIBITION_FRIENDLY = 'exhibition:friendly',
  IEM_COLOGNE_GROUP_A = 'iem:cologne:group-a',
  IEM_COLOGNE_GROUP_B = 'iem:cologne:group-b',
  IEM_COLOGNE_OPEN_QUALIFIER = 'iem:cologne:open-qualifier',
  IEM_COLOGNE_PLAYOFFS = 'iem:cologne:playoffs',
  IEM_KRAKOW_GROUP_A = 'iem:krakow:group-a',
  IEM_KRAKOW_GROUP_B = 'iem:krakow:group-b',
  IEM_KRAKOW_OPEN_QUALIFIER = 'iem:krakow:open-qualifier',
  IEM_KRAKOW_PLAYOFFS = 'iem:krakow:playoffs',
  LEAGUE_ADVANCED = 'league:advanced',
  LEAGUE_ADVANCED_PLAYOFFS = 'league:advanced:playoffs',
  LEAGUE_INTERMEDIATE = 'league:intermediate',
  LEAGUE_INTERMEDIATE_PLAYOFFS = 'league:intermediate:playoffs',
  LEAGUE_MAIN = 'league:main',
  LEAGUE_MAIN_PLAYOFFS = 'league:main:playoffs',
  LEAGUE_OPEN = 'league:open',
  LEAGUE_OPEN_PLAYOFFS = 'league:open:playoffs',
  LEAGUE_PRO = 'league:pro',
  LEAGUE_PRO_PLAYOFFS = 'league:pro:playoffs',
  MAJOR_ASIA_OPEN_QUALIFIER_1 = 'major:asia:open-qualifier:1',
  MAJOR_ASIA_OPEN_QUALIFIER_2 = 'major:asia:open-qualifier:2',
  MAJOR_CHINA_OPEN_QUALIFIER_1 = 'major:china:open-qualifier:1',
  MAJOR_CHINA_OPEN_QUALIFIER_2 = 'major:china:open-qualifier:2',
  MAJOR_ASIA_RMR = 'major:asia:rmr',
  MAJOR_OCE_OPEN_QUALIFIER_1 = 'major:oce:open-qualifier:1',
  MAJOR_OCE_OPEN_QUALIFIER_2 = 'major:oce:open-qualifier:2',
  MAJOR_AMERICAS_OPEN_QUALIFIER_1 = 'major:americas:open-qualifier:1',
  MAJOR_AMERICAS_OPEN_QUALIFIER_2 = 'major:americas:open-qualifier:2',
  MAJOR_AMERICAS_RMR = 'major:americas:rmr',
  MAJOR_EUROPE_OPEN_QUALIFIER_1 = 'major:europe:open-qualifier:1',
  MAJOR_EUROPE_OPEN_QUALIFIER_2 = 'major:europe:open-qualifier:2',
  MAJOR_EUROPE_OPEN_QUALIFIER_3 = 'major:europe:open-qualifier:3',
  MAJOR_EUROPE_OPEN_QUALIFIER_4 = 'major:europe:open-qualifier:4',
  MAJOR_EUROPE_RMR_A = 'major:europe:rmr:a',
  MAJOR_EUROPE_RMR_B = 'major:europe:rmr:b',
  MAJOR_CHALLENGERS_STAGE = 'major:challengers-stage',
  MAJOR_LEGENDS_STAGE = 'major:legends-stage',
  MAJOR_CHAMPIONS_STAGE = 'major:champions-stage',
}

export type CompetitionHostingLocation = {
  city: string;
  countryCode: string;
};

export type CompetitionOrganizer = {
  name: string;
  locations: CompetitionHostingLocation[];
};

const EuropeRmrHostingLocations: CompetitionHostingLocation[] = [
  { city: 'Bucharest', countryCode: 'RO' },
  { city: 'Copenhagen', countryCode: 'DK' },
  { city: 'Hamburg', countryCode: 'DE' },
  { city: 'Stockholm', countryCode: 'SE' },
  { city: 'Madrid', countryCode: 'ES' },
];

const AsiaRmrHostingLocations: CompetitionHostingLocation[] = [
  { city: 'Shanghai', countryCode: 'CN' },
  { city: 'Ulaanbaatar', countryCode: 'MN' },
  { city: 'Chengdu', countryCode: 'CN' },
  { city: 'Shenzhen', countryCode: 'CN' },
  { city: 'Melbourne', countryCode: 'AU' },
];

const AmericasRmrHostingLocations: CompetitionHostingLocation[] = [
  { city: 'Monterrey', countryCode: 'MX' },
  { city: 'Austin', countryCode: 'US' },
  { city: 'Rio de Janeiro', countryCode: 'BR' },
  { city: 'Buenos Aires', countryCode: 'ARG' },
  { city: 'Dallas', countryCode: 'US' },
];

const MajorHostingLocations: CompetitionHostingLocation[] = [
  { city: 'Berlin', countryCode: 'DE' },
  { city: 'Paris', countryCode: 'FR' },
  { city: 'Sydney', countryCode: 'AU' },
  { city: 'Rio de Janeiro', countryCode: 'BR' },
  { city: 'Boston', countryCode: 'US' },
  { city: 'New York', countryCode: 'US' },
  { city: 'Shanghai', countryCode: 'CN' },
  { city: 'Beijing', countryCode: 'CN' },
  { city: 'Copenhagen', countryCode: 'DK' },
  { city: 'London', countryCode: 'UK' },
  { city: 'Antwerp', countryCode: 'NL' },
  { city: 'Astana', countryCode: 'KZ' },
  { city: 'Istanbul', countryCode: 'TR' },
  { city: 'Kyiv', countryCode: 'UA' },
  { city: 'Prague', countryCode: 'CZ' },
  { city: 'Singapore', countryCode: 'SG' },
];

export const MajorHostingOrganizers: CompetitionOrganizer[] = [
  {
    name: 'PGL',
    locations: [
      { city: 'Antwerp', countryCode: 'NL' },
      { city: 'London', countryCode: 'UK' },
      { city: 'Copenhagen', countryCode: 'DK' },
      { city: 'New York', countryCode: 'US' },
      { city: 'Stockholm', countryCode: 'SE' },
    ],
  },
  {
    name: 'IEM',
    locations: [
      { city: 'Sydney', countryCode: 'AU' },
      { city: 'Boston', countryCode: 'US' },
      { city: 'New York', countryCode: 'US' },
      { city: 'Rio', countryCode: 'BR' },
      { city: 'London', countryCode: 'UK' },
      { city: 'Katowice', countryCode: 'PL' },
      { city: 'Madrid', countryCode: 'ES' },
    ],
  },
  {
    name: 'BLAST',
    locations: [
      { city: 'Berlin', countryCode: 'DE' },
      { city: 'Paris', countryCode: 'FR' },
      { city: 'Copenhagen', countryCode: 'DK' },
      { city: 'London', countryCode: 'UK' },
      { city: 'Lisbon', countryCode: 'PT' },
    ],
  },
  {
    name: 'Perfect World',
    locations: [
      { city: 'Shanghai', countryCode: 'CN' },
      { city: 'Beijing', countryCode: 'CN' },
    ],
  },
  {
    name: 'StarLadder',
    locations: [
      { city: 'Astana', countryCode: 'KZ' },
      { city: 'Istanbul', countryCode: 'TR' },
      { city: 'Kyiv', countryCode: 'UA' },
      { city: 'Prague', countryCode: 'CZ' },
      { city: 'Singapore', countryCode: 'SG' },
    ],
  },
];

export const CompetitionHostingLocations: Partial<Record<TierSlug, CompetitionHostingLocation[]>> =
  {
    [TierSlug.MAJOR_EUROPE_RMR_A]: EuropeRmrHostingLocations,
    [TierSlug.MAJOR_EUROPE_RMR_B]: EuropeRmrHostingLocations,
    [TierSlug.MAJOR_ASIA_RMR]: AsiaRmrHostingLocations,
    [TierSlug.MAJOR_AMERICAS_RMR]: AmericasRmrHostingLocations,
    [TierSlug.BLAST_FINALS]: [
      { city: 'Copenhagen', countryCode: 'DK' },
      { city: 'Malta', countryCode: 'MT' },
    ],
    [TierSlug.CCT_GLOBAL_FINALS]: [
      { city: 'Bucharest', countryCode: 'RO' },
      { city: 'Jonkoping', countryCode: 'SE' },
      { city: 'Barcelona', countryCode: 'ES' },
      { city: 'Budapest', countryCode: 'HU' },
      { city: 'Belgrade', countryCode: 'RS' },
      { city: 'Riga', countryCode: 'LV' },
      { city: 'Istanbul', countryCode: 'TR' },
    ],
    [TierSlug.ESL_CHALLENGER]: [
      { city: 'Atlanta', countryCode: 'US' },
      { city: 'Valencia', countryCode: 'ES' },
      { city: 'Jonkoping', countryCode: 'SE' },
      { city: 'Rotterdam', countryCode: 'NL' },
      { city: 'Prague', countryCode: 'CZ' },
      { city: 'Gdansk', countryCode: 'PL' },
      { city: 'Munich', countryCode: 'DE' },
    ],
    [TierSlug.ESL_CHALLENGER_PLAYOFFS]: [
      { city: 'Atlanta', countryCode: 'US' },
      { city: 'Valencia', countryCode: 'ES' },
      { city: 'Jonkoping', countryCode: 'SE' },
      { city: 'Rotterdam', countryCode: 'NL' },
      { city: 'Prague', countryCode: 'CZ' },
      { city: 'Gdansk', countryCode: 'PL' },
      { city: 'Munich', countryCode: 'DE' },
    ],
    [TierSlug.MAJOR_CHALLENGERS_STAGE]: MajorHostingLocations,
    [TierSlug.MAJOR_LEGENDS_STAGE]: MajorHostingLocations,
    [TierSlug.MAJOR_CHAMPIONS_STAGE]: MajorHostingLocations,
    [TierSlug.LEAGUE_PRO]: [
      { city: 'Malta', countryCode: 'MT' },
      { city: 'Dusseldorf', countryCode: 'DE' },
      { city: 'Odense', countryCode: 'DK' },
      { city: 'Montpellier', countryCode: 'FR' },
      { city: 'Dallas', countryCode: 'US' },
      { city: 'Sao Paulo', countryCode: 'BR' },
      { city: 'London', countryCode: 'UK' },
    ],
    [TierSlug.LEAGUE_PRO_PLAYOFFS]: [
      { city: 'Malta', countryCode: 'MT' },
      { city: 'Dusseldorf', countryCode: 'DE' },
      { city: 'Odense', countryCode: 'DK' },
      { city: 'Montpellier', countryCode: 'FR' },
      { city: 'Dallas', countryCode: 'US' },
      { city: 'Sao Paulo', countryCode: 'BR' },
      { city: 'London', countryCode: 'UK' },
    ],
    [TierSlug.IEM_COLOGNE_GROUP_A]: [{ city: 'Cologne', countryCode: 'DE' }],
    [TierSlug.IEM_COLOGNE_GROUP_B]: [{ city: 'Cologne', countryCode: 'DE' }],
    [TierSlug.IEM_COLOGNE_PLAYOFFS]: [{ city: 'Cologne', countryCode: 'DE' }],
    [TierSlug.IEM_KRAKOW_GROUP_A]: [{ city: 'Krakow', countryCode: 'PL' }],
    [TierSlug.IEM_KRAKOW_GROUP_B]: [{ city: 'Krakow', countryCode: 'PL' }],
    [TierSlug.IEM_KRAKOW_PLAYOFFS]: [{ city: 'Krakow', countryCode: 'PL' }],
  };

/**
 * Theme settings.
 *
 * @enum
 */
export enum ThemeSetting {
  LIGHT = 'fantasy',
  DARK = 'sunset',
}

/**
 * Theme types.
 *
 * @enum
 */
export enum ThemeType {
  LIGHT = 'light',
  DARK = 'dark',
  SYSTEM = 'system',
}

/**
 * Threading status types.
 *
 * @enum
 */
export enum ThreadingStatus {
  COMPLETED = 'completed',
  FAILED = 'failed',
  RUNNING = 'running',
}

/**
 * Types of threading targets, or functions
 * that will run in their own thread.
 *
 * @enum
 */
export enum ThreadingTarget {
  FIBONACCI = 'fibonacci',
  LISTING = 'listing',
}

/** @enum */
export enum TransferStatus {
  TEAM_ACCEPTED,
  TEAM_PENDING,
  TEAM_REJECTED,
  PLAYER_ACCEPTED,
  PLAYER_PENDING,
  PLAYER_REJECTED,
  EXPIRED,
}

/** @enum */
export enum WeaponTemplate {
  RIFLE = 'Rifle',
  SNIPER = 'Sniper',
}

/**
 * Browser Window unique identifier names.
 *
 * @enum
 */
export enum WindowIdentifier {
  Landing = 'landing',
  Main = 'main',
  Modal = 'modal',
  Splash = 'splash',
  Threading = 'threading',
}

/**
 * Promotion and relegation zones.
 *
 * @enum
 */
export enum Zones {
  LEAGUE_PROMOTION_AUTO_START = 1,
  LEAGUE_PROMOTION_AUTO_END = 3,
  LEAGUE_PROMOTION_PLAYOFFS_START = 3,
  LEAGUE_PROMOTION_PLAYOFFS_END = 6,
  LEAGUE_MID_TABLE_START = 5,
  LEAGUE_MID_TABLE_END = 17,
  LEAGUE_RELEGATION_START = 18,
  LEAGUE_RELEGATION_END = 20,
}

/**
 * Tracks possible competition awards.
 *
 * @constant
 */
export const Awards = [
  {
    on: CalendarEntry.COMPETITION_END,
    target: TierSlug.BLAST_FINALS,
    type: AwardType.CHAMPION,
    action: [AwardAction.CONFETTI, AwardAction.EMAIL],
    start: Zones.LEAGUE_PROMOTION_AUTO_START,
  },
  {
    on: CalendarEntry.COMPETITION_END,
    target: TierSlug.CCT_SERIES_PLAYOFFS,
    type: AwardType.CHAMPION,
    action: [AwardAction.CONFETTI, AwardAction.EMAIL],
    start: Zones.LEAGUE_PROMOTION_AUTO_START,
  },
  {
    on: CalendarEntry.COMPETITION_END,
    target: TierSlug.CCT_OCE_PLAYOFFS,
    type: AwardType.CHAMPION,
    action: [AwardAction.CONFETTI, AwardAction.EMAIL],
    start: Zones.LEAGUE_PROMOTION_AUTO_START,
  },
  {
    on: CalendarEntry.COMPETITION_END,
    target: TierSlug.CCT_GLOBAL_FINALS,
    type: AwardType.CHAMPION,
    action: [AwardAction.CONFETTI, AwardAction.EMAIL],
    start: Zones.LEAGUE_PROMOTION_AUTO_START,
  },
  {
    on: CalendarEntry.COMPETITION_END,
    target: TierSlug.ESL_CHALLENGER_PLAYOFFS,
    type: AwardType.CHAMPION,
    action: [AwardAction.CONFETTI, AwardAction.EMAIL],
    start: Zones.LEAGUE_PROMOTION_AUTO_START,
  },
  {
    on: CalendarEntry.COMPETITION_END,
    target: TierSlug.IEM_COLOGNE_PLAYOFFS,
    type: AwardType.CHAMPION,
    action: [AwardAction.CONFETTI, AwardAction.EMAIL],
    start: Zones.LEAGUE_PROMOTION_AUTO_START,
  },
  {
    on: CalendarEntry.COMPETITION_END,
    target: TierSlug.ESEA_CASH_CUP,
    type: AwardType.CHAMPION,
    action: [AwardAction.CONFETTI, AwardAction.EMAIL],
    start: Zones.LEAGUE_PROMOTION_AUTO_START,
  },
  {
    on: CalendarEntry.COMPETITION_END,
    target: TierSlug.IEM_KRAKOW_PLAYOFFS,
    type: AwardType.CHAMPION,
    action: [AwardAction.CONFETTI, AwardAction.EMAIL],
    start: Zones.LEAGUE_PROMOTION_AUTO_START,
  },
  {
    on: CalendarEntry.COMPETITION_END,
    target: TierSlug.LEAGUE_OPEN_PLAYOFFS,
    type: AwardType.CHAMPION,
    action: [AwardAction.CONFETTI, AwardAction.EMAIL],
    start: Zones.LEAGUE_PROMOTION_AUTO_START,
  },
  {
    on: CalendarEntry.COMPETITION_END,
    target: TierSlug.LEAGUE_OPEN_PLAYOFFS,
    type: AwardType.PROMOTION,
    action: [AwardAction.CONFETTI, AwardAction.EMAIL],
    start: Zones.LEAGUE_PROMOTION_AUTO_START,
    end: Zones.LEAGUE_PROMOTION_AUTO_END,
  },
  {
    on: CalendarEntry.COMPETITION_END,
    target: TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
    type: AwardType.CHAMPION,
    action: [AwardAction.CONFETTI, AwardAction.EMAIL],
    start: Zones.LEAGUE_PROMOTION_AUTO_START,
  },
  {
    on: CalendarEntry.COMPETITION_END,
    target: TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
    type: AwardType.PROMOTION,
    action: [AwardAction.CONFETTI, AwardAction.EMAIL],
    start: Zones.LEAGUE_PROMOTION_AUTO_START,
    end: Zones.LEAGUE_PROMOTION_AUTO_END,
  },
  {
    on: CalendarEntry.COMPETITION_END,
    target: TierSlug.LEAGUE_MAIN_PLAYOFFS,
    type: AwardType.CHAMPION,
    action: [AwardAction.CONFETTI, AwardAction.EMAIL],
    start: Zones.LEAGUE_PROMOTION_AUTO_START,
  },
  {
    on: CalendarEntry.COMPETITION_END,
    target: TierSlug.LEAGUE_MAIN_PLAYOFFS,
    type: AwardType.PROMOTION,
    action: [AwardAction.CONFETTI, AwardAction.EMAIL],
    start: Zones.LEAGUE_PROMOTION_AUTO_START,
    end: Zones.LEAGUE_PROMOTION_AUTO_END,
  },
  {
    on: CalendarEntry.COMPETITION_END,
    target: TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
    type: AwardType.CHAMPION,
    action: [AwardAction.CONFETTI, AwardAction.EMAIL],
    start: Zones.LEAGUE_PROMOTION_AUTO_START,
  },
  {
    on: CalendarEntry.COMPETITION_END,
    target: TierSlug.LEAGUE_PRO_PLAYOFFS,
    type: AwardType.CHAMPION,
    action: [AwardAction.CONFETTI, AwardAction.EMAIL],
    start: Zones.LEAGUE_PROMOTION_AUTO_START,
  },
];

/**
 * Elo actual score values.
 *
 * @constant
 */
export const EloScore = {
  [MatchResult.WIN]: 1.0,
  [MatchResult.DRAW]: 0.5,
  [MatchResult.LOSS]: 0,
};

/**
 * Elo ratings per tier.
 *
 * @constant
 */
export const EloRatings: Partial<Record<TierSlug, number>> = {
  [TierSlug.LEAGUE_OPEN]: 1000,
  [TierSlug.LEAGUE_INTERMEDIATE]: 1250,
  [TierSlug.LEAGUE_MAIN]: 1500,
  [TierSlug.LEAGUE_ADVANCED]: 1750,
  [TierSlug.LEAGUE_PRO]: 2000,
};

/**
 * Game settings.
 *
 * @constant
 */
export const GameSettings = {
  // general settings
  BOT_VOICEPITCH_MAX: 125,
  BOT_VOICEPITCH_MIN: 80,
  LOGS_DIR: 'logs',
  SERVER_CVAR_GAMEOVER_DELAY: 1,
  SERVER_CVAR_MAXROUNDS: 24,
  SERVER_CVAR_MAXROUNDS_OT: 6,
  SERVER_CVAR_FREEZETIME: 10,
  SQUAD_STARTERS_NUM: 5,
  STEAM_EXE: 'steam.exe',
  STEAM_LIBRARIES_FILE: 'steamapps/libraryfolders.vdf',
  WIN_AWARD_AMOUNT: 100,

  // csgo settings
  CSGO_APPID: 4465480,
  CSGO_DS_APPID: 740,
  CSGO_BETTER_BOTS_NAMES_FILE: 'addons/sourcemod/configs/bot_names.txt',
  CSGO_BOT_COMMAND_FILE: 'cfg/liga-bots.cfg',
  CSGO_BOT_CONFIG: 'botprofile.db',
  CSGO_BASEDIR: 'steamapps/common/csgo legacy',
  CSGO_EXE: 'csgo.exe',
  CSGO_GAMEDIR: 'csgo',
  CSGO_LANGUAGE_FILE: 'resource/csgo_english.txt',
  CSGO_SERVER_CONFIG_FILE: 'cfg/server.cfg',
  CSGO_STEAM_INF_FILE: 'steam.inf',
  CSGO_VERSION: 2000258,

  // rcon settings
  RCON_MAX_ATTEMPTS: 10,
  RCON_PASSWORD: 'rxpev45',
  RCON_PORT: 27016,
};

/**
 * Idiomatic version of tier names.
 *
 * @constant
 */
export const IdiomaticTier: Record<TierSlug | string, string> = {
  [TierSlug.BLAST_FINALS]: 'Finals',
  [TierSlug.CCT_GLOBAL_FINALS]: 'Global Finals',
  [TierSlug.CCT_OCE_PLAYOFFS]: 'Playoffs',
  [TierSlug.CCT_OCE_SERIES]: 'Series',
  [TierSlug.CCT_SERIES]: 'Series',
  [TierSlug.CCT_SERIES_PLAYOFFS]: 'Playoffs',
  [TierSlug.ESEA_CASH_CUP]: 'Cash Cup',
  [TierSlug.ESL_CHALLENGER]: 'Group Stage',
  [TierSlug.ESL_CHALLENGER_PLAYOFFS]: 'Playoffs',
  [TierSlug.EXHIBITION_FRIENDLY]: 'Friendly',
  [TierSlug.IEM_COLOGNE_GROUP_A]: 'Group A',
  [TierSlug.IEM_COLOGNE_GROUP_B]: 'Group B',
  [TierSlug.IEM_COLOGNE_OPEN_QUALIFIER]: 'Qualifier',
  [TierSlug.IEM_COLOGNE_PLAYOFFS]: 'Playoffs',
  [TierSlug.IEM_KRAKOW_GROUP_A]: 'Group A',
  [TierSlug.IEM_KRAKOW_GROUP_B]: 'Group B',
  [TierSlug.IEM_KRAKOW_OPEN_QUALIFIER]: 'Qualifier',
  [TierSlug.IEM_KRAKOW_PLAYOFFS]: 'Playoffs',
  [TierSlug.LEAGUE_OPEN]: 'Open Division',
  [TierSlug.LEAGUE_OPEN_PLAYOFFS]: 'Open Division Playoffs',
  [TierSlug.LEAGUE_INTERMEDIATE]: 'Intermediate Division',
  [TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS]: 'Intermediate Division Playoffs',
  [TierSlug.LEAGUE_MAIN]: 'Main Division',
  [TierSlug.LEAGUE_MAIN_PLAYOFFS]: 'Main Division Playoffs',
  [TierSlug.LEAGUE_ADVANCED]: 'Advanced Division',
  [TierSlug.LEAGUE_ADVANCED_PLAYOFFS]: 'Advanced Division Playoffs',
  [TierSlug.LEAGUE_PRO]: 'Group Stage',
  [TierSlug.LEAGUE_PRO_PLAYOFFS]: 'Playoffs',
  [TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_1]: 'RMR Open Qualifier #1',
  [TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_2]: 'RMR Open Qualifier #2',
  [TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_1]: 'RMR Open Qualifier #1 (CN)',
  [TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_2]: 'RMR Open Qualifier #2 (CN)',
  [TierSlug.MAJOR_ASIA_RMR]: 'RMR',
  [TierSlug.MAJOR_OCE_OPEN_QUALIFIER_1]: 'RMR Open Qualifier #1',
  [TierSlug.MAJOR_OCE_OPEN_QUALIFIER_2]: 'RMR Open Qualifier #2',
  [TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_1]: 'RMR Open Qualifier #1',
  [TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_2]: 'RMR Open Qualifier #2',
  [TierSlug.MAJOR_AMERICAS_RMR]: 'RMR',
  [TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1]: 'RMR Open Qualifier #1',
  [TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_2]: 'RMR Open Qualifier #2',
  [TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3]: 'RMR Open Qualifier #3',
  [TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_4]: 'RMR Open Qualifier #4',
  [TierSlug.MAJOR_EUROPE_RMR_A]: 'RMR A',
  [TierSlug.MAJOR_EUROPE_RMR_B]: 'RMR B',
  [TierSlug.MAJOR_CHALLENGERS_STAGE]: 'Major Challengers Stage',
  [TierSlug.MAJOR_LEGENDS_STAGE]: 'Major Legends Stage',
  [TierSlug.MAJOR_CHAMPIONS_STAGE]: 'Major Champions Stage',
};

/** @constant */
export const IdiomaticTransferStatus: Record<number, string> = {
  [TransferStatus.PLAYER_ACCEPTED]: 'Player Accepted',
  [TransferStatus.PLAYER_PENDING]: 'Player Pending',
  [TransferStatus.PLAYER_REJECTED]: 'Player Rejected',
  [TransferStatus.TEAM_ACCEPTED]: 'Team Accepted',
  [TransferStatus.TEAM_PENDING]: 'Team Pending',
  [TransferStatus.TEAM_REJECTED]: 'Team Rejected',
  [TransferStatus.EXPIRED]: 'Expired',
};

/**
 * Replacement maps for game variants.
 *
 * @constant
 */
export const MapPoolReplacements: Record<Game, Record<string, string>> = {
  [Game.CSGO]: {
    // cs1.6
    de_cbble: 'de_anubis',
    de_cpl_fire: 'de_inferno',
    de_cpl_mill: 'de_ancient',
    de_cpl_strike: 'de_mirage',
    de_russka: 'de_train',

    // czero
    de_cbble_cz: 'de_ancient',
    de_czl_freight: 'de_mirage',
    de_czl_karnak: 'de_ancient',
    de_czl_silo: 'de_anubis',
    de_dust2_cz: 'de_dust2',
    de_inferno_cz: 'de_inferno',
    de_russka_cz: 'de_train',
  },
};

/**
 * Map veto config.
 *
 * @constant
 */
export const MapVetoConfig: Record<number, Array<{ team: number; type: MapVetoAction }>> = {
  3: [
    { team: 0, type: MapVetoAction.BAN },
    { team: 1, type: MapVetoAction.BAN },
    { team: 0, type: MapVetoAction.PICK },
    { team: 1, type: MapVetoAction.PICK },
    { team: 1, type: MapVetoAction.BAN },
    { team: 0, type: MapVetoAction.BAN },
  ],
  5: [
    { team: 0, type: MapVetoAction.BAN },
    { team: 1, type: MapVetoAction.BAN },
    { team: 0, type: MapVetoAction.PICK },
    { team: 1, type: MapVetoAction.PICK },
    { team: 1, type: MapVetoAction.PICK },
    { team: 0, type: MapVetoAction.PICK },
  ],
};

/**
 * Eligible days of the week for competitions to hold matches.
 *
 * Each day of the week caries its own probability weight.
 * The lower the value the less chance a match will be
 * held on that day of the week.
 *
 * @constant
 */
export const MatchDayWeights: Record<string, Record<number, number | 'auto'>> = {
  [LeagueSlug.ESPORTS_LEAGUE]: {
    5: 20, // friday
    6: 'auto', // saturday
    0: 'auto', // sunday
  },
  [LeagueSlug.ESPORTS_PRO_LEAGUE]: {
    5: 20, // friday
    6: 'auto', // saturday
    0: 'auto', // sunday
  },
  [LeagueSlug.ESPORTS_MAJOR]: {
    5: 20, // friday
    6: 'auto', // saturday
    0: 'auto', // sunday
  },
};

/**
 * Player wages sorted by tiers.
 *
 * Each tier is split into top, mid, and low positions
 * which affects the wages and player costs.
 *
 * @property percent    Percentage considered for the current tier.
 * @property low        Lowest wage possible for this tier.
 * @property high       Highest wage possible for this tier.
 * @property multiplier Player cost is calculated by multiplying the wages by this number.
 * @constant
 */
export const PlayerWages = {
  [TierSlug.LEAGUE_ADVANCED]: [{ percent: 20, low: 1_000, high: 5_000, multiplier: 2 }],
  [TierSlug.LEAGUE_PRO]: [
    { percent: 20, low: 5_000, high: 10_000, multiplier: 2 },
    { percent: 80, low: 10_000, high: 15_000, multiplier: 4 },
    { percent: 20, low: 15_000, high: 20_000, multiplier: 6 },
  ],
};

/**
 * Prestige affect probability weights when
 * simulating games and generating scores.
 *
 * The league tiers serve as a good base
 * to determine prestige order.
 *
 * @constant
 */
export const Prestige = [
  TierSlug.LEAGUE_OPEN,
  TierSlug.LEAGUE_INTERMEDIATE,
  TierSlug.LEAGUE_MAIN,
  TierSlug.LEAGUE_ADVANCED,
  TierSlug.LEAGUE_PRO,
];

/**
 * Prize pool distribution ranges.
 *
 * @constant
 */
export const PrizePool: Record<TierSlug | string, { total: number; distribution: Array<number> }> =
  {
    [TierSlug.BLAST_FINALS]: { total: 750_000, distribution: [40, 18, 10, 10, 5.5, 5.5, 5.5, 5.5] },
    [TierSlug.CCT_GLOBAL_FINALS]: {
      total: 150_000,
      distribution: [50, 23.333333, 10, 10, 1.666667, 1.666667, 1.666667, 1.666667],
    },
    [TierSlug.CCT_OCE_PLAYOFFS]: {
      total: 20_000,
      distribution: [50, 25, 7.5, 7.5, 2.5, 2.5, 2.5, 2.5],
    },
    [TierSlug.CCT_OCE_SERIES]: { total: 0, distribution: [] },
    [TierSlug.CCT_SERIES]: { total: 0, distribution: [] },
    [TierSlug.CCT_SERIES_PLAYOFFS]: { total: 50_000, distribution: [50, 20, 5, 5, 5, 5, 5, 5] },
    [TierSlug.ESEA_CASH_CUP]: { total: 25_000, distribution: [60, 20, 10, 10] },
    [TierSlug.ESL_CHALLENGER]: { total: 0, distribution: [] },
    [TierSlug.ESL_CHALLENGER_PLAYOFFS]: { total: 150_000, distribution: [50, 25, 12.5, 12.5] },
    [TierSlug.IEM_COLOGNE_GROUP_A]: { total: 0, distribution: [] },
    [TierSlug.IEM_COLOGNE_GROUP_B]: { total: 0, distribution: [] },
    [TierSlug.IEM_COLOGNE_OPEN_QUALIFIER]: { total: 0, distribution: [] },
    [TierSlug.IEM_COLOGNE_PLAYOFFS]: {
      total: 1_000_000,
      distribution: [40, 18, 10, 10, 5.5, 5.5, 5.5, 5.5],
    },
    [TierSlug.IEM_KRAKOW_GROUP_A]: { total: 0, distribution: [] },
    [TierSlug.IEM_KRAKOW_GROUP_B]: { total: 0, distribution: [] },
    [TierSlug.IEM_KRAKOW_OPEN_QUALIFIER]: { total: 0, distribution: [] },
    [TierSlug.IEM_KRAKOW_PLAYOFFS]: {
      total: 1_000_000,
      distribution: [40, 18, 10, 10, 5.5, 5.5, 5.5, 5.5],
    },
    [TierSlug.LEAGUE_OPEN]: { total: 0, distribution: [] },
    [TierSlug.LEAGUE_OPEN_PLAYOFFS]: {
      total: 10_000,
      distribution: [35, 20, 10, 10, 6.25, 6.25, 6.25, 6.25],
    },
    [TierSlug.LEAGUE_INTERMEDIATE]: { total: 0, distribution: [] },
    [TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS]: {
      total: 15_000,
      distribution: [35, 20, 10, 10, 6.25, 6.25, 6.25, 6.25],
    },
    [TierSlug.LEAGUE_MAIN]: { total: 0, distribution: [] },
    [TierSlug.LEAGUE_MAIN_PLAYOFFS]: {
      total: 30_000,
      distribution: [35, 20, 10, 10, 6.25, 6.25, 6.25, 6.25],
    },
    [TierSlug.LEAGUE_ADVANCED]: { total: 0, distribution: [] },
    [TierSlug.LEAGUE_ADVANCED_PLAYOFFS]: {
      total: 70_000,
      distribution: [35, 20, 10, 10, 6.25, 6.25, 6.25, 6.25],
    },
    [TierSlug.LEAGUE_PRO]: { total: 0, distribution: [] },
    [TierSlug.LEAGUE_PRO_PLAYOFFS]: {
      total: 1_000_000,
      distribution: [40, 18, 10, 10, 5.5, 5.5, 5.5, 5.5],
    },
    [TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_1]: { total: 0, distribution: [] },
    [TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_2]: { total: 0, distribution: [] },
    [TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_1]: { total: 0, distribution: [] },
    [TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_2]: { total: 0, distribution: [] },
    [TierSlug.MAJOR_ASIA_RMR]: { total: 0, distribution: [] },
    [TierSlug.MAJOR_OCE_OPEN_QUALIFIER_1]: { total: 0, distribution: [] },
    [TierSlug.MAJOR_OCE_OPEN_QUALIFIER_2]: { total: 0, distribution: [] },
    [TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_1]: { total: 0, distribution: [] },
    [TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_2]: { total: 0, distribution: [] },
    [TierSlug.MAJOR_AMERICAS_RMR]: { total: 0, distribution: [] },
    [TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1]: { total: 0, distribution: [] },
    [TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_2]: { total: 0, distribution: [] },
    [TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3]: { total: 0, distribution: [] },
    [TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_4]: { total: 0, distribution: [] },
    [TierSlug.MAJOR_EUROPE_RMR_A]: { total: 0, distribution: [] },
    [TierSlug.MAJOR_EUROPE_RMR_B]: { total: 0, distribution: [] },
    [TierSlug.MAJOR_CHALLENGERS_STAGE]: { total: 0, distribution: [] },
    [TierSlug.MAJOR_LEGENDS_STAGE]: { total: 0, distribution: [] },
    [TierSlug.MAJOR_CHAMPIONS_STAGE]: {
      total: 2_500_000,
      distribution: [40, 18, 10, 10, 5.5, 5.5, 5.5, 5.5],
    },
  };

/**
 * Settings for the application and their defaults.
 *
 * @constant
 */
export const Settings = {
  general: {
    game: Game.CSGO,
    logLevel: Application.LOGGING_LEVEL,
    simulationMode: SimulationMode.DEFAULT,
    steamPath: null as string,
    gamePath: null as string,
    dedicatedServerPath: null as string,
    gameLaunchTimeout: 10,
    gameLaunchOptions: null as string,
    theme: ThemeType.SYSTEM,
    fullscreen: true,
    discordPresence: true,
    locale: null as LocaleIdentifier,
    volume: 0.50,
    musicVolume: 0.25,
    faceitMatchFoundTune: 'whoosh_whip.wav' as string | null,
  },
  calendar: {
    calendarDateFormat: CalendarDateFormat.EU,
    maxIterations: 8,
    unit: CalendarUnit.DAY,
  },
  matchRules: {
    maxRounds: 24,
    maxRoundsOvertime: 6,
    mapOverride: null as string,
    overtime: true,
  },
  gameSettings: {
    isM4A1: false,
    isUSP: false,
    isCZ: false,
  },
  arenaMode: {
    enabled: false,
    equalizerApoConfigPath: 'C:\\Program Files\\EqualizerAPO\\config',
    vstPluginPath: '',
  },
};

export const FaceitMatchFoundTunes = [
  { label: 'Off', value: null as string | null },
  { label: 'Whoosh', value: 'whoosh_whip.wav' },
  { label: 'Found Tone', value: 'found_tone.wav' },
  { label: 'Lone Wolf Howling', value: 'lone_wolf_howling.wav' },
] as const;

/**
 * Match config for tiers such as
 * the number of games per match.
 *
 * The array index represents the round
 * counting back from the grand-final.
 *
 * For example, an array of `[7, 5, 3]`:
 *
 * - grand-final is bo7
 * - semi-final is bo5
 * - quarter-final is bo3
 *
 * @constant
 */
export const TierMatchConfig: Record<string, Array<number>> = {
  [TierSlug.BLAST_FINALS]: [3],
  [TierSlug.CCT_GLOBAL_FINALS]: [3],
  [TierSlug.CCT_OCE_PLAYOFFS]: [3],
  [TierSlug.CCT_OCE_SERIES]: [3],
  [TierSlug.CCT_SERIES_PLAYOFFS]: [3],
  [TierSlug.ESEA_CASH_CUP]: [1],
  [TierSlug.ESL_CHALLENGER]: [3],
  [TierSlug.ESL_CHALLENGER_PLAYOFFS]: [3],
  [TierSlug.IEM_COLOGNE_GROUP_A]: [3],
  [TierSlug.IEM_COLOGNE_GROUP_B]: [3],
  [TierSlug.IEM_COLOGNE_OPEN_QUALIFIER]: [3, 3, 3, 3, 1, 1, 1, 1, 1],
  [TierSlug.IEM_COLOGNE_PLAYOFFS]: [5, 3, 3],
  [TierSlug.IEM_KRAKOW_GROUP_A]: [3],
  [TierSlug.IEM_KRAKOW_GROUP_B]: [3],
  [TierSlug.IEM_KRAKOW_OPEN_QUALIFIER]: [3, 3, 3, 3, 1, 1, 1, 1, 1],
  [TierSlug.IEM_KRAKOW_PLAYOFFS]: [5, 3, 3],
  [TierSlug.LEAGUE_PRO]: [3],
  [TierSlug.LEAGUE_ADVANCED_PLAYOFFS]: [3, 3],
  [TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS]: [3, 3],
  [TierSlug.LEAGUE_MAIN_PLAYOFFS]: [3, 3],
  [TierSlug.LEAGUE_OPEN_PLAYOFFS]: [3, 3],
  [TierSlug.LEAGUE_PRO_PLAYOFFS]: [5, 3, 3, 3],
  [TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_1]: [1, 3, 1],
  [TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_2]: [1, 3, 1],
  [TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_1]: [3, 3, 1],
  [TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_2]: [3, 3, 1],
  [TierSlug.MAJOR_ASIA_RMR]: [1, 3, 3],
  [TierSlug.MAJOR_OCE_OPEN_QUALIFIER_1]: [3, 3, 1],
  [TierSlug.MAJOR_OCE_OPEN_QUALIFIER_2]: [3, 3, 1],
  [TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_1]: [1, 1, 3, 3, 1],
  [TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_2]: [1, 1, 3, 3, 1],
  [TierSlug.MAJOR_AMERICAS_RMR]: [3, 3, 3],
  [TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1]: [1, 1, 3, 3, 3, 1],
  [TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_2]: [1, 1, 3, 3, 3, 1],
  [TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3]: [1, 1, 3, 3, 3, 1],
  [TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_4]: [1, 1, 3, 3, 3, 1],
  [TierSlug.MAJOR_EUROPE_RMR_A]: [3, 3, 3],
  [TierSlug.MAJOR_EUROPE_RMR_B]: [3, 3, 3],
  [TierSlug.MAJOR_CHALLENGERS_STAGE]: [3, 3, 3],
  [TierSlug.MAJOR_LEGENDS_STAGE]: [3, 3, 3],
  [TierSlug.MAJOR_CHAMPIONS_STAGE]: [5, 3, 3],
};

/**
 * Swiss format options by tier.
 *
 * @constant
 */
export const TierSwissConfig: Partial<
  Record<
    TierSlug,
    {
      maxLosses: number;
      maxRounds: number;
      maxTeams: number;
      maxWins: number;
    }
  >
> = {
  [TierSlug.CCT_SERIES]: {
    maxLosses: 3,
    maxRounds: 5,
    maxTeams: 16,
    maxWins: 3,
  },
  [TierSlug.MAJOR_AMERICAS_RMR]: {
    maxLosses: 2,
    maxRounds: 4,
    maxTeams: 16,
    maxWins: 3,
  },
  [TierSlug.MAJOR_EUROPE_RMR_A]: {
    maxLosses: 3,
    maxRounds: 5,
    maxTeams: 16,
    maxWins: 3,
  },
  [TierSlug.MAJOR_EUROPE_RMR_B]: {
    maxLosses: 3,
    maxRounds: 5,
    maxTeams: 16,
    maxWins: 3,
  },
  [TierSlug.MAJOR_CHALLENGERS_STAGE]: {
    maxLosses: 3,
    maxRounds: 5,
    maxTeams: 16,
    maxWins: 3,
  },
  [TierSlug.MAJOR_LEGENDS_STAGE]: {
    maxLosses: 3,
    maxRounds: 5,
    maxTeams: 16,
    maxWins: 3,
  },
};

/**
 * Promotion and relegation zones per tier.
 *
 * @constant
 */
export const TierZones: Record<string | 'default', number[][]> = {
  default: [
    [Zones.LEAGUE_PROMOTION_AUTO_START, Zones.LEAGUE_PROMOTION_AUTO_END],
    [Zones.LEAGUE_PROMOTION_PLAYOFFS_START, Zones.LEAGUE_PROMOTION_PLAYOFFS_END],
    [Zones.LEAGUE_RELEGATION_START, Zones.LEAGUE_RELEGATION_END],
  ],
};

/**
 * League tier zones per federation.
 *
 * @constant
 */
export const LeagueTierZonesByFederation: Record<
  FederationSlug,
  Partial<Record<TierSlug, number[][]>>
> = {
  [FederationSlug.ESPORTS_AMERICAS]: {
    [TierSlug.LEAGUE_OPEN]: [
      [0, 0],
      [1, 16],
      [0, 0],
    ],
    [TierSlug.LEAGUE_INTERMEDIATE]: [
      [0, 0],
      [1, 8],
      [27, 30],
    ],
    [TierSlug.LEAGUE_MAIN]: [
      [0, 0],
      [1, 8],
      [17, 20],
    ],
    [TierSlug.LEAGUE_ADVANCED]: [
      [0, 0],
      [1, 16],
      [17, 20],
    ],
    [TierSlug.LEAGUE_OPEN_PLAYOFFS]: [
      [1, 4],
      [0, 0],
      [0, 0],
    ],
    [TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS]: [
      [1, 4],
      [0, 0],
      [0, 0],
    ],
    [TierSlug.LEAGUE_MAIN_PLAYOFFS]: [
      [1, 4],
      [0, 0],
      [0, 0],
    ],
    [TierSlug.LEAGUE_ADVANCED_PLAYOFFS]: [
      [1, 8],
      [0, 0],
      [0, 0],
    ],
  },
  [FederationSlug.ESPORTS_ASIA]: {
    [TierSlug.LEAGUE_OPEN]: [
      [0, 0],
      [1, 8],
      [0, 0],
    ],
    [TierSlug.LEAGUE_ADVANCED]: [
      [0, 0],
      [1, 8],
      [19, 20],
    ],
    [TierSlug.LEAGUE_OPEN_PLAYOFFS]: [
      [1, 2],
      [0, 0],
      [0, 0],
    ],
    [TierSlug.LEAGUE_ADVANCED_PLAYOFFS]: [
      [1, 3],
      [0, 0],
      [0, 0],
    ],
  },
  [FederationSlug.ESPORTS_EUROPA]: {
    [TierSlug.LEAGUE_OPEN]: [
      [0, 0],
      [1, 16],
      [0, 0],
    ],
    [TierSlug.LEAGUE_INTERMEDIATE]: [
      [0, 0],
      [1, 8],
      [27, 30],
    ],
    [TierSlug.LEAGUE_MAIN]: [
      [0, 0],
      [1, 8],
      [17, 20],
    ],
    [TierSlug.LEAGUE_ADVANCED]: [
      [0, 0],
      [1, 16],
      [17, 20],
    ],
    [TierSlug.LEAGUE_OPEN_PLAYOFFS]: [
      [1, 4],
      [0, 0],
      [0, 0],
    ],
    [TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS]: [
      [1, 4],
      [0, 0],
      [0, 0],
    ],
    [TierSlug.LEAGUE_MAIN_PLAYOFFS]: [
      [1, 4],
      [0, 0],
      [0, 0],
    ],
    [TierSlug.LEAGUE_ADVANCED_PLAYOFFS]: [
      [1, 8],
      [0, 0],
      [0, 0],
    ],
  },
  [FederationSlug.ESPORTS_OCE]: {
    [TierSlug.LEAGUE_OPEN]: [
      [0, 0],
      [1, 8],
      [0, 0],
    ],
    [TierSlug.LEAGUE_ADVANCED]: [
      [0, 0],
      [1, 8],
      [15, 16],
    ],
    [TierSlug.LEAGUE_OPEN_PLAYOFFS]: [
      [1, 2],
      [0, 0],
      [0, 0],
    ],
    [TierSlug.LEAGUE_ADVANCED_PLAYOFFS]: [
      [1, 1],
      [0, 0],
      [0, 0],
    ],
  },
  [FederationSlug.ESPORTS_WORLD]: {
    [TierSlug.LEAGUE_PRO]: [
      [1, 16],
      [0, 0],
      [17, 32],
    ],
  },
};

/**
 * League tier sizes per federation.
 *
 * @constant
 */
export const LeagueTierSizesByFederation: Record<
  FederationSlug,
  Partial<Record<TierSlug, number>>
> = {
  [FederationSlug.ESPORTS_AMERICAS]: {
    [TierSlug.LEAGUE_OPEN]: 40,
    [TierSlug.LEAGUE_INTERMEDIATE]: 30,
    [TierSlug.LEAGUE_MAIN]: 20,
    [TierSlug.LEAGUE_ADVANCED]: 20,
    [TierSlug.LEAGUE_OPEN_PLAYOFFS]: 16,
    [TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS]: 8,
    [TierSlug.LEAGUE_MAIN_PLAYOFFS]: 8,
    [TierSlug.LEAGUE_ADVANCED_PLAYOFFS]: 16,
  },
  [FederationSlug.ESPORTS_ASIA]: {
    [TierSlug.LEAGUE_OPEN]: 30,
    [TierSlug.LEAGUE_ADVANCED]: 20,
    [TierSlug.LEAGUE_OPEN_PLAYOFFS]: 8,
    [TierSlug.LEAGUE_ADVANCED_PLAYOFFS]: 8,
  },
  [FederationSlug.ESPORTS_EUROPA]: {
    [TierSlug.LEAGUE_OPEN]: 40,
    [TierSlug.LEAGUE_INTERMEDIATE]: 30,
    [TierSlug.LEAGUE_MAIN]: 20,
    [TierSlug.LEAGUE_ADVANCED]: 20,
    [TierSlug.LEAGUE_OPEN_PLAYOFFS]: 16,
    [TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS]: 8,
    [TierSlug.LEAGUE_MAIN_PLAYOFFS]: 8,
    [TierSlug.LEAGUE_ADVANCED_PLAYOFFS]: 16,
  },
  [FederationSlug.ESPORTS_OCE]: {
    [TierSlug.LEAGUE_OPEN]: 20,
    [TierSlug.LEAGUE_ADVANCED]: 15,
    [TierSlug.LEAGUE_OPEN_PLAYOFFS]: 8,
    [TierSlug.LEAGUE_ADVANCED_PLAYOFFS]: 8,
  },
  [FederationSlug.ESPORTS_WORLD]: {},
};

/**
 * League tiers disabled by federation.
 *
 * @constant
 */
export const LeagueTierDisabledByFederation: Record<FederationSlug, TierSlug[]> = {
  [FederationSlug.ESPORTS_AMERICAS]: [],
  [FederationSlug.ESPORTS_ASIA]: [
    TierSlug.LEAGUE_INTERMEDIATE,
    TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
    TierSlug.LEAGUE_MAIN,
    TierSlug.LEAGUE_MAIN_PLAYOFFS,
  ],
  [FederationSlug.ESPORTS_EUROPA]: [],
  [FederationSlug.ESPORTS_OCE]: [
    TierSlug.LEAGUE_INTERMEDIATE,
    TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
    TierSlug.LEAGUE_MAIN,
    TierSlug.LEAGUE_MAIN_PLAYOFFS,
  ],
  [FederationSlug.ESPORTS_WORLD]: [],
};

/**
 * Transfer settings when accepting transfer offers.
 *
 * @constant
 */
export const TransferSettings = {
  // how long do teams and players take to respond
  RESPONSE_MIN_DAYS: 1,
  RESPONSE_MAX_DAYS: 3,

  // npc-to-npc transfer probability
  PBX_NPC_CONSIDER: 50,

  // how likely each tier is to send an offer (open -> pro)
  PBX_NPC_TIER: [40, 30, 30, 30, 30],

  // chance to consider cross-federation bids for top profiles
  PBX_NPC_CROSS_FED_TOP: 4,

  // chance an NPC team signs a free agent instead of trading with another team
  PBX_NPC_FREE_AGENT_SIGN: 10,

  // chance an NPC free-agent pickup stays in the same country when a matching option exists
  PBX_NPC_FREE_AGENT_SAME_COUNTRY: 85,

  // when no suitable same-country free agent is found, chance to sign from same federation
  PBX_NPC_FREE_AGENT_SAME_FED: 10,

  // preference boost for same-country offers
  PBX_NPC_SAME_COUNTRY_BOOST: 85,

  // players with this many days left receive expiry weighting boost
  PBX_NPC_EXPIRY_WINDOW_MIN_DAYS: 90,
  PBX_NPC_EXPIRY_WINDOW_MAX_DAYS: 180,

  // stronger teams are less likely to sell players
  PBX_NPC_SELLING_TEAM_PERFORMANCE_DAMPENER: 20,

  // how much percent to add (per dollar) over the wages
  PBX_PLAYER_HIGHBALL_MODIFIER: 0.01,

  // is the player willing to lower their wages?
  PBX_PLAYER_LOWBALL_OFFER: 10,

  // how likely is the player willing
  // to move to another region
  PBX_PLAYER_RELOCATE: 20,

  // how much percent to add (per dollar) over the selling price
  PBX_TEAM_HIGHBALL_MODIFIER: 0.01,

  // is the team willing to lower their fee?
  PBX_TEAM_LOWBALL_OFFER: 10,

  // how likely is the team willing to sell
  // their non-transfer-listed player
  PBX_TEAM_SELL_UNLISTED: 10,

  // what are the chances a team will consider
  // sending an offer to the user today?
  PBX_USER_CONSIDER: 15,

  // chance of buying above asking price
  PBX_USER_HIGHBALL_OFFER: 10,
  PBX_USER_HIGHBALL_OFFER_MIN: 1.05,
  PBX_USER_HIGHBALL_OFFER_MAX: 1.15,

  // chance of sending the user a lowball offer
  PBX_USER_LOWBALL_OFFER: 25,
  PBX_USER_LOWBALL_OFFER_MIN: 0.6,
  PBX_USER_LOWBALL_OFFER_MAX: 0.9,

  // chances a team will attempt to poach the user's
  // best player regardless of transfer list status
  PBX_USER_POACH: 5,

  // probability weights when choosing the prestige level of teams
  // that would be interested in buying a player from the user.
  PBX_USER_PRESTIGE_WEIGHTS: [0.5, 90, 2],

  // continue with the transfer even if the user
  // does not have any transfer listed players
  PBX_USER_SELL_UNLISTED: 10,

  // whom from the user's squad should we target
  //
  // each probability maps to an index within
  // the user's players array which should
  // ideally be sorted by their xp
  PBX_USER_TARGET: [90, 5],
};

/**
 * Transfer settings for the user.
 *
 * @constant
 */
export const UserOfferSettings = {
  FACEIT_MATCH_GATEWAY_BY_FEDERATION: {
    [FederationSlug.ESPORTS_EUROPA]: { minMatches: 7, maxMatches: 15 },
    [FederationSlug.ESPORTS_AMERICAS]: { minMatches: 5, maxMatches: 12 },
    [FederationSlug.ESPORTS_ASIA]: { minMatches: 5, maxMatches: 15 },
    [FederationSlug.ESPORTS_OCE]: { minMatches: 5, maxMatches: 10 },
  } as Record<
    | FederationSlug.ESPORTS_EUROPA
    | FederationSlug.ESPORTS_AMERICAS
    | FederationSlug.ESPORTS_ASIA
    | FederationSlug.ESPORTS_OCE,
    { minMatches: number; maxMatches: number }
  >,

  FACEIT_ELO_THRESHOLDS: {
    OPEN_MAX: 2000,
    INTERMEDIATE_MAX: 2200,
  },
  FACEIT_ELIGIBLE_DIVISIONS: [TierSlug.LEAGUE_OPEN, TierSlug.LEAGUE_INTERMEDIATE],

  TEAMLESS_OFFER_COOLDOWN_DAYS: 10,
  TEAM_OFFER_COOLDOWN_DAYS: 50,
  TEAMLESS_MAX_PENDING_OFFERS: 3,
  SAME_COUNTRY_OFFER_CHANCE: 60,
  SAME_CORE_OFFER_CHANCE: 30,
  SAME_FEDERATION_OTHER_COUNTRY_OFFER_CHANCE: 10,

  // contract terms by tier
  CONTRACT_YEARS_WEIGHTS: {
    [TierSlug.LEAGUE_OPEN]: [
      { years: 1, weight: 85 },
      { years: 2, weight: 15 },
    ],
    [TierSlug.LEAGUE_INTERMEDIATE]: [
      { years: 1, weight: 70 },
      { years: 2, weight: 30 },
    ],
    [TierSlug.LEAGUE_MAIN]: [
      { years: 1, weight: 50 },
      { years: 2, weight: 50 },
    ],
    [TierSlug.LEAGUE_ADVANCED]: [
      { years: 2, weight: 80 },
      { years: 3, weight: 20 },
    ],
    [TierSlug.LEAGUE_PRO]: [
      { years: 2, weight: 50 },
      { years: 3, weight: 20 },
      { years: 4, weight: 15 },
      { years: 5, weight: 15 },
    ],
  },

  // faceit vs league weighting by tier
  SIGNAL_WEIGHTS_BY_TIER: {
    [TierSlug.LEAGUE_OPEN]: { faceit: 0.8, league: 0.2 },
    [TierSlug.LEAGUE_INTERMEDIATE]: { faceit: 0.6, league: 0.4 },
    [TierSlug.LEAGUE_MAIN]: { faceit: 0.2, league: 0.8 },
    [TierSlug.LEAGUE_ADVANCED]: { faceit: 0.1, league: 0.9 },
    [TierSlug.LEAGUE_PRO]: { faceit: 0.05, league: 0.95 },
  },

  ROLE_OFFER_TUNING: {
    [UserRole.RIFLER]: {
      pbxMultLeague: 1.0,
      pbxMultFaceit: 1.0,
      cooldownMultTeam: 1.0,
      cooldownMultTeamless: 1.0,
    },
    [UserRole.IGL]: {
      pbxMultLeague: 0.85,
      pbxMultFaceit: 0.9,
      cooldownMultTeam: 1.3,
      cooldownMultTeamless: 1.3,
    },
    [UserRole.AWPER]: {
      pbxMultLeague: 0.55,
      pbxMultFaceit: 0.7,
      cooldownMultTeam: 1.6,
      cooldownMultTeamless: 1.6,
    },
  },
};

export const PlayerContractSettings = {
  // Bench evaluation
  BENCH_MIN_LEAGUE_MATCHES: 7,
  BENCH_KD_MIN_BY_TIER: {
    [TierSlug.LEAGUE_OPEN]: 0.9,
    [TierSlug.LEAGUE_INTERMEDIATE]: 0.95,
    [TierSlug.LEAGUE_MAIN]: 1.0,
    [TierSlug.LEAGUE_ADVANCED]: 1.05,
    [TierSlug.LEAGUE_PRO]: 1.1,
  },
  BENCH_PBX_BY_TIER: {
    [TierSlug.LEAGUE_OPEN]: 30,
    [TierSlug.LEAGUE_INTERMEDIATE]: 35,
    [TierSlug.LEAGUE_MAIN]: 50,
    [TierSlug.LEAGUE_ADVANCED]: 65,
    [TierSlug.LEAGUE_PRO]: 80,
  },

  // Kick evaluation (early termination)
  KICK_MIN_LEAGUE_MATCHES: 6,
  KICK_WINDOW_DAYS: 90,
  KICK_KD_MAX_BY_TIER: {
    [TierSlug.LEAGUE_OPEN]: 0.7,
    [TierSlug.LEAGUE_INTERMEDIATE]: 0.75,
    [TierSlug.LEAGUE_MAIN]: 0.8,
    [TierSlug.LEAGUE_ADVANCED]: 0.9,
    [TierSlug.LEAGUE_PRO]: 0.95,
  },
  KICK_PBX_BY_TIER: {
    [TierSlug.LEAGUE_OPEN]: 50,
    [TierSlug.LEAGUE_INTERMEDIATE]: 20,
    [TierSlug.LEAGUE_MAIN]: 25,
    [TierSlug.LEAGUE_ADVANCED]: 30,
    [TierSlug.LEAGUE_PRO]: 45,
  },

  // Extension
  EXTENSION_EVAL_DAYS_BEFORE_END: 30,
  EXTENSION_MIN_MATCHES: 7,
  EXTENSION_PLAYER_OK_KD_BY_TIER: {
    [TierSlug.LEAGUE_OPEN]: 1.0,
    [TierSlug.LEAGUE_INTERMEDIATE]: 1.0,
    [TierSlug.LEAGUE_MAIN]: 1.05,
    [TierSlug.LEAGUE_ADVANCED]: 1.1,
    [TierSlug.LEAGUE_PRO]: 1.15,
  },
  EXTENSION_PBX_GOOD_TEAM_GOOD_PLAYER: 85,
  EXTENSION_PBX_BAD_TEAM_GOOD_PLAYER: 45,
  EXTENSION_PBX_GOOD_TEAM_OK_PLAYER: 55,
  EXTENSION_DECLINE_PBX_EVEN_IF_GOOD: 10,
  REVIEW_MIN_MATCHES_LAST_30_DAYS: 3,
};

/**
 * Game weapon templates derived from their
 * respective `BotProfile.db` file.
 *
 * @constant
 */
export const WeaponTemplates = {
  [Game.CSGO]: {
    [WeaponTemplate.RIFLE]: [
      'ak47',
      'aug',
      'm4a1_silencer',
      'm4a1',
      'galiar',
      'famas',
      'mp9',
      'mac10',
      'ump45',
      'mp7',
    ],
    [WeaponTemplate.SNIPER]: [
      'awp',
      'ak47',
      'aug',
      'm4a1_silencer',
      'm4a1',
      'galiar',
      'famas',
      'ssg08',
      'mp9',
      'mac10',
      'ump45',
      'mp7',
    ],
  },
};
