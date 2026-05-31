/**
 * Exhibition match selection screen.
 *
 * @module
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { cloneDeep, sample, set } from 'lodash';
import { Constants, Eagers, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { useAudio, useTranslation } from '@liga/frontend/hooks';
import { Image } from '@liga/frontend/components';
import { findTeamOptionByValue, TeamSelect } from '@liga/frontend/components/select';
import cz75AutoIcon from '@liga/frontend/assets/weapons/2D/cz75a.svg';
import m4a1sIcon from '@liga/frontend/assets/weapons/2D/m4a1_silencer.svg';
import spectatingIcon from '@liga/frontend/assets/spectating.png';
import uspsIcon from '@liga/frontend/assets/weapons/2D/usp_silencer.svg';
import {
  FaArrowLeft,
  FaCaretLeft,
  FaCaretRight,
  FaExclamationTriangle,
  FaFolderOpen,
  FaRandom,
} from 'react-icons/fa';

type TeamData = Awaited<ReturnType<typeof api.play.exhibitionTeams<typeof Eagers.team>>>[number];

/** @interface */
interface TeamSelectorProps {
  onChange: (teamId: number) => void;
  onTeamUpdate?: (team: TeamData) => void;
  onEditRoster?: (team: TeamData) => void;
  initialFederationId?: number;
  initialTierId?: number;
  initialTeamId?: number;
}

const EXHIBITION_HOME_TEAM_STORAGE_KEY = 'exhibitionHomeTeamId';
const EXHIBITION_AWAY_TEAM_STORAGE_KEY = 'exhibitionAwayTeamId';

const weaponSettings = [
  {
    icon: uspsIcon,
    label: 'Equip USP-S',
    subtitle: 'Enable to use USP-S as your CT pistol.',
    path: 'gameSettings.isUSP',
    setting: 'isUSP',
  },
  {
    icon: m4a1sIcon,
    label: 'Equip M4A1-S',
    subtitle: 'Enable to use M4A1-S as your CT rifle.',
    path: 'gameSettings.isM4A1',
    setting: 'isM4A1',
  },
  {
    icon: cz75AutoIcon,
    label: 'Equip CZ75-Auto',
    subtitle: 'Enable to use CZ75-Auto as your pistol.',
    path: 'gameSettings.isCZ',
    setting: 'isCZ',
  },
] as const;

function getStoredTeamId(key: string) {
  const value = Number(window.sessionStorage.getItem(key));
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function toTeamOption(team: TeamData) {
  return { value: team.id, label: team.name, ...team };
}

/**
 * Team selector component.
 *
 * @param props Root props.
 * @function
 */
function TeamSelector(props: TeamSelectorProps) {
  const t = useTranslation('windows');
  const [federations, setFederations] = React.useState<
    Awaited<ReturnType<typeof api.play.exhibitionFederations>>
  >([]);
  const [selectedFederationId, setSelectedFederationId] = React.useState<number>(
    props.initialFederationId,
  );
  const [selectedTeam, setSelectedTeam] =
    React.useState<ReturnType<typeof findTeamOptionByValue>>();
  const [selectedTierId, setSelectedTierId] = React.useState<number>(props.initialTierId);
  const [teams, setTeams] = React.useState<
    Awaited<ReturnType<typeof api.play.exhibitionTeams<typeof Eagers.team>>>
  >([]);
  const selectedFederation = React.useMemo(
    () => federations.find((federation) => federation.id === selectedFederationId),
    [federations, selectedFederationId],
  );
  const selectableFederations = React.useMemo(
    () =>
      federations.filter(
        (federation) => federation.slug !== Constants.FederationSlug.ESPORTS_WORLD,
      ),
    [federations],
  );
  const isFederationSlug = (slug: string): slug is Constants.FederationSlug =>
    Object.values(Constants.FederationSlug).includes(slug as Constants.FederationSlug);

  const isTierEnabled = React.useCallback(
    (tier: Constants.TierSlug) => {
      const slug = selectedFederation?.slug;
      return slug && isFederationSlug(slug)
        ? Util.isLeagueTierEnabledForFederation(tier, slug)
        : true;
    },
    [selectedFederation?.slug],
  );

  // build team query
  const teamQuery = React.useMemo(
    () => ({
      ...Eagers.team,
      ...Util.buildTeamQuery(selectedFederationId, null, selectedTierId),
    }),
    [selectedFederationId, selectedTierId],
  );

  // initial data fetch
  React.useEffect(() => {
    api.play.exhibitionFederations().then(setFederations);
  }, []);

  // apply team filters
  React.useEffect(() => {
    api.play.exhibitionTeams<typeof Eagers.team>(teamQuery).then(setTeams);
  }, [teamQuery]);

  const setTeamSelection = React.useCallback((team: TeamData) => {
    const federationId = team.country?.continent?.federation?.id;

    if (federationId) {
      setSelectedFederationId(federationId);
    }

    setSelectedTierId(team.tier);
    setTeams((currentTeams) =>
      currentTeams.some((currentTeam) => currentTeam.id === team.id) ? currentTeams : [team],
    );
    setSelectedTeam(toTeamOption(team));
  }, []);

  // reset tier selection if the federation does not support it
  React.useEffect(() => {
    if (!Number.isInteger(selectedTierId)) {
      return;
    }

    const tierSlug = Constants.Prestige[selectedTierId];
    if (tierSlug && !isTierEnabled(tierSlug)) {
      setSelectedTierId(undefined);
    }
  }, [isTierEnabled, selectedTierId]);

  // preload random team
  React.useEffect(() => {
    if (!teams.length || selectedTeam) {
      return;
    }

    const initialTeam = props.initialTeamId
      ? teams.find((team) => team.id === props.initialTeamId)
      : undefined;
    const randomTeam = initialTeam || sample(teams);

    setSelectedTeam(toTeamOption(randomTeam));
  }, [props.initialTeamId, selectedTeam, teams]);

  const onFederationSelection = (federationId: number) => {
    setSelectedFederationId(federationId);
    setTeams([]);
    setSelectedTeam(undefined);
  };

  const onTierSelection = (tierId: number) => {
    setSelectedTierId(tierId);
    setTeams([]);
    setSelectedTeam(undefined);
  };

  const onRandomTeamSelection = async () => {
    const candidateTeams = await api.play.exhibitionTeams<typeof Eagers.team>({
      ...Eagers.team,
    });
    const randomTeam = sample(
      candidateTeams.filter((candidateTeam) => {
        const federationSlug = candidateTeam.country?.continent?.federation?.slug;
        const tierSlug = Constants.Prestige[candidateTeam.tier];

        return (
          federationSlug &&
          federationSlug !== Constants.FederationSlug.ESPORTS_WORLD &&
          isFederationSlug(federationSlug) &&
          tierSlug &&
          Util.isLeagueTierEnabledForFederation(tierSlug, federationSlug)
        );
      }),
    );

    if (randomTeam) {
      setTeamSelection(randomTeam);
    }
  };

  // callback handler
  React.useEffect(() => {
    if (!selectedTeam) {
      return;
    }

    props.onChange(selectedTeam.id);
  }, [selectedTeam]);

  // massage team data to team selector data structure
  const teamSelectorData = React.useMemo(
    () =>
      Constants.Prestige.filter((prestige, prestigeIdx) => {
        if (!isTierEnabled(prestige)) {
          return false;
        }
        return Number.isInteger(selectedTierId) ? prestigeIdx === selectedTierId : true;
      }).map((prestige) => ({
        label: Constants.IdiomaticTier[prestige],
        options: teams
          .filter((team) => team.tier === Constants.Prestige.findIndex((tier) => tier === prestige))
          .map((team) => ({
            ...team,
            value: team.id,
            label: team.name,
          })),
      })),
    [isTierEnabled, teams, selectedTierId],
  );

  // isolate the selected team
  const team = React.useMemo(
    () => teams.find((tteam) => tteam.id === selectedTeam?.id),
    [selectedTeam, teams],
  );

  React.useEffect(() => {
    if (!team) {
      return;
    }

    props.onTeamUpdate?.(team);
  }, [team]);

  return (
    <section className="flex flex-1 flex-col items-center gap-24 pt-24">
      {!team && (
        <article className="center h-48 w-auto">
          <span className="loading loading-spinner loading-lg" />
        </article>
      )}
      {!!team && <Image src={team.blazon} className="h-48 w-auto" />}
      <form className="w-3/4">
        <fieldset className="stack-y">
          <article>
            <header>
              <p>{t('shared.federation')}</p>
            </header>
            <aside>
              <select
                className="select w-full"
                onChange={(event) => onFederationSelection(Number(event.target.value))}
                value={selectedFederationId}
              >
                {selectableFederations.map((federation) => (
                  <option key={federation.id} value={federation.id}>
                    {federation.name}
                  </option>
                ))}
              </select>
            </aside>
          </article>
          <article>
            <header>
              <p>{t('shared.tierPrestige')}</p>
            </header>
            <aside>
              <select
                className="select w-full"
                onChange={(event) => onTierSelection(Number(event.target.value))}
                value={selectedTierId}
              >
                {Constants.Prestige.filter((prestige) => isTierEnabled(prestige)).map(
                  (prestige) => (
                    <option
                      key={prestige}
                      value={Constants.Prestige.findIndex((tier) => tier === prestige)}
                    >
                      {Constants.IdiomaticTier[prestige] === 'Group Stage'
                        ? 'ESL Pro League'
                        : Constants.IdiomaticTier[prestige]}
                    </option>
                  ),
                )}
              </select>
            </aside>
          </article>
          <article>
            <header>
              <p>{t('shared.team')}</p>
            </header>
            <aside>
              <TeamSelect
                className="w-full"
                backgroundColor="var(--color-base-200)"
                options={teamSelectorData}
                value={selectedTeam}
                onChange={(option) =>
                  setSelectedTeam(findTeamOptionByValue(teamSelectorData, option.value))
                }
              />
            </aside>
          </article>
        </fieldset>
      </form>
      {!!team && (
        <section className="flex flex-col items-center gap-2">
          <button
            type="button"
            className="btn btn-outline btn-sm gap-2"
            onClick={onRandomTeamSelection}
          >
            <FaRandom />
            Random Team
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => props.onEditRoster?.(team)}
          >
            Edit Roster
          </button>
        </section>
      )}
    </section>
  );
}

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const [appStatus, setAppStatus] = React.useState<NodeJS.ErrnoException>();
  const [settings, setSettings] = React.useState(Constants.Settings);
  const [homeTeamId, setHomeTeamId] = React.useState<number>(() =>
    getStoredTeamId(EXHIBITION_HOME_TEAM_STORAGE_KEY),
  );
  const [awayTeamId, setAwayTeamId] = React.useState<number>(() =>
    getStoredTeamId(EXHIBITION_AWAY_TEAM_STORAGE_KEY),
  );
  const [homeTeam, setHomeTeam] = React.useState<TeamData>();
  const [awayTeam, setAwayTeam] = React.useState<TeamData>();
  const [homeRoster, setHomeRoster] = React.useState<Array<number | null>>([]);
  const [awayRoster, setAwayRoster] = React.useState<Array<number | null>>([]);
  const [editingTeamId, setEditingTeamId] = React.useState<number | null>(null);
  const [replacementSlot, setReplacementSlot] = React.useState(0);
  const [rosterContextMenu, setRosterContextMenu] = React.useState<{
    index: number;
    x: number;
    y: number;
  } | null>(null);
  const [replacementFederationId, setReplacementFederationId] = React.useState<number | null>(null);
  const [playerSearch, setPlayerSearch] = React.useState('');
  const [replacementFederations, setReplacementFederations] = React.useState<
    Awaited<ReturnType<typeof api.play.exhibitionFederations>>
  >([]);
  const [playerPoolFederationId, setPlayerPoolFederationId] = React.useState<number | null>(null);
  const [playerPool, setPlayerPool] = React.useState<
    Awaited<ReturnType<typeof api.play.exhibitionPlayers<typeof Eagers.player>>>
  >([]);
  const [allPlayersPool, setAllPlayersPool] = React.useState<
    Awaited<ReturnType<typeof api.play.exhibitionPlayers<typeof Eagers.player>>>
  >([]);
  const [replacementCache, setReplacementCache] = React.useState<
    Record<
      number,
      Awaited<ReturnType<typeof api.play.exhibitionPlayers<typeof Eagers.player>>>[number]
    >
  >({});
  const [isUserCT, setIsUserCT] = React.useState(false);
  const [spectating, setSpectating] = React.useState(false);
  const [mapPool, setMapPool] = React.useState<Awaited<ReturnType<typeof api.mapPool.find>>>([]);
  const navigate = useNavigate();
  const t = useTranslation('windows');
  const previousHomeTeamId = React.useRef<number>();

  // load audio files
  const audioRelease = useAudio('button-release.wav');
  const audioClick = useAudio('button-click.wav');

  React.useEffect(() => {
    api.play.exhibitionFederations().then(setReplacementFederations);

    api.profiles.current().then(async (profile) => {
      const profileSettings = profile?.settings
        ? (JSON.parse(profile.settings) as typeof Constants.Settings)
        : Constants.Settings;

      const modified = cloneDeep({
        ...Constants.Settings,
        ...profileSettings,
        general: {
          ...Constants.Settings.general,
          ...profileSettings.general,
        },
        gameSettings: {
          ...Constants.Settings.gameSettings,
          ...profileSettings.gameSettings,
        },
        matchRules: {
          ...Constants.Settings.matchRules,
          ...profileSettings.matchRules,
        },
      });

      const [steamPath, gamePath, dedicatedServerPath] = await Promise.all([
        modified.general.steamPath
          ? Promise.resolve(modified.general.steamPath)
          : api.app.detectSteam(),
        modified.general.gamePath
          ? Promise.resolve(modified.general.gamePath)
          : api.app.detectGame(modified.general.game),
        Promise.resolve(modified.general.dedicatedServerPath),
      ]);

      modified.general.steamPath = steamPath;
      modified.general.gamePath = gamePath;
      modified.general.dedicatedServerPath = dedicatedServerPath || null;

      setSettings(modified);
    });

    // fetch map pool
    api.mapPool
      .find({
        where: {
          gameVersion: {
            slug: Constants.Settings.general.game,
          },
        },
      })
      .then(setMapPool)
      .catch((): void => undefined);
  }, []);

  // handle settings updates
  const onSettingsUpdate = (path: string, value: unknown) => {
    const modified = cloneDeep(settings);
    set(modified, path, value);

    // detect game path again
    api.app.detectGame(modified.general.game).then((gamePath) => {
      modified.general.gamePath = gamePath;
      setSettings(modified);
    });

    // fetch map pool again
    api.mapPool
      .find({
        where: {
          gameVersion: {
            slug: modified.general.game,
          },
        },
      })
      .then(setMapPool)
      .catch((): void => undefined);
  };

  // validate settings
  React.useEffect(() => {
    // if paths are not explicitly initialized
    // then we won't send a status check yet
    if (settings.general.steamPath === null || settings.general.gamePath === null) {
      return;
    }

    api.app.status(settings).then((status) => setAppStatus(JSON.parse(status || false)));
  }, [settings]);

  const steamPathError = React.useMemo(() => {
    if (!appStatus) {
      return;
    }

    const [, match] = appStatus.path.match(/(steam\.exe)/) || [];
    return match ? appStatus.path : '';
  }, [appStatus]);

  const gamePathError = React.useMemo(() => {
    if (!appStatus) {
      return;
    }

    const [, match] = appStatus.path.match(/((?:csgo|hl|hl2)\.exe)/) || [];
    return match ? appStatus.path : '';
  }, [appStatus]);

  const selectedMap = settings.matchRules.mapOverride || mapPool[0]?.gameMap?.name;

  React.useEffect(() => {
    if (homeTeamId) {
      window.sessionStorage.setItem(EXHIBITION_HOME_TEAM_STORAGE_KEY, String(homeTeamId));
    }
  }, [homeTeamId]);

  React.useEffect(() => {
    if (awayTeamId) {
      window.sessionStorage.setItem(EXHIBITION_AWAY_TEAM_STORAGE_KEY, String(awayTeamId));
    }
  }, [awayTeamId]);

  React.useEffect(() => {
    if (!mapPool.length || settings.matchRules.mapOverride) {
      return;
    }

    const modified = cloneDeep(settings);
    modified.matchRules.mapOverride = mapPool[0].gameMap.name;
    setSettings(modified);
  }, [mapPool, settings]);

  const onMapSelection = (map: string) => {
    const modified = cloneDeep(settings);
    modified.matchRules.mapOverride = map;
    setSettings(modified);
  };

  const getDefaultRoster = React.useCallback(
    (team?: TeamData, injectYou = false): Array<number | null> => {
      if (!team) {
        return [];
      }

      const starters = team.players
        .filter((player) => player.starter && !player.transferListed)
        .slice(0, Constants.Application.SQUAD_MIN_LENGTH);
      const fallback = team.players
        .filter((player) => !player.transferListed)
        .slice(0, Constants.Application.SQUAD_MIN_LENGTH);

      const lineup = (starters.length ? starters : fallback).map((player) => player.id);

      if (injectYou && lineup.length) {
        const awperIdx = team.players.findIndex(
          (player) =>
            lineup.includes(player.id) &&
            (player.role === Constants.UserRole.AWPER ||
              player.role === Constants.PlayerRole.SNIPER),
        );
        const replacementIdx = awperIdx >= 0 ? awperIdx : 0;
        lineup[replacementIdx] = -1;
      }

      return lineup.slice(0, Constants.Application.SQUAD_MIN_LENGTH).concat(
        Array.from({
          length: Math.max(0, Constants.Application.SQUAD_MIN_LENGTH - lineup.length),
        }).map((): null => null),
      );
    },
    [],
  );

  React.useEffect(() => {
    if (!homeTeam) {
      return;
    }

    if (previousHomeTeamId.current === homeTeam.id) {
      return;
    }

    previousHomeTeamId.current = homeTeam.id;
    setHomeRoster(getDefaultRoster(homeTeam, !spectating));
  }, [homeTeam, getDefaultRoster, spectating]);

  React.useEffect(() => {
    if (!awayTeam) {
      return;
    }

    setAwayRoster(getDefaultRoster(awayTeam));
  }, [awayTeam, getDefaultRoster]);

  const getRosterWithoutYou = React.useCallback(
    (team: TeamData, roster: Array<number | null>) => {
      const defaultRoster = getDefaultRoster(team);
      const nextRoster = roster.map((playerId, index) =>
        playerId === -1 ? defaultRoster[index] || null : playerId,
      );

      return nextRoster.slice(0, Constants.Application.SQUAD_MIN_LENGTH).concat(
        Array.from({
          length: Math.max(0, Constants.Application.SQUAD_MIN_LENGTH - nextRoster.length),
        }).map((): null => null),
      );
    },
    [getDefaultRoster],
  );

  const getRosterWithYou = React.useCallback(
    (team: TeamData, roster: Array<number | null>) => {
      if (roster.includes(-1)) {
        return roster;
      }

      const defaultRoster = getDefaultRoster(team);
      const awperIdx = defaultRoster.findIndex((playerId) => {
        const player = team.players.find((entry) => entry.id === playerId);
        return (
          player?.role === Constants.UserRole.AWPER || player?.role === Constants.PlayerRole.SNIPER
        );
      });
      const replacementIdx = awperIdx >= 0 ? awperIdx : 0;
      const nextRoster = [...roster];

      nextRoster[replacementIdx] = -1;

      return nextRoster.slice(0, Constants.Application.SQUAD_MIN_LENGTH).concat(
        Array.from({
          length: Math.max(0, Constants.Application.SQUAD_MIN_LENGTH - nextRoster.length),
        }).map((): null => null),
      );
    },
    [getDefaultRoster],
  );

  const onSpectatingToggle = (checked: boolean) => {
    setSpectating(checked);

    if (!homeTeam) {
      return;
    }

    setHomeRoster((prev) =>
      checked ? getRosterWithoutYou(homeTeam, prev) : getRosterWithYou(homeTeam, prev),
    );
  };

  const currentEditingTeam = editingTeamId === homeTeam?.id ? homeTeam : awayTeam;
  const currentEditingRoster = editingTeamId === homeTeam?.id ? homeRoster : awayRoster;
  const filteredPlayerPool = React.useMemo(
    () =>
      playerPool.filter((player) =>
        player.name.toLowerCase().includes(playerSearch.trim().toLowerCase()),
      ),
    [playerPool, playerSearch],
  );
  const rosterPlayerLookup = React.useMemo(() => {
    const lookup = new Map<number, TeamData['players'][number]>();

    (currentEditingTeam?.players || []).forEach((player) => lookup.set(player.id, player));
    playerPool.forEach((player) => lookup.set(player.id, player as TeamData['players'][number]));
    allPlayersPool.forEach((player) =>
      lookup.set(player.id, player as TeamData['players'][number]),
    );
    Object.values(replacementCache).forEach((player) =>
      lookup.set(player.id, player as TeamData['players'][number]),
    );

    return lookup;
  }, [allPlayersPool, currentEditingTeam, playerPool, replacementCache]);
  const currentRosterPlayers = currentEditingRoster
    .map((playerId) => {
      if (!Number.isInteger(playerId)) {
        return null;
      }

      if (playerId === -1 && currentEditingTeam?.players?.length) {
        const base =
          currentEditingTeam.players.find(
            (player) =>
              player.role === Constants.UserRole.AWPER ||
              player.role === Constants.PlayerRole.SNIPER,
          ) || currentEditingTeam.players[0];

        return {
          ...base,
          id: -1,
          name: 'YOU',
          avatar: 'resources://avatars/empty.png',
          role: Constants.PlayerRole.SNIPER,
        };
      }

      return rosterPlayerLookup.get(playerId);
    })
    .map((player) => player || null);

  const openRosterEditor = (team: TeamData) => {
    setEditingTeamId(team.id);
    setReplacementSlot(0);
    setRosterContextMenu(null);
    setPlayerSearch('');
    const federationId = team.country.continent.federation.id;
    setReplacementFederationId(federationId);
  };

  React.useEffect(() => {
    if (!editingTeamId || !replacementFederationId) {
      return;
    }

    if (playerPoolFederationId === replacementFederationId && playerPool.length) {
      return;
    }

    setPlayerPoolFederationId(replacementFederationId);
    api.play
      .exhibitionPlayers<typeof Eagers.player>({
        ...Eagers.player,
        where: {
          team: {
            country: {
              continent: {
                federationId: replacementFederationId,
              },
            },
          },
        },
      })
      .then(setPlayerPool);
  }, [editingTeamId, replacementFederationId]);

  const applyRosterReplacement = (
    incomingPlayer: Awaited<
      ReturnType<typeof api.play.exhibitionPlayers<typeof Eagers.player>>
    >[number],
  ) => {
    if (!editingTeamId) {
      return;
    }
    const incomingPlayerId = incomingPlayer.id;
    setReplacementCache((prev) => ({
      ...prev,
      [incomingPlayerId]: incomingPlayer,
    }));

    const activeRoster = editingTeamId === homeTeam?.id ? homeRoster : awayRoster;
    const otherRoster = editingTeamId === homeTeam?.id ? awayRoster : homeRoster;
    const slotPlayerId = activeRoster[replacementSlot];
    if (editingTeamId === homeTeam?.id && slotPlayerId === -1) {
      return;
    }
    const duplicateInMatch =
      otherRoster.includes(incomingPlayerId) ||
      activeRoster.some(
        (playerId, idx) => idx !== replacementSlot && playerId === incomingPlayerId,
      );

    if (duplicateInMatch && slotPlayerId !== incomingPlayerId) {
      return;
    }

    const updateRoster = (prev: Array<number | null>) => {
      const next = [...prev];
      const targetSlot = Number.isInteger(next[replacementSlot])
        ? replacementSlot
        : next.findIndex((slot) => !Number.isInteger(slot));
      const effectiveSlot = targetSlot >= 0 ? targetSlot : replacementSlot;
      next[effectiveSlot] = incomingPlayerId;
      return next.slice(0, Constants.Application.SQUAD_MIN_LENGTH).concat(
        Array.from({
          length: Math.max(0, Constants.Application.SQUAD_MIN_LENGTH - next.length),
        }).map((): null => null),
      );
    };

    if (editingTeamId === homeTeam?.id) {
      setHomeRoster(updateRoster);
      return;
    }

    setAwayRoster(updateRoster);
  };

  const removeRosterPlayer = (slotIndex: number) => {
    const updateRoster = (prev: Array<number | null>) => {
      const next = [...prev];
      next[slotIndex] = null;
      return next;
    };

    if (editingTeamId === homeTeam?.id) {
      setHomeRoster(updateRoster);
    } else {
      setAwayRoster(updateRoster);
    }

    setRosterContextMenu(null);
  };

  const shuffleCurrentRoster = async () => {
    if (!editingTeamId) {
      return;
    }

    const isHomeTeam = editingTeamId === homeTeam?.id;
    const activeRoster = isHomeTeam ? homeRoster : awayRoster;
    const otherRoster = isHomeTeam ? awayRoster : homeRoster;
    const lockedYouSlotIndex = isHomeTeam
      ? activeRoster.findIndex((playerId) => playerId === -1)
      : -1;

    const allPlayers = allPlayersPool.length
      ? allPlayersPool
      : await api.play.exhibitionPlayers<typeof Eagers.player>(Eagers.player).then((players) => {
          setAllPlayersPool(players);
          return players;
        });

    const blockedPlayerIds = new Set(
      otherRoster.filter(
        (playerId): playerId is number => Number.isInteger(playerId) && playerId !== -1,
      ),
    );
    const candidatePool = (allPlayers.length ? allPlayers : currentEditingTeam?.players || [])
      .filter((player) => !blockedPlayerIds.has(player.id))
      .map((player) => player.id);

    const uniqueCandidatePool = Array.from(new Set(candidatePool));
    for (let i = uniqueCandidatePool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [uniqueCandidatePool[i], uniqueCandidatePool[j]] = [
        uniqueCandidatePool[j],
        uniqueCandidatePool[i],
      ];
    }

    const nextRoster = Array.from(
      { length: Number(Constants.Application.SQUAD_MIN_LENGTH) },
      (): number | null => null,
    );
    if (lockedYouSlotIndex >= 0) {
      nextRoster[lockedYouSlotIndex] = -1;
    }

    let candidateIndex = 0;
    for (let slotIndex = 0; slotIndex < nextRoster.length; slotIndex++) {
      if (slotIndex === lockedYouSlotIndex) {
        continue;
      }

      if (candidateIndex >= uniqueCandidatePool.length) {
        break;
      }

      nextRoster[slotIndex] = uniqueCandidatePool[candidateIndex];
      candidateIndex += 1;
    }

    if (isHomeTeam) {
      setHomeRoster(nextRoster);
      return;
    }

    setAwayRoster(nextRoster);
  };

  return (
    <main className="frosted flex h-full w-full">
      <FaArrowLeft
        className="absolute top-5 left-5 size-5 cursor-pointer"
        onClick={() => navigate('/')}
        onMouseDown={audioRelease}
      />
      <TeamSelector
        initialFederationId={1}
        initialTierId={4}
        initialTeamId={homeTeamId}
        onChange={setHomeTeamId}
        onTeamUpdate={setHomeTeam}
        onEditRoster={openRosterEditor}
      />
      <section className="center w-24 gap-4 text-center">
        <p>
          <em>
            {spectating && homeTeam
              ? `Pick ${homeTeam.name}'s starting side`
              : 'Pick your starting side'}
          </em>
        </p>
        <label className="swap swap-flip [&_article]:center [&_article]:gap-4 [&_article_svg]:size-8">
          <input
            type="checkbox"
            checked={isUserCT}
            onChange={(event) => setIsUserCT(event.target.checked)}
          />
          <article className="swap-off">
            <Image src="resources://avatars/t.png" />
            <FaCaretLeft />
          </article>
          <article className="swap-on">
            <Image src="resources://avatars/ct.png" />
            <FaCaretRight />
          </article>
        </label>
        <section className="mt-4 flex flex-col gap-2">
          <article className="border-base-content/20 bg-base-300/20 h-24 w-44 overflow-hidden rounded-md border shadow-sm">
            {!!selectedMap && (
              <Image
                className="h-full w-full object-cover"
                src={Util.convertMapPool(selectedMap, settings.general.game, true)}
                title={Util.convertMapPool(selectedMap, settings.general.game)}
              />
            )}
          </article>
          <article className="border-base-content/20 bg-base-300/20 h-12 w-44 rounded-md border p-0 shadow-sm">
            <details className="dropdown h-full w-full">
              <summary className="btn btn-ghost h-full w-full rounded-md text-center">
                {selectedMap
                  ? Util.convertMapPool(selectedMap, settings.general.game)
                  : 'Choose Map'}
              </summary>
              <ul className="dropdown-content bg-base-200 rounded-box z-20 mt-1 flex max-h-72 w-44 flex-col overflow-x-hidden overflow-y-auto p-1 shadow">
                {mapPool.map((map) => (
                  <li key={map.gameMap.name} className="w-full">
                    <button
                      type="button"
                      className="hover:bg-base-300 w-full rounded px-2 py-2 text-center"
                      onClick={() => onMapSelection(map.gameMap.name)}
                    >
                      {Util.convertMapPool(map.gameMap.name, settings.general.game)}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          </article>
        </section>
      </section>
      <TeamSelector
        initialFederationId={2}
        initialTierId={4}
        initialTeamId={awayTeamId}
        onChange={setAwayTeamId}
        onTeamUpdate={setAwayTeam}
        onEditRoster={openRosterEditor}
      />
      <section className="flex flex-1 flex-col p-4">
        <form className="form-ios form-ios-col-2 w-full flex-1">
          <fieldset>
            <article>
              <header>
                <p>{t('settings.steamTitle')}</p>
                <p>
                  e.g.: <code>C:\Program Files\Steam</code>
                </p>
                {!!steamPathError && (
                  <span className="tooltip" data-tip={String(steamPathError)}>
                    <FaExclamationTriangle className="text-error" />
                  </span>
                )}
              </header>
              <aside className="join">
                <input
                  readOnly
                  type="text"
                  className="input join-item bg-base-200 cursor-default text-sm"
                  value={settings.general.steamPath || ''}
                />
                <button
                  type="button"
                  className="btn join-item"
                  onClick={() =>
                    api.app
                      .dialog(Constants.WindowIdentifier.Landing, {
                        properties: ['openDirectory'],
                      })
                      .then(
                        (dialogData) =>
                          !dialogData.canceled &&
                          onSettingsUpdate('general.steamPath', dialogData.filePaths[0]),
                      )
                  }
                >
                  <FaFolderOpen />
                </button>
              </aside>
            </article>
            <article>
              <header>
                <p>{t('settings.gamePathTitle')}</p>
                <p>{t('settings.gamePathSubtitle')}</p>
                {!!gamePathError && (
                  <span className="tooltip" data-tip={String(gamePathError)}>
                    <FaExclamationTriangle className="text-error" />
                  </span>
                )}
              </header>
              <aside className="join">
                <input
                  readOnly
                  type="text"
                  className="input join-item bg-base-200 cursor-default text-sm"
                  value={settings.general.gamePath || ''}
                />
                <button
                  type="button"
                  className="btn join-item"
                  onClick={() =>
                    api.app
                      .dialog(Constants.WindowIdentifier.Landing, {
                        properties: ['openDirectory'],
                      })
                      .then(
                        (dialogData) =>
                          !dialogData.canceled &&
                          onSettingsUpdate('general.gamePath', dialogData.filePaths[0]),
                      )
                  }
                >
                  <FaFolderOpen />
                </button>
              </aside>
            </article>
            <article>
              <header>
                <p>Dedicated Server Path</p>
                <p>Path to your CS:GO Dedicated Server (srcds) installation.</p>
              </header>
              <aside className="join">
                <input
                  readOnly
                  type="text"
                  className="input join-item bg-base-200 cursor-default text-sm"
                  value={settings.general.dedicatedServerPath || ''}
                />
                <button
                  type="button"
                  className="btn join-item"
                  onClick={() =>
                    api.app
                      .dialog(Constants.WindowIdentifier.Landing, {
                        properties: ['openDirectory'],
                      })
                      .then(
                        (dialogData) =>
                          !dialogData.canceled &&
                          onSettingsUpdate('general.dedicatedServerPath', dialogData.filePaths[0]),
                      )
                  }
                >
                  <FaFolderOpen />
                </button>
              </aside>
            </article>
            <article>
              <header>
                <p>{t('settings.launchOptionsTitle')}</p>
                <p>{t('settings.launchOptionsSubtitle')}</p>
              </header>
              <aside>
                <input
                  type="text"
                  className="input join-item bg-base-200 text-sm"
                  value={settings.general.gameLaunchOptions || ''}
                  onChange={(event) =>
                    onSettingsUpdate('general.gameLaunchOptions', event.target.value)
                  }
                />
              </aside>
            </article>
            {weaponSettings.map((weapon) => (
              <article key={weapon.path}>
                <header>
                  <p className="flex items-center gap-4 not-italic">
                    <span className="border-base-content/20 flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden border-r pr-4">
                      <img
                        alt=""
                        className="h-10 w-20 object-contain"
                        draggable={false}
                        src={weapon.icon}
                      />
                    </span>
                    <span>{weapon.label}</span>
                  </p>
                  <p>{weapon.subtitle}</p>
                </header>
                <aside>
                  <input
                    type="checkbox"
                    className="toggle"
                    checked={settings.gameSettings[weapon.setting]}
                    onChange={(event) => onSettingsUpdate(weapon.path, event.target.checked)}
                  />
                </aside>
              </article>
            ))}
            <article>
              <header>
                <p className="flex items-center gap-4 not-italic">
                  <span className="border-base-content/20 flex h-14 w-24 shrink-0 items-center justify-center overflow-visible border-r pr-4">
                    <img
                      alt=""
                      className="h-14 w-14 object-contain"
                      draggable={false}
                      src={spectatingIcon}
                    />
                  </span>
                  <span>Spectate Match</span>
                </p>
                <p>Spectate the match.</p>
              </header>
              <aside>
                <input
                  type="checkbox"
                  className="toggle"
                  checked={spectating}
                  onChange={(event) => onSpectatingToggle(event.target.checked)}
                />
              </aside>
            </article>
          </fieldset>
        </form>
        <button
          className="btn btn-xl btn-block btn-primary"
          onMouseDown={audioClick}
          onClick={() => {
            const orderedTeamIds = isUserCT ? [awayTeamId, homeTeamId] : [homeTeamId, awayTeamId];

            return api.play.exhibition(
              settings,
              orderedTeamIds,
              homeTeamId,
              [
                {
                  teamId: homeTeamId,
                  playerIds: homeRoster.filter((playerId): playerId is number =>
                    Number.isInteger(playerId),
                  ),
                },
                {
                  teamId: awayTeamId,
                  playerIds: awayRoster.filter((playerId): playerId is number =>
                    Number.isInteger(playerId),
                  ),
                },
              ].filter((entry) => Number.isInteger(entry.teamId) && entry.playerIds.length),
              spectating,
            );
          }}
        >
          {spectating ? 'Spectate' : t('main.dashboard.play')}
        </button>
      </section>
      {editingTeamId && (
        <aside className="bg-base-content/60 center fixed inset-0 z-50 p-6">
          <section className="bg-base-200 h-[620px] w-full max-w-5xl rounded-xl p-4">
            <header className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Edit Roster - {currentEditingTeam?.name}</h2>
              <button type="button" className="btn btn-sm" onClick={() => setEditingTeamId(null)}>
                Close
              </button>
            </header>
            <section className="grid h-[calc(100%-44px)] grid-cols-2 gap-4">
              <article className="flex min-h-0 flex-col">
                <p className="mb-2 font-semibold">Current Roster</p>
                <div className="grid grid-cols-5 gap-2">
                  {currentRosterPlayers.map((player, index) => (
                    <button
                      key={(player?.id || 'empty') + '_' + index}
                      type="button"
                      className={cx(
                        'border-base-content/20 bg-base-100 rounded-lg border p-2',
                        replacementSlot === index && 'border-primary',
                      )}
                      onClick={() => {
                        if (player?.id === -1) {
                          return;
                        }

                        setReplacementSlot(index);
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        if (!player || player.id === -1) {
                          return;
                        }

                        setRosterContextMenu({
                          index,
                          x: event.clientX,
                          y: event.clientY,
                        });
                      }}
                    >
                      {!!player && (
                        <React.Fragment>
                          <Image
                            src={player.avatar || 'resources://avatars/empty.png'}
                            className="mx-auto size-14 rounded-md object-cover"
                          />
                          <p className="truncate text-xs">{player.name}</p>
                        </React.Fragment>
                      )}
                      {!player && (
                        <React.Fragment>
                          <div className="text-primary text-center text-4xl leading-none">+</div>
                          <p className="truncate text-xs">Empty</p>
                        </React.Fragment>
                      )}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn btn-sm mt-4 w-fit"
                  onClick={() => {
                    shuffleCurrentRoster();
                  }}
                >
                  Shuffle Roster
                </button>
              </article>
              <article className="flex min-h-0 flex-col">
                <p className="mb-2 font-semibold">Choose Replacement</p>
                <select
                  className="select select-sm mb-2 w-full"
                  value={replacementFederationId || ''}
                  onChange={(event) => setReplacementFederationId(Number(event.target.value))}
                >
                  {replacementFederations.map((federation) => (
                    <option key={federation.id} value={federation.id}>
                      {federation.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  className="input input-sm mb-2 w-full"
                  placeholder="Search player name..."
                  value={playerSearch}
                  onChange={(event) => setPlayerSearch(event.target.value)}
                />
                <div className="grid min-h-0 flex-1 grid-cols-3 gap-2 overflow-y-auto pr-1">
                  {filteredPlayerPool.map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      className="border-base-content/20 bg-base-100 rounded-lg border p-2 text-left"
                      onClick={() => applyRosterReplacement(player)}
                    >
                      <Image
                        src={player.avatar || 'resources://avatars/empty.png'}
                        className="mb-1 size-14 rounded-md object-cover"
                      />
                      <p className="truncate text-xs">{player.name}</p>
                      <p className="text-primary text-[10px]">
                        {currentEditingRoster.filter((slot) => Number.isInteger(slot)).length >=
                        Constants.Application.SQUAD_MIN_LENGTH
                          ? 'Replace'
                          : 'Add'}
                      </p>
                    </button>
                  ))}
                </div>
              </article>
            </section>
          </section>
        </aside>
      )}
      {!!rosterContextMenu && (
        <button
          type="button"
          className="btn btn-sm btn-error fixed z-[60]"
          style={{
            top: rosterContextMenu.y,
            left: rosterContextMenu.x,
          }}
          onClick={() => removeRosterPlayer(rosterContextMenu.index)}
        >
          Remove
        </button>
      )}
    </main>
  );
}
