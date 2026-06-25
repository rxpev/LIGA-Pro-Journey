const CUSTOM_GAME_MUSIC_PAUSED_STORAGE_KEY = 'customGameMusicPaused';
const CUSTOM_GAME_MUSIC_PAUSED_EVENT = 'custom-game-music-paused';

export function isCustomGameMusicPaused() {
  return window.sessionStorage.getItem(CUSTOM_GAME_MUSIC_PAUSED_STORAGE_KEY) === '1';
}

export function setCustomGameMusicPaused(paused: boolean) {
  if (paused) {
    window.sessionStorage.setItem(CUSTOM_GAME_MUSIC_PAUSED_STORAGE_KEY, '1');
  } else {
    window.sessionStorage.removeItem(CUSTOM_GAME_MUSIC_PAUSED_STORAGE_KEY);
  }

  window.dispatchEvent(
    new CustomEvent<boolean>(CUSTOM_GAME_MUSIC_PAUSED_EVENT, {
      detail: paused,
    }),
  );
}

export function onCustomGameMusicPausedChange(callback: (paused: boolean) => void) {
  const onCustomGameMusicPaused = (event: Event) => {
    callback((event as CustomEvent<boolean>).detail);
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key === CUSTOM_GAME_MUSIC_PAUSED_STORAGE_KEY) {
      callback(isCustomGameMusicPaused());
    }
  };

  window.addEventListener(CUSTOM_GAME_MUSIC_PAUSED_EVENT, onCustomGameMusicPaused);
  window.addEventListener('storage', onStorage);

  return () => {
    window.removeEventListener(CUSTOM_GAME_MUSIC_PAUSED_EVENT, onCustomGameMusicPaused);
    window.removeEventListener('storage', onStorage);
  };
}
