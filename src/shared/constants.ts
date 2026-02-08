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
  RIFLER = "RIFLER",
  IGL = "IGL",
  AWPER = "AWPER",
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
  ENOENT = 'ENOENT',
  ERUNNING = 'ERUNNING',
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
  ESPORTS_WORLD_CUP = 'eswc',
  ESPORTS_MAJOR = 'major',
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
  APP_DETECT_STEAM = '/app/detect/steam',
  APP_DIALOG = '/app/dialog',
  APP_EXTERNAL = '/app/external',
  APP_LOCALE = '/app/locale',
  APP_MESSAGE_BOX = '/app/messageBox',
  APP_INFO = '/app/info',
  APP_QUIT = '/app/quit',
  APP_STATUS = '/app/status',
  APP_UPLOAD = '/app/upload',
  APP_WHATS_NEW = '/app/whatsNew',
  BLAZONRY_ALL = '/blazonry/all',
  BONUS_ALL = '/bonus/all',
  BONUS_BUY = '/bonus/buy',
  CALENDAR_CREATE = '/calendar/create',
  CALENDAR_FIND = '/calendar/find',
  CALENDAR_SIM = '/calendar/sim',
  CALENDAR_START = '/calendar/start',
  CALENDAR_STOP = '/calendar/stop',
  COMPETITIONS_ALL = '/competitions/all',
  COMPETITIONS_FIND = '/competitions/find',
  COMPETITIONS_WINNERS = '/competitions/winners',
  CONFETTI_START = '/confetti/start',
  CONTINENTS_ALL = '/continents/all',
  DATABASE_CONNECT = '/database/connect',
  DATABASE_DISCONNECT = '/database/disconnect',
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
  MATCH_UPDATE_MAP_LIST = '/match/update/map-list',
  MATCHES_ALL = '/matches/all',
  MATCHES_COUNT = '/matches/count',
  MATCHES_PREVIOUS = '/matches/previous',
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
  ESWC_CHALLENGERS = 'eswc:challengers',
  ESWC_LEGENDS = 'eswc:legends',
  ESWC_CHAMPIONS = 'eswc:champions',
  ESWC_PLAYOFFS = 'eswc:playoffs',
  EXHIBITION_FRIENDLY = 'exhibition:friendly',
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
  MAJOR_OCE_OPEN_QUALIFIER_1 = 'major:oce:open-qualifier:1',
  MAJOR_OCE_OPEN_QUALIFIER_2 = 'major:oce:open-qualifier:2',
}

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
  ESWC_CHALLENGERS_PROMOTION_AUTO_START = 1,
  ESWC_CHALLENGERS_PROMOTION_AUTO_END = 2,
  ESWC_LEGENDS_PROMOTION_AUTO_START = 1,
  ESWC_LEGENDS_PROMOTION_AUTO_END = 2,
  ESWC_CHAMPIONS_PROMOTION_AUTO_START = 1,
  ESWC_CHAMPIONS_PROMOTION_AUTO_END = 2,
}

/**
 * Tracks possible competition awards.
 *
 * @constant
 */
export const Awards = [
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
  {
    on: CalendarEntry.COMPETITION_END,
    target: TierSlug.ESWC_CHALLENGERS,
    type: AwardType.QUALIFY,
    action: [AwardAction.EMAIL],
    start: 0,
    end: Zones.ESWC_CHALLENGERS_PROMOTION_AUTO_END,
  },
  {
    on: CalendarEntry.COMPETITION_END,
    target: TierSlug.ESWC_LEGENDS,
    type: AwardType.QUALIFY,
    action: [AwardAction.EMAIL],
    start: 0,
    end: Zones.ESWC_LEGENDS_PROMOTION_AUTO_END,
  },
  {
    on: CalendarEntry.COMPETITION_END,
    target: TierSlug.ESWC_CHAMPIONS,
    type: AwardType.QUALIFY,
    action: [AwardAction.EMAIL],
    start: 0,
    end: Zones.ESWC_CHAMPIONS_PROMOTION_AUTO_END,
  },
  {
    on: CalendarEntry.COMPETITION_END,
    target: TierSlug.ESWC_PLAYOFFS,
    type: AwardType.CHAMPION,
    action: [AwardAction.CONFETTI, AwardAction.EMAIL],
    start: 1,
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
  [TierSlug.LEAGUE_PRO]: 2500,
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
  SERVER_CVAR_GAMEOVER_DELAY: 5,
  SERVER_CVAR_MAXROUNDS: 24,
  SERVER_CVAR_MAXROUNDS_OT: 6,
  SERVER_CVAR_FREEZETIME: 10,
  SQUAD_STARTERS_NUM: 5,
  STEAM_EXE: 'steam.exe',
  STEAM_LIBRARIES_FILE: 'steamapps/libraryfolders.vdf',
  WIN_AWARD_AMOUNT: 100,

  // csgo settings
  CSGO_APPID: 730,
  CSGO_BETTER_BOTS_NAMES_FILE: 'addons/sourcemod/configs/bot_names.txt',
  CSGO_BOT_COMMAND_FILE: 'cfg/liga-bots.cfg',
  CSGO_BOT_CONFIG: 'botprofile.db',
  CSGO_BASEDIR: 'steamapps/common/Counter-Strike Global Offensive',
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
  [TierSlug.ESWC_CHALLENGERS]: 'Challengers Stage',
  [TierSlug.ESWC_LEGENDS]: 'Legends Stage',
  [TierSlug.ESWC_CHAMPIONS]: 'Champions Stage',
  [TierSlug.ESWC_PLAYOFFS]: 'Champions Stage Playoffs',
  [TierSlug.EXHIBITION_FRIENDLY]: 'Friendly',
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
  [TierSlug.MAJOR_OCE_OPEN_QUALIFIER_1]: 'RMR Open Qualifier #1',
  [TierSlug.MAJOR_OCE_OPEN_QUALIFIER_2]: 'RMR Open Qualifier #2',
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
  [LeagueSlug.ESPORTS_WORLD_CUP]: {
    3: 50, // wednesday
    4: 'auto', // thursday
  },
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
  [TierSlug.ESWC_CHALLENGERS]: { total: 0, distribution: [] },
  [TierSlug.ESWC_LEGENDS]: { total: 0, distribution: [] },
  [TierSlug.ESWC_CHAMPIONS]: { total: 0, distribution: [] },
  [TierSlug.ESWC_PLAYOFFS]: { total: 500_000, distribution: [50, 35, 15] },
  [TierSlug.LEAGUE_OPEN]: { total: 5_000, distribution: [50, 35, 15] },
  [TierSlug.LEAGUE_OPEN_PLAYOFFS]: { total: 0, distribution: [] },
  [TierSlug.LEAGUE_INTERMEDIATE]: { total: 15_000, distribution: [50, 35, 15] },
  [TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS]: { total: 0, distribution: [] },
  [TierSlug.LEAGUE_MAIN]: { total: 30_000, distribution: [50, 35, 15] },
  [TierSlug.LEAGUE_MAIN_PLAYOFFS]: { total: 0, distribution: [] },
  [TierSlug.LEAGUE_ADVANCED]: { total: 70_000, distribution: [50, 35, 15] },
  [TierSlug.LEAGUE_ADVANCED_PLAYOFFS]: { total: 0, distribution: [] },
  [TierSlug.LEAGUE_PRO]: { total: 1_000_000, distribution: [50, 35, 15] },
  [TierSlug.LEAGUE_PRO_PLAYOFFS]: { total: 0, distribution: [] },
  [TierSlug.MAJOR_OCE_OPEN_QUALIFIER_1]: { total: 0, distribution: [] },
  [TierSlug.MAJOR_OCE_OPEN_QUALIFIER_2]: { total: 0, distribution: [] },
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
    gameLaunchOptions: null as string,
    theme: ThemeType.SYSTEM,
    locale: null as LocaleIdentifier,
    volume: 0.05,
  },
  calendar: {
    calendarDateFormat: CalendarDateFormat.EU,
    ignoreExits: false,
    maxIterations: 8,
    unit: CalendarUnit.DAY,
  },
  matchRules: {
    maxRounds: 24,
    maxRoundsOvertime: 6,
    overtime: true,
  },
};

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
  [TierSlug.ESWC_PLAYOFFS]: [5, 3],
  [TierSlug.LEAGUE_PRO]: [3],
  [TierSlug.LEAGUE_ADVANCED_PLAYOFFS]: [3, 3],
  [TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS]: [3, 3],
  [TierSlug.LEAGUE_MAIN_PLAYOFFS]: [3, 3],
  [TierSlug.LEAGUE_OPEN_PLAYOFFS]: [3, 3],
  [TierSlug.LEAGUE_PRO_PLAYOFFS]: [5, 3, 3, 3],
  [TierSlug.MAJOR_OCE_OPEN_QUALIFIER_1]: [3, 3, 1],
  [TierSlug.MAJOR_OCE_OPEN_QUALIFIER_2]: [3, 3, 1],
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
  [TierSlug.ESWC_CHALLENGERS]: [
    [Zones.ESWC_CHALLENGERS_PROMOTION_AUTO_START, Zones.ESWC_CHALLENGERS_PROMOTION_AUTO_END],
  ],
  [TierSlug.ESWC_LEGENDS]: [
    [Zones.ESWC_LEGENDS_PROMOTION_AUTO_START, Zones.ESWC_LEGENDS_PROMOTION_AUTO_END],
  ],
  [TierSlug.ESWC_CHAMPIONS]: [
    [Zones.ESWC_CHAMPIONS_PROMOTION_AUTO_START, Zones.ESWC_CHAMPIONS_PROMOTION_AUTO_END],
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
  FACEIT_MIN_MATCHES_BEFORE_OFFERS: 3,
  FACEIT_MAX_MATCHES_FIRST_WINDOW: 10,

  FACEIT_ELO_THRESHOLDS: {
    OPEN_MAX: 2000,
    INTERMEDIATE_MAX: 2200,
  },
  FACEIT_ELIGIBLE_DIVISIONS: [TierSlug.LEAGUE_OPEN, TierSlug.LEAGUE_INTERMEDIATE],

  // ramp probability from match 3 to 10 (initial window)
  FACEIT_OFFER_PBX_BY_MATCH_INDEX: [0, 0, 0, 15, 25, 35, 45, 55, 65, 75],

  TEAMLESS_OFFER_COOLDOWN_DAYS: 10,
  TEAM_OFFER_COOLDOWN_DAYS: 50,
  TEAMLESS_MAX_PENDING_OFFERS: 3,

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
      pbxMultFaceit: 0.90,
      cooldownMultTeam: 1.30,
      cooldownMultTeamless: 1.30,
    },
    [UserRole.AWPER]: {
      pbxMultLeague: 0.55,
      pbxMultFaceit: 0.70,
      cooldownMultTeam: 1.60,
      cooldownMultTeamless: 1.60,
    },
  },
};

export const PlayerContractSettings = {
  // Bench evaluation
  BENCH_MIN_LEAGUE_MATCHES: 7,
  BENCH_KD_MIN_BY_TIER: {
    [TierSlug.LEAGUE_OPEN]: 0.90,
    [TierSlug.LEAGUE_INTERMEDIATE]: 0.95,
    [TierSlug.LEAGUE_MAIN]: 1.00,
    [TierSlug.LEAGUE_ADVANCED]: 1.05,
    [TierSlug.LEAGUE_PRO]: 1.10,
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
    [TierSlug.LEAGUE_OPEN]: 0.70,
    [TierSlug.LEAGUE_INTERMEDIATE]: 0.75,
    [TierSlug.LEAGUE_MAIN]: 0.80,
    [TierSlug.LEAGUE_ADVANCED]: 0.90,
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
    [TierSlug.LEAGUE_OPEN]: 1.00,
    [TierSlug.LEAGUE_INTERMEDIATE]: 1.00,
    [TierSlug.LEAGUE_MAIN]: 1.05,
    [TierSlug.LEAGUE_ADVANCED]: 1.10,
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
    [WeaponTemplate.RIFLE]: ['ak47', 'aug', 'm4a1_silencer', 'm4a1', 'galiar', 'famas', 'mp9', 'mac10', 'ump45', 'mp7'],
    [WeaponTemplate.SNIPER]: ['awp', 'ak47', 'aug', 'm4a1_silencer', 'm4a1', 'galiar', 'famas', 'ssg08', 'mp9', 'mac10', 'ump45', 'mp7'],
  },
};
