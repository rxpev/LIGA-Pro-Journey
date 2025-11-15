/**
 * Saves the provided form data as a new PLAYER career.
 *
 * @module
 */
import React from 'react';
import { Constants } from '@liga/shared';
import { AppStateContext } from '@liga/frontend/redux';
import { useTranslation } from '@liga/frontend/hooks';
import { useLocation } from 'react-router-dom';

interface RoleLocationState {
  role?: 'RIFLER' | 'AWPER' | 'IGL';
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

  const selectedRole = location.state?.role || 'RIFLER';

  // extract user + role data
  const windowData = state.windowData[Constants.WindowIdentifier.Landing];
  const playerName = windowData?.user?.name;
  const countryId = windowData?.user?.countryId;

  // compute new save ID
  const latestProfile = Math.max(...state.profiles.map((profile) => profile.id));
  const newSaveId = (isFinite(latestProfile) ? latestProfile : 0) + 1;



  React.useEffect(() => {
    const createPlayerCareer = async () => {
      try {
        setStatus(t('shared.connectingToDatabase'));
        await api.database.connect(String(newSaveId));

        // Create PLAYER profile instead of manager
        setStatus(t('landing.create.statusSaving'));
        await api.profiles.createPlayerCareer({
          playerName: windowData?.user?.name!,
          countryId: windowData?.user?.countryId!,
          role: selectedRole || 'RIFLER', // fallback
        });

        // Skip team-based season init (since teamless)
        setStatus(t('landing.create.statusWorldgen'));
        await api.calendar.create({
          date: windowData.today.toISOString(),
          type: Constants.CalendarEntry.SEASON_START,
        });

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
