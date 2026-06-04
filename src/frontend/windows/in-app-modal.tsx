/**
 * Hosts the application's modal routes inside the active fullscreen window.
 *
 * @module
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import Routes from '@liga/frontend/routes';
import { Constants } from '@liga/shared';
import { AppStateContext, AppStateProvider } from '@liga/frontend/redux';
import { localeUpdate, profileUpdate, shortlistUpdate } from '@liga/frontend/redux/actions';
import { useAudio, useTheme } from '@liga/frontend/hooks';
import { MemoryRouter, Route, Routes as RouterRoutes } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';

type InAppModalRequest = ModalRequest & {
  inAppModal?: boolean;
};

function ModalStateLoader(props: { children: React.ReactNode }) {
  const { dispatch } = React.useContext(AppStateContext);
  const [loaded, setLoaded] = React.useState(false);

  useTheme();

  React.useEffect(() => {
    api.profiles.current().then((profile) => {
      dispatch(profileUpdate(profile));
      setLoaded(true);
    });
    api.shortlist.all().then((shortlist) => dispatch(shortlistUpdate(shortlist)));
    api.app.locale().then((locale) => dispatch(localeUpdate(locale)));

    const removeProfileListener = api.ipc.on(
      Constants.IPCRoute.PROFILES_CURRENT,
      (profile: Parameters<typeof profileUpdate>[0]) => dispatch(profileUpdate(profile)),
    );
    const removeShortlistListener = api.ipc.on(Constants.IPCRoute.SHORTLIST_UPDATE, () =>
      api.shortlist.all().then((shortlist) => dispatch(shortlistUpdate(shortlist))),
    );

    return () => {
      removeProfileListener();
      removeShortlistListener();
    };
  }, []);

  if (!loaded) {
    return (
      <main className="h-full w-full">
        <section className="center h-full">
          <span className="loading loading-bars" />
        </section>
      </main>
    );
  }

  return props.children;
}

function ModalApplication(props: { request: InAppModalRequest; onClose: () => void }) {
  return (
    <AppStateProvider>
      <ModalStateLoader>
        <ModalContent {...props} />
      </ModalStateLoader>
    </AppStateProvider>
  );
}

function ModalContent(props: { request: InAppModalRequest; onClose: () => void }) {
  const audioHover = useAudio('button-hover.wav');
  const audioClick = useAudio('button-click-inapp.wav');
  const audioRelease = useAudio('button-release.wav');
  const overflowClass = props.request.target === '/settings' ? 'overflow-hidden' : 'overflow-auto';

  React.useEffect(() => {
    const interactiveSelector = [
      'button',
      'a',
      '[role="button"]',
      'input[type="button"]',
      'input[type="submit"]',
      'input[type="checkbox"]',
      'input[type="radio"]',
      'select',
      '.cursor-pointer',
    ].join(',');
    const getInteractiveElement = (target: EventTarget | null) =>
      target instanceof Element ? target.closest<HTMLElement>(interactiveSelector) : null;
    const canPlayInteractionSound = (element: HTMLElement | null) =>
      !!element &&
      element.dataset.interactionSound !== 'none' &&
      !element.matches(':disabled, [aria-disabled="true"], .menu-disabled');
    const onInteractionHover = (event: MouseEvent) => {
      const element = getInteractiveElement(event.target);

      if (
        !canPlayInteractionSound(element) ||
        (event.relatedTarget instanceof Node && element.contains(event.relatedTarget))
      ) {
        return;
      }

      audioHover();
    };
    const onInteractionDown = (event: MouseEvent) => {
      const element = getInteractiveElement(event.target);

      if (event.button !== 0 || !canPlayInteractionSound(element)) {
        return;
      }

      if (element.dataset.interactionSound === 'back') {
        audioRelease();
        return;
      }

      audioClick();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        props.onClose();
      }
    };

    document.addEventListener('mouseover', onInteractionHover);
    document.addEventListener('mousedown', onInteractionDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mouseover', onInteractionHover);
      document.removeEventListener('mousedown', onInteractionDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [audioClick, audioHover, audioRelease, props.onClose]);

  return (
    <dialog className="modal modal-open fixed inset-0 z-[100] h-screen w-screen">
      <section
        className={`modal-box bg-base-100 relative h-[75vh] max-h-none w-1/2 max-w-none ${overflowClass} rounded-lg p-0 shadow-2xl`}
      >
        <FaArrowLeft
          aria-label="Close"
          data-interaction-sound="back"
          className="absolute top-5 right-5 z-[110] size-5 cursor-pointer"
          onClick={props.onClose}
        />
        <div className="h-full w-full [&>main]:!h-full [&>main]:!w-full">
          <MemoryRouter
            initialEntries={[{ pathname: props.request.target, state: props.request.payload }]}
          >
            <RouterRoutes>
              <Route path="/brackets" element={<Routes.Modal.Brackets />} />
              <Route path="/map-pool" element={<Routes.Modal.MapPool />} />
              <Route path="/mods" element={<Routes.Modal.Mods />} />
              <Route path="/play" element={<Routes.Modal.Play />} />
              <Route path="/postgame" element={<Routes.Modal.Postgame />} />
              <Route path="/pregame" element={<Routes.Modal.Pregame />} />
              <Route path="/settings" element={<Routes.Modal.Settings />} />
              <Route path="/transfer" element={<Routes.Modal.Transfer />} />
              <Route path="/user" element={<Routes.Modal.User />} />
              <Route path="/issues/all" element={<Routes.Modal.Issues.All />} />
              <Route path="/issues/comments" element={<Routes.Modal.Issues.Comments />} />
              <Route path="/issues/create" element={<Routes.Modal.Issues.Create />} />
              <Route path="/markdown/changelog" element={<Routes.Modal.Markdown.Changelog />} />
              <Route path="/markdown/csgo.exe" element={<Routes.Modal.Markdown.CSGO />} />
              <Route path="/markdown/whats-new" element={<Routes.Modal.Markdown.WhatsNew />} />
              <Route path="/team/gallery" element={<Routes.Modal.Team.Gallery />} />
            </RouterRoutes>
          </MemoryRouter>
        </div>
      </section>
    </dialog>
  );
}

/**
 * Listens for modal requests and renders them into an independent React root.
 *
 * @component
 */
export default function InAppModal(): React.ReactNode {
  const root = React.useRef<ReactDOM.Root>();
  const container = React.useRef<HTMLDivElement>();

  const close = React.useCallback(() => {
    root.current?.render(null);
  }, []);

  React.useEffect(() => {
    let instance = 0;
    container.current = document.createElement('div');
    container.current.id = 'in-app-modal';
    document.body.appendChild(container.current);
    root.current = ReactDOM.createRoot(container.current);

    const removeSendListener = api.ipc.on(
      Constants.IPCRoute.WINDOW_SEND,
      (data: InAppModalRequest) => {
        if (!data?.inAppModal || !data.target) {
          return;
        }

        root.current?.render(
          <ModalApplication key={`${data.target}:${instance++}`} request={data} onClose={close} />,
        );
      },
    );

    const removeCloseListener = api.ipc.on(
      Constants.IPCRoute.WINDOW_CLOSE,
      (id: Constants.WindowIdentifier) => {
        if (id === Constants.WindowIdentifier.Modal) {
          close();
        }
      },
    );

    return () => {
      removeSendListener();
      removeCloseListener();
      root.current?.unmount();
      container.current?.remove();
    };
  }, [close]);

  return null;
}
