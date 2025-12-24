/**
 * Configures the application state.
 *
 * @module
 */
import type AppInfo from "package.json";
import Locale from "@liga/locale";
import { Constants, Eagers } from "@liga/shared";

/** Lightweight user struct for Landing window */
export interface PlayerCareerUser {
  name: string;
  countryId: number;
  avatar?: string;
}

/** Fully flexible Redux action */
export interface AppAction {
  type: number;
  payload?: any;
}

export type ThunkAction = (dispatch: AppDispatch) => void | Promise<void>;
export type AppDispatch = (action: AppAction | ThunkAction) => void;

/** Root State */
export interface AppState {
  appInfo: typeof AppInfo;
  appStatus: string;
  continents: Array<
    Awaited<
      ReturnType<typeof api.continents.all<typeof Eagers.continent>>
    >[number]
  >;
  emails: Awaited<
    ReturnType<typeof api.emails.all<typeof Eagers.email>>
  >;
  locale: Awaited<ReturnType<typeof api.app.locale>>;
  playing: boolean;
  profile: Awaited<
    ReturnType<typeof api.profiles.current<typeof Eagers.profile>>
  >;
  profiles: Array<AppState["profile"]>;
  shortlist: Awaited<
    ReturnType<typeof api.shortlist.all<typeof Eagers.shortlist>>
  >;
  faceitMatchRoom: any | null;
  faceitMatchId: number | null;
  faceitMatchCompleted: boolean;
  faceitVeto: {
    history: Array<{
      map: string;
      by: "TEAM_A" | "TEAM_B" | "SYSTEM";
      kind: "BAN" | "DECIDER";
    }>;
    completed: boolean;
    deciderMap: string | null;
  };
  faceitQueue: {
    status: "IDLE" | "QUEUEING" | "RESOLVING";
    startedAt: number | null;
    targetSec: number | null;
  };
  windowData: Partial<{
    [Constants.WindowIdentifier.Landing]: {
      user?: PlayerCareerUser;
      role?: { selectedRole: string };
      today: Date;
    };
    [Constants.WindowIdentifier.Modal]: {
      name?: string;
      blazon?: string;
    };
  }>;

  working: boolean;
}

/** Default state */
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
  faceitMatchRoom: null,
  faceitMatchId: null,
  faceitMatchCompleted: false,
  faceitVeto: {
    history: [],
    completed: false,
    deciderMap: null,
  },
  faceitQueue: {
    status: "IDLE",
    startedAt: null,
    targetSec: null,
  },
  windowData: {
    landing: {
      today: new Date(
        new Date().getFullYear(),
        Constants.Application.SEASON_START_MONTH,
        Constants.Application.SEASON_START_DAY
      ),
    },
    modal: {},
  },
  working: false,
};
