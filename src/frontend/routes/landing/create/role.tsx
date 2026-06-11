import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAudio } from '@liga/frontend/hooks';
import { Constants } from '@liga/shared';
import { AppStateContext } from '@liga/frontend/redux';
import type { PlayerCareerRole } from '@liga/frontend/redux/state';
import { windowDataUpdate } from '@liga/frontend/redux/actions';
import awperIcon from '@liga/frontend/assets/awper.png';
import riflerIcon from '@liga/frontend/assets/rifler.png';
import iglIcon from '@liga/frontend/assets/igl.png';
import { cx } from '@liga/frontend/lib';

const ROLE_OPTIONS: Array<{
  role: PlayerCareerRole;
  label: string;
  desc: string;
  icon: string;
  badgeClassName: string;
  selectedCardClassName: string;
  hoverCardClassName: string;
}> = [
  {
    role: 'RIFLER',
    label: 'Rifler',
    desc: 'Balanced all-round player with steady performance and average team demand',
    icon: riflerIcon,
    badgeClassName: 'bg-blue-300',
    selectedCardClassName: 'border-blue-300 shadow-[0_0_24px_rgba(147,197,253,0.55)]',
    hoverCardClassName: 'hover:border-blue-300/60 hover:shadow-[0_0_18px_rgba(147,197,253,0.35)]',
  },
  {
    role: 'AWPER',
    label: 'AWPer',
    desc: 'Master of precision; Limited team spots but exclusive access to the AWP',
    icon: awperIcon,
    badgeClassName: 'bg-purple-300',
    selectedCardClassName: 'border-purple-300 shadow-[0_0_24px_rgba(216,180,254,0.55)]',
    hoverCardClassName: 'hover:border-purple-300/60 hover:shadow-[0_0_18px_rgba(216,180,254,0.35)]',
  },
  {
    role: 'IGL',
    label: 'IGL',
    desc: 'Strategic leader controlling vetoes; fewer offers, but greater influence in matches',
    icon: iglIcon,
    badgeClassName: 'bg-green-300',
    selectedCardClassName: 'border-green-300 shadow-[0_0_24px_rgba(134,239,172,0.55)]',
    hoverCardClassName: 'hover:border-green-300/60 hover:shadow-[0_0_18px_rgba(134,239,172,0.35)]',
  },
];

export default function Role() {
  const navigate = useNavigate();
  const { state, dispatch } = React.useContext(AppStateContext);
  const audioClick = useAudio('button-click.wav');
  const audioNegativeAlert = useAudio('negative-alert.wav');
  const windowData = state.windowData.landing;
  const [selectedRole, setSelectedRole] = React.useState<PlayerCareerRole | null>(
    windowData?.role?.selectedRole || null,
  );
  const [error, setError] = React.useState('');

  const handleSelect = (role: PlayerCareerRole) => {
    setSelectedRole(role);
    setError('');
    dispatch(
      windowDataUpdate({
        [Constants.WindowIdentifier.Landing]: {
          ...windowData,
          role: { selectedRole: role },
        },
      }),
    );
    audioClick();
  };

  const handleNext = () => {
    const missingFields = [
      !windowData?.user?.name?.trim() && 'alias',
      !windowData?.user?.countryId && 'country',
      !selectedRole && 'role',
    ].filter(Boolean);

    if (missingFields.length) {
      setError('Choose an alias, country, and role before creating a save.');
      audioNegativeAlert();
      return;
    }

    audioClick();
    navigate('/create/3', { state: { role: selectedRole } });
  };

  return (
    <div className="flex flex-col items-center justify-center h-full w-full gap-8">
      <h2 className="text-3xl font-semibold mb-2">Choose Your Role</h2>
      <p className="text-gray-400 mb-6 italic">
        Each role affects your playstyle, offers, and in-game mechanics.
      </p>
      <div className="grid grid-cols-3 gap-6 w-full max-w-4xl items-stretch">
        {ROLE_OPTIONS.map((r) => (
          <div
            key={r.role}
            onClick={() => handleSelect(r.role)}
            className={cx(
              'cursor-pointer transition-all duration-200 rounded-2xl backdrop-blur-md',
              'border-2 h-full flex flex-col items-center p-7',
              selectedRole === r.role
                ? cx('bg-base-200/60', r.selectedCardClassName)
                : cx('border-white/10 bg-base-200/30 shadow-lg', r.hoverCardClassName),
            )}
          >
            <div
              className={cx(
                'w-28 h-28 rounded-full flex items-center justify-center overflow-hidden mb-4 transition-all duration-300',
                r.badgeClassName,
              )}
            >
              <img
                src={r.icon}
                alt={r.label + ' icon'}
                className="w-20 h-20 object-contain opacity-95"
              />
            </div>
            <h3 className="text-xl font-semibold text-center min-h-[2rem] flex items-center">
              {r.label}
            </h3>
            <p className="text-sm text-gray-400 text-center mt-2 mb-4 min-h-[5.5rem] leading-snug">
              {r.desc}
            </p>
            <button className={cx('btn btn-sm w-24 mt-auto', selectedRole === r.role ? 'btn-primary' : 'btn-outline')}>
              Select
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={handleNext}
        className="btn btn-primary mt-6 px-10 text-lg"
      >
        Continue
      </button>
      <p className="h-5 text-sm text-error">{error}</p>
    </div>
  );
}
