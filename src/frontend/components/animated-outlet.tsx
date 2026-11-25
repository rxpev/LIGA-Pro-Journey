/**
 * Freezes the outlet component whenever the route changes
 * in order to properly render route exit transitions.
 *
 * @module
 */
import React from 'react';
import {
  UNSAFE_LocationContext as LocationContext,
  useLocation,
  useOutlet,
} from 'react-router-dom';

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
];

type Page = {
  content: React.ReactNode;
  locationContext: React.ContextType<typeof LocationContext>;
  routeKey: string;
  tab: number;
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
  const locationContext = React.useContext(LocationContext);
  const initialTab = getMainTabIndex(location.pathname);
  const initialPage: Page = {
    content: outlet,
    locationContext,
    routeKey: location.key,
    tab: initialTab,
  };
  const [pages, setPages] = React.useState<Page[]>([initialPage]);
  const [activeTab, setActiveTab] = React.useState(initialTab);
  const activeTabRef = React.useRef(initialTab);
  const [exitingTab, setExitingTab] = React.useState<number | null>(null);
  const [direction, setDirection] = React.useState<'forward' | 'backward' | null>(null);

  React.useLayoutEffect(() => {
    const nextTab = getMainTabIndex(location.pathname);
    const currentTab = activeTabRef.current;
    const nextPage: Page = {
      content: outlet,
      locationContext,
      routeKey: location.key,
      tab: nextTab,
    };

    setPages((current) => {
      const existing = current.find((page) => page.tab === nextTab);

      if (existing?.routeKey === location.key) {
        return current;
      }

      return existing
        ? current.map((page) => (page.tab === nextTab ? nextPage : page))
        : [...current, nextPage];
    });

    // Only animate moves between the primary navigation tabs. Sub-navigation
    // remains instant, so local tabs do not feel like full-page navigation.
    if (currentTab === -1 || nextTab === -1 || currentTab === nextTab) {
      activeTabRef.current = nextTab;
      setActiveTab(nextTab);
      setExitingTab(null);
      setDirection(null);
      return;
    }

    activeTabRef.current = nextTab;
    setExitingTab(currentTab);
    setActiveTab(nextTab);
    setDirection(nextTab > currentTab ? 'forward' : 'backward');
  }, [location.key, location.pathname]);

  const transitionClass = direction ? `route-transition-${direction}` : '';

  return (
    <section className="route-transition-viewport">
      {pages.map((page) => (
        <div
          key={page.tab}
          aria-hidden={page.tab !== activeTab}
          className={`route-transition-page ${
            page.tab === exitingTab
              ? `route-transition-exit ${transitionClass}`
              : page.tab === activeTab && exitingTab !== null
                ? `route-transition-enter ${transitionClass}`
                : ''
          }`}
          style={{
            display: page.tab === activeTab || page.tab === exitingTab ? undefined : 'none',
          }}
          onAnimationEnd={(event) => {
            if (
              page.tab === activeTab &&
              event.target === event.currentTarget &&
              event.animationName.startsWith('main-route-enter')
            ) {
              setExitingTab(null);
              setDirection(null);
            }
          }}
        >
          <LocationContext.Provider value={page.locationContext}>
            {page.content}
          </LocationContext.Provider>
        </div>
      ))}
    </section>
  );
}
