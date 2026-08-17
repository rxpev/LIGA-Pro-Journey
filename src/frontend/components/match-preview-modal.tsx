import React from 'react';
import { Constants, Eagers, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';

type Match = Awaited<ReturnType<typeof api.matches.all<typeof Eagers.matchEvents>>>[number];
type Player = Match['players'][number];

function isWithinStint(date: Date, startedAt: Date | string, endedAt: Date | string | null) {
  const start = new Date(startedAt);
  start.setHours(0, 0, 0, 0);
  const end = endedAt ? new Date(endedAt) : null;
  end?.setHours(23, 59, 59, 999);
  return start <= date && (!end || end >= date);
}

/** Keep this aligned with the postgame modal: match players are historical snapshots. */
function playersForTeam(match: Match, teamId: number) {
  const date = new Date(match.date);
  return match.players.filter((player) =>
    player.careerStints?.some(
      (stint) => stint.teamId === teamId && isWithinStint(date, stint.startedAt, stint.endedAt),
    ),
  );
}

function playerRating(player: Player, events: Match['events']) {
  const relevantEvents = events.filter((event) => event.weapon !== null || event.assistId);
  const gameIds = [...new Set(relevantEvents.map((event) => event.gameId))];
  const ratings = gameIds.map((gameId) => {
    const gameEvents = relevantEvents.filter((event) => event.gameId === gameId);
    const kills = gameEvents.filter((event) => event.attackerId === player.id).length;
    const deaths = gameEvents.filter(
      (event) => event.victimId === player.id && !event.assistId,
    ).length;
    const assists = gameEvents.filter((event) => event.assistId === player.id).length;
    return Util.getPlayerRating(kills, deaths, assists);
  });
  return ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : 0;
}

export default function MatchPreviewModal(props: {
  matchId: number;
  position: { x: number; y: number };
  onClose: () => void;
  onOpenMatch: () => void;
  onPlayerClick: (playerId: number) => void;
  onTeamClick: (teamId: number) => void;
}) {
  const [match, setMatch] = React.useState<Match>();

  React.useEffect(() => {
    setMatch(undefined);
    api.matches
      .all<
        typeof Eagers.matchEvents
      >({ where: { id: props.matchId }, include: Eagers.matchEvents.include })
      .then((matches) => setMatch(matches[0]));
  }, [props.matchId]);

  const popupPosition = {
    left: Math.min(Math.max(props.position.x, 12), Math.max(12, window.innerWidth - 396)),
    top: Math.min(Math.max(props.position.y, 12), Math.max(12, window.innerHeight - 470)),
  };
  const lineupPlayers = match
    ? match.competitors.map((competitor) =>
        playersForTeam(match, competitor.team.id).sort(
          (playerA, playerB) =>
            playerRating(playerB, match.events) - playerRating(playerA, match.events),
        ),
      )
    : [];

  return (
    <div className="fixed inset-0 z-[120]" onClick={props.onClose}>
      <section
        className="bg-base-100 border-base-content/10 w-full max-w-sm overflow-hidden rounded-lg border shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Match preview"
        style={{ position: 'fixed', ...popupPosition }}
      >
        {!match ? (
          <div className="center h-56">
            <span className="loading loading-bars" />
          </div>
        ) : (
          <>
            <header className="bg-base-100 border-base-content/10 relative h-14 border-b px-4">
              <span
                className="absolute top-1/2 right-1/2 flex -translate-y-1/2 items-center gap-1 font-bold"
                style={{ marginRight: '1.25rem' }}
              >
                <button
                  type="button"
                  className="hover:text-primary max-w-28 cursor-pointer truncate"
                  onClick={() => props.onTeamClick(match.competitors[0].team.id)}
                >
                  {match.competitors[0].team.name}
                </button>
                <img
                  src={match.competitors[0].team.blazon || 'resources://blazonry/noteam.svg'}
                  className="size-7 shrink-0 object-contain"
                />
              </span>
              <strong className="absolute top-1/2 left-1/2 w-10 -translate-x-1/2 -translate-y-1/2 text-center text-sm whitespace-nowrap tabular-nums">
                <span
                  className={
                    match.competitors[0].result === Constants.MatchResult.WIN
                      ? 'text-success'
                      : 'text-error'
                  }
                >
                  {match.competitors[0].score ?? '-'}
                </span>
                <span className="px-1 opacity-60">:</span>
                <span
                  className={
                    match.competitors[1].result === Constants.MatchResult.WIN
                      ? 'text-success'
                      : 'text-error'
                  }
                >
                  {match.competitors[1].score ?? '-'}
                </span>
              </strong>
              <span
                className="absolute top-1/2 left-1/2 flex -translate-y-1/2 items-center gap-1 font-bold"
                style={{ marginLeft: '1.25rem' }}
              >
                <img
                  src={match.competitors[1].team.blazon || 'resources://blazonry/noteam.svg'}
                  className="size-7 shrink-0 object-contain"
                />
                <button
                  type="button"
                  className="hover:text-primary max-w-28 cursor-pointer truncate"
                  onClick={() => props.onTeamClick(match.competitors[1].team.id)}
                >
                  {match.competitors[1].team.name}
                </button>
              </span>
            </header>
            <div className="px-4 py-3">
              <h3 className="mb-2 text-center text-sm font-bold">Maps</h3>
              <div className="space-y-1 text-sm">
                {match.games
                  .filter((game) => game.status === Constants.MatchStatus.COMPLETED)
                  .map((game) => {
                    const homeScore =
                      game.teams.find((team) => team.teamId === match.competitors[0].teamId)
                        ?.score ?? game.teams[0]?.score;
                    const awayScore =
                      game.teams.find((team) => team.teamId === match.competitors[1].teamId)
                        ?.score ?? game.teams[1]?.score;
                    const homeWon = homeScore != null && awayScore != null && homeScore > awayScore;
                    const awayWon = homeScore != null && awayScore != null && awayScore > homeScore;

                    return (
                      <div
                        className="grid grid-cols-[2.5rem_7rem_2.5rem] items-center justify-center gap-2 whitespace-nowrap"
                        key={game.id}
                      >
                        <span
                          className={cx(
                            'text-center tabular-nums',
                            homeWon ? 'text-success' : 'text-base-content/60',
                          )}
                        >
                          {homeScore ?? '-'}
                        </span>
                        <span className="text-center">
                          {Util.convertMapPool(game.map, Constants.Game.CSGO)}
                        </span>
                        <span
                          className={cx(
                            'text-center tabular-nums',
                            awayWon ? 'text-success' : 'text-base-content/60',
                          )}
                        >
                          {awayScore ?? '-'}
                        </span>
                      </div>
                    );
                  })}
              </div>
              <div className="mt-4">
                <div className="text-center text-xs font-bold">
                  <h3>Lineups</h3>
                </div>
                <div className="mt-2 space-y-1 text-sm">
                  {Array.from({
                    length: Math.max(lineupPlayers[0]?.length || 0, lineupPlayers[1]?.length || 0),
                  }).map((_, index) => {
                    const homePlayer = lineupPlayers[0]?.[index];
                    const awayPlayer = lineupPlayers[1]?.[index];
                    const homeRating = homePlayer ? playerRating(homePlayer, match.events) : null;
                    const awayRating = awayPlayer ? playerRating(awayPlayer, match.events) : null;
                    return (
                      <div
                        className="grid grid-cols-[1fr_auto_auto_1fr] items-center gap-x-3"
                        key={`${homePlayer?.id ?? 'home'}-${awayPlayer?.id ?? 'away'}`}
                      >
                        <button
                          type="button"
                          className="hover:text-primary flex min-w-0 cursor-pointer items-center gap-1.5 truncate text-left"
                          disabled={!homePlayer}
                          onClick={() => homePlayer && props.onPlayerClick(homePlayer.id)}
                        >
                          <span className="bg-base-content/20 size-7 shrink-0 overflow-hidden rounded-full">
                            <img
                              src={homePlayer?.avatar || 'resources://avatars/empty.png'}
                              className="size-full object-cover object-top"
                            />
                          </span>
                          {homePlayer?.name ?? ''}
                        </button>
                        <span className="tabular-nums">{homeRating?.toFixed(2) ?? '-'}</span>
                        <span className="tabular-nums">{awayRating?.toFixed(2) ?? '-'}</span>
                        <button
                          type="button"
                          className="hover:text-primary flex min-w-0 cursor-pointer flex-row-reverse items-center gap-1.5 truncate text-right"
                          disabled={!awayPlayer}
                          onClick={() => awayPlayer && props.onPlayerClick(awayPlayer.id)}
                        >
                          <span className="bg-base-content/20 size-7 shrink-0 overflow-hidden rounded-full">
                            <img
                              src={awayPlayer?.avatar || 'resources://avatars/empty.png'}
                              className="size-full object-cover object-top"
                            />
                          </span>
                          {awayPlayer?.name ?? ''}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <footer className="flex gap-2 px-3 pt-2 pb-3">
              <button
                type="button"
                className="btn flex-1 bg-[#4d6783] text-[#d8e5f1]"
                onClick={props.onOpenMatch}
              >
                Match page
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
