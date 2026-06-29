/**
 * Play IPC handlers.
 *
 * @module
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import log from 'electron-log';
import { ipcMain } from 'electron';
import { flatten, merge, sample } from 'lodash';
import { Constants, Eagers, Util } from '@liga/shared';
import { saveFaceitResult } from '@liga/backend/lib/save-result';
import * as XpEconomy from '@liga/backend/lib/xp-economy';
import {
  DatabaseClient,
  ArenaMode,
  Game,
  Scorebot,
  Simulator,
  WindowManager,
  Worldgen,
} from '@liga/backend/lib';

async function withExhibitionRootPrisma<T>(callback: (prisma: PrismaClient) => Promise<T>) {
  const rootSavePath = path.join(DatabaseClient.localBasePath, Util.getSaveFileName(0));
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${rootSavePath}?connection_limit=1`,
      },
    },
  });

  try {
    return await callback(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Register the IPC event handlers.
 *
 * @function
 */
export default function () {
  ipcMain.handle(Constants.IPCRoute.PLAY_EXHIBITION_FEDERATIONS, async () =>
    withExhibitionRootPrisma((prisma) => prisma.federation.findMany()),
  );

  ipcMain.handle(
    Constants.IPCRoute.PLAY_EXHIBITION_TEAMS,
    async (_, query: Prisma.TeamFindManyArgs) =>
      withExhibitionRootPrisma((prisma) => prisma.team.findMany(query)),
  );

  ipcMain.handle(
    Constants.IPCRoute.PLAY_EXHIBITION_PLAYERS,
    async (_, query?: Prisma.PlayerFindManyArgs) =>
      withExhibitionRootPrisma((prisma) => prisma.player.findMany(query)),
  );

  ipcMain.handle(
    Constants.IPCRoute.PLAY_EXHIBITION,
    async (
      event,
      settings: typeof Constants.Settings,
      teamIds: Array<number>,
      teamId: number,
      rosterOverrides: Array<{ teamId: number; playerIds: Array<number> }> = [],
      spectating = false,
      customGameOptions: Constants.CustomGameOptions = { mode: 'classic' },
    ) => {
      let previousPath = '';
      try {
        previousPath = DatabaseClient.path;
      } catch (_) {
        previousPath = Util.getSaveFileName(0);
      }
      const previousPathMatch = previousPath?.match(/save_(\d+)\.db$/);
      const previousSaveId = Number(previousPathMatch?.[1] ?? 0);
      const exhibitionSaveId = Number(`9${Date.now()}`);
      const rootSavePath = path.join(DatabaseClient.localBasePath, Util.getSaveFileName(0));
      const exhibitionSavePath = path.join(
        DatabaseClient.basePath,
        Util.getSaveFileName(exhibitionSaveId),
      );
      let postgamePayload: unknown = null;
      const landingWindow = WindowManager.get(Constants.WindowIdentifier.Landing);
      let minimizedForClientLaunch = false;
      const sendProgress = (status: string) => {
        event.sender.send(Constants.IPCRoute.PLAY_PROGRESS, { status });

        if (status === 'STARTING_CLIENT' && !minimizedForClientLaunch) {
          minimizedForClientLaunch = true;
          setTimeout(() => landingWindow.minimize(), 250);
        }
      };

      sendProgress('PREPARING_MATCH');

      sendProgress('COPYING_FILES');
      await fs.promises.mkdir(path.dirname(exhibitionSavePath), { recursive: true });
      await fs.promises.copyFile(rootSavePath, exhibitionSavePath);
      await DatabaseClient.connect(exhibitionSaveId);

      try {
        type TeamWithPlayers = Prisma.TeamGetPayload<typeof Eagers.team>;

        // configure map override if none selected
        const mapPool = await DatabaseClient.prisma.mapPool.findMany({
          where: {
            gameVersion: { slug: settings.general.game },
          },
          include: Eagers.mapPool.include,
        });
        const selectedMap =
          settings.matchRules.mapOverride || sample(mapPool)?.gameMap.name || 'de_dust2';

        // grab team info
        const [homeRaw, awayRaw] = await Promise.all(
          teamIds.map((id) =>
            DatabaseClient.prisma.team.findFirst<typeof Eagers.team>({
              where: { id },
              include: Eagers.team.include,
            }),
          ),
        );
        let selectedUserPlayerId: number | null = null;
        const maxRosterSize = Constants.Application.SQUAD_MIN_LENGTH;

        const applyRosterOverride = async (
          team: TeamWithPlayers | null,
        ): Promise<TeamWithPlayers | null> => {
          if (!team) {
            return team;
          }

          const override = rosterOverrides.find((entry) => entry.teamId === team.id);

          if (!override?.playerIds?.length) {
            return team;
          }

          const uniquePlayerIds = [...new Set(override.playerIds)].slice(
            0,
            maxRosterSize,
          );
          const includesYou = !spectating && team.id === teamId && uniquePlayerIds.includes(-1);
          const rosterIds = uniquePlayerIds.filter((playerId) => playerId !== -1);
          const teamPlayerMap = new Map(team.players.map((player) => [player.id, player]));
          const externalPlayerIds = rosterIds.filter((playerId) => !teamPlayerMap.has(playerId));
          const externalPlayers = externalPlayerIds.length
            ? await DatabaseClient.prisma.player.findMany({
                where: { id: { in: externalPlayerIds } },
              })
            : [];
          const externalPlayerMap = new Map(externalPlayers.map((player) => [player.id, player]));
          const forcedPlayers = rosterIds
            .map((playerId) => teamPlayerMap.get(playerId) || externalPlayerMap.get(playerId))
            .filter((player): player is (typeof team.players)[number] => Boolean(player));
          const fallbackPlayers = team.players
            .filter((player) => !rosterIds.includes(player.id))
            .slice(0, Math.max(0, maxRosterSize - forcedPlayers.length));
          let lineup = [...forcedPlayers, ...fallbackPlayers].slice(
            0,
            maxRosterSize,
          );

          if (!spectating && team.id === teamId) {
            const awperIdx = lineup.findIndex(
              (player) =>
                player.role === Constants.UserRole.AWPER ||
                player.role === Constants.PlayerRole.SNIPER,
            );
            const sourceIdx = awperIdx >= 0 ? awperIdx : 0;

            if (lineup.length > 0 && includesYou) {
              const controlPlayer =
                team.players.find((player) => !rosterIds.includes(player.id)) ||
                team.players[sourceIdx] ||
                team.players[0];
              selectedUserPlayerId = controlPlayer.id;

              if (!lineup.some((player) => player.id === controlPlayer.id)) {
                lineup = [...lineup, controlPlayer].slice(
                  0,
                  maxRosterSize,
                );
              }
            } else if (lineup.length > 0 && !selectedUserPlayerId) {
              selectedUserPlayerId = lineup[sourceIdx].id;
            }
          }

          return {
            ...team,
            players: lineup.map((player, index) => ({
              ...player,
              starter: index < maxRosterSize && player.id !== selectedUserPlayerId,
            })),
          };
        };
        const [home, away] = await Promise.all([
          applyRosterOverride(homeRaw),
          applyRosterOverride(awayRaw),
        ]);

        if (!home || !away) {
          throw new Error('Could not resolve exhibition teams.');
        }

        const homeIds = new Set(home.players.map((player) => player.id));
        const awayOriginalPlayers = [...away.players];
        away.players = away.players.filter((player) => !homeIds.has(player.id));
        if (away.players.length < maxRosterSize) {
          const awayFallback = awayOriginalPlayers
            .filter(
              (player) =>
                !homeIds.has(player.id) && !away.players.some((entry) => entry.id === player.id),
            )
            .slice(0, maxRosterSize - away.players.length);
          away.players = [...away.players, ...awayFallback];
        }

        // grab user's chosen team
        const userTeam = [home, away].find((team) => team.id === teamId);

        // load federation and tier info
        const federation = await DatabaseClient.prisma.federation.findFirst({
          where: {
            slug: Constants.FederationSlug.ESPORTS_WORLD,
          },
        });

        // since this is an exhibition match we must
        // manually build the match-related objects
        const profile = {
          teamId: userTeam.id,
          playerId: spectating ? -1 : selectedUserPlayerId || userTeam.players[0].id,
          settings: JSON.stringify(settings),
        } as Prisma.ProfileGetPayload<unknown>;

        const tier = {
          name: 'Exhibition',
          slug: Constants.TierSlug.EXHIBITION_FRIENDLY,
          groupSize: 0,
          league: {
            name: 'Exhibition',
          },
        } as Prisma.TierGetPayload<{ include: { league: true } }>;

        const match = {
          customGameOptions,
          games: [
            {
              status: Constants.MatchStatus.READY,
              num: 1,
              map: selectedMap,
              teams: [home, away].map((team, seed) => ({
                seed: seed + 1,
                teamId: team.id,
                team,
              })),
            },
          ],
          competitors: [home, away].map((team) => ({
            teamId: team.id,
            team,
          })),
          competition: {
            federation,
            tier,
            competitors: [home, away].map((team) => ({
              teamId: team.id,
              team: team as Omit<typeof team, 'players' | 'country'>,
            })),
          },
        } as unknown as Prisma.MatchGetPayload<typeof Eagers.match>;

        // start the server and play the match
        const gameServer = new Game.Server(profile, match, null, spectating);
        gameServer.onProgress(sendProgress);
        gameServer.onCleanup(() => ArenaMode.disable(settings));
        gameServer.onClientConnected(async () => {
          await ArenaMode.startCrowdLoop(settings);
        });
        await ArenaMode.runForMatch(settings, match, () => gameServer.start());
        sendProgress('SAVING_RESULTS');

        const sideTeamIds = gameServer.getSideTeamIds();
        const [tScore, ctScore] = gameServer.result.score;
        const scoreByTeamId = {
          [sideTeamIds?.t ?? home.id]: tScore,
          [sideTeamIds?.ct ?? away.id]: ctScore,
        };

        postgamePayload = {
          type: 'exhibition',
          mode: customGameOptions.mode,
          map: gameServer.matchGame.map,
          game: settings.general.game,
          teams: [home, away].map((team) => ({
            id: team.id,
            name: team.name,
            blazon: team.blazon,
            score: scoreByTeamId[team.id] ?? 0,
            players: team.players.map((player) => ({
              id: player.id,
              name: !spectating && player.id === selectedUserPlayerId ? 'YOU' : player.name,
              matchName: player.name,
              country: 'country' in player ? player.country : null,
            })),
          })),
          fallbackPlayerId: selectedUserPlayerId,
          events: gameServer.scorebotEvents.map((event) => ({
            type: event.type,
            payload: {
              ...event.payload,
              timestamp: event.payload.timestamp.toISOString(),
            },
          })),
        };
      } finally {
        const cleanupStartedAt = Date.now();
        await DatabaseClient.disconnect();
        log.debug(
          'Exhibition cleanup: disconnected temporary database in %dms.',
          Date.now() - cleanupStartedAt,
        );

        const reconnectStartedAt = Date.now();
        await DatabaseClient.connect(previousSaveId);
        log.debug(
          'Exhibition cleanup: reconnected previous database in %dms.',
          Date.now() - reconnectStartedAt,
        );

        fs.promises.unlink(exhibitionSavePath).catch((error) => {
          log.warn('Could not remove temporary exhibition save %s: %s', exhibitionSavePath, error);
        });
      }

      if (postgamePayload) {
        WindowManager.get(Constants.WindowIdentifier.Landing, false)?.restore();
        WindowManager.send(Constants.WindowIdentifier.Modal, {
          target: '/postgame',
          payload: postgamePayload,
        });
      }
    },
  );
  ipcMain.handle(Constants.IPCRoute.PLAY_START, async (event, spectating?: boolean) => {
    // grab today's match
    const profile = await DatabaseClient.prisma.profile.findFirst(Eagers.profile);
    const entry = await DatabaseClient.prisma.calendar.findFirst({
      where: {
        date: profile.date,
        type: Constants.CalendarEntry.MATCHDAY_USER,
      },
    });
    const match = await DatabaseClient.prisma.match.findFirst({
      where: {
        id: Number(entry.payload),
      },
      include: Eagers.match.include,
    });

    const mainWindow = WindowManager.get(Constants.WindowIdentifier.Main);
    let minimizedForClientLaunch = false;
    const sendProgress = (status: string) => {
      if (status === 'STARTING_CLIENT' && !minimizedForClientLaunch) {
        minimizedForClientLaunch = true;
        mainWindow.minimize();
      }

      event.sender.send(Constants.IPCRoute.PLAY_PROGRESS, { status });
    };

    sendProgress('PREPARING_MATCH');

    // load on-the-fly settings
    let settingsLocalStorage: string;

    try {
      settingsLocalStorage = await mainWindow.webContents.executeJavaScript(
        'localStorage.getItem("settings");',
      );
    } catch (_) {
      log.warn('Could not load on-the-fly settings.');
    }

    if (settingsLocalStorage) {
      const settingsLocal = JSON.parse(settingsLocalStorage);
      const settingsRemote = Util.loadSettings(profile.settings);
      profile.settings = JSON.stringify(merge({}, settingsRemote, settingsLocal));
    }

    const settings = Util.loadSettings(profile.settings);

    // start the server and play the match
    const gameServer = new Game.Server(profile, match, null, spectating);
    gameServer.onProgress(sendProgress);
    gameServer.onCleanup(() => ArenaMode.disable(settings));
    gameServer.onClientConnected(async () => {
      await ArenaMode.startCrowdLoop(settings);
    });
    await ArenaMode.runForMatch(settings, match, () => gameServer.start());
    sendProgress('SAVING_RESULTS');
    const [home, away] = match.competitors;
    const sideTeamIds = gameServer.getSideTeamIds();
    const [tScore, ctScore] = gameServer.result.score;
    const scoreByTeamId = {
      [sideTeamIds?.t ?? home.teamId]: tScore,
      [sideTeamIds?.ct ?? away.teamId]: ctScore,
    };
    const homeScore = scoreByTeamId[home.teamId] ?? 0;
    const awayScore = scoreByTeamId[away.teamId] ?? 0;
    const gameScore = {
      [home.teamId]: homeScore,
      [away.teamId]: awayScore,
    };
    const globalScore = {
      [home.teamId]:
        match.games.length > 1
          ? home.score +
            Number(Simulator.getMatchResult(home.teamId, gameScore) === Constants.MatchResult.WIN)
          : gameScore[home.teamId],
      [away.teamId]:
        match.games.length > 1
          ? away.score +
            Number(Simulator.getMatchResult(away.teamId, gameScore) === Constants.MatchResult.WIN)
          : gameScore[away.teamId],
    };
    const winsToClinch = Math.floor(match.games.length / 2) + 1;
    const matchCompleted = Object.values(globalScore).some((score) => score >= winsToClinch);

    // add the user back into the list of players
    // to record match events properly
    const players = flatten(gameServer.competitors.map((competitor) => competitor.team.players));
    players.push(profile.player);

    // update the match record and create the match events database entries
    await DatabaseClient.prisma.match.update({
      where: { id: match.id },
      data: {
        status: matchCompleted ? Constants.MatchStatus.COMPLETED : match.status,
        competitors: {
          update: match.competitors.map((competitor) => ({
            where: { id: competitor.id },
            data: {
              score: globalScore[competitor.teamId],
              result: matchCompleted
                ? Simulator.getMatchResult(competitor.teamId, globalScore)
                : competitor.result,
            },
          })),
        },
        games: {
          update: {
            where: { id: gameServer.matchGame.id },
            data: {
              status: Constants.MatchStatus.COMPLETED,
              teams: {
                update: gameServer.matchGame.teams.map((team) => ({
                  where: {
                    id: team.id,
                  },
                  data: {
                    score: gameScore[team.teamId],
                    result: Simulator.getMatchResult(team.teamId, gameScore),
                  },
                })),
              },
            },
          },
        },
        players: {
          connect: players.map((player) => ({ id: player.id })),
        },
        events: {
          create: (() => {
            // in order to record things under the correct half we must sort the
            // entries by their timestamp and keep manual track of the rounds
            let half = 0;
            let rounds = 1;

            return gameServer.scorebotEvents
              .sort((a, b) => a.payload.timestamp.getTime() - b.payload.timestamp.getTime())
              .map((event) => {
                switch (event.type) {
                  case Scorebot.EventIdentifier.PLAYER_ASSISTED: {
                    const eventAssisted = event.payload as Scorebot.EventPayloadPlayerAssisted;
                    const assist = players.find(
                      (player) => player.name === eventAssisted.assist.name,
                    );
                    const victim = players.find(
                      (player) => player.name === eventAssisted.victim.name,
                    );
                    return {
                      half,
                      payload: JSON.stringify(event),
                      timestamp: eventAssisted.timestamp,
                      assist: {
                        connect: {
                          id: assist?.id || profile.playerId,
                        },
                      },
                      game: {
                        connect: {
                          id: gameServer.matchGame.id,
                        },
                      },
                      victim: {
                        connect: {
                          id: victim?.id || profile.playerId,
                        },
                      },
                    };
                  }
                  case Scorebot.EventIdentifier.PLAYER_KILLED: {
                    const eventKilled = event.payload as Scorebot.EventPayloadPlayerKilled;
                    const attacker = players.find(
                      (player) => player.name === eventKilled.attacker.name,
                    );
                    const victim = players.find(
                      (player) => player.name === eventKilled.victim.name,
                    );
                    return {
                      half,
                      headshot: eventKilled.headshot,
                      payload: JSON.stringify(event),
                      timestamp: eventKilled.timestamp,
                      weapon: eventKilled.weapon,
                      attacker: {
                        connect: {
                          id: attacker?.id || profile.playerId,
                        },
                      },
                      game: {
                        connect: {
                          id: gameServer.matchGame.id,
                        },
                      },
                      victim: {
                        connect: {
                          id: victim?.id || profile.playerId,
                        },
                      },
                    };
                  }
                  default: {
                    const eventRoundOver = event.payload as Scorebot.EventPayloadRoundOver;
                    const currentHalf = half;
                    const { maxRounds, maxRoundsOvertime } = settings.matchRules;

                    // invert score on odd-numbered halves
                    let invert = half % 2 === 1;

                    // handle overtime conditions where we only swap
                    // on 1st-half of odd-numbered segments
                    //
                    // [  /  ] [  /  ] [  /  ]
                    //  ^           ^   ^
                    //
                    // when an overtime starts, the sides are not swapped, so
                    // every odd-numbered overtime means teams have swapped
                    if (rounds > maxRounds) {
                      const roundsOvertime = rounds - maxRounds;
                      const overtimeCount = Math.ceil(roundsOvertime / maxRoundsOvertime);

                      if (overtimeCount % 2 === 1) {
                        invert = half % 2 === 0; // swap on 1st-half
                      }

                      // figure out if we've reached half-time in this overtime segment
                      const overtimeRound = ((roundsOvertime - 1) % maxRoundsOvertime) + 1;
                      half =
                        overtimeRound === maxRoundsOvertime / 2 ||
                        overtimeRound === maxRoundsOvertime
                          ? ++half
                          : half;
                    } else {
                      half = rounds === maxRounds / 2 || rounds === maxRounds ? ++half : half;
                    }

                    // update round value
                    rounds += 1;

                    // now we can return the data
                    const winnerSideAtStart = invert
                      ? 1 - eventRoundOver.winner
                      : eventRoundOver.winner;
                    const winnerTeamId =
                      winnerSideAtStart === 0
                        ? (sideTeamIds?.t ?? match.competitors[0].teamId)
                        : (sideTeamIds?.ct ?? match.competitors[1].teamId);
                    const winnerCompetitorId =
                      match.competitors.find((competitor) => competitor.teamId === winnerTeamId)
                        ?.id ??
                      match.competitors[invert ? 1 - eventRoundOver.winner : eventRoundOver.winner]
                        .id;

                    return {
                      half: currentHalf,
                      payload: JSON.stringify(event),
                      result: eventRoundOver.event,
                      timestamp: eventRoundOver.timestamp,
                      game: {
                        connect: {
                          id: gameServer.matchGame.id,
                        },
                      },
                      winner: {
                        connect: {
                          id: winnerCompetitorId,
                        },
                      },
                    };
                  }
                }
              });
          })(),
        },
      },
    });

    if (matchCompleted) {
      await XpEconomy.applyMatchXpFromCompletedMatch({
        matchId: match.id,
        profile: { id: profile.id, teamId: profile.teamId, playerId: profile.playerId },
      });
    }

    // bail early if match isn't completed yet and send a profile
    // update so that the match status gets refreshed
    if (!matchCompleted) {
      mainWindow.restore();
      mainWindow.webContents.send(Constants.IPCRoute.PROFILES_CURRENT, profile);
      return WindowManager.send(Constants.WindowIdentifier.Modal, {
        target: '/postgame',
        payload: match.id,
      });
    }

    // clean up on-the-fly settings
    if (settingsLocalStorage) {
      try {
        await mainWindow.webContents.executeJavaScript('localStorage.removeItem("settings");');
      } catch (_) {
        log.warn('Could not remove on-the-fly settings.');
      }
    }

    // apply elo deltas
    const homeActualScore = Constants.EloScore[Simulator.getMatchResult(home.team.id, globalScore)];
    const awayActualScore = Constants.EloScore[Simulator.getMatchResult(away.team.id, globalScore)];
    const deltas = [
      Util.getTeamRankingPointDelta(home.team.elo, away.team.elo, homeActualScore, {
        tierSlug: match.competition?.tier?.slug,
        leagueSlug: match.competition?.tier?.league?.slug,
        competitionFederationId: match.competition?.federationId,
        ownCompetitionFederationId: home.team.competitionFederationId,
        opponentCompetitionFederationId: away.team.competitionFederationId,
        ownTier: home.team.tier,
        opponentTier: away.team.tier,
      }),
      Util.getTeamRankingPointDelta(away.team.elo, home.team.elo, awayActualScore, {
        tierSlug: match.competition?.tier?.slug,
        leagueSlug: match.competition?.tier?.league?.slug,
        competitionFederationId: match.competition?.federationId,
        ownCompetitionFederationId: away.team.competitionFederationId,
        opponentCompetitionFederationId: home.team.competitionFederationId,
        ownTier: away.team.tier,
        opponentTier: home.team.tier,
      }),
    ];
    await Promise.all(
      deltas.map((delta, teamIdx) =>
        DatabaseClient.prisma.team.update({
          where: {
            id: match.competitors[teamIdx].team.id,
          },
          data: {
            elo: Util.clampElo(match.competitors[teamIdx].team.elo + delta),
          },
        }),
      ),
    );

    // check if user won any awards
    await Worldgen.sendUserAward(match.competition);

    // restore window and open the play modal
    mainWindow.restore();
    WindowManager.send(Constants.WindowIdentifier.Modal, {
      target: '/postgame',
      payload: match.id,
    });
  });
}
