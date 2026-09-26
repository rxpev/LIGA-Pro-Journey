/** Conversation-style inbox. */
import React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { format } from 'date-fns';
import { Constants, Dedent } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { AppStateContext } from '@liga/frontend/redux';
import { emailsUpdate } from '@liga/frontend/redux/actions';
import { useFormatAppDate } from '@liga/frontend/hooks/use-FormatAppDate';
import { Link, useLocation } from 'react-router-dom';
import {
  FaArchive,
  FaArrowRight,
  FaBoxOpen,
  FaChevronRight,
  FaEnvelope,
  FaEnvelopeOpen,
  FaFileAlt,
  FaFilter,
  FaInfoCircle,
  FaPaperclip,
  FaSearch,
  FaUsers,
} from 'react-icons/fa';

const emptyAvatar = 'resources://avatars/empty.png';

function getSenderAvatar(name: string) {
  return `resources://coaches/${name === 'T.c' ? 'tc' : name}.png`;
}

function getCoachTitle(role: string) {
  if (role === 'Manager') return 'Head Coach';
  if (role === 'Assistant Manager') return 'Assistant Coach';
  return role;
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
  const location = useLocation();
  const fmtDate = useFormatAppDate();
  const { state, dispatch } = React.useContext(AppStateContext);
  const [selected, setSelected] = React.useState<number | null>(null);
  const [search, setSearch] = React.useState('');
  const [folder, setFolder] = React.useState<'all' | 'archived'>('all');
  const [archivedIds, setArchivedIds] = React.useState<number[]>([]);
  const [archiveStorageKey, setArchiveStorageKey] = React.useState<string | null>(null);
  const [archiveHydrated, setArchiveHydrated] = React.useState(false);
  const [working, setWorking] = React.useState(false);
  const [trialReplyTyping, setTrialReplyTyping] = React.useState(false);
  const [readTrialTransfers, setReadTrialTransfers] = React.useState<Set<number>>(new Set());
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

  const conversations = React.useMemo(() => {
    const emailsBySender = new Map<number, typeof state.emails>();

    state.emails.forEach((email) => {
      const senderEmails = emailsBySender.get(email.fromId) ?? [];
      senderEmails.push(email);
      emailsBySender.set(email.fromId, senderEmails);
    });

    return [...emailsBySender.values()]
      .map((emails) => {
        const sortedEmails = [...emails].sort(
          (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
        );
        const latestEmail = sortedEmails[sortedEmails.length - 1];
        return {
          ...latestEmail,
          dialogues: sortedEmails
            .flatMap((email) => email.dialogues)
            .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()),
          emails: sortedEmails,
          emailIds: sortedEmails.map((email) => email.id),
          read: sortedEmails.every((email) => email.read),
          archived: sortedEmails.every((email) => archivedIds.includes(email.id)),
        };
      })
      .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
  }, [state.emails, archivedIds]);

  const folderConversations = conversations.filter((conversation) =>
    folder === 'archived' ? conversation.archived : !conversation.archived,
  );
  const archivedConversationCount = conversations.filter(
    (conversation) => conversation.archived,
  ).length;
  const normalizedSearch = search.trim().toLowerCase();
  const visible = folderConversations.filter(
    (conversation) =>
      !normalizedSearch ||
      `${conversation.from.name} ${conversation.emails.map((email) => email.subject).join(' ')} ${conversation.dialogues.map((dialogue) => dialogue.content).join(' ')}`
        .toLowerCase()
        .includes(normalizedSearch),
  );

  React.useEffect(() => {
    if (selected == null && visible.length) {
      setSelected(visible[0].fromId);
      return;
    }

    if (selected != null && !visible.some((conversation) => conversation.fromId === selected)) {
      setSelected(visible[0]?.fromId ?? null);
    }
  }, [visible, selected]);

  const active = visible.find((conversation) => conversation.fromId === selected) ?? null;

  React.useEffect(() => {
    const read = (location.state as any)?.trialInformationRead;
    if (!read?.transferId) return;
    setReadTrialTransfers((current) => new Set(current).add(Number(read.transferId)));
    const email = state.emails.find((item) => item.id === Number(read.emailId));
    if (email) setSelected(email.fromId);
  }, [location.state, state.emails]);

  React.useEffect(() => {
    if (!active || active.read) return;
    api.emails
      .updateMany({ where: { id: { in: active.emailIds } }, data: { read: true } })
      .then((emails) => dispatch(emailsUpdate(emails)));
  }, [active?.fromId, active?.read]);

  const dialogues = active?.dialogues ?? [];
  const activeEmailDialogues = active?.emails[active.emails.length - 1]?.dialogues ?? [];
  const threadClosed = activeEmailDialogues.some((dialogue) => isTerminal(dialogue.content));
  const closedEmailIds = new Set(
    active?.emails
      .filter((email) => email.dialogues.some((dialogue) => isTerminal(dialogue.content)))
      .map((email) => email.id) ?? [],
  );
  const isFaceitOpeningChat = active?.subject.startsWith('FACEIT friend request from ') ?? false;
  const isTrialChat =
    active?.emails.some((email) => email.subject.startsWith('Trial Offer')) ?? false;
  const trialTransferId = Number(
    dialogues
      .map((dialogue) => dialogue.content.match(/data-transfer-id="(\d+)"/)?.[1])
      .find(Boolean) ?? 0,
  );
  const isTrialExpired =
    active?.emails.some((email) => email.subject.startsWith('Trial Offer Expired')) ?? false;
  const hasPlayerReply = active
    ? active.dialogues.some((dialogue) => dialogue.fromId !== active.fromId)
    : false;
  const acceptedFaceitInvite = active
    ? activeEmailDialogues.some(
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

  const respondToTrial = (choice: 'accept' | 'reject') => {
    if (!active || !trialTransferId) return;
    setWorking(true);
    setTrialReplyTyping(true);
    api.emails
      .replyTrial(active.id, trialTransferId, choice)
      .then(async (email) => {
        const coachDialogueId = Math.max(...email.dialogues.map((dialogue) => dialogue.id));
        const playerResponseEmail = {
          ...email,
          dialogues: email.dialogues.filter((dialogue) => dialogue.id !== coachDialogueId),
        };
        dispatch(emailsUpdate([playerResponseEmail]));
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        dispatch(emailsUpdate([email]));
      })
      .finally(() => {
        setWorking(false);
        setTrialReplyTyping(false);
      });
  };

  const toggleArchive = (emailIds: number[]) => {
    setArchivedIds((current) => {
      const shouldUnarchive = emailIds.every((emailId) => current.includes(emailId));
      return shouldUnarchive
        ? current.filter((archivedId) => !emailIds.includes(archivedId))
        : [...new Set([...current, ...emailIds])];
    });
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
                <strong>{conversations.length - archivedConversationCount}</strong>
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
                {archivedConversationCount > 0 && <strong>{archivedConversationCount}</strong>}
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
                key={email.fromId}
                role="button"
                tabIndex={0}
                className={cx(
                  'inbox-list-item',
                  selected === email.fromId && 'is-selected',
                  !email.read && 'is-unread',
                )}
                onClick={() => setSelected(email.fromId)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelected(email.fromId);
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
                      toggleArchive(email.emailIds);
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
            <div className="inbox-detail-layout">
              <div className="inbox-chat">
                <header className="inbox-chat-header">
                  <img src={getSenderAvatar(active.from.name)} alt="" onError={useEmptyAvatar} />
                  <div>
                    <h2>{active.from.name}</h2>
                  </div>
                  <button
                    type="button"
                    className="inbox-archive-button"
                    onClick={() => toggleArchive(active.emailIds)}
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
                                    const isTrialInformation =
                                      node.properties.dataTrialInformation === 'true';
                                    return (
                                      <button
                                        {...rest}
                                        disabled={
                                          closedEmailIds.has(dialogue.emailId) ||
                                          dialogue.completed ||
                                          working ||
                                          (isTrialInformation && isTrialExpired)
                                        }
                                        onClick={() => {
                                          if (isTrialInformation) {
                                            const rawBlazon = node.properties.dataTeamBlazon;
                                            api.window.send<ModalRequest>(
                                              Constants.WindowIdentifier.Modal,
                                              {
                                                target: '/trial-contract',
                                                payload: {
                                                  emailId: dialogue.emailId,
                                                  transferId: Number(
                                                    node.properties.dataTransferId,
                                                  ),
                                                  teamName: String(node.properties.dataTeamName),
                                                  teamBlazon:
                                                    rawBlazon && rawBlazon !== 'null'
                                                      ? String(rawBlazon)
                                                      : null,
                                                  series: Number(node.properties.dataSeries),
                                                  goalType: String(node.properties.dataGoalType),
                                                  goalValue: Number(node.properties.dataGoalValue),
                                                  replacedPlayer: String(
                                                    node.properties.dataReplacedPlayer,
                                                  ),
                                                  coachName: active.from.name,
                                                  coachSignatureFont: active.from.signatureFont,
                                                },
                                              },
                                              0,
                                            );
                                            return;
                                          }
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
                                        {isTrialInformation && (
                                          <span
                                            className="trial-attachment-symbol"
                                            aria-hidden="true"
                                          >
                                            <FaFileAlt />
                                            <FaPaperclip />
                                          </span>
                                        )}
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
                  {trialReplyTyping && (
                    <div className="inbox-chat-row">
                      <img
                        src={active?.from ? getSenderAvatar(active.from.name) : emptyAvatar}
                        alt=""
                        className="inbox-chat-avatar"
                        onError={useEmptyAvatar}
                      />
                      <div className="inbox-chat-message-wrap">
                        <span className="inbox-chat-author">{active?.from.name}</span>
                        <div className="inbox-typing" aria-label="Coach is typing">
                          <i />
                          <i />
                          <i />
                        </div>
                      </div>
                    </div>
                  )}
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
                  {isTrialChat &&
                    trialTransferId > 0 &&
                    readTrialTransfers.has(trialTransferId) &&
                    !hasPlayerReply &&
                    !trialReplyTyping &&
                    !isTrialExpired &&
                    !threadClosed && (
                      <div className="inbox-reply-actions">
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={working}
                          onClick={() => respondToTrial('accept')}
                        >
                          Accept Trial
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={working}
                          onClick={() => respondToTrial('reject')}
                        >
                          Reject Trial
                        </button>
                      </div>
                    )}
                  {isFaceitOpeningChat &&
                    acceptedFaceitInvite &&
                    guideStorageKey &&
                    !guideDismissed && (
                      <Link
                        to="/faceit"
                        state={{
                          openIncomingFriendRequest: true,
                          skipFaceitLoadingAnimation: true,
                        }}
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
              {!isFaceitOpeningChat && active.from.team && (
                <aside
                  className="inbox-coach-card"
                  aria-label={`${active.from.name} coach profile`}
                >
                  <div className="inbox-coach-portrait">
                    <img
                      src={active.from.team.blazon || 'resources://blazonry/noteam.svg'}
                      className="inbox-coach-portrait-team"
                      alt=""
                      aria-hidden="true"
                    />
                    <img
                      src={getSenderAvatar(active.from.name)}
                      className="inbox-coach-portrait-person"
                      alt={active.from.name}
                      onError={useEmptyAvatar}
                    />
                  </div>
                  <div className="inbox-coach-copy">
                    <h3>{active.from.name}</h3>
                    <div className="inbox-coach-meta">
                      <img
                        src={active.from.team.blazon || 'resources://blazonry/noteam.svg'}
                        alt=""
                      />
                      <span>{active.from.team.name}</span>
                      <span aria-hidden="true">·</span>
                      <span>{getCoachTitle(active.from.role)}</span>
                    </div>
                    <Link
                      to={`/teams?teamId=${active.from.team.id}`}
                      className="inbox-coach-team-link"
                    >
                      <span>View Team</span>
                      <FaChevronRight aria-hidden="true" />
                    </Link>
                  </div>
                </aside>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
