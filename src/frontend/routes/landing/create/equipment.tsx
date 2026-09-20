import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaCheck } from 'react-icons/fa';
import { Constants } from '@liga/shared';
import { AppStateContext } from '@liga/frontend/redux';
import { windowDataUpdate } from '@liga/frontend/redux/actions';
import type { PlayerCareerEquipment } from '@liga/frontend/redux/state';
import { useAudio } from '@liga/frontend/hooks';
import { cx } from '@liga/frontend/lib';
import cz75AutoIcon from '@liga/frontend/assets/weapons/2D/cz75a.svg';
import m4a1sIcon from '@liga/frontend/assets/weapons/2D/m4a1_silencer.svg';
import uspsIcon from '@liga/frontend/assets/weapons/2D/usp_silencer.svg';

const EQUIPMENT_OPTIONS: Array<{
  setting: keyof PlayerCareerEquipment;
  name: string;
  slot: string;
  alternative: string;
  icon: string;
}> = [
  {
    setting: 'isUSP',
    name: 'USP-S',
    slot: 'CT starting pistol',
    alternative: 'P2000',
    icon: uspsIcon,
  },
  {
    setting: 'isM4A1',
    name: 'M4A1-S',
    slot: 'CT rifle',
    alternative: 'M4A4',
    icon: m4a1sIcon,
  },
  {
    setting: 'isCZ',
    name: 'CZ75-Auto',
    slot: 'Pistol loadout',
    alternative: 'Five-SeveN / Tec-9',
    icon: cz75AutoIcon,
  },
];

export default function Equipment() {
  const navigate = useNavigate();
  const { state, dispatch } = React.useContext(AppStateContext);
  const audioClick = useAudio('button-click.wav');
  const audioRelease = useAudio('button-release.wav');
  const windowData = state.windowData.landing;
  const [equipment, setEquipment] = React.useState<PlayerCareerEquipment>(
    windowData?.equipment ?? { ...Constants.Settings.gameSettings },
  );

  const updateEquipment = (setting: keyof PlayerCareerEquipment, enabled: boolean) => {
    (enabled ? audioClick : audioRelease)();
    const nextEquipment = { ...equipment, [setting]: enabled };
    setEquipment(nextEquipment);
    dispatch(
      windowDataUpdate({
        [Constants.WindowIdentifier.Landing]: {
          ...windowData,
          equipment: nextEquipment,
        },
      }),
    );
  };

  const handleCreate = () => {
    audioClick();
    dispatch(
      windowDataUpdate({
        [Constants.WindowIdentifier.Landing]: {
          ...windowData,
          equipment,
        },
      }),
    );
    navigate('/create/4');
  };

  return (
    <div className="landing-create-equipment-step">
      <section className="landing-create-equipment-step__content">
        <header className="landing-create-equipment-step__heading">
          <span>Equipment</span>
          <p>
            Choose which optional weapons your player equips. You can change these later in
            Settings.
          </p>
        </header>

        <div className="landing-create-equipment-grid">
          {EQUIPMENT_OPTIONS.map((option) => {
            const enabled = equipment[option.setting];

            return (
              <label
                key={option.setting}
                className={cx(
                  'landing-create-equipment-card',
                  enabled && 'landing-create-equipment-card--selected',
                )}
              >
                <input
                  type="checkbox"
                  data-interaction-sound="none"
                  checked={enabled}
                  onChange={(event) => updateEquipment(option.setting, event.target.checked)}
                />
                <span className="landing-create-equipment-card__state">
                  {enabled ? <FaCheck aria-hidden="true" /> : null}
                </span>
                <span className="landing-create-equipment-card__slot">{option.slot}</span>
                <span className="landing-create-equipment-card__weapon">
                  <img src={option.icon} alt="" draggable={false} />
                </span>
                <strong>{option.name}</strong>
                <span className="landing-create-equipment-card__choice">
                  <span>{enabled ? 'Equipped' : `Using ${option.alternative}`}</span>
                  <span
                    className={cx(
                      'landing-create-equipment-card__toggle',
                      enabled && 'landing-create-equipment-card__toggle--enabled',
                    )}
                    aria-hidden="true"
                  >
                    <span />
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <footer className="landing-create-user-step__actions">
        <button
          type="button"
          className="btn"
          aria-label="Back to role selection"
          onClick={() => navigate('/create/2')}
          onMouseDown={audioRelease}
        >
          <FaArrowLeft />
        </button>
        <button type="button" onClick={handleCreate} className="btn btn-primary">
          Create Career <span>›</span>
        </button>
      </footer>
    </div>
  );
}
