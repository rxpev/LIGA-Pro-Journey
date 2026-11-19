import { Constants } from '@liga/shared';

const historyQuery = {
  select: {
    id: true,
    name: true,
    avatar: true,
    careerStints: {
      orderBy: [{ startedAt: 'asc' as const }, { id: 'asc' as const }],
      select: {
        id: true,
        teamId: true,
        starter: true,
        isTrial: true,
        startedAt: true,
        endedAt: true,
        team: { select: { id: true, name: true, blazon: true } },
      },
    },
  },
  where: { careerStints: { some: {} } },
};

type HistoryPlayer = Awaited<ReturnType<typeof api.players.all<typeof historyQuery>>>[number];
export type TransferTeam = NonNullable<HistoryPlayer['careerStints'][number]['team']>;

function realTeam(team: TransferTeam | null | undefined): TransferTeam | null {
  return team && team.name.toLowerCase() !== 'no team' && !team.blazon?.includes('noteam.svg')
    ? team
    : null;
}

export type TransferEvent = {
  id: string;
  date: Date;
  player: Pick<HistoryPlayer, 'id' | 'name' | 'avatar'>;
  from: TransferTeam | null;
  to: TransferTeam | null;
  fromBenched: boolean;
  toBenched: boolean;
  fromTrial: boolean;
  toTrial: boolean;
  kind: 'join' | 'transfer' | 'release' | 'bench' | 'reinstate' | 'trial-signing';
};

export function describeTransferEvent(event: TransferEvent): string {
  switch (event.kind) {
    case 'release':
      return `parts ways with ${event.from?.name || 'No Team'}`;
    case 'bench':
      return `is benched on ${event.to?.name || 'No Team'}`;
    case 'reinstate':
      return `is moved to the active roster on ${event.to?.name || 'No Team'}`;
    case 'trial-signing':
      return `joins ${event.to?.name || 'No Team'} after trial`;
    case 'join':
      return `joins ${event.to?.name || 'No Team'}${event.toTrial ? ' on trial' : ''}`;
    case 'transfer':
      return `transfers from ${event.from?.name || 'No Team'} to ${event.to?.name || 'No Team'}`;
  }
}

export function buildTransferEvents(players: HistoryPlayer[]): TransferEvent[] {
  const events = players.flatMap((player) => {
    const stints = player.careerStints;
    const playerEvents: TransferEvent[] = [];

    stints.forEach((stint, index) => {
      const previous = stints[index - 1];
      const next = stints[index + 1];
      const fromTeam = realTeam(previous?.team);
      const toTeam = realTeam(stint.team);
      const date = new Date(stint.startedAt);
      const base = {
        date,
        player: { id: player.id, name: player.name, avatar: player.avatar },
        fromBenched: previous ? !previous.starter : false,
        toBenched: !stint.starter,
        fromTrial: previous?.isTrial || false,
        toTrial: stint.isTrial,
      };
      const isInitialStint =
        !previous &&
        !stint.isTrial &&
        date.toISOString().slice(0, 10) === Constants.NewSaveSeasonStartDate.slice(0, 10);
      // Save bootstrap can contain consecutive same-team stints on day one so
      // that the imported roster's starter/bench state matches the live Player
      // snapshot. Those rows describe the initial roster; they are not roster
      // moves that happened during the save.
      const isInitialRosterSnapshot =
        previous?.teamId === stint.teamId &&
        date.toISOString().slice(0, 10) === Constants.NewSaveSeasonStartDate.slice(0, 10);

      if (previous?.teamId !== stint.teamId && !isInitialStint) {
        if (toTeam) {
          playerEvents.push({
            ...base,
            id: `move_${player.id}_${stint.id}`,
            from: fromTeam,
            to: toTeam,
            kind: fromTeam ? 'transfer' : 'join',
          });
        } else if (fromTeam) {
          playerEvents.push({
            ...base,
            id: `release_${player.id}_${stint.id}`,
            from: fromTeam,
            to: null,
            toBenched: false,
            kind: 'release',
          });
        }
      } else if (previous?.teamId === stint.teamId && toTeam) {
        if (previous.isTrial && !stint.isTrial) {
          playerEvents.push({
            ...base,
            id: `trial_${player.id}_${stint.id}`,
            from: toTeam,
            to: toTeam,
            kind: 'trial-signing',
          });
        } else if (!isInitialRosterSnapshot && previous.starter && !stint.starter) {
          playerEvents.push({
            ...base,
            id: `bench_${player.id}_${stint.id}`,
            from: toTeam,
            to: toTeam,
            kind: 'bench',
          });
        } else if (!isInitialRosterSnapshot && !previous.starter && stint.starter) {
          playerEvents.push({
            ...base,
            id: `reinstate_${player.id}_${stint.id}`,
            from: toTeam,
            to: toTeam,
            kind: 'reinstate',
          });
        }
      }

      if (toTeam && stint.endedAt && !next) {
        playerEvents.push({
          ...base,
          id: `release_end_${player.id}_${stint.id}`,
          date: new Date(stint.endedAt),
          from: toTeam,
          to: null,
          fromBenched: !stint.starter,
          toBenched: false,
          kind: 'release',
        });
      }
    });

    return playerEvents;
  });

  return events.sort((a, b) => b.date.getTime() - a.date.getTime() || b.id.localeCompare(a.id));
}

export async function loadTransferEvents(): Promise<TransferEvent[]> {
  const players = await api.players.all<typeof historyQuery>(historyQuery);
  return buildTransferEvents(players);
}
