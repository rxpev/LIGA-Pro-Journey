import React from 'react';
import { format as dfFormat, formatRelative as dfFormatRelative } from 'date-fns';
import { enUS } from 'date-fns/locale';
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

export function formatAppRelativeDate(
  value: Dateish,
  dateFormat: Constants.CalendarDateFormat,
  baseDate = new Date(),
  fallback = '-',
) {
  const d = toDate(value);
  if (!d) return fallback;

  const timeFormat = dateFormat === Constants.CalendarDateFormat.US ? 'h:mm a' : 'HH:mm';
  const locale = {
    ...enUS,
    formatRelative: (token: string) => {
      switch (token) {
        case 'lastWeek':
          return `'last' eeee 'at' ${timeFormat}`;
        case 'yesterday':
          return `'yesterday at' ${timeFormat}`;
        case 'today':
          return `'today at' ${timeFormat}`;
        case 'tomorrow':
          return `'tomorrow at' ${timeFormat}`;
        case 'nextWeek':
          return `eeee 'at' ${timeFormat}`;
        default:
          return dateFormat;
      }
    },
  };

  return dfFormatRelative(d, baseDate, { locale });
}

export function getCalendarDateFormat(settings?: string | null) {
  if (!settings) return Constants.Settings.calendar.calendarDateFormat;

  try {
    return Util.loadSettings(settings).calendar.calendarDateFormat;
  } catch {
    return Constants.Settings.calendar.calendarDateFormat;
  }
}

export function useDateFormat() {
  const { state } = React.useContext(AppStateContext);

  return React.useMemo(() => {
    const settings = state.profile?.settings
      ? Util.loadSettings(state.profile.settings)
      : Constants.Settings;

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

export function useFormatAppShortDate() {
  const fmt = useDateFormat();
  const shortFmt = React.useMemo(() => fmt.replace(/\/yyyy$/, ''), [fmt]);

  return React.useCallback(
    (value: Dateish, fallback = '-') => {
      const d = toDate(value);
      if (!d) return fallback;
      return dfFormat(d, shortFmt);
    },
    [shortFmt],
  );
}
