import React, { useEffect, useState } from "react";
import { AppStateContext } from "@liga/frontend/redux";
import faceitLogo from "../../assets/faceit/faceit.png";
import level1 from "../../assets/faceit/1.png";
import level2 from "../../assets/faceit/2.png";
import level3 from "../../assets/faceit/3.png";
import level4 from "../../assets/faceit/4.png";
import level5 from "../../assets/faceit/5.png";
import level6 from "../../assets/faceit/6.png";
import level7 from "../../assets/faceit/7.png";
import level8 from "../../assets/faceit/8.png";
import level9 from "../../assets/faceit/9.png";
import level10 from "../../assets/faceit/10.png";

const LEVEL_IMAGES = [
  null,
  level1, level2, level3, level4, level5,
  level6, level7, level8, level9, level10
];

const LEVEL_RANGES: Record<number, [number, number]> = {
  1: [100, 800],
  2: [801, 950],
  3: [951, 1100],
  4: [1101, 1250],
  5: [1251, 1400],
  6: [1401, 1550],
  7: [1551, 1700],
  8: [1701, 1850],
  9: [1851, 2000],
  10: [2001, 10000],
};

export default function Faceit() {
  const [elo, setElo] = useState<number>(0);
  const [level, setLevel] = useState<number>(0);
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [queueing, setQueueing] = useState(false);
  const [matchRoom, setMatchRoom] = useState<any | null>(null);
  const { state } = React.useContext(AppStateContext);

  // Build lookup: countryId -> code
  const COUNTRY_BY_ID = React.useMemo(() => {
    const map = new Map<number, string>();
    for (const continent of state.continents) {
      for (const country of continent.countries) {
        map.set(country.id, country.code.toLowerCase());
      }
    }
    return map;
  }, [state.continents]);

  useEffect(() => {
    api.faceit
      .profile()
      .then((data) => {
        setElo(data.faceitElo);
        setLevel(data.faceitLevel);
        setRecent(data.recent || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const queue = async () => {
    setQueueing(true);
    try {
      const res = await api.faceit.queue();
      setMatchRoom(res); // OPEN MATCHROOM
    } finally {
      setQueueing(false);
    }
  };

  if (loading) return <div>Loading FACEIT…</div>;

  // XP bar calc
  const [low, high] = LEVEL_RANGES[level] ?? [0, 100];
  const pct = ((elo - low) / (high - low)) * 100;

  return (
    <div className="w-full h-full bg-[#0b0b0b] text-white">

      {/* 🟧 ALWAYS VISIBLE HEADER */}
      <FaceitHeader elo={elo} level={level} pct={pct} low={low} high={high} />

      {/* 🟦 CONDITIONAL BODY */}
      {matchRoom ? (
        <MatchRoom
          room={matchRoom}
          countryMap={COUNTRY_BY_ID}
          onClose={() => setMatchRoom(null)}
        />
      ) : (
        <NormalFaceitBody
          recent={recent}
          queue={queue}
          queueing={queueing}
        />
      )}
    </div>
  );
}

//
// ---------------------
//  HEADER COMPONENT
// ---------------------
//
function FaceitHeader(
  { elo, level, pct, low, high }:
    { elo: number; level: number; pct: number; low: number; high: number }
) {
  return (
    <div className="w-full bg-[#0f0f0f] border-b border-[#ff7300]/60 py-4 shadow-lg flex items-center justify-between">
      <img src={faceitLogo} alt="FACEIT Logo" className="h-10 ml-4 select-none" />

      <div className="flex items-center gap-3 mr-6 px-4 py-2 rounded-md bg-[#0b0b0b]/70 border border-[#ffffff15] shadow-lg shadow-black/40 backdrop-blur-sm">
        <img src={LEVEL_IMAGES[level]} className="h-10 w-10 object-contain" alt="Level" />

        <div className="flex flex-col w-56">
          <div className="text-xl font-bold">{elo}</div>

          <div className="w-full h-2 bg-neutral-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#ff7300]"
              style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
            />
          </div>

          <div className="flex justify-between text-xs opacity-80 mt-1">
            <span>{low}</span>
            <span className="text-center w-full">{`-${elo - low}/+${high - elo}`}</span>
            <span>{high}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

//
// ---------------------
// NORMAL FACEIT BODY
// ---------------------
//
function NormalFaceitBody(
  { recent, queue, queueing }:
    { recent: any[]; queue: () => void; queueing: boolean }
) {
  return (
    <div className="grid grid-cols-3 gap-6 p-6 h-[calc(100vh-160px)]">

      {/* STATS */}
      <div className="bg-[#0f0f0f] rounded-lg border border-[#ffffff15] flex flex-col">
        <div className="w-full bg-[#0c0c0c] py-3 flex justify-center items-center border-b border-[#ff7300]/40">
          <h2 className="text-lg font-bold">STATISTICS</h2>
        </div>

        <div className="p-6">
          <div className="space-y-2 opacity-50">
            <div>K/D Ratio: —</div>
            <div>HS %: —</div>
            <div>Win Rate: —</div>
            <div>Matches Played: —</div>
          </div>
        </div>
      </div>

      {/* PLAY */}
      <div className="bg-[#0f0f0f] rounded-lg border border-[#ffffff15] flex flex-col">
        <div className="w-full bg-[#0c0c0c] py-3 flex justify-center items-center border-b border-[#ff7300]/40">
          <h2 className="text-lg font-bold">PLAY</h2>
        </div>

        <div className="p-6 flex flex-col items-center justify-center">
          <button
            onClick={queue}
            className="px-12 py-5 text-xl rounded bg-orange-600 hover:bg-orange-700 text-white shadow-lg"
          >
            {queueing ? "Queueing…" : "PLAY"}
          </button>
        </div>
      </div>

      {/* RECENT MATCHES */}
      <div className="bg-[#0f0f0f] rounded-lg border border-[#ffffff15] flex flex-col overflow-hidden">
        <div className="w-full bg-[#0c0c0c] py-3 flex justify-center items-center border-b border-[#ff7300]/40">
          <h2 className="text-lg font-bold">RECENT MATCHES</h2>
        </div>

        <div className="p-6 overflow-y-auto">

          {recent.length === 0 && (
            <div className="opacity-50">No matches yet.</div>
          )}

          <div className="space-y-2 mt-2">
            {recent.map((m) => (
              <div key={m.id} className="p-3 bg-neutral-800 rounded">
                <div>{m.map}</div>
                <div>{m.yourTeamWon ? "Win" : "Loss"}</div>
                <div>
                  {m.eloDelta
                    ? `${m.eloDelta > 0 ? "+" : ""}${m.eloDelta}`
                    : null}
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

    </div>
  );
}

//
// ---------------------
// MATCHROOM COMPONENT
// ---------------------
//
function MatchRoom(
  { room, onClose, countryMap }:
    { room: any; onClose: () => void; countryMap: Map<number, string> }
) {
  const { matchId, teamA, teamB, expectedWinA, eloGain, eloLoss } = room;

  return (
    <div className="w-full h-[calc(100vh-100px)] bg-[#0b0b0b] text-white p-6 overflow-y-auto">

      {/* BACK BUTTON */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">MATCH ROOM</h1>

        <button
          onClick={onClose}
          className="px-4 py-2 bg-neutral-700 rounded hover:bg-neutral-600"
        >
          Back
        </button>
      </div>

      {/* MATCH ID */}
      <div className="text-center mb-4 opacity-70">
        Match ID: {matchId}
      </div>

      <div className="grid grid-cols-3 gap-4">

        {/* COLUMN 1 → TEAM A */}
        <div className="bg-[#0f0f0f] p-4 rounded border border-[#222]">
          <h2 className="text-xl font-bold mb-3 text-center">TEAM A</h2>
          <div className="space-y-2">
            {teamA.map((p: any) => (
              <div key={p.id} className="bg-neutral-800 p-3 rounded">
                <div className="flex justify-between items-center">

                  {/* LEFT — flag + name */}
                  <div className="flex items-center gap-2">
                    <span className={`fp ${countryMap.get(p.countryId)}`} />
                    <span>{p.name}</span>
                  </div>

                  {/* RIGHT — elo + level icon */}
                  <div className="flex items-center gap-2">
                    <span className="opacity-70">{p.elo}</span>
                    <img
                      src={LEVEL_IMAGES[p.level]}
                      alt="Level"
                      className="w-8 h-8 object-contain"
                    />
                  </div>

                </div>
              </div>
            ))}
          </div>
        </div>

        {/* COLUMN 2 → MATCH INFO */}
        <div className="bg-[#0f0f0f] p-4 rounded border border-[#222] flex flex-col items-center justify-center">
          <h2 className="text-xl font-bold mb-2">MATCH INFO</h2>

          <div className="mt-2 text-center">
            <div>Win Chance: {(expectedWinA * 100).toFixed(1)}%</div>
            <div className="mt-1 opacity-70">
              Elo Gain: +{eloGain} / Loss: -{eloLoss}
            </div>
          </div>

          <button className="mt-6 px-8 py-3 bg-orange-600 rounded hover:bg-orange-700 text-lg">
            START MATCH
          </button>
        </div>

        {/* COLUMN 3 → TEAM B */}
        <div className="bg-[#0f0f0f] p-4 rounded border border-[#222]">
          <h2 className="text-xl font-bold mb-3 text-center">TEAM B</h2>
          <div className="space-y-2">
            {teamB.map((p: any) => (
              <div key={p.id} className="bg-neutral-800 p-3 rounded">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className={`fp ${countryMap.get(p.countryId)}`} />
                    <span>{p.name}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="opacity-70">{p.elo}</span>
                    <img
                      src={LEVEL_IMAGES[p.level]}
                      alt="Level"
                      className="w-8 h-8 object-contain"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
