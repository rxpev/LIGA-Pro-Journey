import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Constants } from '@liga/shared';
import { AppStateContext } from '@liga/frontend/redux';
import { windowDataUpdate } from '@liga/frontend/redux/actions';
import { useAudio } from '@liga/frontend/hooks';
import { FaChartLine, FaExclamationTriangle } from 'react-icons/fa';

export default function Statistics() {
  const navigate = useNavigate();
  const { state, dispatch } = React.useContext(AppStateContext);
  const audioClick = useAudio('button-click.wav');
  const audioRelease = useAudio('button-release.wav');
  const windowData = state.windowData.landing;
  const [enabled, setEnabled] = React.useState(
    windowData?.statistics?.simulateNpcMatchStats ?? false,
  );

  const updateEnabled = (value: boolean) => {
    (value ? audioClick : audioRelease)();
    setEnabled(value);
    dispatch(
      windowDataUpdate({
        [Constants.WindowIdentifier.Landing]: {
          ...windowData,
          statistics: { simulateNpcMatchStats: value },
        },
      }),
    );
  };

  const handleContinue = () => {
    audioClick();
    dispatch(
      windowDataUpdate({
        [Constants.WindowIdentifier.Landing]: {
          ...windowData,
          statistics: { simulateNpcMatchStats: enabled },
        },
      }),
    );
    navigate('/create/4');
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-7">
      <section className="flex max-w-2xl flex-col items-center gap-4 text-center">
        <div className="center bg-primary/15 text-primary size-16 rounded-full">
          <FaChartLine className="size-7" />
        </div>
        <h2 className="text-3xl font-semibold">Statistic Simulation</h2>
        <p className="text-base leading-relaxed text-gray-300">
          Enable statistic simulation for non-user matches to give all players generated
          scoreboards, ratings, kills, deaths, assists, and map-level match details.
        </p>
      </section>

      <label className="border-base-content/15 bg-base-200/45 flex w-full max-w-2xl cursor-pointer items-start gap-4 rounded-lg border p-5">
        <input
          type="checkbox"
          className="toggle toggle-primary mt-1"
          checked={enabled}
          onChange={(event) => updateEnabled(event.target.checked)}
        />
        <span className="flex flex-col gap-2">
          <span className="text-lg font-semibold">
            Enable statistic simulation for non-user matches
          </span>
          <span className="text-sm leading-relaxed text-gray-400">
            This adds immersion by giving every simulated match real-looking player statistics, but
            it can significantly slow down calendar simulation and may be problematic on low-end
            PCs.
          </span>
        </span>
      </label>

      <section className="border-warning/40 bg-warning/10 text-warning flex max-w-2xl items-start gap-3 rounded-lg border p-4 text-sm leading-relaxed">
        <FaExclamationTriangle className="mt-0.5 shrink-0" />
        <p>
          This setting permanently marks the career and cannot be turned off after enabling. Legacy
          save upgrade and historical stat backfill can be added later.
        </p>
      </section>

      <button onClick={handleContinue} className="btn btn-primary mt-2 px-10 text-lg">
        Continue
      </button>
    </div>
  );
}
