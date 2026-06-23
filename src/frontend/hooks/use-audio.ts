/**
 * Audio API hook.
 *
 * @module
 */
import React from 'react';
import { Constants, Util } from '@liga/shared';
import { AppStateContext } from '@liga/frontend/redux';

interface LoopingAudioOptions {
  enabled?: boolean;
  fadeDuration?: number;
}

interface ManagedAudio {
  audio: HTMLAudioElement;
  fadeInterval?: number;
  retrying: boolean;
}

const loopingAudio = new Map<string, ManagedAudio>();

function getLoopingAudio(src: string) {
  const existing = loopingAudio.get(src);

  if (existing) {
    return existing;
  }

  const audio = new Audio('resources://audio/' + src);
  audio.loop = true;

  const managed = {
    audio,
    retrying: false,
  };

  loopingAudio.set(src, managed);
  return managed;
}

function cancelFade(managed: ManagedAudio) {
  if (!managed.fadeInterval) {
    return;
  }

  window.clearInterval(managed.fadeInterval);
  managed.fadeInterval = undefined;
}

function fadeOutAudio(managed: ManagedAudio, duration: number) {
  cancelFade(managed);

  const audio = managed.audio;
  const startVolume = audio.volume;
  const startedAt = Date.now();

  if (duration <= 0 || startVolume <= 0) {
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 0;
    return;
  }

  managed.fadeInterval = window.setInterval(() => {
    const progress = Math.min(1, (Date.now() - startedAt) / duration);
    audio.volume = startVolume * (1 - progress);

    if (progress >= 1) {
      cancelFade(managed);
      audio.pause();
      audio.currentTime = 0;
    }
  }, 50);
}

/**
 * Audio API.
 *
 * @param src The audio source.
 * @function
 */
export function useAudio(src: string | null) {
  // load audio file
  const audioRef = React.useRef<HTMLAudioElement>();
  const srcRef = React.useRef<string | null>(null);

  if (src && (!audioRef.current || srcRef.current !== src)) {
    audioRef.current = new Audio('resources://audio/' + src);
    srcRef.current = src;
  } else if (!src) {
    audioRef.current = undefined;
    srcRef.current = null;
  }

  // load settings
  const { state } = React.useContext(AppStateContext);
  const settings = React.useMemo(
    () => (state.profile ? Util.loadSettings(state.profile.settings) : Constants.Settings),
    [state.profile],
  );

  // apply volume setting
  React.useEffect(() => {
    if (!audioRef.current) {
      return;
    }

    audioRef.current.volume = settings.general.volume;
  }, [audioRef, settings]);

  // playback audio
  const play = () => {
    if (src && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
    }
  };

  return play;
}

/**
 * Looping audio hook for longer music beds.
 *
 * @param src The audio source.
 * @param options Looping playback options.
 * @function
 */
export function useLoopingAudio(src: string | null, options: LoopingAudioOptions) {
  // load settings
  const { state } = React.useContext(AppStateContext);
  const settings = React.useMemo(
    () => (state.profile ? Util.loadSettings(state.profile.settings) : Constants.Settings),
    [state.profile],
  );
  const targetVolume = settings.general.musicVolume;
  const fadeDuration = options.fadeDuration ?? 1000;
  const managed = React.useMemo(() => (src ? getLoopingAudio(src) : null), [src]);

  const play = React.useCallback(async () => {
    if (!managed || !src) {
      return;
    }

    cancelFade(managed);
    managed.audio.volume = targetVolume;

    try {
      await managed.audio.play();
      managed.retrying = false;
    } catch {
      managed.retrying = true;
    }
  }, [managed, src, targetVolume]);

  const fadeOut = React.useCallback(() => {
    if (!managed) {
      return;
    }

    managed.retrying = false;
    fadeOutAudio(managed, fadeDuration);
  }, [fadeDuration, managed]);

  React.useEffect(() => {
    if (!managed) {
      return;
    }

    if (typeof options.enabled === 'undefined') {
      return;
    }

    if (!options.enabled) {
      fadeOut();
      return;
    }

    play();
  }, [fadeOut, managed, options.enabled, play]);

  React.useEffect(() => {
    if (!managed || !options.enabled) {
      return;
    }

    managed.audio.volume = targetVolume;
  }, [managed, options.enabled, targetVolume]);

  React.useEffect(() => {
    if (!managed || !options.enabled) {
      return;
    }

    const retryPlayback = () => {
      if (managed.retrying || managed.audio.paused) {
        play();
      }
    };

    window.addEventListener('pointerdown', retryPlayback);
    window.addEventListener('keydown', retryPlayback);

    return () => {
      window.removeEventListener('pointerdown', retryPlayback);
      window.removeEventListener('keydown', retryPlayback);
    };
  }, [managed, options.enabled, play]);

  return React.useMemo(
    () => ({
      fadeOut,
      play,
    }),
    [fadeOut, play],
  );
}
