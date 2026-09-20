/** Conversation-style inbox. */
import React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { format } from 'date-fns';
import { Dedent } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { AppStateContext } from '@liga/frontend/redux';
import { emailsUpdate } from '@liga/frontend/redux/actions';
import { useFormatAppDate } from '@liga/frontend/hooks/use-FormatAppDate';
import { Link } from 'react-router-dom';
import {
  FaArchive,
  FaArrowRight,
  FaBoxOpen,
  FaEnvelope,
  FaEnvelopeOpen,
  FaFilter,
  FaInfoCircle,
  FaSearch,
  FaUsers,
} from 'react-icons/fa';

const emptyAvatar = 'resources://avatars/empty.png';

function getSenderAvatar(name: string) {
  return `resources://coaches/${name === 'T.c' ? 'tc' : name}.png`;
}

function useEmptyAvatar(event: React.SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.onerror = null;
  event.currentTarget.src = emptyAvatar;
}

const isTerminal = (value: string) => /^(accepted|rejected|expired)\b/i.test(value.trimStart());

function preview(value: string) {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/[*#_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function latestDialogueContent(dialogues: Array<{ id: number; content: string }>) {
  return dialogues.reduce(
    (latest, dialogue) => (dialogue.id > latest.id ? dialogue : latest),
    dialogues[0],
  )?.content;
}

export default function Inbox() {
  const fmtDate = useFormatAppDate();
  const { state, dispatch } = React.useContext(AppStateContext);
  const [selected, setSelected] = React.useState<number | null>(null);
  const [search, setSearch] = React.useState('');
  const [folder, setFolder] = React.useState<'all' | 'archived'>('all');
  const [archivedIds, setArchivedIds] = React.useState<number[]>([]);
  const [archiveStorageKey, setArchiveStorageKey] = React.useState<string | null>(null);
  const [archiveHydrated, setArchiveHydrated] = React.useState(false);
  const [working, setWorking] = React.useState(false);
  const [guideStorageKey, setGuideStorageKey] = React.useState<string | null>(null);
  const [guideDismissed, setGuideDismissed] = React.useState(false);
  const restoredRequestForEmail = React.useRef<number | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    api.database.current().then((saveId) => {
      if (cancelled) return;
      const key = `inbox-save-${saveId}:archived-chats`;
      setArchiveStorageKey(key);
      try {
        const stored = JSON.parse(localStorage.getItem(key) || '[]');
        setArchivedIds(Array.isArray(stored) ? stored.filter(Number.isInteger) : []);
      } catch {
        setArchivedIds([]);
      } finally {
        setArchiveHydrated(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!archiveHydrated || !archiveStorageKey) return;
    localStorage.setItem(archiveStorageKey, JSON.stringify(archivedIds));
  }, [archivedIds, archiveHydrated, archiveStorageKey]);

  const folderEmails = state.emails.filter((email) =>
    folder === 'archived' ? archivedIds.includes(email.id) : !archivedIds.includes(email.id),
  );
  const archivedEmailCount = state.emails.filter((email) => archivedIds.includes(email.id)).length;
  const normalizedSearch = search.trim().toLowerCase();
  const visible = folderEmails.filter(
    (email) =>
      !normalizedSearch ||
      `${email.from.name} ${email.subject} ${email.dialogues.map((dialogue) => dialogue.content).join(' ')}`
        .toLowerCase()
        .includes(normalizedSearch),
  );

  React.useEffect(() => {
    if (selected == null && visible.length) {
      setSelected(visible[0].id);
      return;
    }

    if (selected != null && !visible.some((email) => email.id === selected)) {
      setSelected(visible[0]?.id ?? null);
    }
  }, [visible, selected]);

  const active = visible.find((email) => email.id === selected) ?? null;

  React.useEffect(() => {
    if (!active || active.read) return;
    api.emails
      .updateMany({ where: { id: { in: [active.id] } }, data: { read: true } })
      .then((emails) => dispatch(emailsUpdate(emails)));
  }, [active?.id]);

  const dialogues = active ? [...active.dialogues].sort((a, b) => a.id - b.id) : [];
  const threadClosed = dialogues.some((dialogue) => isTerminal(dialogue.content));
  const isFaceitOpeningChat = active?.subject.startsWith('FACEIT friend request from ') ?? false;
  const hasPlayerReply = active
    ? dialogues.some((dialogue) => dialogue.fromId !== active.fromId)
    : false;
  const acceptedFaceitInvite = active
    ? dialogues.some(
        (dialogue) =>
          dialogue.fromId !== active.fromId && dialogue.content.trim() === "Sure! I'll add you.",
      )
    : false;
  const playerAvatar = state.profile?.player?.avatar || emptyAvatar;

  const persistIncomingFaceitRequest = React.useCallback(async (recommendation: any | null) => {
    const saveId = await api.database.current();
    const key = `faceit-save-${saveId}:opening-friend-request`;
    const resolvedKey = `faceit-save-${saveId}:opening-friend-request-resolved`;
    if (recommendation) {
      if (localStorage.getItem(resolvedKey) === String(recommendation.id)) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify(recommendation));
      }
    } else {
      localStorage.removeItem(key);
    }
  }, []);

  React.useEffect(() => {
    if (!active || !acceptedFaceitInvite || restoredRequestForEmail.current === active.id) return;
    restoredRequestForEmail.current = active.id;
    api.emails
      .replyFaceitOpening('accept')
      .then((result) => persistIncomingFaceitRequest(result.recommendation))
      .catch(() => {
        restoredRequestForEmail.current = null;
      });
  }, [active?.id, acceptedFaceitInvite, persistIncomingFaceitRequest]);

  React.useEffect(() => {
    let cancelled = false;
    setGuideStorageKey(null);
    setGuideDismissed(false);
    if (!active || !acceptedFaceitInvite) return;

    api.database.current().then((saveId) => {
      if (cancelled) return;
      const key = `faceit-save-${saveId}:opening-friend-guide-opened:${active.id}`;
      setGuideStorageKey(key);
      setGuideDismissed(localStorage.getItem(key) === 'true');
    });

    return () => {
      cancelled = true;
    };
  }, [active?.id, acceptedFaceitInvite]);

  const respondToFaceitInvite = (choice: 'accept' | 'decline') => {
    setWorking(true);
    api.emails
      .replyFaceitOpening(choice)
      .then(async (result) => {
        dispatch(emailsUpdate([result.email]));
        await persistIncomingFaceitRequest(result.recommendation);
      })
      .finally(() => setWorking(false));
  };

  const toggleArchive = (emailId: number) => {
    setArchivedIds((current) =>
      current.includes(emailId)
        ? current.filter((archivedId) => archivedId !== emailId)
        : [...current, emailId],
    );
    setSelected(null);
  };

  return (
    <div id="inbox" className="inbox-dashboard">
      <main className="inbox-content">
        <aside className="inbox-conversations">
          <div className="inbox-conversations-toolbar">
            <header className="inbox-conversations-title">
              <h2>Chats</h2>
              <button type="button" className="inbox-new-message">
                New Message
              </button>
            </header>
            <div className="inbox-search-row">
              <label className="inbox-search">
                <FaSearch />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search conversations..."
                  aria-label="Search conversations"
                />
              </label>
              <button type="button" className="inbox-filter-button" aria-label="Filter chats">
                <FaFilter />
              </button>
            </div>
            <div className="inbox-chat-folders">
              <button
                type="button"
                className={cx('inbox-chats-nav', folder === 'all' && 'is-active')}
                aria-current={folder === 'all' ? 'page' : undefined}
                onClick={() => setFolder('all')}
              >
                <FaEnvelope />
                <span>All Messages</span>
                <strong>{state.emails.length - archivedEmailCount}</strong>
              </button>
              <div className="inbox-chats-nav is-static">
                <FaUsers />
                <span>Team Invites</span>
                <strong>0</strong>
              </div>
              <button
                type="button"
                className={cx('inbox-chats-nav', folder === 'archived' && 'is-active')}
                aria-current={folder === 'archived' ? 'page' : undefined}
                onClick={() => setFolder('archived')}
              >
                <FaArchive />
                <span>Archived</span>
                {archivedEmailCount > 0 && <strong>{archivedEmailCount}</strong>}
              </button>
              <div className="inbox-folder-divider" aria-hidden="true" />
            </div>
          </div>
          <section className="inbox-list" aria-label="Conversations">
            {!visible.length && (
              <div className="inbox-empty">
                {search
                  ? 'No matching conversations.'
                  : folder === 'archived'
                    ? 'No archived chats.'
                    : 'Currently no messages.'}
              </div>
            )}
            {visible.map((email) => (
              <div
                key={email.id}
                role="button"
                tabIndex={0}
                className={cx(
                  'inbox-list-item',
                  selected === email.id && 'is-selected',
                  !email.read && 'is-unread',
                )}
                onClick={() => setSelected(email.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelected(email.id);
                  }
                }}
              >
                <span className="inbox-avatar-wrap">
                  <img
                    src={getSenderAvatar(email.from.name)}
                    alt=""
                    className="inbox-avatar"
                    onError={useEmptyAvatar}
                  />
                  {!email.read && <span className="inbox-unread-dot" aria-label="Unread" />}
                </span>
                <span className="inbox-list-copy">
                  <span className="inbox-list-heading">
                    <strong>{email.from.name}</strong>
                    <time>{fmtDate(email.sentAt)}</time>
                  </span>
                  <span className="inbox-preview">
                    {preview(latestDialogueContent(email.dialogues) || '')}
                  </span>
                </span>
                {folder === 'archived' && (
                  <button
                    type="button"
                    className="inbox-list-archive-action"
                    title="Unarchive chat"
                    aria-label={`Unarchive chat with ${email.from.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleArchive(email.id);
                    }}
                  >
                    <FaBoxOpen />
                  </button>
                )}
              </div>
            ))}
          </section>
        </aside>

        <section className="inbox-detail">
          {!active && (
            <div className="inbox-empty inbox-detail-empty">
              <FaEnvelopeOpen />
              Currently no messages.
            </div>
          )}
          {active && (
            <div className="inbox-chat">
              <header className="inbox-chat-header">
                <img src={getSenderAvatar(active.from.name)} alt="" onError={useEmptyAvatar} />
                <div>
                  <h2>{active.from.name}</h2>
                </div>
                <button
                  type="button"
                  className="inbox-archive-button"
                  onClick={() => toggleArchive(active.id)}
                  title={folder === 'archived' ? 'Unarchive chat' : 'Archive chat'}
                  aria-label={folder === 'archived' ? 'Unarchive chat' : 'Archive chat'}
                >
                  {folder === 'archived' ? <FaBoxOpen /> : <FaArchive />}
                </button>
              </header>

              <div className="inbox-thread">
                {dialogues.map((dialogue, index) => {
                  const dialogueDate = new Date(dialogue.sentAt);
                  const previousDate = index > 0 ? new Date(dialogues[index - 1].sentAt) : null;
                  const showDateDivider =
                    index === 0 ||
                    !previousDate ||
                    format(dialogueDate, 'yyyy-MM-dd') !== format(previousDate, 'yyyy-MM-dd');

                  if (isTerminal(dialogue.content)) {
                    return (
                      <React.Fragment key={dialogue.id}>
                        {showDateDivider && (
                          <div className="inbox-date-divider">
                            <span>{format(dialogueDate, 'MMMM d, yyyy')}</span>
                          </div>
                        )}
                        <div className="inbox-thread-status">
                          <FaInfoCircle />
                          {dialogue.content}
                        </div>
                      </React.Fragment>
                    );
                  }

                  const fromPlayer = dialogue.fromId !== active.fromId;
                  return (
                    <React.Fragment key={dialogue.id}>
                      {showDateDivider && (
                        <div className="inbox-date-divider">
                          <span>{format(dialogueDate, 'MMMM d, yyyy')}</span>
                        </div>
                      )}
                      <div className={cx('inbox-chat-row', fromPlayer && 'is-player')}>
                        {!fromPlayer && (
                          <img
                            src={getSenderAvatar(active.from.name)}
                            alt=""
                            className="inbox-chat-avatar"
                            onError={useEmptyAvatar}
                          />
                        )}
                        <div className="inbox-chat-message-wrap">
                          <span className="inbox-chat-author">
                            {fromPlayer ? state.profile?.name : active.from.name}
                          </span>
                          <article className="inbox-message">
                            <ReactMarkdown
                              rehypePlugins={
                                [rehypeRaw] as Parameters<
                                  typeof ReactMarkdown
                                >[number]['remarkPlugins']
                              }
                              components={{
                                button(props) {
                                  const { node, children, ...rest } = props;
                                  return (
                                    <button
                                      {...rest}
                                      disabled={threadClosed || dialogue.completed || working}
                                      onClick={() => {
                                        setWorking(true);
                                        api.ipc
                                          .invoke(
                                            node.properties.dataIpcRoute as string,
                                            node.properties.dataPayload,
                                          )
                                          .then(() =>
                                            api.emails.updateDialogue({
                                              where: { id: dialogue.id },
                                              data: { completed: true },
                                            }),
                                          )
                                          .then((data) => dispatch(emailsUpdate([data])))
                                          .finally(() => setWorking(false));
                                      }}
                                    >
                                      {children}
                                    </button>
                                  );
                                },
                              }}
                            >
                              {Dedent.dedent(dialogue.content)}
                            </ReactMarkdown>
                          </article>
                          <time>{fmtDate(dialogue.sentAt)}</time>
                        </div>
                        {fromPlayer && (
                          <img
                            src={playerAvatar}
                            alt=""
                            className="inbox-chat-avatar"
                            onError={useEmptyAvatar}
                          />
                        )}
                      </div>
                    </React.Fragment>
                  );
                })}
                {threadClosed && (
                  <div className="inbox-closed-note">
                    <FaInfoCircle />
                    This conversation is closed. No further action is required.
                  </div>
                )}
                {isFaceitOpeningChat && !hasPlayerReply && !threadClosed && (
                  <div className="inbox-reply-actions">
                    <button
                      className="btn btn-primary"
                      disabled={working}
                      onClick={() => respondToFaceitInvite('accept')}
                    >
                      Sure!
                    </button>
                    <button
                      className="btn btn-ghost"
                      disabled={working}
                      onClick={() => respondToFaceitInvite('decline')}
                    >
                      No thank you.
                    </button>
                  </div>
                )}
                {isFaceitOpeningChat &&
                  acceptedFaceitInvite &&
                  guideStorageKey &&
                  !guideDismissed && (
                    <Link
                      to="/faceit"
                      state={{ openIncomingFriendRequest: true, skipFaceitLoadingAnimation: true }}
                      className="inbox-faceit-guide"
                      onClick={() => {
                        localStorage.setItem(guideStorageKey, 'true');
                        setGuideDismissed(true);
                      }}
                    >
                      <span className="inbox-faceit-guide-copy">
                        <strong>Friend request waiting</strong>
                        <small>Open FACEIT to respond</small>
                      </span>
                      <span className="inbox-faceit-guide-icon">
                        <FaArrowRight />
                      </span>
                    </Link>
                  )}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
