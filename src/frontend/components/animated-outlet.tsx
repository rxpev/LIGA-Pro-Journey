/**
 * Freezes the outlet component whenever the route changes
 * in order to properly render route exit transitions.
 *
 * @module
 */
import React from 'react';
import { useLocation, useOutlet } from 'react-router-dom';

const MAIN_TAB_PATHS = [
  '/',
  '/news',
  '/faceit',
  '/squad',
  '/stats',
  '/teams',
  '/competitions',
  '/calendar',
  '/inbox',
  '/players',
];

type Page = {
  content: React.ReactNode;
  path: string;
};

function getMainTabIndex(path: string) {
  return MAIN_TAB_PATHS.findIndex(
    (tabPath) => path === tabPath || (tabPath !== '/' && path.startsWith(`${tabPath}/`)),
  );
}

/**
 * Exports this module.
 *
 * @exports
 */
export default function AnimatedOutlet() {
  const outlet = useOutlet();
  const location = useLocation();
  const [activePage, setActivePage] = React.useState<Page>({
    content: outlet,
    path: location.pathname,
  });
  const [exitingPage, setExitingPage] = React.useState<Page | null>(null);
  const [direction, setDirection] = React.useState<'forward' | 'backward' | null>(null);

  React.useLayoutEffect(() => {
    if (activePage.path === location.pathname) {
      return;
    }

    const currentTab = getMainTabIndex(activePage.path);
    const nextTab = getMainTabIndex(location.pathname);
    const nextPage = { content: outlet, path: location.pathname };

    // Only animate moves between the primary navigation tabs. Sub-navigation
    // remains instant, so local tabs do not feel like full-page navigation.
    if (currentTab === -1 || nextTab === -1 || currentTab === nextTab) {
      setActivePage(nextPage);
      setExitingPage(null);
      setDirection(null);
      return;
    }

    setExitingPage(activePage);
    setActivePage(nextPage);
    setDirection(nextTab > currentTab ? 'forward' : 'backward');
  }, [activePage, location.pathname, outlet]);

  const transitionClass = direction ? `route-transition-${direction}` : '';

  return (
    <section className="route-transition-viewport">
      {exitingPage && (
        <div
          aria-hidden="true"
          className={`route-transition-page route-transition-exit ${transitionClass}`}
        >
          {exitingPage.content}
        </div>
      )}
      <div
        className={`route-transition-page ${
          exitingPage ? `route-transition-enter ${transitionClass}` : ''
        }`}
        onAnimationEnd={(event) => {
          if (
            event.target === event.currentTarget &&
            event.animationName.startsWith('main-route-enter')
          ) {
            setExitingPage(null);
            setDirection(null);
          }
        }}
      >
        {activePage.content}
      </div>
    </section>
  );
}
