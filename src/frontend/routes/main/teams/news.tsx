import React from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { cx } from '@liga/frontend/lib';
import { useFormatAppShortDate } from '@liga/frontend/hooks';
import { FaBolt, FaClock, FaNewspaper } from 'react-icons/fa';

type NewsItem = Awaited<ReturnType<typeof api.news.all>>[number];

function parsePayload(item: NewsItem) {
  try {
    return item.payload ? (JSON.parse(item.payload) as Record<string, unknown>) : {};
  } catch (_) {
    return {};
  }
}

function isRelated(item: NewsItem, teamId: number) {
  const teams = parsePayload(item).relatedTeams;
  return (
    Array.isArray(teams) &&
    teams.some(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        Number((entry as { id?: unknown }).id) === teamId,
    )
  );
}

function getFlagCode(item: NewsItem) {
  const flagCode = parsePayload(item).flagCode;
  return typeof flagCode === 'string' ? flagCode : null;
}

export default function TeamNews() {
  const navigate = useNavigate();
  const fmtShortDate = useFormatAppShortDate();
  const { team } = useOutletContext<RouteContextTeams>();
  const [items, setItems] = React.useState<NewsItem[]>([]);

  React.useEffect(() => {
    api.news.all().then((news) => setItems(news.filter((item) => isRelated(item, team.id))));
  }, [team.id]);

  const groupedItems = React.useMemo(() => {
    return items.reduce<Record<string, NewsItem[]>>((groups, item) => {
      const year = new Date(item.publishedAt).getFullYear().toString();
      (groups[year] ||= []).push(item);
      return groups;
    }, {});
  }, [items]);

  return (
    <section className="p-3">
      <h2 className="px-2 py-2 text-xs font-bold text-[#9aa8b5]">
        News posts mentioning {team.name}
      </h2>
      {!items.length && <p className="text-muted p-6 text-center">No related stories yet.</p>}
      {Object.entries(groupedItems)
        .sort(([a], [b]) => Number(b) - Number(a))
        .map(([year, yearItems]) => (
          <section key={year} className="mb-4">
            <p className="px-2 py-2 text-sm leading-tight font-bold text-[#9aa8b5]">
              News posts from {year}
            </p>
            <div className="space-y-px">
              {yearItems.map((item) => (
                <article
                  key={item.id}
                  className="bg-base-content/10 hover:bg-base-content/15 flex min-h-10 cursor-pointer items-center gap-3 px-3 py-2"
                  onClick={() => navigate('/news', { state: { articleId: item.id } })}
                >
                  <span className="badge badge-sm shrink-0 border border-[#526a83] bg-[#40566e] text-[#d8e5f1]">
                    {fmtShortDate(item.publishedAt)}
                  </span>
                  {getFlagCode(item) ? (
                    <span className={cx('fp shrink-0', getFlagCode(item)!.toLowerCase())} />
                  ) : (
                    <span className="text-muted shrink-0">
                      {item.type === 'SHORT' ? <FaBolt /> : <FaNewspaper />}
                    </span>
                  )}
                  <span className="truncate text-sm font-semibold text-[#9aa8b5]">
                    {item.headline}
                  </span>
                </article>
              ))}
            </div>
          </section>
        ))}
    </section>
  );
}
