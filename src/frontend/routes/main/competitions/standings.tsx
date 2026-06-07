/**
 * Competition standings route.
 *
 * @module
 */
import React from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { groupBy } from 'lodash';
import { Constants, Eagers, Util } from '@liga/shared';
import { AppStateContext } from '@liga/frontend/redux';
import { useTranslation } from '@liga/frontend/hooks';
import { Brackets, Standings } from '@liga/frontend/components';
import { cx } from '@liga/frontend/lib';
import swissArrowGreen from '@liga/frontend/assets/swiss/arrowsgreen.png';
import swissArrowRed from '@liga/frontend/assets/swiss/arrowsred.png';
import swissArrowGreenSingle from '@liga/frontend/assets/swiss/greenarrowsingle.png';
import swissArrowRedSingle from '@liga/frontend/assets/swiss/redarrowsingle.png';
import swissTeamPlaceholder from '@liga/frontend/assets/swiss/teamplaceholder.svg';

type Match = Awaited<ReturnType<typeof api.matches.all<typeof Eagers.match>>>[number];
type Competition = RouteContextCompetitions['competition'];
type CompetitionTeam = Competition['competitors'][number]['team'];
type SwissRecord = { losses: number; wins: number };
type SwissMatchTeamView = {
  competitor: Match['competitors'][number] | null;
  expectedRecord: SwissRecord | null;
  result: 'loss' | 'pending' | 'win';
  team: CompetitionTeam | null;
};
type SwissMatchView = {
  key: string;
  match?: Match;
  record: SwissRecord;
  teams: SwissMatchTeamView[];
};
type SwissArrowPath = { d: string; single?: boolean; tone: 'loss' | 'win' };
type SwissLayout = {
  advancedBuckets: SwissRecord[];
  advancedClassName: string;
  arrowFrameClassName: string;
  arrowPaths: SwissArrowPath[];
  bucketLayouts: Array<{ record: SwissRecord; x: number; y: number }>;
  eliminatedBuckets: SwissRecord[];
  eliminatedClassName: string;
  frameClassName: string;
};

const SwissBucketLayouts = [
  { record: { wins: 0, losses: 0 }, x: 0, y: 92 },
  { record: { wins: 1, losses: 0 }, x: 138, y: 48 },
  { record: { wins: 0, losses: 1 }, x: 138, y: 320 },
  { record: { wins: 2, losses: 0 }, x: 276, y: 0 },
  { record: { wins: 1, losses: 1 }, x: 276, y: 184 },
  { record: { wins: 0, losses: 2 }, x: 276, y: 460 },
  { record: { wins: 2, losses: 1 }, x: 414, y: 92 },
  { record: { wins: 1, losses: 2 }, x: 414, y: 320 },
  { record: { wins: 2, losses: 2 }, x: 552, y: 216 },
];

const SwissArrowPaths = [
  { d: 'M108 122 L136 98', tone: 'win' }, // top 0:0 -> top 1:0
  { d: 'M108 482 L136 506', tone: 'loss' }, // bottom 0:0 -> bottom 0:1

  { d: 'M246 76 L274 52', tone: 'win' }, // top 1:0 -> top 2:0
  { d: 'M246 254 L274 278', tone: 'loss' }, // bottom 1:0 -> second-highest 1:1

  { d: 'M246 350 L274 326', tone: 'win' }, // top 0:1 -> second-lowest 1:1
  { d: 'M246 526 L274 550', tone: 'loss' }, // bottom 0:1 -> bottom 0:2

  { d: 'M384 50 L412 26', tone: 'win' }, // top 2:0 -> 3:0
  { d: 'M384 114 L412 138', tone: 'loss' }, // bottom 2:0 -> top 2:1

  { d: 'M384 213 L412 189', tone: 'win' }, // top 1:1 -> middle 2:1
  { d: 'M384 390 L412 414', tone: 'loss' }, // bottom 1:1 -> middle 1:2

  { d: 'M384 488 L412 464', tone: 'win' }, // top 0:2 -> bottom 1:2
  { d: 'M384 574 L412 598', tone: 'loss' }, // bottom 0:2 -> 0:3

  { d: 'M506 127 L534 103', single: true, tone: 'win' }, // top 2:1 -> 3:1
  { d: 'M522 252 L550 276', tone: 'loss' }, // bottom 2:1 -> top 2:2

  { d: 'M522 366 L550 342', tone: 'win' }, // top 1:2 -> bottom 2:2
  { d: 'M506 480 L534 504', single: true, tone: 'loss' }, // bottom 1:2 -> 1:3

  { d: 'M610 238 L610 208', tone: 'win' }, // top 2:2 -> between 3:1 and 3:2
  { d: 'M610 384 L610 414', tone: 'loss' }, // bottom 2:2 -> between 1:3 and 2:3
] satisfies SwissArrowPath[];

const AmericasRmrSwissBucketLayouts = SwissBucketLayouts.filter(
  (layout) => layout.record.losses < 2,
);

const AmericasRmrSwissArrowPaths = [
  { d: 'M108 122 L136 98', tone: 'win' },                // top 0:0 -> top 1:0
  { d: 'M108 482 L136 506', tone: 'loss' },              // bottom 0:0 -> bottom 0:1
  { d: 'M246 76 L274 52', tone: 'win' },                 // top 1:0 -> top 2:0
  { d: 'M246 254 L274 278', tone: 'loss' },              // bottom 1:0 -> 1:1
  { d: 'M246 350 L274 326', tone: 'win' },               // top 0:1 -> 1:1
  { d: 'M245 528 L273 552', tone: 'loss' },              // bottom 0:1 -> 0:2
  { d: 'M384 50 L412 26', tone: 'win' },                 // top 2:0 -> 3:0
  { d: 'M384 114 L412 138', tone: 'loss' },              // bottom 2:0 -> 2:1
  { d: 'M384 213 L412 189', tone: 'win' },               // top 1:1 -> 2:1
  { d: 'M383 396 L411 420', tone: 'loss' },              // bottom 1:1 -> 1:2
  { d: 'M506 127 L534 103', single: true, tone: 'win' }, // top 2:1 -> 3:1
  { d: 'M518 256 L546 280', tone: 'loss' },              // bottom 2:1 -> 2:2
] satisfies SwissArrowPath[];

const SwissArrowImages = {
  loss: {
    multi: swissArrowRed,
    single: swissArrowRedSingle,
  },
  win: {
    multi: swissArrowGreen,
    single: swissArrowGreenSingle,
  },
} satisfies Record<'loss' | 'win', Record<'multi' | 'single', string>>;

const SwissAdvancedBuckets = [
  { wins: 3, losses: 0 },
  { wins: 3, losses: 1 },
  { wins: 3, losses: 2 },
];

const SwissEliminatedBuckets = [
  { wins: 0, losses: 3 },
  { wins: 1, losses: 3 },
  { wins: 2, losses: 3 },
];

const AmericasRmrSwissAdvancedBuckets = [
  { wins: 3, losses: 0 },
  { wins: 3, losses: 1 },
];

const AmericasRmrSwissEliminatedBuckets = [
  { wins: 0, losses: 2 },
  { wins: 1, losses: 2 },
  { wins: 2, losses: 2 },
];

const SwissMatchBucketCapacities: Record<string, number> = {
  '0:0': 8,
  '0:1': 4,
  '0:2': 2,
  '1:0': 4,
  '1:1': 4,
  '1:2': 3,
  '2:0': 2,
  '2:1': 3,
  '2:2': 3,
};

const SwissTerminalBucketCapacities: Record<string, number> = {
  '0:3': 2,
  '0:2': 4,
  '1:3': 3,
  '1:2': 4,
  '2:3': 3,
  '2:2': 3,
  '3:0': 2,
  '3:1': 3,
  '3:2': 3,
};

const DefaultSwissLayout = {
  advancedBuckets: SwissAdvancedBuckets,
  advancedClassName: 'top-0 left-[414px] h-[196px] w-[272px]',
  arrowFrameClassName: 'h-[620px] w-[700px]',
  arrowPaths: SwissArrowPaths,
  bucketLayouts: SwissBucketLayouts,
  eliminatedBuckets: SwissEliminatedBuckets,
  eliminatedClassName: 'bottom-0 left-[414px] h-[196px] w-[272px]',
  frameClassName: 'min-h-[620px] min-w-[700px]',
} satisfies SwissLayout;

const AmericasRmrSwissLayout = {
  advancedBuckets: AmericasRmrSwissAdvancedBuckets,
  advancedClassName: 'top-0 left-[414px] h-[196px] w-[212px]',
  arrowFrameClassName: 'h-[620px] w-[760px]',
  arrowPaths: AmericasRmrSwissArrowPaths,
  bucketLayouts: AmericasRmrSwissBucketLayouts,
  eliminatedBuckets: AmericasRmrSwissEliminatedBuckets,
  eliminatedClassName: 'top-[284px] left-[280px] h-[340px] w-[352px]',
  frameClassName: 'min-h-[620px] min-w-[760px]',
} satisfies SwissLayout;

function getRecordKey(record: SwissRecord) {
  return `${record.wins}:${record.losses}`;
}

function getSwissTeamInitials(name?: string) {
  if (!name) {
    return 'TBD';
  }

  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function cloneRecord(record: SwissRecord) {
  return { wins: record.wins, losses: record.losses };
}

function getSwissPlaceholderTeam(): SwissMatchTeamView {
  return {
    competitor: null,
    expectedRecord: null,
    result: 'pending',
    team: null,
  };
}

function getSwissPlaceholderMatch(record: SwissRecord, index: number): SwissMatchView {
  return {
    key: `placeholder:${getRecordKey(record)}:${index}`,
    record,
    teams: [getSwissPlaceholderTeam(), getSwissPlaceholderTeam()],
  };
}

function getMatchWinner(match: Match) {
  return match.competitors.find((competitor) => competitor.result === Constants.MatchResult.WIN);
}

function getMatchLoser(match: Match) {
  return match.competitors.find((competitor) => competitor.result === Constants.MatchResult.LOSS);
}

function getSwissMatchViews(matches: Match[], competition: Competition) {
  const records = new Map<number, SwissRecord>();
  const teamBySeed = new Map<number, CompetitionTeam>();

  competition.competitors.forEach((competitor) => {
    records.set(competitor.team.id, { wins: 0, losses: 0 });
    teamBySeed.set(competitor.seed, competitor.team);
  });

  const views = new Map<string, SwissMatchView[]>();
  const sortedMatches = [...matches].sort((a, b) => (a.round || 0) - (b.round || 0) || a.id - b.id);

  sortedMatches.forEach((match) => {
    const competitors = [...match.competitors].sort((a, b) => a.seed - b.seed);
    const [home, away] = competitors;
    const homeTeam = home?.team ?? teamBySeed.get(home?.seed ?? 0) ?? null;
    const awayTeam = away?.team ?? teamBySeed.get(away?.seed ?? 0) ?? null;
    const anchorTeamId = homeTeam?.id ?? awayTeam?.id;
    const record = cloneRecord(
      anchorTeamId ? records.get(anchorTeamId) || { wins: 0, losses: 0 } : { wins: 0, losses: 0 },
    );
    const winner = getMatchWinner(match);
    const loser = getMatchLoser(match);
    const isCompleted = match.status === Constants.MatchStatus.COMPLETED && !!winner && !!loser;
    const teams: SwissMatchTeamView[] = competitors.map((competitor) => {
      const team = competitor.team ?? teamBySeed.get(competitor.seed) ?? null;
      const teamRecord = team ? cloneRecord(records.get(team.id) || { wins: 0, losses: 0 }) : null;
      const result: SwissMatchTeamView['result'] =
        competitor.result === Constants.MatchResult.WIN
          ? 'win'
          : competitor.result === Constants.MatchResult.LOSS
            ? 'loss'
            : 'pending';
      const expectedRecord =
        result === 'win' && teamRecord
          ? { wins: teamRecord.wins + 1, losses: teamRecord.losses }
          : result === 'loss' && teamRecord
            ? { wins: teamRecord.wins, losses: teamRecord.losses + 1 }
            : null;

      return { competitor, expectedRecord, result, team };
    });

    views.set(getRecordKey(record), [
      ...(views.get(getRecordKey(record)) || []),
      {
        key: `${match.id}:${record.wins}:${record.losses}`,
        match,
        record,
        teams: [
          ...teams,
          ...Array.from({ length: Math.max(0, 2 - teams.length) }).map<SwissMatchTeamView>(
            getSwissPlaceholderTeam,
          ),
        ].slice(0, 2),
      },
    ]);

    if (isCompleted) {
      competitors.forEach((competitor) => {
        if (!competitor.team) {
          return;
        }

        const current = records.get(competitor.team.id);
        if (!current) {
          return;
        }

        if (competitor.result === Constants.MatchResult.WIN) {
          current.wins += 1;
        } else if (competitor.result === Constants.MatchResult.LOSS) {
          current.losses += 1;
        }
      });
    }
  });

  return { records, views };
}

function SwissLogo(props: { team: CompetitionTeam | null }) {
  if (!props.team) {
    return (
      <span className="bg-base-300 center size-8 shrink-0 rounded-full p-1">
        <img alt="" src={swissTeamPlaceholder} className="max-h-full max-w-full object-contain" />
      </span>
    );
  }

  return (
    <span className="bg-base-300 center size-8 shrink-0 rounded-full p-1" title={props.team.name}>
      {props.team.blazon ? (
        <img alt="" src={props.team.blazon} className="max-h-full max-w-full object-contain" />
      ) : (
        <span className="text-[10px] font-bold">{getSwissTeamInitials(props.team.name)}</span>
      )}
    </span>
  );
}

function SwissTeamSlot(props: {
  highlightedTeamId?: number;
  onTeamClick: (team: CompetitionTeam) => void;
  team: SwissMatchView['teams'][number];
}) {
  const isHighlighted = props.team.team?.id === props.highlightedTeamId;

  return (
    <button
      type="button"
      disabled={!props.team.team}
      title={props.team.team?.name}
      className={cx(
        'center relative min-h-9 flex-1 gap-1.5 rounded-md px-1.5 transition-colors',
        props.team.result === 'win' && 'bg-green-700 text-white',
        props.team.result === 'loss' && 'text-base-content/35 grayscale',
        props.team.result === 'pending' && 'text-base-content',
        props.team.team && 'hover:bg-base-content/10',
        isHighlighted && 'ring-info ring-offset-base-200 ring-2 ring-offset-1',
      )}
      onClick={() => props.team.team && props.onTeamClick(props.team.team)}
    >
      <SwissLogo team={props.team.team} />
    </button>
  );
}

function SwissMatchCard(props: {
  highlightedTeamId?: number;
  matchView: SwissMatchView;
  onTeamClick: (team: CompetitionTeam) => void;
}) {
  return (
    <article className="bg-base-200/80 border-base-content/5 relative z-10 flex h-10 w-[104px] items-center gap-1 rounded-md border px-1.5 shadow-sm">
      <SwissTeamSlot
        highlightedTeamId={props.highlightedTeamId}
        onTeamClick={props.onTeamClick}
        team={props.matchView.teams[0]}
      />
      <span className="text-base-content/45 shrink-0 text-[10px] font-semibold">vs</span>
      <SwissTeamSlot
        highlightedTeamId={props.highlightedTeamId}
        onTeamClick={props.onTeamClick}
        team={props.matchView.teams[1]}
      />
    </article>
  );
}

function getSwissArrowPlacement(path: string) {
  const points = path.match(/\d+/g)?.map(Number);

  if (!points || points.length !== 4) {
    return null;
  }

  const [startX, startY, endX, endY] = points;
  const deltaX = endX - startX;
  const deltaY = endY - startY;

  return {
    angle: Math.atan2(deltaY, deltaX) * (180 / Math.PI),
    left: (startX + endX) / 2,
    top: (startY + endY) / 2,
    vertical: deltaX === 0,
  };
}

function SwissArrows(props: { className: string; paths: SwissArrowPath[] }) {
  return (
    <div
      aria-hidden="true"
      className={cx(
        'pointer-events-none absolute top-0 left-0 z-0 overflow-visible',
        props.className,
      )}
    >
      {props.paths.map((arrow) => {
        const placement = getSwissArrowPlacement(arrow.d);

        if (!placement) {
          return null;
        }

        return (
          <img
            key={`${arrow.tone}:${arrow.d}`}
            alt=""
            draggable={false}
            src={SwissArrowImages[arrow.tone][arrow.single ? 'single' : 'multi']}
            className="absolute max-w-none select-none"
            style={{
              left: placement.left,
              top: placement.top,
              transform: `translate(-50%, -50%) rotate(${placement.angle}deg)`,
              transformOrigin: 'center',
              width: arrow.single ? 12 : 30,
            }}
          />
        );
      })}
    </div>
  );
}

function SwissRecordColumn(props: {
  highlightedTeamId?: number;
  onTeamClick: (team: CompetitionTeam) => void;
  record: SwissRecord;
  showPlaceholders: boolean;
  x: number;
  y: number;
  views: Map<string, SwissMatchView[]>;
}) {
  const recordKey = getRecordKey(props.record);
  const matches = props.views.get(recordKey) || [];
  const placeholderCount = props.showPlaceholders
    ? Math.max(0, (SwissMatchBucketCapacities[recordKey] || 0) - matches.length)
    : 0;

  return (
    <section
      key={recordKey}
      style={{ left: props.x, top: props.y }}
      className="absolute z-10 min-h-0 w-[118px]"
    >
      <h3 className="text-info/70 mb-1 text-xs font-bold">{recordKey}</h3>
      <div className="flex flex-col gap-1.5">
        {[
          ...matches,
          ...Array.from({ length: placeholderCount }).map((_, index) =>
            getSwissPlaceholderMatch(props.record, index),
          ),
        ].map((matchView) => (
          <SwissMatchCard
            key={matchView.key}
            highlightedTeamId={props.highlightedTeamId}
            matchView={matchView}
            onTeamClick={props.onTeamClick}
          />
        ))}
      </div>
    </section>
  );
}

function SwissTerminalColumn(props: {
  compact?: boolean;
  highlightedTeamId?: number;
  record: SwissRecord;
  records: Map<number, SwissRecord>;
  showPlaceholders: boolean;
  teams: Competition['competitors'];
  onTeamClick: (team: CompetitionTeam) => void;
}) {
  const teams = props.teams
    .filter(
      (competitor) =>
        getRecordKey(props.records.get(competitor.team.id) || { wins: 0, losses: 0 }) ===
        getRecordKey(props.record),
    )
    .sort((a, b) => a.position - b.position);
  const placeholderCount = props.showPlaceholders
    ? Math.max(0, (SwissTerminalBucketCapacities[getRecordKey(props.record)] || 0) - teams.length)
    : 0;

  return (
    <section>
      <h3
        className={cx('text-center font-bold', props.compact ? 'mb-1 text-base' : 'mb-2 text-lg')}
      >
        {getRecordKey(props.record)}
      </h3>
      <div className={cx('flex items-center gap-3', props.compact ? 'justify-center' : 'flex-col')}>
        {teams.map((competitor) => (
          <button
            type="button"
            key={competitor.team.id}
            title={competitor.team.name}
            className={cx(
              'center rounded-full bg-black/15 p-1 transition-colors hover:bg-black/25',
              props.compact ? 'size-8' : 'size-10',
              competitor.team.id === props.highlightedTeamId &&
                'ring-info ring-2 ring-offset-1 ring-offset-transparent',
            )}
            onClick={() => props.onTeamClick(competitor.team)}
          >
            <SwissLogo team={competitor.team} />
          </button>
        ))}
        {Array.from({ length: placeholderCount }).map((_, index) => (
          <button
            type="button"
            key={`placeholder:${getRecordKey(props.record)}:${index}`}
            disabled
            className={cx(
              'center rounded-full bg-black/15 p-1',
              props.compact ? 'size-8' : 'size-10',
            )}
          >
            <SwissLogo team={null} />
          </button>
        ))}
      </div>
    </section>
  );
}

function SwissAdvancedBox(props: {
  buckets: SwissRecord[];
  className: string;
  highlightedTeamId?: number;
  records: Map<number, SwissRecord>;
  showPlaceholders: boolean;
  teams: Competition['competitors'];
  onTeamClick: (team: CompetitionTeam) => void;
}) {
  return (
    <aside aria-label="Advanced" className={cx('absolute z-10 text-white', props.className)}>
      <div className="absolute top-0 left-0 h-[72px] w-[120px] rounded-tl-sm bg-green-700 p-2">
        <SwissTerminalColumn
          compact
          highlightedTeamId={props.highlightedTeamId}
          record={props.buckets[0]}
          records={props.records}
          showPlaceholders={props.showPlaceholders}
          teams={props.teams}
          onTeamClick={props.onTeamClick}
        />
      </div>
      <div
        className={cx(
          'absolute top-0 left-[120px] grid h-full gap-2 rounded-r-sm rounded-bl-sm bg-green-700 p-2',
          props.buckets.length > 2 ? 'w-[152px] grid-cols-2' : 'w-[92px] grid-cols-1',
        )}
      >
        {props.buckets.slice(1).map((record) => (
          <SwissTerminalColumn
            key={getRecordKey(record)}
            highlightedTeamId={props.highlightedTeamId}
            record={record}
            records={props.records}
            showPlaceholders={props.showPlaceholders}
            teams={props.teams}
            onTeamClick={props.onTeamClick}
          />
        ))}
      </div>
    </aside>
  );
}

function SwissEliminatedBox(props: {
  buckets: SwissRecord[];
  className: string;
  highlightedTeamId?: number;
  records: Map<number, SwissRecord>;
  showPlaceholders: boolean;
  teams: Competition['competitors'];
  onTeamClick: (team: CompetitionTeam) => void;
}) {
  if (props.buckets[0]?.losses === 2) {
    const [zeroTwo, oneTwo, twoTwo] = props.buckets;

    const renderBucket = (
      record: SwissRecord,
      className: string,
      layout: 'column' | 'grid' = 'grid',
    ) => {
      const teams = props.teams
        .filter(
          (competitor) =>
            getRecordKey(props.records.get(competitor.team.id) || { wins: 0, losses: 0 }) ===
            getRecordKey(record),
        )
        .sort((a, b) => a.position - b.position);
      const placeholderCount = props.showPlaceholders
        ? Math.max(0, (SwissTerminalBucketCapacities[getRecordKey(record)] || 0) - teams.length)
        : 0;
      const teamSlots: Array<{ key: number | string; team: CompetitionTeam | null }> = teams.map(
        (competitor) => ({
          key: competitor.team.id,
          team: competitor.team,
        }),
      );
      const placeholderSlots = Array.from({ length: placeholderCount }).map<{
        key: number | string;
        team: CompetitionTeam | null;
      }>((_, index) => ({
        key: `placeholder:${getRecordKey(record)}:${index}`,
        team: null,
      }));
      const slots = [...teamSlots, ...placeholderSlots];

      return (
        <div className={cx('absolute z-10 flex flex-col items-center', className)}>
          <h3 className="mb-2 text-lg leading-none font-bold">{getRecordKey(record)}</h3>
          <div
            className={cx(
              'grid justify-center gap-1',
              layout === 'column' ? 'grid-cols-1' : 'grid-cols-2',
            )}
          >
            {slots.map((slot) => (
              <button
                type="button"
                key={slot.key}
                title={slot.team?.name}
                disabled={!slot.team}
                className={cx(
                  'center size-8 rounded-full bg-black/15 p-1 transition-colors',
                  slot.team && 'hover:bg-black/25',
                  slot.team?.id === props.highlightedTeamId &&
                    'ring-info ring-2 ring-offset-1 ring-offset-transparent',
                )}
                onClick={() => slot.team && props.onTeamClick(slot.team)}
              >
                <SwissLogo team={slot.team} />
              </button>
            ))}
          </div>
        </div>
      );
    };

    return (
      <aside aria-label="Eliminated" className={cx('absolute z-10 text-white', props.className)}>
        <div className="absolute top-[310px] left-0 h-[30px] w-[346px] rounded-br-sm bg-red-900" />
        <div className="absolute top-[214px] left-0 h-[96px] w-[139px] rounded-tl-sm bg-red-900" />
        <div className="absolute top-[120px] left-[139px] h-[190px] w-[115px] bg-red-900" />
        <div className="absolute top-0 left-[254px] h-[328px] w-[92px] rounded-t-sm rounded-r-sm bg-red-900" />
        {renderBucket(zeroTwo, 'top-[226px] left-[23px] w-[92px]')}
        {renderBucket(oneTwo, 'top-[122px] left-[146px] w-[92px]')}
        {renderBucket(twoTwo, 'top-[10px] left-[254px] w-[92px]', 'column')}
      </aside>
    );
  }

  return (
    <aside aria-label="Eliminated" className={cx('absolute z-10 text-white', props.className)}>
      <div className="absolute bottom-0 left-0 h-[72px] w-[120px] rounded-bl-sm bg-red-900 p-2">
        <SwissTerminalColumn
          compact
          highlightedTeamId={props.highlightedTeamId}
          record={props.buckets[0]}
          records={props.records}
          showPlaceholders={props.showPlaceholders}
          teams={props.teams}
          onTeamClick={props.onTeamClick}
        />
      </div>
      <div
        className={cx(
          'absolute bottom-0 left-[120px] grid h-full gap-2 rounded-tl-sm rounded-r-sm bg-red-900 p-2',
          props.buckets.length > 3 ? 'w-[212px] grid-cols-3' : 'w-[152px] grid-cols-2',
        )}
      >
        {props.buckets.slice(1).map((record) => (
          <SwissTerminalColumn
            key={getRecordKey(record)}
            highlightedTeamId={props.highlightedTeamId}
            record={record}
            records={props.records}
            showPlaceholders={props.showPlaceholders}
            teams={props.teams}
            onTeamClick={props.onTeamClick}
          />
        ))}
      </div>
    </aside>
  );
}

function SwissDetailedStandings(props: {
  competition: Competition;
  highlight?: number;
  matches?: Match[];
  onTeamClick: (team: CompetitionTeam) => void;
}) {
  const layout =
    props.competition.tier.slug === Constants.TierSlug.MAJOR_AMERICAS_RMR
      ? AmericasRmrSwissLayout
      : DefaultSwissLayout;
  const { records, views } = React.useMemo(
    () => getSwissMatchViews(props.matches || [], props.competition),
    [props.competition, props.matches],
  );
  const showPlaceholders = props.competition.status === Constants.CompetitionStatus.STARTED;

  if (!props.matches) {
    return (
      <section className="center h-full">
        <span className="loading loading-bars" />
      </section>
    );
  }

  if (!props.matches.length && !showPlaceholders) {
    return (
      <section className="center h-full">
        <span>No Swiss matches scheduled.</span>
      </section>
    );
  }

  return (
    <section className="bg-base-300 h-full w-full overflow-auto p-4">
      <div className={cx('relative', layout.frameClassName)}>
        <SwissArrows className={layout.arrowFrameClassName} paths={layout.arrowPaths} />
        {layout.bucketLayouts.map((bucketLayout) => (
          <SwissRecordColumn
            key={getRecordKey(bucketLayout.record)}
            highlightedTeamId={props.highlight}
            record={bucketLayout.record}
            showPlaceholders={showPlaceholders}
            views={views}
            x={bucketLayout.x}
            y={bucketLayout.y}
            onTeamClick={props.onTeamClick}
          />
        ))}
        <SwissAdvancedBox
          buckets={layout.advancedBuckets}
          className={layout.advancedClassName}
          highlightedTeamId={props.highlight}
          records={records}
          showPlaceholders={showPlaceholders}
          teams={props.competition.competitors}
          onTeamClick={props.onTeamClick}
        />
        <SwissEliminatedBox
          buckets={layout.eliminatedBuckets}
          className={layout.eliminatedClassName}
          highlightedTeamId={props.highlight}
          records={records}
          showPlaceholders={showPlaceholders}
          teams={props.competition.competitors}
          onTeamClick={props.onTeamClick}
        />
      </div>
    </section>
  );
}

/**
 * Prevents re-renders caused by application heartbeat.
 *
 * @param props Passthru props to the underlying Brackets component.
 * @function
 */
function PureBrackets(props: React.ComponentProps<typeof Brackets>) {
  return React.useMemo(
    () => <Brackets matches={props.matches} onPartyClick={props.onPartyClick} />,
    [props.matches, props.onPartyClick],
  );
}

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const t = useTranslation();
  const { state } = React.useContext(AppStateContext);
  const navigate = useNavigate();
  const { competition } = useOutletContext<RouteContextCompetitions>();
  const [bracket, setBracket] =
    React.useState<Awaited<ReturnType<typeof api.matches.all<typeof Eagers.match>>>>();
  const [groupMatches, setGroupMatches] =
    React.useState<Awaited<ReturnType<typeof api.matches.all<typeof Eagers.match>>>>();
  const [swissMatches, setSwissMatches] =
    React.useState<Awaited<ReturnType<typeof api.matches.all<typeof Eagers.match>>>>();
  const groups = React.useMemo(
    () => groupBy(competition.competitors, 'group'),
    [competition.competitors],
  );
  const teamLinkById = React.useMemo(
    () =>
      new Map(
        competition.competitors.map((competitor) => [
          competitor.team.id,
          `/teams?teamId=${competitor.team.id}`,
        ]),
      ),
    [competition.competitors],
  );

  const isSwiss = Boolean(Constants.TierSwissConfig[competition.tier.slug as Constants.TierSlug]);
  const hideSmallGroupPoints = Boolean(
    competition.tier.groupSize && competition.tier.groupSize <= 4,
  );

  // fetch matches when viewing bracket
  React.useEffect(() => {
    setBracket(undefined);
    setGroupMatches(undefined);
    setSwissMatches(undefined);

    if (isSwiss) {
      api.matches
        .all({
          where: {
            competitionId: competition.id,
          },
          include: Eagers.match.include,
          orderBy: [{ round: 'asc' }, { id: 'asc' }],
        })
        .then(setSwissMatches);
      return;
    }

    if (competition.tier.groupSize) {
      api.matches
        .all({
          where: {
            competitionId: competition.id,
          },
          include: Eagers.match.include,
          orderBy: [{ round: 'asc' }, { date: 'asc' }, { id: 'asc' }],
        })
        .then(setGroupMatches);
      return;
    }

    api.matches
      .all({
        where: {
          competitionId: competition.id,
        },
        include: Eagers.match.include,
      })
      .then(setBracket);
  }, [competition, isSwiss]);

  if (competition.tier.groupSize) {
    return (
      <section>
        {Object.keys(groups).map((group) => (
          <Standings
            key={group + '__standings'}
            highlight={state.profile.teamId}
            hidePoints={hideSmallGroupPoints}
            competitors={groups[group]}
            matches={groupMatches || []}
            teamLink={(team) => `/teams?teamId=${team.id}`}
            title={
              competition.tier.league.slug === Constants.LeagueSlug.ESPORTS_LEAGUE
                ? Constants.IdiomaticTier[competition.tier.slug]
                : `${t('shared.group')} ${Util.toAlpha(group)}`
            }
            zones={
              Util.shouldShowStandingsZones(competition.status) &&
              Util.getTierZonesByGroup(
                competition.tier.slug as Constants.TierSlug,
                competition.federation.slug as Constants.FederationSlug,
                Object.keys(groups).length,
                competition.tier.groupSize,
              )
            }
          />
        ))}
      </section>
    );
  }

  if (isSwiss) {
    return (
      <section className="h-full w-full overflow-hidden">
        <SwissDetailedStandings
          competition={competition}
          highlight={state.profile.teamId}
          matches={swissMatches}
          onTeamClick={(team) => navigate(`/teams?teamId=${team.id}`)}
        />
      </section>
    );
  }

  if (!bracket || !bracket.length) {
    return (
      <section className="center h-full">
        {!bracket && <span className="loading loading-bars" />}
        {!!bracket && !bracket.length && <span>{t('shared.competitionNotStarted')}</span>}
      </section>
    );
  }

  return (
    <section className="h-full w-full overflow-hidden">
      <PureBrackets
        key={`${competition.id}:${competition.tier.slug}`}
        matches={bracket}
        onPartyClick={(party) => {
          const route = teamLinkById.get(Number(party.id));
          if (route) {
            navigate(route);
          }
        }}
      />
    </section>
  );
}
