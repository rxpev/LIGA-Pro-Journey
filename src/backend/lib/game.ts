/**
 * Game management module.
 *
 * @module
 */
import * as FileManager from './file-manager';
import * as PluginManager from './plugins';
import * as RCON from './rcon';
import * as Scorebot from './scorebot';
import * as Sqrl from 'squirrelly';
import * as VDF from './vdf';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import util from 'node:util';
import log from 'electron-log';
import { spawn, ChildProcessWithoutNullStreams, exec as execSync } from 'node:child_process';
import { app } from 'electron';
import { glob } from 'glob';
import { Prisma, Profile } from '@prisma/client';
import { compact, flatten, random, startCase, uniq } from 'lodash';
import { Constants, Bot, Chance, Util, Eagers, Dedent, is } from '@liga/shared';
import DatabaseClient from "./database-client";

/**
 * Promisified version of `exec`.
 *
 * @constant
 */
const exec = util.promisify(execSync);

/**
 * Track the game process instance at the module level so
 * other modules know if the app has launched the process
 * or if it was launched by something else.
 *
 * @constant
 */
let gameClientProcess: ChildProcessWithoutNullStreams;

/**
 * Custom error to throw when a process
 * has been detected as running.
 *
 * @class
 */
class ProcessRunningError extends Error {
  errno: number;
  code: string;
  path: string;

  constructor(message: string) {
    super();
    this.errno = -1337;
    this.code = Constants.ErrorCode.ERUNNING;
    this.path = message;
  }
}

/**
 * Get Steam's installation path.
 *
 * @function
 */
export async function discoverSteamPath() {
  if (is.osx()) {
    return `${os.homedir()}/Library/Application Support/Steam`;
  }

  // get steam path from windows registry
  const [arch] = os.arch().match(/\d+/);
  const regPath = `HKLM\\SOFTWARE${Number(arch) === 64 && '\\Wow6432Node'}\\Valve\\Steam`;

  try {
    const { stdout } = await exec(`reg query "${regPath}" /v InstallPath`);
    const match = stdout.match(/InstallPath\s+REG_SZ\s+(.*)/);
    return match ? match[1].trim() : null;
  } catch (error) {
    log.warn('failed to detect steam installation path: %s', error.message);
    return null;
  }
}

/**
 * Get a game's installation root by their enum id.
 *
 * @param enumId    The game enum id.
 * @param steamPath The steam path.
 * @function
 */
export async function discoverGamePath(enumId: string, steamPath?: string) {
  if (!steamPath) {
    steamPath = await discoverSteamPath();
  }

  // get the game app id from its short name
  const id = Constants.GameSettings.CSGO_APPID;

  // the libraries manifest file contains a dictionary
  // containing installed game enums
  const librariesFileContent = await fs.promises.readFile(
    path.join(steamPath, Constants.GameSettings.STEAM_LIBRARIES_FILE),
    'utf8',
  );
  const { libraryfolders } = VDF.parse(librariesFileContent);

  // find the folder containing the game id
  const library = Object.values(libraryfolders).find((folder: Record<string, unknown>) => {
    return Object.keys(folder.apps).includes(String(id));
  }) as Record<string, unknown>;

  // if none is found, throw an error
  if (!library) {
    throw Error(`${enumId} not found!`);
  }

  // otherwise return the path
  return Promise.resolve(library.path as string);
}

/**
 * Gets the specified game's executable.
 *
 * @param game      The game.
 * @param rootPath  The game's root directory.
 * @function
 */
export function getGameExecutable(game: string, rootPath: string | null) {
  return path.join(
    rootPath || '',
    Constants.GameSettings.CSGO_BASEDIR,
    Constants.GameSettings.CSGO_EXE
  );
}


/**
 * Gets the specified game's log file.
 *
 * @param game      The game.
 * @param rootPath  The game's root directory.
 * @function
 */
export async function getGameLogFile(game: string, rootPath: string) {
  // Decide base log directory based only on game + rootPath
  const basename = path.basename(rootPath).toLowerCase();

  let basePath = '';
  if (basename === 'csgo') basePath = path.join(rootPath, Constants.GameSettings.LOGS_DIR);
  else if (basename === 'csgo-ds') basePath = path.join(rootPath, 'csgo', Constants.GameSettings.LOGS_DIR);
  else basePath = path.join(rootPath, Constants.GameSettings.CSGO_BASEDIR, Constants.GameSettings.CSGO_GAMEDIR, Constants.GameSettings.LOGS_DIR);

  log.info(`[getGameLogFile] game=${game}, rootPath=${rootPath}, basePath=${basePath}`);

  // bail early if the logs path does not exist
  try {
    await fs.promises.access(basePath, fs.constants.F_OK);
  } catch (_) {
    log.warn(`[getGameLogFile] logs path does not exist: ${basePath}`);
    return '';
  }

  // grab log files and sort by newest
  const files = await glob('*.log', { cwd: basePath, withFileTypes: true, stat: true });
  files.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  if (!files.length) {
    log.warn(`[getGameLogFile] no log files in ${basePath}`);
    return '';
  }

  const full = files[0].fullpath();
  log.info(`[getGameLogFile] picked log: ${full}`);
  return full;
}


/**
 * Throws an exception if the specified game is running.
 *
 * @todo        add macos support
 * @param name  The name of the process to look for.
 * @function
 */
export async function isRunningAndThrow(name: string) {
  const { stdout } = await exec('tasklist');
  const isRunning = stdout.includes(path.basename(name));

  if (isRunning && !gameClientProcess) {
    throw new ProcessRunningError(`${name} is running!`);
  }
}

/**
 * The game server.
 *
 * @class
 */
export class Server {
  private baseDir: string;
  private botCommandFile: string;
  private botConfigFile: string;
  private gameDir: string;
  private gameClientProcess: ChildProcessWithoutNullStreams;
  private profile: Profile;
  private rcon: RCON.Client;
  private scorebot: Scorebot.Watcher;
  private serverConfigFile: string;
  private settings: typeof Constants.Settings;
  private spectating?: boolean;

  // FACEIT fields
  private isFaceit: boolean;
  private faceitRoom: any;
  private faceitSides?: Record<number, "t" | "ct">;
  private faceitUserSide?: "t" | "ct";

  public getFaceitSides() {
    return this.faceitSides;
  }
  public getFaceitUserSide() {
    return this.faceitUserSide;
  }

  public competitors: Server['match']['competitors'];
  public log: log.LogFunctions;
  public match: Prisma.MatchGetPayload<typeof Eagers.match>;
  public matchGame: Server['match']['games'][number];
  public result: Scorebot.EventPayloadGameOver;

  /**
   * Tracks the match's scorebot events in memory.
   *
   * @constant
   */
  public scorebotEvents: Array<{
    type: Scorebot.EventIdentifier;
    payload:
    | Scorebot.EventPayloadPlayerAssisted
    | Scorebot.EventPayloadPlayerKilled
    | Scorebot.EventPayloadRoundOver;
  }>;

  /**
   * Constructor.
   *
   * @param profile       The user profile object.
   * @param match         The match object (can be FACEIT pseudo-match).
   * @param gameOverride  Game override.
   * @param spectating    Whether user is spectating this match.
   */
  constructor(
    profile: Server['profile'],
    match: Server['match'],
    gameOverride?: Constants.Game,
    spectating?: boolean,
  ) {
    // set up plain properties
    this.log = log.scope('gameserver');

    // FACEIT detection (match may be a pseudo object with extra fields)
    this.isFaceit = Boolean((match as any)?.isFaceit);
    this.faceitRoom = (match as any)?.faceitRoom || null;

    this.match = match;

    if (Array.isArray((match as any).games)) {
      this.matchGame = match.games.find((game: any) => game.status !== Constants.MatchStatus.COMPLETED);
    } else {
      this.matchGame = null as any;
    }

    this.profile = profile;
    this.settings = Util.loadSettings(profile.settings);
    this.scorebotEvents = [];
    this.spectating = Boolean(spectating);

    // handle game override
    if (gameOverride) {
      this.settings.general.game = gameOverride;
    }

    // set up properties dependent on game version
    this.baseDir = Constants.GameSettings.CSGO_BASEDIR;
    this.botCommandFile = Constants.GameSettings.CSGO_BOT_COMMAND_FILE;
    this.botConfigFile = Constants.GameSettings.CSGO_BOT_CONFIG;
    this.gameDir = Constants.GameSettings.CSGO_GAMEDIR;
    this.serverConfigFile = Constants.GameSettings.CSGO_SERVER_CONFIG_FILE;

    // build competitors data
    if (this.isFaceit && this.faceitRoom) {
      // Build pseudo competitors from FACEIT match room; user will be the only human.
      const userId = this.profile.playerId;

      // Where is the human?
      const userOnTeamA = this.faceitRoom.teamA.some((p: any) => p.id === userId);
      const userOnTeamB = this.faceitRoom.teamB.some((p: any) => p.id === userId);
      const userTeamId = userOnTeamA ? 1 : userOnTeamB ? 2 : 1;

      // Remove human from both bot rosters just in case
      const cleanTeamA = this.faceitRoom.teamA.filter((p: any) => p.id !== userId);
      const cleanTeamB = this.faceitRoom.teamB.filter((p: any) => p.id !== userId);

      // Same naming convention as the FACEIT match room UI
      const teamAName = this.faceitRoom.teamA.length
        ? `Team_${this.faceitRoom.teamA[0].name}`
        : 'Team_A';
      const teamBName = this.faceitRoom.teamB.length
        ? `Team_${this.faceitRoom.teamB[0].name}`
        : 'Team_B';

      const teamA = {
        teamId: 1,
        team: {
          id: 1,
          name: teamAName,
          slug: teamAName.toLowerCase().replace(/\s+/g, '-'),
          country: { code: 'EU' } as any,
          players: cleanTeamA.map(
            this.toServerPlayerFromMatchPlayer.bind(this),
          ),
        },
      };

      const teamB = {
        teamId: 2,
        team: {
          id: 2,
          name: teamBName,
          slug: teamBName.toLowerCase().replace(/\s+/g, '-'),
          country: { code: 'EU' } as any,
          players: cleanTeamB.map(
            this.toServerPlayerFromMatchPlayer.bind(this),
          ),
        },
      };

      // Randomize which logical team (1/2) starts T / CT once for this match
      const teamAStartsT = Math.random() < 0.5;
      this.faceitSides = teamAStartsT
        ? { 1: 't', 2: 'ct' }
        : { 1: 'ct', 2: 't' };

      this.faceitUserSide = this.faceitSides[userTeamId];

      this.competitors = [teamA, teamB] as any;
    } else {
      this.competitors = match.competitors.map((competitor) => {
        const isUserTeam = competitor.teamId === this.profile.teamId;

        const forceSize =
          this.spectating
            ? Constants.Application.SQUAD_MIN_LENGTH
            : isUserTeam
              ? Constants.Application.SQUAD_MIN_LENGTH - 1
              : Constants.Application.SQUAD_MIN_LENGTH;
        return {
          ...competitor,
          team: {
            ...competitor.team,
            players: Util.getSquad(
              competitor.team,
              this.profile,
              false,
              forceSize,
            ),
          },
        };
      });
    }
  }

  /**
   * Gets the hostname for the game server.
   *
   * @function
   */
  private get hostname() {
    if (this.isFaceit) {
      return `FACEIT | PUG #${this.faceitRoom?.matchId ?? ''}`;
    }

    const { federation, tier } = this.match.competition;
    const idiomaticTierName = Constants.IdiomaticTier[tier.slug];
    return `${tier.league.name}: ${startCase(federation.slug)} | ${idiomaticTierName}`;
  }

  /**
   * Gets the map for the match.
   *
   * @function
   */
  private get map() {
    if (this.isFaceit) {
      return this.matchGame.map;
    }

    return this.matchGame.map;
  }


  /**
   * Determines whether overtime is allowed.
   *
   * @function
   */
  private get overtime() {
    if (this.isFaceit) {
      // FACEIT: use settings only
      return this.settings.matchRules.overtime;
    }

    // override if playoff match
    const groupSize =
      this.match.competition.groupSize !== null && this.match.competition.groupSize !== undefined
        ? this.match.competition.groupSize
        : this.match.competition.tier.groupSize;

    if (!groupSize) {
      return true;
    }

    return this.settings.matchRules.overtime;
  }

  /**
   * Gets the path to the resources folder depending
   * on the current runtime environment.
   *
   * @function
   */
  private get resourcesPath() {
    return process.env['NODE_ENV'] === 'cli' || is.dev()
      ? path.normalize(path.join(process.env.INIT_CWD, 'src/resources'))
      : process.resourcesPath;
  }

  /**
   * Gets the user's custom launch arguments.
   *
   * @function
   */
  private get userArgs() {
    if (this.settings.general.gameLaunchOptions) {
      return this.settings.general.gameLaunchOptions.split(' ');
    }

    return [];
  }

  /**
   * Cleans up processes and other things after
   * closing the game server or client.
   *
   * @function
   */
  private async cleanup() {
    this.log.info('Cleaning up...');

    // clean up connections to processes and/or files
    try {
      if (this.scorebot) {
        await this.scorebot.quit();
      }
      gameClientProcess = null;
    } catch (error) {
      this.log.warn(error);
    }

    // restore files
    return FileManager.restore(
      path.join(this.settings.general.gamePath, this.baseDir, this.gameDir),
    );
  }

  /**
 * Generates the bot profile config (botprofile.db).
 *
 * @function
 */
  private async generateBotConfig() {

    const baseDir = path.join(this.settings.general.dedicatedServerPath, this.gameDir);
    const original = path.join(baseDir, this.botConfigFile); // e.g. "botprofile.db"
    const template = await fs.promises.readFile(original, 'utf8');
    const [home, away] = this.competitors;

    const allPlayers = [...home.team.players, ...away.team.players];
    await this.exportBotTemplatesJSON(allPlayers);

    const rendered = Sqrl.render(
      template,
      {
        home: home.team.players.map(this.generateBotDifficulty.bind(this)),
        away: away.team.players.map(this.generateBotDifficulty.bind(this)),
      },
      { autoEscape: false },
    );

    await fs.promises.writeFile(original, rendered, 'utf8');
    this.log.info(`Generated botprofile at: ${original}`);
  }

  /**
   * Generates a single bot profile block (used in botprofile.db)
   * Includes LookAngle tuning values based on difficulty template.
   */
  private generateBotDifficulty(
    player: Server['competitors'][number]['team']['players'][number],
  ) {
    const xp = new Bot.Exp(player);
    const template = xp.getBotTemplate();
    const difficulty = template.name;
    const voice = random(
      Constants.GameSettings.BOT_VOICEPITCH_MIN,
      Constants.GameSettings.BOT_VOICEPITCH_MAX,
    );

    // Determine weapon template based on role
    const weapon =
      player.role === Constants.PlayerRole.SNIPER
        ? Constants.WeaponTemplate.SNIPER
        : Constants.WeaponTemplate.RIFLE;

    // Determine personality (fallback for missing values)
    const personality = player.personality || Constants.PersonalityTemplate.RIFLE;

    // Lookup for LookAngle params by difficulty
    const lookAngleMap: Record<
      string,
      { normal: number; attack: number; stiff: number; damp: number }
    > = {
      [Constants.BotDifficulty.ABYSMAL]: {
        normal: 20000,
        attack: 9500,
        stiff: 600,
        damp: 27.5,
      },
      [Constants.BotDifficulty.NOTGOOD]: {
        normal: 20000,
        attack: 10500,
        stiff: 625,
        damp: 30.0,
      },
      [Constants.BotDifficulty.WORSE]: {
        normal: 20000,
        attack: 11500,
        stiff: 650,
        damp: 30.0,
      },
      [Constants.BotDifficulty.REALLYBAD]: {
        normal: 20000,
        attack: 11500,
        stiff: 675,
        damp: 32.5,
      },
      [Constants.BotDifficulty.POOR]: {
        normal: 20000,
        attack: 12500,
        stiff: 700,
        damp: 35.0,
      },
      [Constants.BotDifficulty.BAD]: {
        normal: 20000,
        attack: 12500,
        stiff: 700,
        damp: 35.0,
      },
      [Constants.BotDifficulty.LOW]: {
        normal: 20000,
        attack: 13500,
        stiff: 725,
        damp: 37.5,
      },
      [Constants.BotDifficulty.AVG]: {
        normal: 20000,
        attack: 14500,
        stiff: 775,
        damp: 40.0,
      },
      [Constants.BotDifficulty.MEDIUM]: {
        normal: 20000,
        attack: 15500,
        stiff: 800,
        damp: 42.5,
      },
      [Constants.BotDifficulty.SOLID]: {
        normal: 20000,
        attack: 16500,
        stiff: 825,
        damp: 45.0,
      },
      [Constants.BotDifficulty.FRAGGER]: {
        normal: 20000,
        attack: 17500,
        stiff: 850,
        damp: 47.5,
      },
      [Constants.BotDifficulty.STAR]: {
        normal: 20000,
        attack: 20000,
        stiff: 900,
        damp: 50.0,
      },
    };

    const look = lookAngleMap[difficulty] || lookAngleMap[Constants.BotDifficulty.ABYSMAL];

    // Build bot profile string (with dynamic LookAngle values)
    return Dedent.dedent`
${difficulty}+${weapon}+${personality} "${player.name}"
        VoicePitch = ${voice}
        LookAngleMaxAccelNormal = ${look.normal.toFixed(1)}
        LookAngleMaxAccelAttacking = ${look.attack.toFixed(1)}
        LookAngleStiffnessAttacking = ${look.stiff.toFixed(1)}
        LookAngleDampingAttacking = ${look.damp.toFixed(1)}
End\n
`;
  }

  private async exportBotTemplatesJSON(players: any[]) {
    const exportData: Record<string, string> = {};

    for (const player of players) {
      const xp = new Bot.Exp(player);
      const difficulty = xp.getBotTemplate().name;
      exportData[player.name] = difficulty;
    }

    // Build the export path inside LIGA's local server directory
    const exportDir = path.join(
      process.env.APPDATA || '',
      'LIGA Esports Manager',
      'plugins',
      'csgo',
      'addons',
      'sourcemod',
      'configs',
    );

    await fs.promises.mkdir(exportDir, { recursive: true });

    const exportFile = path.join(exportDir, 'bot_templates.json');
    await fs.promises.writeFile(exportFile, JSON.stringify(exportData, null, 2), 'utf8');

    console.log(
      ` Exported ${Object.keys(exportData).length} bot templates to ${exportFile}`,
    );
  }

  /**
   * FACEIT helper: convert MatchPlayer → Server player-like object
   */
  private toServerPlayerFromMatchPlayer(p: any) {
    return {
      id: p.id,
      name: p.name,
      role: p.role ?? null,
      personality: p.personality ?? null,
      countryId: p.countryId,
      xp: p.xp ?? 0,
    } as any;
  }

  /**
   * Generates a SourceMod-compatible AWPers list file.
   * Stored under LIGA's plugin configs so it's auto-copied to the server.
   */
  private async generateAWPersFile() {
    const awpers = this.competitors
      .flatMap((c) => c.team.players)
      .filter((p) => p.role === Constants.PlayerRole.SNIPER);

    // Build VDF structure
    const lines = ['"AWPers"', '{'];
    for (const p of awpers) {
      lines.push(`    "${p.name}" {}`);
    }
    lines.push('}');

    // Ensure correct directory:
    // %AppData%\LIGA Esports Manager\plugins\csgo\addons\sourcemod\configs
    const exportDir = path.join(
      process.env.APPDATA || '',
      'LIGA Esports Manager',
      'plugins',
      'csgo',
      'addons',
      'sourcemod',
      'configs',
    );

    // Make sure it exists
    fs.mkdirSync(exportDir, { recursive: true });

    const targetPath = path.join(exportDir, 'AWPers.txt');

    // Write the file
    fs.writeFileSync(targetPath, lines.join('\n'), 'utf-8');
    this.log.info(`[AWPers] File written to: ${targetPath}`);
  }

  /**
   * Patches the scoreboard so that it doesn't show BOT
   * in the prefix or ping column for the players.
   *
   * Since the prefix is controlled client-side we
   * cannot patch it from the SourceMod plugin.
   *
   * @note csgo only.
   * @function
   */
  private async generateScoreboardConfig() {
    const original = path.join(
      this.settings.general.gamePath,
      this.baseDir,
      this.gameDir,
      Constants.GameSettings.CSGO_LANGUAGE_FILE,
    );
    const template = await fs.promises.readFile(original, 'utf16le');
    const content = template
      .replace(
        /"SFUI_bot_decorated_name"[\s]+"BOT %s1"/g,
        '"SFUI_bot_decorated_name" "%s1"',
      )
      .replace(
        /"SFUI_scoreboard_lbl_bot"[\s]+"BOT"/g,
        '"SFUI_scoreboard_lbl_bot" "5"',
      );
    return fs.promises.writeFile(original, content, 'utf16le');
  }

  /**
  * Generates the server configuration file and the bot command file (liga-bots.cfg).
  *
  * @function
  */
  private async generateServerConfig() {
    const dedicatedDir = this.settings.general.dedicatedServerPath;
    if (!dedicatedDir) {
      this.log.warn('No dedicatedServerPath set, skipping server.cfg / liga-bots.cfg generation');
      return;
    }

    const prisma = DatabaseClient.prisma;

    const user = await prisma.player.findUnique({
      where: { id: this.profile.playerId },
      select: { role: true },
    });

    const isAWP = !this.spectating && user?.role === "AWPER" ? 1 : 0;
    const isIGL = !this.spectating && user?.role === "IGL";
    const bot_defer_to_human_items = this.isFaceit ? 0 : (isIGL ? 1 : 0);

    // ------------------------------
    // 1) SERVER.CFG TEMPLATE + PATH
    // ------------------------------
    const serverTemplatePath = path.join(
      PluginManager.getPath(),
      this.gameDir,
      this.serverConfigFile, // e.g. "cfg/server.cfg"
    );
    const serverTemplate = await fs.promises.readFile(serverTemplatePath, 'utf8');

    const serverCfgPath = path.join(
      dedicatedDir,
      this.gameDir,
      this.serverConfigFile, // same "cfg/server.cfg"
    );

    await fs.promises.mkdir(path.dirname(serverCfgPath), { recursive: true });

    const [home, away] = this.competitors as any;

    // For FACEIT, sides may be randomized; map them to T/CT.
    let tTeam = home;
    let ctTeam = away;

    if (this.isFaceit && this.faceitSides) {
      const maybeT = this.competitors.find(
        (c: any) => this.faceitSides?.[c.teamId] === 't',
      );
      const maybeCT = this.competitors.find(
        (c: any) => this.faceitSides?.[c.teamId] === 'ct',
      );

      if (maybeT) tTeam = maybeT;
      if (maybeCT) ctTeam = maybeCT;
    }

    const humanteam =
      this.spectating
        ? 'any'
        : this.profile.teamId === tTeam.teamId
          ? 'T'
          : this.profile.teamId === ctTeam.teamId
            ? 'CT'
            : 'any';

    let homeStats: any;
    let awayStats: any;

    if (!this.isFaceit) {
      [homeStats, awayStats] = [
        this.match.competition.competitors.find(
          (competitor) => competitor.teamId === home.teamId,
        ),
        this.match.competition.competitors.find(
          (competitor) => competitor.teamId === away.teamId,
        ),
      ];
    }

    const serverCfgData = this.isFaceit
      ? {
        demo: true,
        hostname: this.hostname,
        maxrounds: this.settings.matchRules.maxRounds,
        ot: +this.overtime,
        rcon_password: Constants.GameSettings.RCON_PASSWORD,
        teamname_t: tTeam.team.name,
        teamname_ct: ctTeam.team.name,
        gameover_delay: Constants.GameSettings.SERVER_CVAR_GAMEOVER_DELAY,
        spectating: +this.spectating,
        damage_prints: 0,
        isAWP,
        isFaceit: 1,
        bot_defer_to_human_items,

        match_stat: 'FACEIT PUG',
        teamflag_t: tTeam.team.country?.code || 'EU',
        teamflag_ct: ctTeam.team.country?.code || 'EU',
        shortname_t: tTeam.team.slug || 'FACEITA',
        shortname_ct: ctTeam.team.slug || 'FACEITB',
        stat_t: '',
        stat_ct: '',
        humanteam:
          this.faceitUserSide === 't'
            ? 'T'
            : this.faceitUserSide === 'ct'
              ? 'CT'
              : 'any',
      }
      : {
        demo: true,
        hostname: this.hostname,
        maxrounds: this.settings.matchRules.maxRounds,
        ot: +this.overtime,
        rcon_password: Constants.GameSettings.RCON_PASSWORD,
        teamname_t: home.team.name,
        teamname_ct: away.team.name,
        gameover_delay: Constants.GameSettings.SERVER_CVAR_GAMEOVER_DELAY,
        spectating: +this.spectating,
        damage_prints: 0,
        isAWP,
        isFaceit: 0,
        bot_defer_to_human_items,
        humanteam,

        match_stat: this.match.competition.tier.name,
        teamflag_t: home.team.country.code,
        teamflag_ct: away.team.country.code,
        shortname_t: home.team.slug,
        shortname_ct: away.team.slug,
        stat_t: Util.toOrdinalSuffix(homeStats.position),
        stat_ct: Util.toOrdinalSuffix(awayStats.position),
      };

    const serverCfgRendered = Sqrl.render(serverTemplate, serverCfgData, {
      autoEscape: false,
    });

    await fs.promises.writeFile(serverCfgPath, serverCfgRendered, 'utf8');
    this.log.info(`Generated server.cfg at: ${serverCfgPath}`);

    // -------------------------------------------
    // 2) LIGA-BOTS.CFG TEMPLATE + PATH (COMMANDS)
    // -------------------------------------------
    const botCmdTemplatePath = path.join(
      PluginManager.getPath(),
      this.gameDir,
      this.botCommandFile, // e.g. "cfg/liga-bots.cfg"
    );
    const botCmdTemplate = await fs.promises.readFile(botCmdTemplatePath, 'utf8');

    const botCmdPath = path.join(
      dedicatedDir,
      this.gameDir,
      this.botCommandFile, // same "cfg/liga-bots.cfg"
    );

    await fs.promises.mkdir(path.dirname(botCmdPath), { recursive: true });

    const bots = flatten(
      this.competitors.map((competitor, idx) =>
        competitor.team.players.map((player) => {
          const xp = new Bot.Exp(player);

          const side =
            this.isFaceit && this.faceitSides
              ? this.faceitSides[competitor.teamId] || 't'
              : idx === 0
                ? 't'
                : 'ct';
          return {
            difficulty: xp.getBotTemplate().difficulty,
            name: player.name,
            team: side,
          };
        }),
      ),
    );

    const botCmdRendered = Sqrl.render(
      botCmdTemplate,
      { bots },
      { autoEscape: false },
    );

    await fs.promises.writeFile(botCmdPath, botCmdRendered, 'utf8');
    this.log.info(`Generated ${this.botCommandFile} at: ${botCmdPath}`);
  }

  /**
   * Gets the local ip address.
   *
   * @function
   */
  private getLocalIP() {
    const allAddresses: Array<string> = [];
    const interfaces = os.networkInterfaces();

    Object.keys(interfaces).forEach((name) => {
      interfaces[name].forEach((networkInterface) => {
        if (networkInterface.family !== 'IPv4') {
          return;
        }

        allAddresses.push(networkInterface.address);
      });
    });

    const [localAddress] = uniq(allAddresses.sort()).filter(
      (IP) => IP !== '127.0.0.1',
    );
    return localAddress;
  }

  /**
   * Gets the file path to a team's logo/blazon.
   *
   * @param uri       The uri of the logo/blazon.
   * @param useBase64 Return as a base64-encoded string.
   * @function
   */
  private async getTeamLogo(uri: string, useBase64 = true) {
    const { protocol, filePath } =
      /^(?<protocol>.+):\/\/(?<filePath>.+)/g.exec(uri).groups;

    if (!protocol || !filePath) {
      return '';
    }

    if (process.env['NODE_ENV'] === 'cli' && protocol === 'custom') {
      return '';
    }

    let logoPath = '';

    switch (protocol) {
      case 'resources':
        logoPath = path.join(this.resourcesPath, filePath);
        break;
      case 'custom':
      case 'uploads':
        logoPath =
          process.env['NODE_ENV'] === 'cli'
            ? path.join(
              process.env.APPDATA as string,
              'LIGA Esports Manager',
              protocol,
              filePath,
            )
            : path.join(app.getPath('userData'), protocol, filePath);
        break;
    }

    if (useBase64) {
      const MIME_TYPES: Record<string, string> = {
        '.svg': 'image/svg+xml',
        '.jpg': 'image/jpeg',
        '.png': 'image/png',
      };
      const ext = path.extname(logoPath);
      const base64 = await fs.promises.readFile(logoPath, { encoding: 'base64' });
      const mime = MIME_TYPES[ext.toLowerCase()];
      return `data:${mime};base64,${base64}`;
    }

    return logoPath;
  }

  /**
   * Launches the CSGO game client.
   *
   * @function
   */
  private launchClientCSGO() {
    const defaultArgs = [
      '-novid',
      '+connect',
      `${this.getLocalIP()}:${Constants.GameSettings.RCON_PORT}`,
    ];

    const fixedSteamPath = path.join(
      this.settings.general.gamePath,
      Constants.GameSettings.CSGO_BASEDIR,
    );

    defaultArgs.unshift('-insecure');

    if (is.osx()) {
      gameClientProcess = spawn(
        'open',
        [
          `steam://rungameid/${Constants.GameSettings.CSGO_APPID}//'${defaultArgs.join(
            ' ',
          )}'`,
        ],
        { shell: true },
      );
    } else {
      gameClientProcess = spawn(
        Constants.GameSettings.CSGO_EXE,
        [
          '-applaunch',
          Constants.GameSettings.CSGO_APPID.toString(),
          ...defaultArgs,
          ...this.userArgs,
        ],
        { cwd: fixedSteamPath },
      );
    }

    gameClientProcess.on('close', this.cleanup.bind(this));
    this.log.debug(gameClientProcess.spawnargs);
    return Promise.resolve();
  }

  private launchServerCSGO() {
    const serverRoot = this.settings.general.dedicatedServerPath;
    const serverExe = path.join(serverRoot, 'srcds.exe');
    const serverCfg = 'server.cfg';

    const args = [
      '-console',
      '-usercon',
      '-insecure',
      '-tickrate 128',
      '-maxplayers_override',
      '10',
      '-game',
      'csgo',
      '+game_type',
      '0',
      '+game_mode',
      '1',
      '-port',
      Constants.GameSettings.RCON_PORT.toString(),
      '+exec',
      serverCfg,
      '+map',
      Util.convertMapPool(this.map, this.settings.general.game),
      '+rcon_password',
      Constants.GameSettings.RCON_PASSWORD,
    ];

    const srcdsCommand = `"${serverExe}" ${args.join(' ')}`;

    const cmdString = `E: && cd /d "${path.join(
      serverRoot,
      'csgo',
    )}" && ${srcdsCommand}`;

    spawn(
      'cmd.exe',
      [
        '/c',
        'start',
        '""',
        'cmd',
        '/c',
        cmdString,
      ],
      {
        detached: true,
        windowsHide: false,
        shell: true,
      },
    );
  }

  /**
   * Sets up and configures the files that are
   * necessary for the game server to run.
   *
   * @function
   */
  private async prepare() {
    const localGameDir = this.gameDir;
    // source: LIGA's plugin files (e.g. %APPDATA%\LIGA Esports Manager\plugins\csgo)
    const from = path.join(PluginManager.getPath(), localGameDir);

    // decide where to copy files to
    // if game is CS:GO, use dedicated server path instead of client path
    const isDedicated = this.settings.general.game === Constants.Game.CSGO;
    const dedicatedServerPath =
      this.settings.general.dedicatedServerPath || 'E:/steamcmd/csgo-ds'; // fallback

    const to = isDedicated
      ? path.join(dedicatedServerPath, 'csgo')
      : path.join(this.settings.general.gamePath, this.baseDir, this.gameDir);

    this.log.info(`Preparing server files from: ${from}`);
    this.log.info(`Copying to: ${to}`);

    if (this.settings.general.game === Constants.Game.CSGO) {
      const [home, away] = this.competitors;
      const allPlayers = [...home.team.players, ...away.team.players];
      await this.exportBotTemplatesJSON(allPlayers);
      await this.generateAWPersFile();
    }

    // find and extract zip files
    const zipFiles = await glob('**/*.zip', { cwd: from });
    await Promise.all(
      zipFiles.map((file) => FileManager.extract(path.join(from, file), to)),
    );

    // copy plain files
    await FileManager.copy('**/!(*.zip)', from, to);

    // generate server and bot configs
    await this.generateServerConfig();
    await this.generateBotConfig();

    // configure game files
    await this.generateScoreboardConfig();

    this.log.info('Server preparation complete.');
  }

  /**
   * Starts the game client.
   *
   *
   *
   * @function
   */
  public async start(): Promise<void> {
    // 1) Prepare files / plugins / cfgs
    await this.prepare();

    // 2) Launch server 
    this.launchServerCSGO();

    // 3) Connect to RCON (server)
    this.rcon = new RCON.Client(
      this.getLocalIP(),
      Constants.GameSettings.RCON_PORT,
      Constants.GameSettings.RCON_PASSWORD,
      {
        tcp: true,
        retryMax: Constants.GameSettings.RCON_MAX_ATTEMPTS,
      },
    );

    try {
      await this.rcon.init();
    } catch (error) {
      this.log.warn(error);
    }

    // 4) now launch the client (after server is up)
    await this.launchClientCSGO();

    // 5) Attach client process handlers (all games with a client)
    if (gameClientProcess) {
      gameClientProcess.on('error', (error) => {
        this.log.error(error);
      });

      gameClientProcess.on('close', this.cleanup.bind(this));
    }

    // 6) Start scorebot on the correct log file
    const logRoot =
      this.settings.general.game === Constants.Game.CSGO
        ? (this.settings.general.dedicatedServerPath || this.settings.general.gamePath)
        : this.settings.general.gamePath;

    const logFile = await getGameLogFile(
      this.settings.general.game,
      logRoot,
    );

    this.log.info(`Scorebot watching log file: ${logFile}`);


    this.scorebot = new Scorebot.Watcher(logFile);

    try {
      await this.scorebot.start();
    } catch (error) {
      this.log.error(error);
      throw error;
    }

    // 7) Push events into in-memory buffer
    this.scorebot.on(Scorebot.EventIdentifier.PLAYER_ASSISTED, (payload) =>
      this.scorebotEvents.push({ type: Scorebot.EventIdentifier.PLAYER_ASSISTED, payload }),
    );
    this.scorebot.on(Scorebot.EventIdentifier.PLAYER_KILLED, (payload) =>
      this.scorebotEvents.push({ type: Scorebot.EventIdentifier.PLAYER_KILLED, payload }),
    );
    this.scorebot.on(Scorebot.EventIdentifier.ROUND_OVER, (payload) =>
      this.scorebotEvents.push({ type: Scorebot.EventIdentifier.ROUND_OVER, payload }),
    );

    // 8) Resolve when GAME_OVER fires
    return new Promise((resolve) => {
      this.scorebot.on(Scorebot.EventIdentifier.GAME_OVER, async (payload) => {
        // In CS:GO we delay + adjust score ordering for OT
        if (true) {
          await Util.sleep(Constants.GameSettings.SERVER_CVAR_GAMEOVER_DELAY * 1000);

          const totalRoundsPlayed = payload.score.reduce((a, b) => a + b, 0);
          if (totalRoundsPlayed > this.settings.matchRules.maxRounds) {
            const totalRoundsOvertime =
              totalRoundsPlayed - this.settings.matchRules.maxRounds;
            const overtimeCount = Math.ceil(
              totalRoundsOvertime / this.settings.matchRules.maxRoundsOvertime,
            );

            // odd overtime segments → swap reported scores
            if (overtimeCount % 2 === 1) {
              payload.score.reverse();
            }
          }
        }
        if (gameClientProcess && !gameClientProcess.killed) {
          try {
            gameClientProcess.kill();
          } catch (e) {
          }
        }
        this.log.info('Final result: %O', payload);
        this.result = payload;
        resolve();
      });
    });
  }
}
