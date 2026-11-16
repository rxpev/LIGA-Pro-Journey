import React from 'react';
import { FaExchangeAlt } from 'react-icons/fa';
import { Constants } from '@liga/shared';
import { Pagination } from '@liga/frontend/components';
import {
  describeTransferEvent,
  loadTransferEvents,
  type TransferEvent,
} from '@liga/frontend/lib/transfer-events';
import { useFormatAppDate } from '@liga/frontend/hooks/use-FormatAppDate';

const PAGE_SIZE = 10;
export default function TransferHistory() {
  const formatDate = useFormatAppDate();
  const [page, setPage] = React.useState(1);
  const [events, setEvents] = React.useState<TransferEvent[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    loadTransferEvents().then((items) => {
      if (!active) return;
      setEvents(items);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const pages = Math.max(1, Math.ceil(events.length / PAGE_SIZE));
  const items = events.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const changePage = (next: number) => {
    const bounded = Math.min(pages, Math.max(1, next));
    setPage(bounded);
  };

  return (
    <main className="flex h-full min-h-0 w-full flex-col">
      <header className="border-base-content/10 bg-base-200 flex shrink-0 items-center gap-3 border-b px-5 py-4">
        <FaExchangeAlt className="text-base-content/60" aria-hidden="true" />
        <div>
          <h1 className="text-lg font-bold">Transfer history</h1>
          <p className="text-base-content/55 text-xs">
            Transfers and roster moves across all teams
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="grid h-full place-items-center">
            <span className="loading loading-bars" />
          </div>
        ) : !items.length ? (
          <p className="text-base-content/55 grid h-full place-items-center text-sm">
            No transfers yet
          </p>
        ) : (
          <ul className="border-base-content/10 bg-base-200/70 overflow-hidden rounded border">
            {items.map((event) => {
              const from = event.from;
              const to = event.to;
              return (
                <li
                  key={event.id}
                  className="border-base-content/10 grid min-h-16 grid-cols-[2.75rem_3rem_1rem_3rem_minmax(0,1fr)_6.5rem] items-center gap-2 border-b px-3 last:border-b-0"
                >
                  <button
                    type="button"
                    className="bg-base-300 grid size-10 place-items-center overflow-hidden rounded-full"
                    title={`View ${event.player.name}`}
                    onClick={() =>
                      api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
                        target: '/transfer',
                        payload: event.player.id,
                      })
                    }
                  >
                    <img
                      src={event.player.avatar || 'resources://avatars/empty.png'}
                      alt=""
                      className="size-full object-cover object-top"
                    />
                  </button>
                  <span className="relative grid size-10 place-items-center">
                    <img
                      src={from?.blazon || 'resources://blazonry/noteam.svg'}
                      title={from?.name || 'No Team'}
                      alt=""
                      className="size-10 object-contain"
                    />
                    {event.fromBenched && (
                      <small className="bg-base-300 absolute right-0 bottom-0 px-0.5 text-[7px] font-bold">
                        BENCH
                      </small>
                    )}
                  </span>
                  <span className="text-base-content/55 text-center">→</span>
                  <span className="relative grid size-10 place-items-center">
                    <img
                      src={to?.blazon || 'resources://blazonry/noteam.svg'}
                      title={to?.name || 'No Team'}
                      alt=""
                      className="size-10 object-contain"
                    />
                    {event.toBenched && (
                      <small className="bg-base-300 absolute right-0 bottom-0 px-0.5 text-[7px] font-bold">
                        BENCH
                      </small>
                    )}
                  </span>
                  <p className="min-w-0 truncate text-sm">
                    <b>{event.player.name}</b>{' '}
                    <span className="text-base-content/65">{describeTransferEvent(event)}</span>
                  </p>
                  <time className="text-base-content/55 text-right text-xs">
                    {formatDate(event.date)}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="border-base-content/10 bg-base-200 flex shrink-0 items-center border-t px-3 py-2 text-sm">
        <Pagination numPage={page} totalPages={pages} onChange={changePage} onClick={changePage} />
      </footer>
    </main>
  );
}
