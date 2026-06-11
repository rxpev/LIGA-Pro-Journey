/**
 * Saves the provided form data as a new PLAYER career.
 *
 * @module
 */
import React from 'react';
import { Constants } from '@liga/shared';
import { AppStateContext } from '@liga/frontend/redux';
import { useAudio, useTranslation } from '@liga/frontend/hooks';
import type { PlayerCareerRole } from '@liga/frontend/redux/state';
import { useLocation } from 'react-router-dom';

interface RoleLocationState {
  role?: PlayerCareerRole;
}

/**
 * Exports this module.
 *
 * @exports
 */
export default function Save() {
  const t = useTranslation('windows');
  const { state } = React.useContext(AppStateContext);
  const [status, setStatus] = React.useState('');
  const location = useLocation() as unknown as { state?: RoleLocationState };
  const audioNegativeAlert = useAudio('negative-alert.wav');

  // extract user + role data
  const windowData = state.windowData[Constants.WindowIdentifier.Landing];
  const playerName = windowData?.user?.name;
  const countryId = windowData?.user?.countryId;
  const selectedRole = location.state?.role || windowData?.role?.selectedRole;

  // compute new save ID
  const latestProfile = Math.max(...state.profiles.map((profile) => profile.id));
  const newSaveId = (isFinite(latestProfile) ? latestProfile : 0) + 1;



  React.useEffect(() => {
    const createPlayerCareer = async () => {
      if (!playerName?.trim() || !countryId || !selectedRole) {
        audioNegativeAlert();
        setStatus('Choose an alias, country, and role before creating a save.');
        return;
      }

      try {
        setStatus(t('shared.connectingToDatabase'));
        await api.database.connect(String(newSaveId));

        // Create PLAYER profile instead of manager
        setStatus(t('landing.create.statusSaving'));
        await api.profiles.createPlayerCareer({
          playerName,
          countryId,
          role: selectedRole,
        });

        // Skip team-based season init (since teamless)
        setStatus(t('landing.create.statusWorldgen'));

        await api.calendar.start();

        // Open main game window
        api.window.open(Constants.WindowIdentifier.Main);
        api.window.close(Constants.WindowIdentifier.Landing);
      } catch (err) {
        console.error(err);
        setStatus('Error creating save.');
      }
    };

    createPlayerCareer();
  }, []);

  return (
    <article className="center h-full">
      <header className="stack-y items-center">
        <span className="loading loading-bars loading-lg" />
        <p>{status}</p>
      </header>
    </article>
  );
}
