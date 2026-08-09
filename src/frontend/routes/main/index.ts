/**
 * Provides the route components for the Main Browser Window.
 *
 * @module
 */
import Calendar from './calendar';
import Competitions from './competitions';
import Dashboard from './dashboard';
import Inbox from './inbox';
import Players from './players';
import Squad from './squad';
import Stats from './stats';
import Teams from './teams';
import Faceit from './faceit/faceit';
import FaceitDetailedStatistics from './faceit/detailed-statistics';
import FaceitRankings from './faceit/rankings';
import News from './news';

/**
 * Exports this module.
 *
 * @exports
 */
export default {
  // standalone routes
  Calendar,
  Dashboard,
  Inbox,
  Players,
  Squad,
  Stats,
  Faceit,
  FaceitDetailedStatistics,
  FaceitRankings,
  News,

  // composite routes
  Competitions,
  Teams,
};
