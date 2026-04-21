'use client';

import { useEffect, useRef, useCallback } from 'react';

const PREFERENCE_KEY = 'nos.notifications.audio.itemDone';
const DEBOUNCE_MS = 250;
const ASSET_URL = '/sounds/item-done.mp3';

function isEnabled(): boolean {
  try {
    return window.localStorage.getItem(PREFERENCE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function useItemDoneSound(): () => void {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastPlayedRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const audio = new Audio(ASSET_URL);
    audio.preload = 'auto';
    audio.load();
    audioRef.current = audio;
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  return useCallback(() => {
    if (typeof window === 'undefined') return;
    if (typeof document === 'undefined' || typeof document.visibilityState === 'undefined') {
      return;
    }
    if (!isEnabled()) return;

    const now = Date.now();
    if (now - lastPlayedRef.current < DEBOUNCE_MS) return;
    lastPlayedRef.current = now;

    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.currentTime = 0;
      const result = audio.play();
      if (result && typeof result.catch === 'function') {
        result.catch((err) => {
          console.warn('item-done sound playback rejected:', err);
        });
      }
    } catch (err) {
      console.warn('item-done sound playback threw:', err);
    }
  }, []);
}
