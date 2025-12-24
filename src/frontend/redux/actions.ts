/**
 * Configures the state actions.
 *
 * @module
 */
import { Constants, Util } from "@liga/shared";
import { AppDispatch, AppState } from "./state";

/** Redux Action Enum */
export enum ReduxActions {
  APP_INFO_UPDATE,
  APP_STATUS_UPDATE,
  CONTINENTS_UPDATE,
  EMAILS_UPDATE,
  EMAILS_DELETE,
  LOCALE_UPDATE,
  PLAYING_UPDATE,
  PROFILE_UPDATE,
  PROFILES_DELETE,
  PROFILES_UPDATE,
  SHORTLIST_UPDATE,
  WINDOW_DATA_UPDATE,
  WORKING_UPDATE,

  /** FACEIT */
  FACEIT_ROOM_SET,
  FACEIT_ROOM_CLEAR,
  FACEIT_MATCH_COMPLETED,
  FACEIT_VETO_SET,
  FACEIT_VETO_CLEAR,
  FACEIT_QUEUE_SET,
  FACEIT_QUEUE_RESOLVING,
  FACEIT_QUEUE_CLEAR,
}

/** Basic action creators */
export const appInfoUpdate = (payload: AppState["appInfo"]) => ({
  type: ReduxActions.APP_INFO_UPDATE,
  payload,
});
export const appStatusUpdate = (payload: AppState["appStatus"]) => ({
  type: ReduxActions.APP_STATUS_UPDATE,
  payload,
});
export const continentsUpdate = (payload: AppState["continents"]) => ({
  type: ReduxActions.CONTINENTS_UPDATE,
  payload,
});
export const emailsUpdate = (payload: AppState["emails"]) => ({
  type: ReduxActions.EMAILS_UPDATE,
  payload,
});
export const emailsDelete = (payload: AppState["emails"]) => ({
  type: ReduxActions.EMAILS_DELETE,
  payload,
});
export const localeUpdate = (payload: AppState["locale"]) => ({
  type: ReduxActions.LOCALE_UPDATE,
  payload,
});
export const playingUpdate = (payload: AppState["playing"]) => ({
  type: ReduxActions.PLAYING_UPDATE,
  payload,
});
export const profileUpdate = (payload: AppState["profile"]) => ({
  type: ReduxActions.PROFILE_UPDATE,
  payload,
});
export const profilesDelete = (payload: AppState["profiles"]) => ({
  type: ReduxActions.PROFILES_DELETE,
  payload,
});
export const profilesUpdate = (payload: AppState["profiles"]) => ({
  type: ReduxActions.PROFILES_UPDATE,
  payload,
});
export const shortlistUpdate = (payload: AppState["shortlist"]) => ({
  type: ReduxActions.SHORTLIST_UPDATE,
  payload,
});
export const windowDataUpdate = (payload: AppState["windowData"]) => ({
  type: ReduxActions.WINDOW_DATA_UPDATE,
  payload,
});
export const workingUpdate = (payload: AppState["working"]) => ({
  type: ReduxActions.WORKING_UPDATE,
  payload,
});

/** Async: advance calendar */
export function calendarAdvance(days?: number) {
  return async (dispatch: AppDispatch) => {
    dispatch(workingUpdate(true));
    await api.calendar.start(days);
    dispatch(workingUpdate(false));
  };
}

/** Async: start gameplay */
export function play(id: number, spectating?: boolean) {
  return async (dispatch: AppDispatch) => {
    dispatch(playingUpdate(true));
    await Util.sleep(1000);
    await api.play.start(spectating);

    const match = await api.match.find({ where: { id } });

    if (match.status === Constants.MatchStatus.COMPLETED) {
      dispatch(calendarAdvance(1));
    }

    dispatch(playingUpdate(false));
  };
}
export function faceitRoomSet(room: any, matchId?: number) {
  return {
    type: ReduxActions.FACEIT_ROOM_SET,
    payload: { room, matchId },
  };
}

export function faceitRoomClear() {
  return { type: ReduxActions.FACEIT_ROOM_CLEAR };
}

export function faceitMatchCompleted() {
  return { type: ReduxActions.FACEIT_MATCH_COMPLETED };
}

export interface FaceitVetoAction {
  map: string;
  by: "TEAM_A" | "TEAM_B" | "SYSTEM";
  kind: "BAN" | "DECIDER";
}

export const faceitVetoSet = (
  history: Array<{ map: string; by: "TEAM_A" | "TEAM_B" | "SYSTEM"; kind: "BAN" | "DECIDER" }>,
  completed: boolean,
  deciderMap: string | null
) => ({
  type: ReduxActions.FACEIT_VETO_SET,
  payload: { history, completed, deciderMap },
});

export const faceitVetoClear = () => ({
  type: ReduxActions.FACEIT_VETO_CLEAR,
});

export const faceitQueueSet = (startedAt: number, targetSec: number) => ({
  type: ReduxActions.FACEIT_QUEUE_SET,
  payload: { startedAt, targetSec },
});

export const faceitQueueResolving = () => ({
  type: ReduxActions.FACEIT_QUEUE_RESOLVING,
});

export const faceitQueueClear = () => ({
  type: ReduxActions.FACEIT_QUEUE_CLEAR,
});
