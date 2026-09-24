/**
 * Saves the provided form data as a new PLAYER career.
 *
 * @module
 */
import React from 'react';
import { Constants, Util } from '@liga/shared';
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
  const playerAge = windowData?.user?.age;
  const countryId = windowData?.user?.countryId;
  const selectedRole = location.state?.role || windowData?.role?.selectedRole;
  const equipment = windowData?.equipment ?? Constants.Settings.gameSettings;
  const simulateNpcMatchStats = windowData?.statistics?.simulateNpcMatchStats ?? true;

  // compute new save ID
  const latestProfile = Math.max(...state.profiles.map((profile) => profile.id));
  const newSaveId = (isFinite(latestProfile) ? latestProfile : 0) + 1;

  React.useEffect(() => {
    const createPlayerCareer = async () => {
      if (!playerName?.trim() || !playerAge || !countryId || !selectedRole) {
        audioNegativeAlert();
        setStatus('Choose an alias, age, country, and role before creating a save.');
        return;
      }

      try {
        // Preserve the audio preferences from the main menu profile before switching databases.
        const sourceSettings = state.profile?.settings
          ? Util.loadSettings(state.profile.settings)
          : (await api.profiles
              .current()
              .then((profile) => (profile?.settings ? Util.loadSettings(profile.settings) : null))
              .catch((): null => null)) || Constants.Settings;
        const audioSettings = {
          volume: sourceSettings.general.volume,
          musicVolume: sourceSettings.general.musicVolume,
          faceitMatchFoundTune: sourceSettings.general.faceitMatchFoundTune,
        };

        setStatus(t('shared.connectingToDatabase'));
        await api.database.connect(String(newSaveId));
        localStorage.setItem('liga-active-save-id', String(newSaveId));
        // Save numbers can be reused after deletion. Never let an unrelated
        // legacy localStorage friend list migrate into the new database.
        localStorage.removeItem(`faceit-save-${newSaveId}:friends`);

        // Create PLAYER profile instead of manager
        setStatus(t('landing.create.statusSaving'));
        await api.profiles.createPlayerCareer({
          playerName,
          age: playerAge,
          countryId,
          role: selectedRole,
          equipment,
          audioSettings,
          simulateNpcMatchStats,
        });
        // A deleted save number can be reused. Its old FACEIT welcome state
        // must not carry over to this new career.
        localStorage.removeItem(`faceit-save-${newSaveId}:welcome-seen`);

        // Skip team-based season init (since teamless)
        setStatus(t('landing.create.statusWorldgen'));

        await api.calendar.start();

        // Open main game window
        api.window.open(Constants.WindowIdentifier.Main);
        api.window.close(Constants.WindowIdentifier.Landing);
      } catch (err) {
        console.error(err);
        await api.saves.delete(newSaveId).catch(() => Promise.resolve());
        setStatus('Error creating save.');
      }
    };

    createPlayerCareer();
  }, []);

  return (
    <main className="landing-operation-status">
      <section className="landing-operation-status__panel">
        <span className="landing-operation-status__label">Creating Career</span>
        <header>
          <span className="landing-operation-status__spinner loading loading-bars loading-lg" />
          <p>{status || 'Preparing your career...'}</p>
        </header>
        <div className="landing-operation-status__progress" aria-hidden="true">
          <span />
        </div>
      </section>
    </main>
  );
}
