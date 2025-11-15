import React from "react";
import { LEVEL_IMAGES } from "./faceit";
import { FaceitHeader } from "./faceit";

export default function MatchRoom({
  room,
  onClose,
  countryMap,
  elo,
  level,
  pct,
  low,
  high,
}: {
  room: any;
  onClose: () => void;
  countryMap: Map<number, string>;
  elo: number;
  level: number;
  pct: number;
  low: number;
  high: number;
}) {

  const { matchId, teamA, teamB, expectedWinA, eloGain, eloLoss } = room;

  return (
    <div className="w-full min-h-screen bg-[#0b0b0b] text-white flex flex-col">

      {/* FACEIT HEADER ALWAYS ON TOP */}
      <FaceitHeader elo={elo} level={level} pct={pct} low={low} high={high} />

      {/* BODY */}
      <div className="p-6 overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">MATCH ROOM</h1>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-neutral-700 rounded hover:bg-neutral-600"
          >
            Back
          </button>
        </div>

        <div className="text-center mb-4 opacity-70">
          Match ID: {matchId}
        </div>

        <div className="grid grid-cols-3 gap-4">

          {/* TEAM A */}
          <div className="bg-[#0f0f0f] p-4 rounded border border-[#222]">
            <h2 className="text-xl font-bold mb-3 text-center">TEAM A</h2>

            <div className="space-y-2">
              {teamA.map((p: any) => (
                <div key={p.id} className="bg-neutral-800 p-3 rounded flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className={`fp ${countryMap.get(p.countryId)}`} />
                    <span>{p.name}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="opacity-70">{p.elo}</span>
                    <img src={LEVEL_IMAGES[p.level]} className="w-8 h-8" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* MATCH INFO */}
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

          {/* TEAM B */}
          <div className="bg-[#0f0f0f] p-4 rounded border border-[#222]">
            <h2 className="text-xl font-bold mb-3 text-center">TEAM B</h2>

            <div className="space-y-2">
              {teamB.map((p: any) => (
                <div key={p.id} className="bg-neutral-800 p-3 rounded flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className={`fp ${countryMap.get(p.countryId)}`} />
                    <span>{p.name}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="opacity-70">{p.elo}</span>
                    <img src={LEVEL_IMAGES[p.level]} className="w-8 h-8" />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
