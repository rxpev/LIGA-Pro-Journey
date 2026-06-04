import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import faceitLogo from "../../../assets/faceit/faceit.png";
import { getFaceitRankBadge, LEVEL_IMAGES, LeaderboardPlayer } from "./faceit";

type RankingsRouteState = {
  fromFaceitRankingsButton?: boolean;
  leaderboardRegionTitle?: string;
};

type RegionFilter = "ALL" | "EUROPE" | "AMERICAS" | "ASIA" | "OCEANIA";

const PLAYERS_PER_PAGE = 50;
const REGION_TITLES: Record<RegionFilter, string> = {
  ALL: "RANKINGS",
  EUROPE: "EUROPE RANKINGS",
  AMERICAS: "AMERICAS RANKINGS",
  ASIA: "ASIA RANKINGS",
  OCEANIA: "OCEANIA RANKINGS",
};

const REGION_OPTIONS: Array<{ value: RegionFilter; label: string }> = [
  { value: "ALL", label: "ALL" },
  { value: "EUROPE", label: "Europe" },
  { value: "AMERICAS", label: "Americas" },
  { value: "ASIA", label: "Asia" },
  { value: "OCEANIA", label: "Oceania" },
];

export default function FaceitRankings(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = (location.state || {}) as RankingsRouteState;


  const [players, setPlayers] = React.useState<LeaderboardPlayer[]>([]);
  const [availableCountries, setAvailableCountries] = React.useState<Array<{ code: string; name: string }>>([]);
  const [region, setRegion] = React.useState<RegionFilter>("ALL");
  const [countryCode, setCountryCode] = React.useState<string>("ALL");
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(0);
  const [totalPlayers, setTotalPlayers] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  const dynamicLeaderboardTitle = REGION_TITLES[region];

  React.useEffect(() => {
    if (!routeState.fromFaceitRankingsButton) {
      navigate("/faceit", { replace: true });
      return;
    }

    setLoading(true);
    api.faceit
      .leaderboard(page, PLAYERS_PER_PAGE, {
        region,
        countryCode: countryCode === "ALL" ? null : countryCode,
      })
      .then((data) => {
        setPlayers(data.entries || []);
        setTotalPages(data.totalPages || 0);
        setTotalPlayers(data.total || 0);
        setAvailableCountries(data.availableCountries || []);
      })
      .finally(() => setLoading(false));
  }, [navigate, page, routeState.fromFaceitRankingsButton, region, countryCode]);

  const isFirstPage = page <= 1;
  const isLastPage = totalPages === 0 || page >= totalPages;

  return (
    <div className="w-full h-full bg-[#0b0b0b] text-white flex flex-col">
      <div className="w-full bg-[#0f0f0f] border-b border-[#ff7300]/60 py-4 shadow-lg flex items-center justify-between px-4">
        <button
          data-interaction-sound="back"
          onClick={() => navigate("/faceit")}
          className="px-3 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-sm font-semibold"
        >
          ← Back
        </button>

        <img src={faceitLogo} className="h-10 select-none" />

        <div className="w-16" />
      </div>

      <div className="p-6 h-[calc(100vh-96px)]">
        <div className="grid grid-cols-[280px_1fr] gap-4 h-full">
          <div className="bg-[#0f0f0f] rounded-lg border border-[#ffffff15] p-4 flex flex-col gap-4">
            <h3 className="text-sm font-bold tracking-wide">FILTERS</h3>

            <div className="space-y-2">
              <div className="text-xs opacity-70">Region</div>
              <div className="flex flex-wrap gap-2">
                {REGION_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      setRegion(option.value);
                      setCountryCode("ALL");
                      setPage(1);
                    }}
                    className={`px-4 py-2 rounded text-sm font-semibold border transition ${region === option.value
                        ? "bg-orange-600 border-orange-500 text-white"
                        : "bg-neutral-800 border-[#ffffff20] hover:border-[#ff7300]/70"
                      }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs opacity-70">Country</div>
              <select
                value={countryCode}
                onChange={(e) => {
                  setCountryCode(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded bg-neutral-800 border border-[#ffffff20] px-3 py-2 text-sm"
              >
                <option value="ALL">ALL</option>
                {availableCountries.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-[#0f0f0f] rounded-lg border border-[#ffffff15] h-full flex flex-col overflow-hidden">
            <div className="w-full bg-[#0c0c0c] py-3 px-4 border-b border-[#ff7300]/40 flex items-center justify-between">
              <h2 className="text-lg font-bold">{dynamicLeaderboardTitle}</h2>
              <span className="text-xs opacity-70">{totalPlayers} players</span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#ffffff10]">
              {loading ? (
                <div className="px-4 py-4 text-sm opacity-60">Loading leaderboard...</div>
              ) : players.length === 0 ? (
                <div className="px-4 py-4 text-sm opacity-60">No leaderboard data available.</div>
              ) : (
                players.map((player) => {
                  const rankBadge = player.rank <= 100 ? getFaceitRankBadge(player.rank) : null;
                  return (
                    <div
                      key={player.playerId}
                      className="flex items-center justify-between px-4 py-2 bg-neutral-900/20"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs text-neutral-300 w-8">#{player.rank}</span>
                        <img
                          src={LEVEL_IMAGES[player.faceitLevel] || LEVEL_IMAGES[1]}
                          className="w-6 h-6"
                        />
                        {player.countryCode ? (
                          <span className={`fp ${player.countryCode}`} />
                        ) : (
                          <span className="w-4" />
                        )}
                        <span className="text-sm font-semibold truncate">{player.nickname}</span>
                      </div>

                      <div className="flex items-center gap-3">
                        {rankBadge ? (
                          <img
                            src={rankBadge}
                            className="w-20 h-15"
                          />
                        ) : (
                          <div className="w-20" />
                        )}
                        <span className="text-sm font-bold text-white min-w-[56px] text-right">
                          {player.faceitElo}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t border-[#ffffff10] px-4 py-3 bg-[#0c0c0c]/80 flex items-center justify-between">
              <button
                disabled={isFirstPage || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-xs opacity-80">
                Page {totalPages === 0 ? 0 : page} / {totalPages}
              </span>
              <button
                disabled={isLastPage || loading}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
