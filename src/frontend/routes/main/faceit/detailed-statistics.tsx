import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import faceitLogo from '../../../assets/faceit/faceit.png';
import killsIcon from '../../../assets/faceit/kills.png';
import deathsIcon from '../../../assets/faceit/deaths.png';
import headshotIcon from '../../../assets/faceit/headshot.png';
import { AppStateContext } from '@liga/frontend/redux';
import { Constants, Util } from '@liga/shared';

type DetailedStatisticsRouteState = {
  fromFaceitDetailedStatisticsButton?: boolean;
};

type FaceitMapConfig = {
  key: string;
  label: string;
  mapSlug: string;
  customIconName: string;
};

type AggregatedStats = {
  kills: number;
  deaths: number;
  hsPercent: number;
  kdRatio: number;
  highestKills: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
};

type EloPoint = {
  matchId: number;
  date: string | Date;
  elo: number;
  eloDelta: number;
  map: string;
};

type WeaponStats = {
  weapon: string;
  kills: number;
  headshots: number;
  hsPercent: number;
};

enum DetailedStatsView {
  MAPS = 'MAPS',
  WEAPONS = 'WEAPONS',
}

const ELO_WINDOW_SIZE = 30;

const FACEIT_MAPS: FaceitMapConfig[] = [
  { key: 'ancient', label: 'Ancient', mapSlug: 'de_ancient', customIconName: 'ancient' },
  { key: 'anubis', label: 'Anubis', mapSlug: 'de_anubis', customIconName: 'anubis' },
  { key: 'cache', label: 'Cache', mapSlug: 'de_cache', customIconName: 'cache' },
  { key: 'dust2', label: 'Dust II', mapSlug: 'de_dust2', customIconName: 'dust2' },
  { key: 'inferno', label: 'Inferno', mapSlug: 'de_inferno', customIconName: 'inferno' },
  { key: 'mirage', label: 'Mirage', mapSlug: 'de_mirage', customIconName: 'mirage' },
  { key: 'nuke', label: 'Nuke', mapSlug: 'de_nuke', customIconName: 'nuke' },
  { key: 'overpass', label: 'Overpass', mapSlug: 'de_overpass', customIconName: 'overpass' },
  { key: 'train', label: 'Train', mapSlug: 'de_train', customIconName: 'train' },
  { key: 'vertigo', label: 'Vertigo', mapSlug: 'de_vertigo', customIconName: 'vertigo' },
];

const customMapIconsContext = (require as any).context(
  '../../../assets/faceit',
  false,
  /\.\/.+\.png$/,
);
const weaponIconsContext = (require as any).context(
  '../../../assets/weapons/2D',
  false,
  /\.\/.+\.svg$/,
);

const getCustomMapIcon = (name: string): string | null => {
  const path = `./${name.toLowerCase()}.png`;
  if (!customMapIconsContext.keys().includes(path)) return null;
  const loaded = customMapIconsContext(path);
  return typeof loaded === 'string' ? loaded : loaded?.default || null;
};

const getWeaponKey = (weapon: string) => {
  const normalized = weapon.replace(/^weapon_/, '').toLowerCase();
  return ['incgrenade', 'inferno', 'molotov'].includes(normalized) ? 'molotov' : normalized;
};

const getWeaponIcon = (weapon: string): string | null => {
  const weaponKey = getWeaponKey(weapon);
  const assetKey = weaponKey === 'hkp2000' ? 'p2000' : weaponKey;
  const path = `./${assetKey}.svg`;
  if (!weaponIconsContext.keys().includes(path)) return null;
  const loaded = weaponIconsContext(path);
  return typeof loaded === 'string' ? loaded : loaded?.default || null;
};

const formatWeaponName = (weapon: string) => {
  const normalized = getWeaponKey(weapon);
  const labels: Record<string, string> = {
    ak47: 'AK-47',
    aug: 'AUG',
    awp: 'AWP',
    bizon: 'PP-Bizon',
    cz75a: 'CZ75-Auto',
    deagle: 'Desert Eagle',
    elite: 'Dual Berettas',
    famas: 'FAMAS',
    fiveseven: 'Five-SeveN',
    g3sg1: 'G3SG1',
    galilar: 'Galil AR',
    glock: 'Glock-18',
    hegrenade: 'HE Grenade',
    hkp2000: 'P2000',
    m249: 'M249',
    m4a1: 'M4A4',
    m4a1_silencer: 'M4A1-S',
    mac10: 'MAC-10',
    mag7: 'MAG-7',
    molotov: 'Molotov',
    mp5sd: 'MP5-SD',
    mp7: 'MP7',
    mp9: 'MP9',
    negev: 'Negev',
    nova: 'Nova',
    p250: 'P250',
    p90: 'P90',
    revolver: 'R8 Revolver',
    sawedoff: 'Sawed-Off',
    scar20: 'SCAR-20',
    sg556: 'SG 553',
    ssg08: 'SSG 08',
    taser: 'Zeus x27',
    tec9: 'Tec-9',
    ump45: 'UMP-45',
    usp_silencer: 'USP-S',
    xm1014: 'XM1014',
  };

  return (
    labels[normalized] ||
    normalized
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  );
};

export default function FaceitDetailedStatistics(): JSX.Element {
  const { state } = React.useContext(AppStateContext);
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = (location.state || {}) as DetailedStatisticsRouteState;

  const [loading, setLoading] = React.useState(true);
  const [selectedMapKey, setSelectedMapKey] = React.useState<string | null>(null);
  const [activeView, setActiveView] = React.useState<DetailedStatsView>(DetailedStatsView.MAPS);
  const [allTimeStats, setAllTimeStats] = React.useState<AggregatedStats | null>(null);
  const [mapStats, setMapStats] = React.useState<Record<string, AggregatedStats>>({});
  const [weaponStats, setWeaponStats] = React.useState<WeaponStats[]>([]);
  const [eloHistory, setEloHistory] = React.useState<EloPoint[]>([]);
  const [eloWindowStart, setEloWindowStart] = React.useState(0);
  const [hoveredEloIndex, setHoveredEloIndex] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!routeState.fromFaceitDetailedStatisticsButton) {
      navigate('/faceit', { replace: true });
    }
  }, [navigate, routeState.fromFaceitDetailedStatisticsButton]);

  const settingsAll = React.useMemo(() => {
    if (!state.profile) return Constants.Settings;
    return Util.loadSettings(state.profile.settings);
  }, [state.profile]);

  const gameEnum = settingsAll.general.game as Constants.Game;

  React.useEffect(() => {
    (async () => {
      try {
        const detailedStats = await api.faceit.detailedStats();
        setAllTimeStats(
          detailedStats.allTime
            ? {
                ...detailedStats.allTime,
                hsPercent: Math.round(Number(detailedStats.allTime.hsPercent || 0)),
                winRate: Math.round(Number(detailedStats.allTime.winRate || 0)),
              }
            : null,
        );

        const computedMapStats: Record<string, AggregatedStats> = {};
        for (const map of FACEIT_MAPS) {
          const stats = detailedStats.byMap?.[map.mapSlug];
          computedMapStats[map.key] = {
            kills: Number(stats?.kills || 0),
            deaths: Number(stats?.deaths || 0),
            hsPercent: Math.round(Number(stats?.hsPercent || 0)),
            kdRatio: Number(stats?.kdRatio || 0),
            highestKills: Number(stats?.highestKills || 0),
            matchesPlayed: Number(stats?.matchesPlayed || 0),
            wins: Number(stats?.wins || 0),
            losses: Number(stats?.losses || 0),
            winRate: Math.round(Number(stats?.winRate || 0)),
          };
        }

        setMapStats(computedMapStats);
        setWeaponStats(
          (detailedStats.byWeapon || []).map((weaponStats) => ({
            weapon: getWeaponKey(weaponStats.weapon),
            kills: Number(weaponStats.kills || 0),
            headshots: Number(weaponStats.headshots || 0),
            hsPercent: Math.round(Number(weaponStats.hsPercent || 0)),
          })),
        );
        const fullEloHistory = detailedStats.eloHistory || [];
        setEloHistory(fullEloHistory);
        setEloWindowStart(Math.max(0, fullEloHistory.length - ELO_WINDOW_SIZE));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  React.useEffect(() => {
    setHoveredEloIndex(null);
  }, [eloWindowStart]);

  const selectedMap = FACEIT_MAPS.find((map) => map.key === selectedMapKey) || null;
  const activeStats = selectedMap ? mapStats[selectedMap.key] : allTimeStats;
  const rightCardImage = selectedMap
    ? Util.convertMapPool(selectedMap.mapSlug, gameEnum, true)
    : getCustomMapIcon('allmaps');
  const avgKills =
    activeStats && activeStats.matchesPlayed > 0
      ? Math.floor(activeStats.kills / activeStats.matchesPlayed)
      : 0;
  const eloWindow = eloHistory.slice(eloWindowStart, eloWindowStart + ELO_WINDOW_SIZE);
  const canGoPrevElo = eloWindowStart > 0;
  const canGoNextElo = eloWindowStart + ELO_WINDOW_SIZE < eloHistory.length;

  const eloGraphData = React.useMemo(() => {
    const width = 1000;
    const height = 220;
    const padding = 18;
    const elos = eloWindow.map((point) => point.elo);
    const min = elos.length > 0 ? Math.min(...elos) : 0;
    const max = elos.length > 0 ? Math.max(...elos) : 0;
    const range = Math.max(1, max - min);

    const points = eloWindow.map((point, index) => {
      const x =
        eloWindow.length <= 1
          ? width / 2
          : padding + (index / (eloWindow.length - 1)) * (width - padding * 2);
      const y = height - padding - ((point.elo - min) / range) * (height - padding * 2);
      return {
        ...point,
        x,
        y,
      };
    });
    return {
      width,
      height,
      min,
      max,
      mid: Math.round((min + max) / 2),
      points,
      polyline: points.map((point) => `${point.x},${point.y}`).join(' '),
    };
  }, [eloWindow]);

  const winRateColorClass = (winRate: number | undefined) => {
    if (winRate == null) return 'text-white';
    if (winRate > 50) return 'text-green-400';
    if (winRate < 50) return 'text-red-400';
    return 'text-white';
  };

  const renderStatCard = (
    title: string,
    value: string | number,
    icon?: string,
    valueClassName = 'text-lg font-bold',
  ) => (
    <div className="flex h-28 flex-col items-center justify-center rounded-lg border border-[#ffffff10] bg-neutral-900/40 p-3">
      {icon ? <img src={icon} className="mb-2 h-10 w-10 opacity-90" /> : null}
      <div className={valueClassName}>{value}</div>
      <div className="mt-1 text-xs opacity-60">{title}</div>
    </div>
  );

  const renderWeaponStats = () => (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-[#ffffff15] bg-[#0b0b0b]">
      <div className="border-b border-[#ffffff10] bg-[#0c0c0c]/70 px-4 py-3">
        <h3 className="text-base font-bold">Weapon Statistics</h3>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 text-xs text-orange-50 uppercase">
            <tr className="bg-[#3a210b]">
              <th className="bg-[#3a210b] px-4 py-3 text-left">Weapon</th>
              <th className="bg-[#3a210b] px-4 py-3 text-center">Kills</th>
              <th className="bg-[#3a210b] px-4 py-3 text-center">HS Kills</th>
              <th className="bg-[#3a210b] px-4 py-3 text-center">HS %</th>
            </tr>
          </thead>
          <tbody>
            {weaponStats.map((row) => {
              const icon = getWeaponIcon(row.weapon);

              return (
                <tr key={row.weapon} className="border-t border-[#ffffff10]">
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-4 font-semibold">
                      <span className="flex h-16 w-28 items-center justify-center rounded border border-[#ffffff18] bg-neutral-900/60">
                        {icon ? (
                          <img src={icon} className="max-h-12 max-w-24 object-contain" />
                        ) : (
                          <span className="text-xs text-neutral-500">-</span>
                        )}
                      </span>
                      <span>{formatWeaponName(row.weapon)}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center font-semibold">{row.kills}</td>
                  <td className="px-4 py-3 text-center font-semibold">{row.headshots}</td>
                  <td
                    className={`px-4 py-3 text-center font-semibold ${
                      row.hsPercent >= 50
                        ? 'text-green-400'
                        : row.hsPercent <= 20
                          ? 'text-red-400'
                          : 'text-white'
                    }`}
                  >
                    {row.hsPercent}%
                  </td>
                </tr>
              );
            })}
            {!weaponStats.length ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-neutral-500">
                  No weapon stats yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="flex h-full w-full flex-col bg-[#0b0b0b] text-white">
      <div className="flex w-full items-center justify-between border-b border-[#ff7300]/60 bg-[#0f0f0f] px-4 py-4 shadow-lg">
        <button
          data-interaction-sound="back"
          onClick={() => navigate('/faceit')}
          className="rounded bg-neutral-700 px-3 py-1 text-sm font-semibold hover:bg-neutral-600"
        >
          ← Back
        </button>

        <img src={faceitLogo} className="h-10 select-none" />

        <div className="w-16" />
      </div>

      <div className="h-[calc(100vh-96px)] p-6">
        <div className="flex h-full flex-col overflow-hidden rounded-lg border border-[#ffffff15] bg-[#0f0f0f]">
          <div className="flex w-full items-center justify-between border-b border-[#ff7300]/40 bg-[#0c0c0c] px-4 py-3">
            <h2 className="text-lg font-bold">DETAILED STATISTICS</h2>
            <button
              onClick={() =>
                setActiveView((view) =>
                  view === DetailedStatsView.MAPS
                    ? DetailedStatsView.WEAPONS
                    : DetailedStatsView.MAPS,
                )
              }
              className="rounded bg-orange-600 px-3 py-1 text-sm font-semibold hover:bg-orange-500"
            >
              {activeView === DetailedStatsView.MAPS ? 'Weapon Stats' : 'Map Stats'}
            </button>
          </div>

          <div className="flex-1 overflow-hidden p-6">
            {loading ? (
              <div className="text-sm opacity-70">Loading detailed FACEIT stats…</div>
            ) : activeView === DetailedStatsView.WEAPONS ? (
              renderWeaponStats()
            ) : (
              <div className="grid h-full grid-cols-[220px_1fr_1fr] gap-4">
                <div className="flex flex-col overflow-hidden rounded-lg border border-[#ffffff15] bg-[#0b0b0b]">
                  <div className="border-b border-[#ffffff10] bg-[#0c0c0c]/70 px-4 py-3 text-lg font-semibold">
                    Map stats
                  </div>
                  <div className="space-y-2 overflow-y-auto p-3">
                    <button
                      onClick={() => setSelectedMapKey(null)}
                      className={`flex w-full items-center gap-3 rounded border px-3 py-2 text-left text-sm font-semibold transition ${
                        selectedMapKey === null
                          ? 'border-orange-500 bg-orange-600 text-white'
                          : 'border-[#ffffff20] bg-neutral-900/50 hover:border-[#ff7300]/70'
                      }`}
                    >
                      <img
                        src={
                          getCustomMapIcon('allmaps') ||
                          Util.convertMapPool('de_mirage', gameEnum, true)
                        }
                        className="h-8 w-8 rounded object-cover"
                      />
                      <span>All maps</span>
                    </button>

                    {FACEIT_MAPS.map((map) => {
                      const customIcon = getCustomMapIcon(map.customIconName);
                      const defaultIcon = Util.convertMapPool(map.mapSlug, gameEnum, true);
                      const iconSrc = customIcon || defaultIcon;

                      return (
                        <button
                          key={map.key}
                          onClick={() => setSelectedMapKey(map.key)}
                          className={`flex w-full items-center gap-3 rounded border px-3 py-2 text-left text-sm font-semibold transition ${
                            selectedMapKey === map.key
                              ? 'border-orange-500 bg-orange-600 text-white'
                              : 'border-[#ffffff20] bg-neutral-900/50 hover:border-[#ff7300]/70'
                          }`}
                        >
                          <img src={iconSrc} className="h-8 w-8 rounded object-cover" />
                          <span>{map.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex min-h-0 flex-col rounded-lg border border-[#ffffff15] bg-[#0b0b0b] p-4">
                  <h3 className="mb-4 text-base font-bold">
                    {selectedMap ? `${selectedMap.label} Statistics` : 'All Time Statistics'}
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    {renderStatCard('Kills', activeStats?.kills ?? '—', killsIcon)}
                    {renderStatCard('Deaths', activeStats?.deaths ?? '—', deathsIcon)}
                    {renderStatCard('HS%', `${activeStats?.hsPercent ?? 0}%`, headshotIcon)}
                    {renderStatCard('K/D', (activeStats?.kdRatio ?? 0).toFixed(2))}

                    {renderStatCard('Avg Kills', avgKills)}
                    {renderStatCard('Highest Kills', activeStats?.highestKills ?? '—')}
                  </div>

                  <div className="mt-4 flex min-h-0 flex-1 flex-col rounded-lg border border-[#ffffff15] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-base font-bold">ELO</h3>
                      <div className="flex items-center gap-2">
                        <button
                          disabled={!canGoPrevElo}
                          onClick={() =>
                            setEloWindowStart((start) => Math.max(0, start - ELO_WINDOW_SIZE))
                          }
                          className="rounded bg-neutral-700 px-2 py-1 text-xs hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Prev 30
                        </button>
                        <button
                          disabled={!canGoNextElo}
                          onClick={() =>
                            setEloWindowStart((start) =>
                              Math.min(
                                Math.max(0, eloHistory.length - ELO_WINDOW_SIZE),
                                start + ELO_WINDOW_SIZE,
                              ),
                            )
                          }
                          className="rounded bg-neutral-700 px-2 py-1 text-xs hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Next 30
                        </button>
                      </div>
                    </div>

                    <div className="min-h-[220px] flex-1 rounded-lg border border-[#ffffff10] bg-neutral-900/40 p-3">
                      {eloWindow.length < 2 ? (
                        <div className="flex h-full w-full items-center justify-center text-sm opacity-60">
                          Not enough matches to render ELO graph.
                        </div>
                      ) : (
                        <div className="flex h-full w-full gap-3">
                          <div className="flex w-12 flex-col justify-between py-2 text-xs text-neutral-300">
                            <span>{Math.round(eloGraphData.max)}</span>
                            <span>{eloGraphData.mid}</span>
                            <span>{Math.round(eloGraphData.min)}</span>
                          </div>

                          <div className="relative flex-1">
                            <svg
                              viewBox={`0 0 ${eloGraphData.width} ${eloGraphData.height}`}
                              className="h-full w-full"
                              preserveAspectRatio="none"
                            >
                              <polyline
                                fill="none"
                                stroke="#f97316"
                                strokeWidth="4"
                                points={eloGraphData.polyline}
                              />
                              {eloGraphData.points.map((point, index) => (
                                <circle
                                  key={point.matchId}
                                  cx={point.x}
                                  cy={point.y}
                                  r={index === hoveredEloIndex ? 7 : 5}
                                  fill={index === hoveredEloIndex ? '#fb923c' : '#f97316'}
                                  onMouseEnter={() => setHoveredEloIndex(index)}
                                  onMouseLeave={() =>
                                    setHoveredEloIndex((current) =>
                                      current === index ? null : current,
                                    )
                                  }
                                />
                              ))}
                            </svg>

                            {hoveredEloIndex != null ? (
                              <div className="absolute top-2 right-2 rounded border border-[#ffffff20] bg-[#0f0f0f] px-2 py-1 text-xs">
                                <div>ELO: {eloGraphData.points[hoveredEloIndex].elo}</div>
                                <div>
                                  Delta:{' '}
                                  {eloGraphData.points[hoveredEloIndex].eloDelta > 0 ? '+' : ''}
                                  {eloGraphData.points[hoveredEloIndex].eloDelta}
                                </div>
                                <div>
                                  Map:{' '}
                                  {Util.convertMapPool(
                                    eloGraphData.points[hoveredEloIndex].map,
                                    gameEnum,
                                  )}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 text-right text-xs opacity-60">
                      Showing matches {eloWindowStart + 1} -{' '}
                      {Math.min(eloWindowStart + ELO_WINDOW_SIZE, eloHistory.length)} of{' '}
                      {eloHistory.length}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col rounded-lg border border-[#ffffff15] bg-[#0b0b0b] p-4">
                  <h3 className="mb-4 text-base font-bold">
                    {selectedMap ? `${selectedMap.label} Overview` : 'All Maps Overview'}
                  </h3>

                  {rightCardImage ? (
                    <img
                      src={rightCardImage}
                      className="h-56 w-full rounded-lg border border-[#ffffff20] object-cover"
                    />
                  ) : (
                    <div className="flex h-56 w-full items-center justify-center rounded-lg border border-dashed border-[#ffffff30] text-sm opacity-60">
                      Add allmaps.png to src/frontend/assets/faceit
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      {renderStatCard('Matches', activeStats?.matchesPlayed ?? 0)}
                    </div>

                    {renderStatCard('W', activeStats?.wins ?? 0)}
                    {renderStatCard('L', activeStats?.losses ?? 0)}

                    <div className="col-span-2 flex justify-center">
                      <div className="w-full max-w-[calc(50%-8px)]">
                        {renderStatCard(
                          'Win Rate',
                          `${activeStats?.winRate ?? 0}%`,
                          undefined,
                          `text-lg font-bold ${winRateColorClass(activeStats?.winRate)}`,
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
