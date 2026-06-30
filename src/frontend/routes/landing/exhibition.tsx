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
import { setCustomGameMusicPaused } from '@liga/frontend/lib/landing-music';
import type { PlayingStatus } from '@liga/frontend/redux/state';
import { useAudio, useLoopingAudio, useTranslation } from '@liga/frontend/hooks';
import { Image } from '@liga/frontend/components';
import { findTeamOptionByValue, TeamSelect } from '@liga/frontend/components/select';
import arenaModeIcon from '@liga/frontend/assets/customgames/arenamode.png';
import classicModeImage from '@liga/frontend/assets/customgames/classic.png';
import comingSoonModeImage from '@liga/frontend/assets/customgames/comingsoon.png';
import cz75AutoIcon from '@liga/frontend/assets/weapons/2D/cz75a.svg';
import deathmatchModeImage from '@liga/frontend/assets/customgames/deathmatch.png';
import headshotOnlyIcon from '@liga/frontend/assets/customgames/headshot.png';
import m4a1sIcon from '@liga/frontend/assets/weapons/2D/m4a1_silencer.svg';
import mp9Icon from '@liga/frontend/assets/weapons/2D/mp9.svg';
import spectatingIcon from '@liga/frontend/assets/customgames/spectating.png';
import uspsIcon from '@liga/frontend/assets/weapons/2D/usp_silencer.svg';
import mysteryModeImage1 from '@liga/frontend/assets/customgames/1.png';
import mysteryModeImage2 from '@liga/frontend/assets/customgames/2.png';
import {
  FaArrowLeft,
  FaCaretLeft,
  FaCaretRight,
  FaCheck,
  FaExclamationTriangle,
  FaFolderOpen,
  FaInfoCircle,
  FaLock,
  FaRandom,
  FaSpinner,
  FaTimes,
} from 'react-icons/fa';

type TeamData = Awaited<ReturnType<typeof api.play.exhibitionTeams<typeof Eagers.team>>>[number];
type ExhibitionPlayer = Awaited<
  ReturnType<typeof api.play.exhibitionPlayers<typeof Eagers.player>>
>[number];
type ProfileData = Awaited<ReturnType<typeof api.profiles.current<typeof Eagers.profile>>>;
type CustomGameMode = 'classic' | 'deathmatch';
type DeathmatchDifficulty = 'pro' | 'hard' | 'medium' | 'easy';
type MapPoolEntry = Awaited<ReturnType<typeof api.mapPool.find>>[number];
type DeathmatchSlot = {
  id: number;
  name: string;
  teamId?: number | null;
  avatar?: string | null;
  teamBlazon?: string | null;
  isUser?: boolean;
};

/** @interface */
interface TeamSelectorProps {
  onChange: (teamId: number) => void;
  onTeamUpdate?: (team: TeamData) => void;
  onEditRoster?: (team: TeamData) => void;
  excludedTeamId?: number;
  initialFederationId?: number;
  initialTierId?: number;
  initialTeamId?: number;
}

const EXHIBITION_HOME_TEAM_STORAGE_KEY = 'exhibitionHomeTeamId';
const EXHIBITION_AWAY_TEAM_STORAGE_KEY = 'exhibitionAwayTeamId';
const PLAYING_STATUS_STEPS: Array<PlayingStatus> = [
  'PREPARING_MATCH',
  'COPYING_FILES',
  'STARTING_SERVER',
  'CONNECTING_SERVER',
  'WAITING_FOR_SERVER',
  'STARTING_CLIENT',
  'WATCHING_MATCH',
  'SAVING_RESULTS',
];
const deathmatchGameTimeOptions = [10, 20, 30, 45, 60] as const;
const deathmatchPlayerLimitOptions = [20, 18, 16, 14, 12, 10] as const;

const deathmatchDifficulties: Array<{
  id: DeathmatchDifficulty;
  label: string;
  minXp: number;
  maxXp?: number;
}> = [
  {
    id: 'pro',
    label: 'PRO',
    minXp: 60,
  },
  {
    id: 'hard',
    label: 'Hard',
    minXp: 50,
    maxXp: 70,
  },
  {
    id: 'medium',
    label: 'Medium',
    minXp: 25,
    maxXp: 50,
  },
  {
    id: 'easy',
    label: 'Easy',
    minXp: 0,
    maxXp: 24,
  },
];

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
      ? teams.find((team) => team.id === props.initialTeamId && team.id !== props.excludedTeamId)
      : undefined;
    const randomTeam =
      initialTeam || sample(teams.filter((team) => team.id !== props.excludedTeamId));

    if (randomTeam) {
      setSelectedTeam(toTeamOption(randomTeam));
    }
  }, [props.excludedTeamId, props.initialTeamId, selectedTeam, teams]);

  React.useEffect(() => {
    if (selectedTeam?.id === props.excludedTeamId) {
      setSelectedTeam(undefined);
    }
  }, [props.excludedTeamId, selectedTeam?.id]);

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
          candidateTeam.id !== props.excludedTeamId &&
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
          .filter((team) => team.id !== props.excludedTeamId)
          .map((team) => ({
            ...team,
            value: team.id,
            label: team.name,
          })),
      })),
    [isTierEnabled, props.excludedTeamId, teams, selectedTierId],
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

function shuffleDeathmatchPlayers(players: Array<ExhibitionPlayer>) {
  const nextPlayers = [...players];

  for (let i = nextPlayers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [nextPlayers[i], nextPlayers[j]] = [nextPlayers[j], nextPlayers[i]];
  }

  return nextPlayers;
}

function DeathmatchLineupColumn(props: {
  icon: string;
  maxSlots: number;
  players: Array<DeathmatchSlot>;
  title: string;
}) {
  const compact = props.maxSlots > 5;
  const slots = props.players.slice(0, props.maxSlots).concat(
    Array.from({
      length: Math.max(0, props.maxSlots - props.players.length),
    }).map(
      (_, index): DeathmatchSlot => ({
        id: -1000 - index,
        name: 'Empty',
        avatar: 'resources://avatars/empty.png',
        teamBlazon: props.icon,
      }),
    ),
  );

  return (
    <section className="bg-base-300/35 border-base-content/10 flex w-80 flex-col border shadow-2xl">
      <header
        className={cx(
          'border-base-content/10 flex shrink-0 items-center justify-center gap-4 border-b px-5',
          compact ? 'h-14' : 'h-20',
        )}
      >
        <Image src={props.icon} className={compact ? 'size-10' : 'size-14'} />
        <span className={cx('font-bold', compact ? 'text-lg' : 'text-xl')}>{props.title}</span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        {slots.map((player, index) => (
          <article
            key={`${player.id}_${index}`}
            className={cx(
              'border-base-content/10 flex items-center border-b px-4',
              compact ? 'h-[50px] gap-3' : 'h-[82px] gap-4',
              player.isUser && 'bg-primary/15 text-primary font-bold',
            )}
          >
            <span className="text-base-content/50 w-7 text-right text-sm tabular-nums">
              {index + 1}
            </span>
            <Image
              src={player.avatar || 'resources://avatars/empty.png'}
              className={cx('rounded object-cover', compact ? 'size-9' : 'size-14')}
            />
            <span className={cx('min-w-0 truncate', compact ? 'text-sm' : 'text-lg')}>
              {player.name}
            </span>
            <Image
              src={player.teamBlazon || props.icon}
              className={cx(
                'ml-auto shrink-0 object-contain opacity-80',
                compact ? 'size-7' : 'size-10',
              )}
            />
          </article>
        ))}
      </div>
    </section>
  );
}

function SelectedMapPanel(props: {
  buttonClassName: string;
  game: Constants.Game;
  imageClassName: string;
  onOpen: () => void;
  onPress: () => void;
  selectedMap?: string;
  wrapperClassName: string;
}) {
  const mapLabel = props.selectedMap
    ? Util.convertMapPool(props.selectedMap, props.game)
    : 'Map Selection';

  return (
    <section className={cx('flex flex-col gap-2', props.wrapperClassName)}>
      <article
        className={cx(
          'border-base-content/20 bg-base-300/20 overflow-hidden rounded-md border shadow-sm',
          props.imageClassName,
        )}
      >
        {!!props.selectedMap && (
          <Image
            className="h-full w-full object-cover"
            src={Util.convertMapPool(props.selectedMap, props.game, true)}
            title={mapLabel}
          />
        )}
      </article>
      <button
        type="button"
        className={cx(
          'btn btn-ghost border-base-content/20 bg-base-300/20 rounded-md border text-center shadow-sm',
          props.buttonClassName,
        )}
        onClick={props.onOpen}
        onMouseDown={props.onPress}
      >
        <span className="truncate">{mapLabel}</span>
      </button>
    </section>
  );
}

function MapSelectionModal(props: {
  game: Constants.Game;
  mapPool: Array<MapPoolEntry>;
  onClose: () => void;
  onPress: () => void;
  onSelect: (map: string) => void;
  selectedMap?: string;
}) {
  return (
    <section
      className="bg-base-300/80 fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-sm"
      onMouseDown={props.onClose}
    >
      <article
        className="bg-base-100 border-base-content/10 flex max-h-[86vh] w-full max-w-5xl flex-col border shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="border-base-content/10 flex shrink-0 items-center justify-between border-b px-6 py-4">
          <p className="text-xl font-black">Map Selection</p>
          <button
            type="button"
            className="btn btn-ghost btn-square"
            onClick={props.onClose}
            onMouseDown={props.onPress}
          >
            <FaTimes />
          </button>
        </header>
        <section className="grid min-h-0 grid-cols-5 gap-3 overflow-y-auto p-4">
          {props.mapPool.map((map) => {
            const mapName = map.gameMap.name;
            const mapLabel = Util.convertMapPool(mapName, props.game);
            const selected = props.selectedMap === mapName;

            return (
              <button
                key={mapName}
                type="button"
                className={cx(
                  'group border-base-content/10 bg-base-200 hover:border-base-content/30 relative overflow-hidden rounded-md border text-left shadow-md transition',
                  selected && 'border-primary bg-primary/10 shadow-primary/20',
                )}
                onClick={() => props.onSelect(mapName)}
                onMouseDown={props.onPress}
              >
                <figure className="relative aspect-[16/9] overflow-hidden">
                  <Image
                    className="h-full w-full object-cover transition group-hover:scale-105"
                    src={Util.convertMapPool(mapName, props.game, true)}
                    title={mapLabel}
                  />
                  {selected && (
                    <span className="bg-primary text-primary-content absolute top-2 right-2 grid size-8 place-items-center rounded-full shadow-lg">
                      <FaCheck className="size-4" />
                    </span>
                  )}
                </figure>
                <span className="block truncate px-3 py-3 text-center text-sm font-bold">
                  {mapLabel}
                </span>
              </button>
            );
          })}
        </section>
      </article>
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
  const [selectedGameMode, setSelectedGameMode] = React.useState<CustomGameMode>('classic');
  const [deathmatchDifficulty, setDeathmatchDifficulty] =
    React.useState<DeathmatchDifficulty>('pro');
  const [deathmatchGameTime, setDeathmatchGameTime] = React.useState(10);
  const [deathmatchPlayerLimit, setDeathmatchPlayerLimit] = React.useState(10);
  const [deathmatchHeadshotOnly, setDeathmatchHeadshotOnly] = React.useState(false);
  const [deathmatchPistolsOnly, setDeathmatchPistolsOnly] = React.useState(false);
  const [deathmatchForceBuy, setDeathmatchForceBuy] = React.useState(false);
  const [currentProfile, setCurrentProfile] = React.useState<ProfileData | null>(null);
  const [deathmatchTPlayers, setDeathmatchTPlayers] = React.useState<Array<DeathmatchSlot>>([]);
  const [deathmatchCTPlayers, setDeathmatchCTPlayers] = React.useState<Array<DeathmatchSlot>>([]);
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
  const [arenaModeStatus, setArenaModeStatus] = React.useState<Awaited<
    ReturnType<typeof api.app.arenaModeStatus>
  > | null>(null);
  const [arenaModeInstallPromptVisible, setArenaModeInstallPromptVisible] = React.useState(false);
  const [customGamePlayingStatus, setCustomGamePlayingStatus] =
    React.useState<PlayingStatus | null>(null);
  const [customGamePlayError, setCustomGamePlayError] =
    React.useState<NodeJS.ErrnoException | null>(null);
  const [mapSelectionModalVisible, setMapSelectionModalVisible] = React.useState(false);
  const [mapPool, setMapPool] = React.useState<Array<MapPoolEntry>>([]);
  const navigate = useNavigate();
  const t = useTranslation('windows');
  const previousHomeTeamId = React.useRef<number>();
  const isDeathmatchMode = selectedGameMode === 'deathmatch';
  const deathmatchSlotsPerSide = deathmatchPlayerLimit / 2;
  const selectedDeathmatchDifficulty = React.useMemo(
    () =>
      deathmatchDifficulties.find((difficulty) => difficulty.id === deathmatchDifficulty) ||
      deathmatchDifficulties[0],
    [deathmatchDifficulty],
  );
  const arenaModeInstalled = Boolean(
    arenaModeStatus?.installed &&
      arenaModeStatus.equalizerApoInstalled &&
      arenaModeStatus.valhallaSupermassiveInstalled,
  );

  // load audio files
  const audioRelease = useAudio('button-release.wav');
  const audioClick = useAudio('button-click.wav');
  const audioNegativeAlert = useAudio('negative-alert.wav');
  const lastInvalidGamePathError = React.useRef('');
  const menuMusic = useLoopingAudio('ProJourneyTheme.wav', {
    fadeDuration: 1200,
  });

  React.useEffect(() => {
    api.play.exhibitionFederations().then(setReplacementFederations);

    api.profiles.current().then(async (profile) => {
      setCurrentProfile(profile);
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
      api.app
        .arenaModeStatus(modified)
        .then(setArenaModeStatus)
        .catch(() => setArenaModeStatus(null));
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

  React.useEffect(() => {
    if (!isDeathmatchMode || allPlayersPool.length) {
      return;
    }

    api.play.exhibitionPlayers<typeof Eagers.player>(Eagers.player).then(setAllPlayersPool);
  }, [allPlayersPool.length, isDeathmatchMode]);

  React.useEffect(() => {
    if (!isDeathmatchMode || !allPlayersPool.length) {
      return;
    }

    const userPlayer = currentProfile?.player;
    const userSlot: DeathmatchSlot = {
      id: -1,
      name: 'YOU',
      teamId: currentProfile?.teamId,
      avatar: userPlayer?.avatar || 'resources://avatars/empty.png',
      teamBlazon: currentProfile?.team?.blazon,
      isUser: true,
    };
    const userPlayerId = currentProfile?.playerId || userPlayer?.id;
    const isEligibleDifficultyPlayer = (player: ExhibitionPlayer) => {
      const xp = player.xp || 0;
      return (
        xp >= selectedDeathmatchDifficulty.minXp &&
        (selectedDeathmatchDifficulty.maxXp === undefined ||
          xp <= selectedDeathmatchDifficulty.maxXp)
      );
    };
    const randomPlayers = shuffleDeathmatchPlayers(
      allPlayersPool.filter(
        (player) => player.id !== userPlayerId && isEligibleDifficultyPlayer(player),
      ),
    );
    const tBotCount = Math.max(0, deathmatchSlotsPerSide - 1);
    const tPlayers = randomPlayers.slice(0, tBotCount);
    const ctPlayers = randomPlayers.slice(tBotCount, tBotCount + deathmatchSlotsPerSide);

    setDeathmatchTPlayers([
      userSlot,
      ...tPlayers.map((player) => ({
        id: player.id,
        name: player.name,
        teamId: player.teamId,
        avatar: player.avatar,
        teamBlazon: player.team?.blazon,
      })),
    ]);
    setDeathmatchCTPlayers(
      ctPlayers.map((player) => ({
        id: player.id,
        name: player.name,
        teamId: player.teamId,
        avatar: player.avatar,
        teamBlazon: player.team?.blazon,
      })),
    );
  }, [
    allPlayersPool,
    currentProfile?.player,
    currentProfile?.playerId,
    currentProfile?.team?.blazon,
    deathmatchSlotsPerSide,
    isDeathmatchMode,
    selectedDeathmatchDifficulty,
  ]);

  // handle settings updates
  const onSettingsUpdate = (path: string, value: unknown) => {
    const modified = cloneDeep(settings);
    set(modified, path, value);

    if (path === 'general.game' || path === 'general.steamPath') {
      api.app.detectGame(modified.general.game).then((gamePath) => {
        modified.general.gamePath = gamePath;
        setSettings(modified);
      });
    } else {
      setSettings(modified);
    }

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

  const onToggleSettingsUpdate = (path: string, checked: boolean) => {
    (checked ? audioClick : audioRelease)();
    onSettingsUpdate(path, checked);
  };

  const onArenaModeToggle = (checked: boolean) => {
    if (checked && !arenaModeInstalled) {
      audioNegativeAlert();
      setArenaModeInstallPromptVisible(true);
      return;
    }

    onToggleSettingsUpdate('arenaMode.enabled', checked);
  };

  // validate settings
  React.useEffect(() => {
    // if paths are not explicitly initialized
    // then we won't send a status check yet
    if (settings.general.steamPath === null || settings.general.gamePath === null) {
      return;
    }

    api.app.status(settings).then((status) => {
      const parsed = JSON.parse(status || false) as NodeJS.ErrnoException | false;
      setAppStatus(parsed || undefined);
    });
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

    if (appStatus.code === Constants.ErrorCode.EINVAL) {
      return appStatus.path;
    }

    const [, match] = appStatus.path.match(/((?:csgo|hl|hl2)\.exe)/) || [];
    return match ? appStatus.path : '';
  }, [appStatus]);

  const selectedMap = settings.matchRules.mapOverride || mapPool[0]?.gameMap?.name;
  const hasDuplicateTeams = Boolean(homeTeamId && awayTeamId && homeTeamId === awayTeamId);
  const deathmatchHomeTeamId =
    currentProfile?.teamId ||
    homeTeamId ||
    deathmatchTPlayers.find((player) => Number.isInteger(player.teamId))?.teamId;
  const deathmatchAwayTeamId =
    deathmatchCTPlayers.find(
      (player) => Number.isInteger(player.teamId) && player.teamId !== deathmatchHomeTeamId,
    )?.teamId ||
    awayTeamId ||
    allPlayersPool.find(
      (player) => Number.isInteger(player.teamId) && player.teamId !== deathmatchHomeTeamId,
    )?.teamId;
  const canLaunchDeathmatch = Boolean(
    deathmatchHomeTeamId &&
      deathmatchAwayTeamId &&
      deathmatchHomeTeamId !== deathmatchAwayTeamId &&
      deathmatchTPlayers.length &&
      deathmatchCTPlayers.length,
  );

  const handleLaunchError = React.useCallback(async (error?: unknown) => {
    const launchError = error as NodeJS.ErrnoException;
    const status =
      launchError?.code === Constants.ErrorCode.EABANDONED
        ? null
        : await api.app.status(settings);
    const parsed = JSON.parse(status || false) as NodeJS.ErrnoException | false;
    setAppStatus(parsed || undefined);

    if (parsed && parsed.code === Constants.ErrorCode.EINVAL) {
      if (lastInvalidGamePathError.current !== status) {
        lastInvalidGamePathError.current = status;
        audioNegativeAlert();
      }
      setCustomGamePlayError(parsed);
      return;
    }

    audioNegativeAlert();
    setCustomGamePlayError({
      code: Constants.ErrorCode.EABANDONED,
      message: launchError?.message || 'The match was abandoned.',
    } as NodeJS.ErrnoException);
  }, [audioNegativeAlert, settings]);

  const runCustomGameLaunch = React.useCallback(
    async (launch: () => Promise<unknown>) => {
      setCustomGamePlayError(null);
      setCustomGamePlayingStatus('PREPARING_MATCH');
      setCustomGameMusicPaused(true);
      menuMusic.fadeOut();

      const removeProgressListener = api.ipc.on(
        Constants.IPCRoute.PLAY_PROGRESS,
        (payload: { status?: PlayingStatus }) => {
          if (!payload?.status) {
            return;
          }

          setCustomGamePlayingStatus(payload.status);
        },
      );

      try {
        await launch();
        setCustomGamePlayingStatus('SAVING_RESULTS');
      } catch (error) {
        setCustomGamePlayingStatus(null);
        await handleLaunchError(error);
      } finally {
        removeProgressListener();
        setCustomGamePlayingStatus(null);
        setCustomGameMusicPaused(false);
      }
    },
    [handleLaunchError, menuMusic],
  );
  const customGamePlayingStatusIndex = Math.max(
    0,
    PLAYING_STATUS_STEPS.findIndex((step) => step === customGamePlayingStatus),
  );
  const customGamePlayingProgressValue =
    ((customGamePlayingStatusIndex + 1) / PLAYING_STATUS_STEPS.length) * 100;

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

  React.useEffect(() => {
    if (!mapSelectionModalVisible) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMapSelectionModalVisible(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mapSelectionModalVisible]);

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
    <main className="frosted relative flex h-full w-full pl-64">
      <FaArrowLeft
        className="absolute top-5 left-5 z-10 size-5 cursor-pointer"
        onClick={() => navigate('/')}
        onMouseDown={audioRelease}
      />
      <nav className="border-base-content/10 bg-base-300/35 absolute inset-y-0 left-0 flex w-56 flex-col gap-3 overflow-y-auto border-r px-5 pt-28 pb-5 shadow-2xl">
        <button
          type="button"
          className={cx(
            'group border-base-content/20 bg-base-300/60 overflow-hidden rounded-md border text-left shadow-lg transition',
            selectedGameMode === 'classic' && 'border-primary bg-base-200/80 shadow-primary/20',
          )}
          onMouseDown={() => {
            audioClick();
            setSelectedGameMode('classic');
          }}
        >
          <img
            alt=""
            className="h-28 w-full object-cover"
            draggable={false}
            src={classicModeImage}
          />
          <span className="block px-4 py-3 text-base font-semibold">Classic 5v5</span>
        </button>
        <button
          type="button"
          className={cx(
            'border-base-content/20 bg-base-300/35 overflow-hidden rounded-md border text-left shadow-lg transition',
            selectedGameMode === 'deathmatch'
              ? 'border-primary bg-base-200/80 shadow-primary/20'
              : 'hover:border-base-content/40',
          )}
          onMouseDown={() => {
            audioClick();
            setSelectedGameMode('deathmatch');
          }}
        >
          <img
            alt=""
            className="h-28 w-full object-cover"
            draggable={false}
            src={deathmatchModeImage}
          />
          <span className="block px-4 py-3 text-base font-semibold">Deathmatch</span>
        </button>
        <button
          type="button"
          className="border-base-content/10 bg-base-300/35 overflow-hidden rounded-md border text-left opacity-50 shadow-lg"
          aria-disabled
          onMouseDown={audioNegativeAlert}
        >
          <figure className="relative h-28 w-full overflow-hidden">
            <img
              alt=""
              className="h-full w-full object-cover blur-[1px] grayscale"
              draggable={false}
              src={comingSoonModeImage}
            />
            <span className="bg-base-300/75 absolute inset-0 grid place-items-center">
              <FaLock className="size-8" />
            </span>
          </figure>
          <span className="block px-4 py-3 text-base font-semibold">Coming Soon</span>
        </button>
        {[
          { label: '?', image: mysteryModeImage1 },
          { label: '?', image: mysteryModeImage2 },
        ].map((slot, index) => (
          <button
            key={index}
            type="button"
            className="border-base-content/10 bg-base-300/35 overflow-hidden rounded-md border text-left opacity-50 shadow-lg"
            aria-disabled
            onMouseDown={audioNegativeAlert}
          >
            <figure className="relative h-28 w-full overflow-hidden">
              <img
                alt=""
                className="h-full w-full scale-105 object-cover opacity-55 blur-[4px] grayscale"
                draggable={false}
                src={slot.image}
              />
              <span className="bg-base-300/65 absolute inset-0 grid place-items-center backdrop-blur-[1px]">
                <FaLock className="size-8 opacity-80" />
              </span>
            </figure>
            <span className="block px-4 py-3 text-center text-base font-semibold">
              {slot.label}
            </span>
          </button>
        ))}
      </nav>
      {!isDeathmatchMode && (
        <React.Fragment>
          <TeamSelector
            excludedTeamId={awayTeamId}
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
            <SelectedMapPanel
              buttonClassName="h-12 w-44"
              game={settings.general.game}
              imageClassName="h-24 w-44"
              selectedMap={selectedMap}
              wrapperClassName="mt-4"
              onOpen={() => setMapSelectionModalVisible(true)}
              onPress={audioClick}
            />
          </section>
          <TeamSelector
            excludedTeamId={homeTeamId}
            initialFederationId={2}
            initialTierId={4}
            initialTeamId={awayTeamId}
            onChange={setAwayTeamId}
            onTeamUpdate={setAwayTeam}
            onEditRoster={openRosterEditor}
          />
        </React.Fragment>
      )}
      {isDeathmatchMode && (
        <section className="flex flex-1 items-center justify-center gap-10 px-8">
          <DeathmatchLineupColumn
            icon="resources://avatars/t.png"
            maxSlots={deathmatchSlotsPerSide}
            title="T Side"
            players={deathmatchTPlayers}
          />
          <section className="center w-80 gap-5 text-center">
            <details className="dropdown h-16 w-80">
              <summary className="btn border-primary/60 bg-primary/20 text-primary hover:bg-primary/30 h-full w-full rounded-md border text-xl font-black shadow-lg">
                {selectedDeathmatchDifficulty.label}
              </summary>
              <ul className="dropdown-content bg-base-200 border-base-content/10 rounded-box z-20 mt-1 flex w-80 flex-col gap-1 border p-1 shadow-2xl">
                {deathmatchDifficulties.map((difficulty) => (
                  <li key={difficulty.id} className="w-full">
                    <button
                      type="button"
                      className={cx(
                        'hover:bg-base-300 w-full rounded px-4 py-4 text-center text-lg font-bold',
                        deathmatchDifficulty === difficulty.id && 'bg-primary/20 text-primary',
                      )}
                      onClick={() => {
                        audioClick();
                        setDeathmatchDifficulty(difficulty.id);
                      }}
                    >
                      {difficulty.label}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
            <SelectedMapPanel
              buttonClassName="h-16 w-80 text-base"
              game={settings.general.game}
              imageClassName="h-52 w-80"
              selectedMap={selectedMap}
              wrapperClassName=""
              onOpen={() => setMapSelectionModalVisible(true)}
              onPress={audioClick}
            />
          </section>
          <DeathmatchLineupColumn
            icon="resources://avatars/ct.png"
            maxSlots={deathmatchSlotsPerSide}
            title="CT Side"
            players={deathmatchCTPlayers}
          />
        </section>
      )}
      <section
        className={cx(
          'flex w-[36rem] shrink-0 flex-col',
          isDeathmatchMode ? 'p-4' : 'py-4 pr-0 pl-8',
        )}
      >
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
            {isDeathmatchMode && (
              <React.Fragment>
                <article>
                  <header>
                    <p>Game Time</p>
                  </header>
                  <aside>
                    <select
                      className="select w-full"
                      value={deathmatchGameTime}
                      onChange={(event) => {
                        audioClick();
                        setDeathmatchGameTime(Number(event.target.value));
                      }}
                    >
                      {deathmatchGameTimeOptions.map((option) => (
                        <option key={option} value={option}>
                          {option} min
                        </option>
                      ))}
                    </select>
                  </aside>
                </article>
                <article>
                  <header>
                    <p className="inline-flex w-fit items-center gap-2">
                      <span>Player Limit</span>
                      <span
                        className="tooltip tooltip-right text-base-content/60 !static !h-auto"
                        data-tip="More players increase server load. Low-end systems may struggle with higher player counts."
                      >
                        <FaInfoCircle />
                      </span>
                    </p>
                  </header>
                  <aside>
                    <select
                      className="select w-full"
                      value={deathmatchPlayerLimit}
                      onChange={(event) => {
                        audioClick();
                        setDeathmatchPlayerLimit(Number(event.target.value));
                      }}
                    >
                      {deathmatchPlayerLimitOptions.map((option) => (
                        <option key={option} value={option}>
                          {option} players
                        </option>
                      ))}
                    </select>
                  </aside>
                </article>
                <article>
                  <header>
                    <p className="flex items-center gap-4 not-italic">
                      <span className="border-base-content/20 flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden border-r pr-4">
                        <img
                          alt=""
                          className="h-12 w-20 object-contain"
                          draggable={false}
                          src={headshotOnlyIcon}
                        />
                      </span>
                      <span>Headshot Only</span>
                    </p>
                  </header>
                  <aside>
                    <input
                      type="checkbox"
                      data-interaction-sound="none"
                      className="toggle"
                      checked={deathmatchHeadshotOnly}
                      onChange={(event) => {
                        (event.target.checked ? audioClick : audioRelease)();
                        setDeathmatchHeadshotOnly(event.target.checked);
                      }}
                    />
                  </aside>
                </article>
                <article>
                  <header>
                    <p className="flex items-center gap-4 not-italic">
                      <span className="border-base-content/20 flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden border-r pr-4">
                        <img
                          alt=""
                          className="h-10 w-20 object-contain"
                          draggable={false}
                          src={uspsIcon}
                        />
                      </span>
                      <span>Pistols Only</span>
                    </p>
                  </header>
                  <aside>
                    <input
                      type="checkbox"
                      data-interaction-sound="none"
                      className="toggle"
                      checked={deathmatchPistolsOnly}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        (checked ? audioClick : audioRelease)();
                        setDeathmatchPistolsOnly(checked);

                        if (checked) {
                          setDeathmatchForceBuy(false);
                        }
                      }}
                    />
                  </aside>
                </article>
                <article>
                  <header>
                    <p className="flex items-center gap-4 not-italic">
                      <span className="border-base-content/20 flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden border-r pr-4">
                        <img
                          alt=""
                          className="h-10 w-20 object-contain"
                          draggable={false}
                          src={mp9Icon}
                        />
                      </span>
                      <span>Force Buy</span>
                    </p>
                  </header>
                  <aside>
                    <input
                      type="checkbox"
                      data-interaction-sound="none"
                      className="toggle"
                      checked={deathmatchForceBuy}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        (checked ? audioClick : audioRelease)();
                        setDeathmatchForceBuy(checked);

                        if (checked) {
                          setDeathmatchPistolsOnly(false);
                        }
                      }}
                    />
                  </aside>
                </article>
              </React.Fragment>
            )}
            {!isDeathmatchMode && (
              <React.Fragment>
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
                        data-interaction-sound="none"
                        className="toggle"
                        checked={settings.gameSettings[weapon.setting]}
                        onChange={(event) =>
                          onToggleSettingsUpdate(weapon.path, event.target.checked)
                        }
                      />
                    </aside>
                  </article>
                ))}
                <article className={cx(!arenaModeInstalled && 'opacity-50')}>
                  <header>
                    <p className="flex items-center gap-4 not-italic">
                      <span className="border-base-content/20 flex h-14 w-24 shrink-0 items-center justify-center overflow-visible border-r pr-4">
                        <img
                          alt=""
                          className="h-14 w-14 object-contain"
                          draggable={false}
                          src={arenaModeIcon}
                        />
                      </span>
                      <span>Arena Mode</span>
                    </p>
                    <p>Adds crowd noise and arena bass to your custom match.</p>
                    {!arenaModeInstalled && (
                      <p className="text-error">
                        Arena Mode isn't installed. Install it from Game Settings.
                      </p>
                    )}
                  </header>
                  <aside>
                    <input
                      type="checkbox"
                      aria-disabled={!arenaModeInstalled}
                      data-interaction-sound="none"
                      className="toggle"
                      checked={arenaModeInstalled && settings.arenaMode.enabled}
                      onChange={(event) => onArenaModeToggle(event.target.checked)}
                    />
                  </aside>
                </article>
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
                      data-interaction-sound="none"
                      className="toggle"
                      checked={spectating}
                      onChange={(event) => {
                        (event.target.checked ? audioClick : audioRelease)();
                        onSpectatingToggle(event.target.checked);
                      }}
                    />
                  </aside>
                </article>
              </React.Fragment>
            )}
          </fieldset>
        </form>
        <button
          className="btn btn-xl btn-block btn-primary"
          disabled={isDeathmatchMode ? !canLaunchDeathmatch : hasDuplicateTeams}
          onMouseDown={audioClick}
          onClick={() => {
            if (isDeathmatchMode) {
              if (!canLaunchDeathmatch || !deathmatchHomeTeamId || !deathmatchAwayTeamId) {
                audioNegativeAlert();
                return;
              }

              return runCustomGameLaunch(() =>
                api.play.exhibition(
                  {
                    ...settings,
                    arenaMode: {
                      ...settings.arenaMode,
                      enabled: false,
                    },
                  },
                  [deathmatchHomeTeamId, deathmatchAwayTeamId],
                  deathmatchHomeTeamId,
                  [
                    {
                      teamId: deathmatchHomeTeamId,
                      playerIds: deathmatchTPlayers
                        .map((player) => player.id)
                        .filter((playerId): playerId is number => Number.isInteger(playerId)),
                    },
                    {
                      teamId: deathmatchAwayTeamId,
                      playerIds: deathmatchCTPlayers
                        .map((player) => player.id)
                        .filter((playerId): playerId is number => Number.isInteger(playerId)),
                    },
                  ],
                  false,
                  {
                    mode: 'deathmatch',
                    deathmatch: {
                      gameTime: deathmatchGameTime,
                      playerLimit: deathmatchPlayerLimit,
                      headshotOnly: deathmatchHeadshotOnly,
                      pistolsOnly: deathmatchPistolsOnly,
                      forceBuy: deathmatchForceBuy,
                    },
                  },
                ),
              );
            }

            if (hasDuplicateTeams) {
              return;
            }

            const orderedTeamIds = isUserCT ? [awayTeamId, homeTeamId] : [homeTeamId, awayTeamId];

            return runCustomGameLaunch(() =>
              api.play.exhibition(
                {
                  ...settings,
                  arenaMode: {
                    ...settings.arenaMode,
                    enabled: arenaModeInstalled && settings.arenaMode.enabled,
                  },
                },
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
                {
                  mode: 'classic',
                },
              ),
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
      {arenaModeInstallPromptVisible && (
        <section className="bg-base-300/80 fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
          <article className="bg-base-100 border-base-content/10 max-w-lg border p-6 shadow-2xl">
            <header className="stack-y mb-6">
              <p className="text-lg font-bold">Arena Mode isn't installed</p>
              <p>Install Arena Mode from the Game Settings tab before enabling it.</p>
            </header>
            <footer className="flex justify-end">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setArenaModeInstallPromptVisible(false)}
              >
                Okay
              </button>
            </footer>
          </article>
        </section>
      )}
      {mapSelectionModalVisible && (
        <MapSelectionModal
          game={settings.general.game}
          mapPool={mapPool}
          selectedMap={selectedMap}
          onClose={() => setMapSelectionModalVisible(false)}
          onPress={audioClick}
          onSelect={(map) => {
            onMapSelection(map);
            setMapSelectionModalVisible(false);
          }}
        />
      )}
      {!!customGamePlayingStatus && (
        <section className="bg-base-300/80 fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
          <article className="bg-base-100 border-base-content/10 max-w-lg border p-6 shadow-2xl">
            <header className="stack-y mb-5">
              <div className="flex items-center gap-3">
                <FaSpinner className="text-warning size-8 shrink-0 animate-spin" />
                <p className="text-lg font-bold">{t('main.dashboard.playingMatchTitle')}</p>
              </div>
              <p className="opacity-70">{t('main.dashboard.playingMatchSubtitle')}</p>
            </header>
            <article className="bg-base-200 rounded p-4">
              <p className="text-sm uppercase opacity-60">
                {t('main.dashboard.matchStartupStatus')}
              </p>
              <p className="font-bold">
                {t(`main.dashboard.playingStatus.${customGamePlayingStatus}`)}
              </p>
              <progress
                className="progress progress-warning mt-4 w-full"
                value={customGamePlayingProgressValue}
                max="100"
              />
              <ul className="mt-4 space-y-2 text-sm">
                {PLAYING_STATUS_STEPS.map((step, idx) => {
                  const isComplete = idx < customGamePlayingStatusIndex;
                  const isActive = idx === customGamePlayingStatusIndex;

                  return (
                    <li
                      key={step}
                      className={cx(
                        'flex items-center gap-2',
                        isActive && 'font-bold',
                        !isActive && !isComplete && 'opacity-50',
                      )}
                    >
                      {isComplete ? (
                        <FaCheck className="text-success" />
                      ) : (
                        <span
                          className={cx(
                            'border-base-content/40 block size-4 rounded-full border',
                            isActive && 'border-warning bg-warning',
                          )}
                        />
                      )}
                      <span>{t(`main.dashboard.playingStatus.${step}`)}</span>
                    </li>
                  );
                })}
              </ul>
            </article>
          </article>
        </section>
      )}
      {!!customGamePlayError && (
        <section className="bg-base-300/80 fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
          <article className="bg-base-100 border-base-content/10 max-w-lg border p-6 shadow-2xl">
            <header className="stack-y mb-6">
              <div className="flex items-center gap-3">
                <FaExclamationTriangle className="text-warning size-8 shrink-0" />
                <p className="text-lg font-bold">
                  {t(
                    customGamePlayError.code === Constants.ErrorCode.EINVAL
                      ? 'main.dashboard.gamePathInvalidTitle'
                      : 'main.dashboard.matchAbandonedTitle',
                  )}
                </p>
              </div>
              <p>
                {t(
                  customGamePlayError.code === Constants.ErrorCode.EINVAL
                    ? 'main.dashboard.gamePathInvalid'
                    : 'main.dashboard.matchAbandonedSubtitle',
                )}
              </p>
              {customGamePlayError.code === Constants.ErrorCode.EINVAL &&
                !!customGamePlayError.path && (
                <p
                  className="bg-base-200 truncate p-2 text-sm"
                  title={customGamePlayError.path}
                >
                  {customGamePlayError.path}
                </p>
              )}
            </header>
            <footer className="flex justify-end gap-2">
              <button
                type="button"
                data-interaction-sound="back"
                className="btn"
                onClick={() => setCustomGamePlayError(null)}
              >
                OK
              </button>
              {customGamePlayError.code === Constants.ErrorCode.EINVAL && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setCustomGamePlayError(null);
                    api.app
                      .dialog(Constants.WindowIdentifier.Landing, {
                        properties: ['openDirectory'],
                      })
                      .then(
                        (dialogData) =>
                          !dialogData.canceled &&
                          onSettingsUpdate('general.gamePath', dialogData.filePaths[0]),
                      );
                  }}
                >
                  {t('main.dashboard.openSettings')}
                </button>
              )}
            </footer>
          </article>
        </section>
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
