import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAudio } from '@liga/frontend/hooks';
import { Constants } from '@liga/shared';
import { AppStateContext } from '@liga/frontend/redux';
import type { PlayerCareerRole } from '@liga/frontend/redux/state';
import { windowDataUpdate } from '@liga/frontend/redux/actions';
import awperIcon from '@liga/frontend/assets/awper.png';
import awperBackground from '@liga/frontend/assets/role_awper_bg.png';
import riflerBackground from '@liga/frontend/assets/role_rifler_bg.png';
import iglBackground from '@liga/frontend/assets/role_igl_bg.png';
import riflerIcon from '@liga/frontend/assets/rifler.png';
import iglIcon from '@liga/frontend/assets/igl.png';
import { cx } from '@liga/frontend/lib';
import { FaArrowLeft } from 'react-icons/fa';

const ROLE_OPTIONS: Array<{
  role: PlayerCareerRole;
  label: string;
  desc: string;
  icon: string;
  background: string;
  general: string[];
  gameplay: string[];
  badgeClassName: string;
  selectedCardClassName: string;
  hoverCardClassName: string;
}> = [
  {
    role: 'RIFLER',
    label: 'Rifler',
    desc: 'All-Rounder',
    icon: riflerIcon,
    background: riflerBackground,
    general: ['High contract offer probability', 'Lowest chance of getting benched'],
    gameplay: ['Cannot use the AWP in-game unless specific conditions are met'],
    badgeClassName: 'bg-[#ff5e13]/20 border border-[#ff6a27]',
    selectedCardClassName:
      'border-[#ff6a27] bg-[#ff5e13]/16 shadow-[0_0_24px_rgba(255,94,19,0.38)]',
    hoverCardClassName: 'hover:border-[#ff7b3c]/70 hover:shadow-[0_0_18px_rgba(255,94,19,0.24)]',
  },
  {
    role: 'AWPER',
    label: 'AWPer',
    desc: 'Master of Precision',
    icon: awperIcon,
    background: awperBackground,
    general: [
      'Lowest contract offer probability',
      'High performance requirement to avoid being benched',
    ],
    gameplay: ['Can use the AWP in-game at all times'],
    badgeClassName: 'bg-[#ff5e13]/20 border border-[#ff6a27]',
    selectedCardClassName:
      'border-[#ff6a27] bg-[#ff5e13]/16 shadow-[0_0_24px_rgba(255,94,19,0.38)]',
    hoverCardClassName: 'hover:border-[#ff7b3c]/70 hover:shadow-[0_0_18px_rgba(255,94,19,0.24)]',
  },
  {
    role: 'IGL',
    label: 'IGL',
    desc: 'Strategic Leader',
    icon: iglIcon,
    background: iglBackground,
    general: ['Lower offer rate than Riflers', 'High win rate requirement to avoid being benched'],
    gameplay: [
      'Can participate in vetoes before official matches',
      'Always spawns with the bomb in official matches',
      'Can call defaults on the CT side and strategies on the T side in official matches',
      'Cannot use the AWP in-game unless specific conditions are met',
    ],
    badgeClassName: 'bg-[#ff5e13]/20 border border-[#ff6a27]',
    selectedCardClassName:
      'border-[#ff6a27] bg-[#ff5e13]/16 shadow-[0_0_24px_rgba(255,94,19,0.38)]',
    hoverCardClassName: 'hover:border-[#ff7b3c]/70 hover:shadow-[0_0_18px_rgba(255,94,19,0.24)]',
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
    navigate('/create/4', { state: { role: selectedRole } });
  };

  return (
    <div className="flex h-full w-full flex-col">
      <div className="relative flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-8">
        <header className="landing-create-role-step__heading">
          <span>Role</span>
        </header>
        <div className="landing-create-role-layout">
          {ROLE_OPTIONS.map((r, index) => (
            <React.Fragment key={r.role}>
              <div
                onClick={() => handleSelect(r.role)}
                className={cx(
                  'landing-create-role-card cursor-pointer overflow-hidden rounded-none backdrop-blur-md transition-all duration-200',
                  'flex h-full flex-col items-center border-2 p-7',
                  selectedRole &&
                    index > ROLE_OPTIONS.findIndex((option) => option.role === selectedRole) &&
                    'landing-create-role-card--following',
                  selectedRole === r.role
                    ? cx('bg-base-200/60', r.selectedCardClassName)
                    : cx(
                        'bg-base-200/30 border-x-white/10 border-t-white/10 border-b-[#03070a]',
                        r.hoverCardClassName,
                      ),
                )}
                style={{
                  backgroundImage: `linear-gradient(180deg, rgb(3 7 10 / 24%) 0%, rgb(3 7 10 / 46%) 45%, rgb(3 7 10 / 94%) 74%, #03070a 90%, #03070a 100%), url(${r.background})`,
                  backgroundSize: '100% 100%, 160% auto',
                  backgroundPosition:
                    r.role === 'RIFLER'
                      ? 'center, 40% 12%'
                      : r.role === 'AWPER'
                        ? 'center, 78% 35%'
                        : 'center, center 12%',
                  backgroundRepeat: 'no-repeat, no-repeat',
                }}
              >
                <header className="landing-create-role-card__identity">
                  <div
                    className={cx(
                      'landing-create-role-card__badge flex h-28 w-28 items-center justify-center overflow-hidden rounded-full transition-all duration-300',
                      r.badgeClassName,
                    )}
                  >
                    <img
                      src={r.icon}
                      alt={r.label + ' icon'}
                      className="h-20 w-20 object-contain opacity-95"
                    />
                  </div>
                  <h3 className="landing-create-role-card__title flex min-h-[2rem] items-center text-center text-xl font-semibold">
                    {r.label}
                  </h3>
                </header>
                <p className="landing-create-role-card__description mt-2 mb-4 min-h-[5.5rem] text-center text-sm leading-snug text-gray-400">
                  {r.desc}
                </p>
                <button
                  className={cx(
                    'landing-create-role-card__select btn btn-sm w-24',
                    selectedRole === r.role ? 'btn-primary' : 'btn-outline',
                  )}
                >
                  Select
                </button>
              </div>
              {selectedRole === r.role && (
                <aside className="landing-create-role-info" aria-live="polite">
                  <section>
                    <h3>General Information</h3>
                    <ul>
                      {r.general.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  </section>
                  <section>
                    <h3>Gameplay</h3>
                    <ul>
                      {r.gameplay.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  </section>
                </aside>
              )}
            </React.Fragment>
          ))}
        </div>
        <p className="text-error absolute right-0 bottom-3 left-0 h-5 text-center text-sm">
          {error}
        </p>
      </div>
      <footer className="landing-create-user-step__actions w-full shrink-0">
        <button
          type="button"
          className="btn"
          aria-label="Back to player information"
          onClick={() => navigate('/create')}
          onMouseDown={audioClick}
        >
          <FaArrowLeft />
        </button>
        <button
          type="button"
          onClick={handleNext}
          className={cx('btn btn-primary', !selectedRole && 'cursor-not-allowed opacity-50')}
          aria-disabled={!selectedRole}
        >
          Create Career <span>›</span>
        </button>
      </footer>
    </div>
  );
}
