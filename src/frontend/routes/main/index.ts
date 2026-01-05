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
import Teams from './teams';
import Faceit from "./faceit/faceit";

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
  Faceit,

  // composite routes
  Competitions,
  Teams,
};
