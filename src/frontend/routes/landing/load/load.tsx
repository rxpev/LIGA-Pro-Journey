/**
 * Allows the user to load or delete a saved career.
 *
 * @module
 */
import React from 'react';
import { upperFirst } from 'lodash';
import { useNavigate, Outlet } from 'react-router-dom';
import { Util } from '@liga/shared';
import { AppStateContext } from '@liga/frontend/redux';
import type { AppState } from '@liga/frontend/redux/state';
import {
  formatAppRelativeDate,
  getCalendarDateFormat,
  useAudio,
  useTranslation,
} from '@liga/frontend/hooks';
import { FaArrowLeft, FaTrash } from 'react-icons/fa';
import awperIcon from '@liga/frontend/assets/awper.png';
import iglIcon from '@liga/frontend/assets/igl.png';
import riflerIcon from '@liga/frontend/assets/rifler.png';

const ROLE_ICONS: Record<string, string> = {
  AWPER: awperIcon,
  IGL: iglIcon,
  RIFLER: riflerIcon,
};

const ROLE_BADGE_STYLES: Record<string, string> = {
  AWPER: 'bg-purple-300',
  IGL: 'bg-green-300',
  RIFLER: 'bg-blue-300',
};

const NO_TEAM_ICON = 'resources://blazonry/noteam.svg';

type SaveListProfile = AppState['profiles'][number] & {
  player?: {
    role?: string | null;
    team?: {
      name?: string | null;
      blazon?: string | null;
    } | null;
  } | null;
  team?: {
    name?: string | null;
    blazon?: string | null;
  } | null;
};

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const navigate = useNavigate();
  const { state } = React.useContext(AppStateContext);
  const t = useTranslation('windows');
  const dateFormat = getCalendarDateFormat(state.profile?.settings);

  // load audio files
  const audioRelease = useAudio('button-release.wav');
  const audioClick = useAudio('button-click.wav');
  const audioNegativeAlert = useAudio('negative-alert.wav');

  return (
    <main className="frosted relative flex h-full w-3/5 flex-col overflow-hidden p-5 xl:w-1/2">
      <FaArrowLeft
        className="absolute top-5 left-5 z-20 size-5 cursor-pointer"
        onClick={() => navigate(-1)}
        onMouseDown={audioRelease}
      />
      <table className="table table-fixed">
        <colgroup>
          <col className="w-1/5" />
          <col className="w-1/5" />
          <col className="w-1/5" />
          <col className="w-1/5" />
          <col className="w-1/5" />
        </colgroup>
        <thead className="bg-base-300">
          <tr>
            <th className="pl-14">{t('shared.name')}</th>
            <th className="text-center">Role</th>
            <th>{t('shared.team')}</th>
            <th>{t('landing.load.lastUpdated')}</th>
            <th className="text-center">{t('shared.delete')}</th>
          </tr>
        </thead>
      </table>
      <section className="min-h-0 flex-1 overflow-y-auto">
        <table className="table table-fixed">
          <colgroup>
            <col className="w-1/5" />
            <col className="w-1/5" />
            <col className="w-1/5" />
            <col className="w-1/5" />
            <col className="w-1/5" />
          </colgroup>
        <tbody>
          {state.profiles.map((profile) => {
            const save = profile as SaveListProfile;
            const role = save.player?.role || 'RIFLER';
            const roleIcon = ROLE_ICONS[role] || riflerIcon;
            const roleBadgeStyle = ROLE_BADGE_STYLES[role] || ROLE_BADGE_STYLES.RIFLER;
            const team = save.team || save.player?.team;
            const teamBlazon = team?.blazon || NO_TEAM_ICON;
            const teamName = team?.name || 'No Team';
            return (
              <tr
                key={profile.id}
                className="hover:bg-base-content/10 cursor-pointer"
                onClick={() => navigate('/connect/' + profile.id)}
                onMouseDown={audioClick}
              >
                <td className="pl-14">
                  <p>{profile.name}</p>
                  <p className="text-muted">
                    <em>{Util.getSaveFileName(profile.id)}</em>
                  </p>
                </td>
                <td className="text-center">
                  <span
                    title={role}
                    className={`inline-grid size-9 place-items-center rounded-full ${roleBadgeStyle}`}
                  >
                    <img src={roleIcon} alt={role} className="size-8 object-contain opacity-95" />
                  </span>
                </td>
                <td>
                  <div className="flex items-center gap-3">
                    <img
                      src={teamBlazon}
                      alt={teamName}
                      title={teamName}
                      className="size-8 shrink-0 object-contain"
                    />
                    <span className="truncate">{team?.name || 'No Team'}</span>
                  </div>
                </td>
                <td>{upperFirst(formatAppRelativeDate(profile.updatedAt, dateFormat))}</td>
                <td className="text-center" onClick={(event) => event.stopPropagation()}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => navigate('/load/delete/' + profile.id)}
                    onMouseDown={(event) => {
                      event.stopPropagation();
                      audioNegativeAlert();
                    }}
                  >
                    <FaTrash />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </section>
      <Outlet />
    </main>
  );
}
