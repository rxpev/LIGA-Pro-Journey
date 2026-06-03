/**
 * Confirmation modal shown when deleting a saved career.
 *
 * @module
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { AppStateContext } from '@liga/frontend/redux';
import { profilesDelete } from '@liga/frontend/redux/actions';
import { useAudio, useTranslation } from '@liga/frontend/hooks';

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const { id } = useParams();
  const { dispatch, state } = React.useContext(AppStateContext);
  const [deleting, setDeleting] = React.useState(false);
  const navigate = useNavigate();
  const t = useTranslation('windows');

  // load audio files
  const audioRelease = useAudio('button-release.wav');
  const audioClick = useAudio('button-click.wav');

  // refresh profile when attempting delete
  const profile = React.useMemo(
    () => state.profiles.find((item) => item.id === parseInt(id)),
    [id, state.profiles],
  );

  // delete profile event handler
  const handleDeleteProfile = async () => {
    if (!profile) {
      navigate(-1);
      return;
    }

    setDeleting(true);
    await api.saves.delete(profile.id);
    dispatch(profilesDelete([profile]));
    setDeleting(false);
    navigate(-1);
  };

  if (!profile) {
    return null;
  }

  return createPortal(
    <dialog className="modal modal-open fixed inset-0 z-50 h-screen w-screen">
      <section className="modal-box">
        <h3 className="text-lg">{t('landing.delete.title')}</h3>
        <p className="py-4">{t('landing.delete.subtitle')}</p>
        <article className="modal-action">
          <button className="btn" onClick={() => navigate(-1)} onMouseDown={audioRelease}>
            {t('landing.delete.cancel')}
          </button>
          <button className="btn btn-error" onClick={handleDeleteProfile} onMouseDown={audioClick}>
            {!!deleting && <span className="loading loading-spinner"></span>}
            {t('shared.delete')}
          </button>
        </article>
      </section>
    </dialog>,
    document.body,
  );
}
