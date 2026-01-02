import React from 'react';
import { format as dfFormat } from 'date-fns';
import { Constants, Util } from '@liga/shared';
import { AppStateContext } from '@liga/frontend/redux';

type Dateish = Date | number | string | null | undefined;

function toDate(value: Dateish) {
  // treat unset values as "no date"
  if (value === null || value === undefined || value === '') return null;

  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  if (d.getTime() === 0) return null;

  return d;
}

export function useDateFormat() {
  const { state } = React.useContext(AppStateContext);

  return React.useMemo(() => {
    const settings = Util.loadSettings(state.profile?.settings);
    return (
      settings.calendar.calendarDateFormat ??
      Constants.Settings.calendar.calendarDateFormat
    );
  }, [state.profile?.settings]);
}

export function useFormatAppDate() {
  const fmt = useDateFormat();

  return React.useCallback(
    (value: Dateish, fallback = '-') => {
      const d = toDate(value);
      if (!d) return fallback;
      return dfFormat(d, fmt);
    },
    [fmt],
  );
}
