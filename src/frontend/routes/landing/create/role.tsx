import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAudio } from '@liga/frontend/hooks';
import awperIcon from '@liga/frontend/assets/awper.png';
import riflerIcon from '@liga/frontend/assets/rifler.png';
import iglIcon from '@liga/frontend/assets/igl.png';
import { cx } from '@liga/frontend/lib';

export default function Role() {
  const navigate = useNavigate();
  const audioClick = useAudio('button-click.wav');
  const [selectedRole, setSelectedRole] = React.useState<'RIFLER' | 'AWPER' | 'IGL' | null>(null);

  const handleSelect = (role: 'RIFLER' | 'AWPER' | 'IGL') => {
    setSelectedRole(role);
    audioClick();
  };

  const handleNext = () => {
    if (!selectedRole) return;
    navigate('/create/3', { state: { role: selectedRole } });
  };

  return (
    <div className="flex flex-col items-center justify-center h-full w-full gap-8">
      <h2 className="text-3xl font-semibold mb-2">Choose Your Role</h2>
      <p className="text-gray-400 mb-6 italic">
        Each role affects your playstyle, offers, and in-game mechanics.
      </p>

      {/* Role cards */}
      <div className="grid grid-cols-3 gap-6 w-full max-w-4xl">
        {[
          { role: 'RIFLER', label: 'Rifler', desc: 'Balanced all-round player with steady performance and average team demand' },
          { role: 'AWPER', label: 'AWPer', desc: 'Master of precision; Limited team spots but exclusive access to the AWP' },
          { role: 'IGL', label: 'IGL', desc: 'Strategic leader controlling vetoes; fewer offers, but greater influence in matches' },
        ].map((r) => (
          <div
            key={r.role}
            onClick={() => handleSelect(r.role as any)}
            className={`cursor-pointer transition-all duration-200 rounded-2xl p-6 flex flex-col items-center justify-between shadow-lg backdrop-blur-md
              ${selectedRole === r.role
                ? 'border-2 border-primary bg-base-200/60'
                : 'border border-white/10 hover:border-primary/40 bg-base-200/30'
              }`}
          >
            <div
              className={cx(
                'w-28 h-28 rounded-full flex items-center justify-center overflow-hidden mb-4 transition-all duration-300',
                selectedRole === r.role
                  ? 'bg-gradient-to-br from-[#fb923c] via-[#f97316] to-[#ea580c] shadow-[0_0_20px_rgba(249,115,22,0.7)] scale-105'
                  : 'bg-gradient-to-br from-[#fb923c]/70 via-[#f97316]/60 to-[#ea580c]/70 hover:from-[#fb923c] hover:via-[#f97316] hover:to-[#ea580c] hover:shadow-[0_0_20px_rgba(249,115,22,0.6)]'
              )}
            >
              <img
                src={
                  r.role === 'RIFLER'
                    ? riflerIcon
                    : r.role === 'AWPER'
                      ? awperIcon
                      : iglIcon
                }
                alt={r.label + ' icon'}
                className="w-20 h-20 object-contain opacity-95"
              />
            </div>

            {/* Role text */}
            <h3 className="text-xl font-semibold mb-2">{r.label}</h3>
            <p className="text-sm text-gray-400 text-center mb-4">{r.desc}</p>

            {/* Select button */}
            <button
              className={`btn btn-sm w-24 ${selectedRole === r.role ? 'btn-primary' : 'btn-outline'
                }`}
            >
              Select
            </button>
          </div>
        ))}
      </div>

      {/* Next button */}
      <button
        onClick={handleNext}
        disabled={!selectedRole}
        className="btn btn-primary mt-6 px-10 text-lg disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Continue
      </button>
    </div>
  );
}
