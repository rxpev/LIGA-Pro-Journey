/**
 * Configures the application state.
 *
 * @module
 */
import type AppInfo from 'package.json';
import Locale from '@liga/locale';
import { Constants, Eagers } from '@liga/shared';

/** @interface */
export interface AppAction<T> {
  type: number;
  payload?: T;
}
export interface PlayerCareerUser {
  name: string;
  countryId: number;
  avatar?: string;
}

/** @interface */
export interface AppState {
  appInfo: typeof AppInfo;
  appStatus: string;
  continents: Array<
    Awaited<ReturnType<typeof api.continents.all<typeof Eagers.continent>>>[number]
  >;
  emails: Awaited<ReturnType<typeof api.emails.all<typeof Eagers.email>>>;
  locale: Awaited<ReturnType<typeof api.app.locale>>;
  playing: boolean;
  profile: Awaited<ReturnType<typeof api.profiles.current<typeof Eagers.profile>>>;
  profiles: Array<AppState['profile']>;
  shortlist: Awaited<ReturnType<typeof api.shortlist.all<typeof Eagers.shortlist>>>;
  windowData: Partial<{
    [Constants.WindowIdentifier.Landing]: {
      user?: PlayerCareerUser;
      role?: { selectedRole: string };
      today: Date;
    };
    [Constants.WindowIdentifier.Modal]: Pick<
      Parameters<typeof api.profiles.create>[0]['team'],
      'name' | 'blazon'
    >;
  }>;
  working: boolean;
}

/** @type {AppActions} */
export type AppActions = AppAction<AppState[keyof AppState]>;

/** @type {AppDispatch} */
export type AppDispatch = (action: AppActions | ThunkAction) => void;

/** @type {ThunkAction} */
export type ThunkAction = (dispatch: AppDispatch) => void | Promise<void>;

/** @constant */
export const InitialState: AppState = {
  appInfo: null,
  appStatus: null,
  continents: [],
  emails: [],
  locale: Locale.en,
  playing: false,
  profile: null,
  profiles: [],
  shortlist: [],
  windowData: {
    landing: {
      today: new Date(
        new Date().getFullYear(),
        Constants.Application.SEASON_START_MONTH,
        Constants.Application.SEASON_START_DAY
      ),
      user: undefined,
      role: undefined,
    },
    modal: {},
  },
  working: false,
};
