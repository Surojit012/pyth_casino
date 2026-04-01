'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { soundEngine, type SoundCue } from '@/lib/sound';

interface SoundContextValue {
  soundEnabled: boolean;
  toggleSound: () => void;
  playCue: (cue: SoundCue) => void;
  unlockAudio: () => void;
}

const STORAGE_KEY = 'pyth_casino_sound_enabled';
const SoundContext = createContext<SoundContextValue | undefined>(undefined);

function getInitialSoundPreference() {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const [soundEnabled, setSoundEnabled] = useState(getInitialSoundPreference);

  useEffect(() => {
    soundEngine.setEnabled(soundEnabled);
    try {
      localStorage.setItem(STORAGE_KEY, soundEnabled ? '1' : '0');
    } catch {
      // Ignore localStorage errors.
    }
  }, [soundEnabled]);

  const value = useMemo<SoundContextValue>(() => ({
    soundEnabled,
    toggleSound: () => setSoundEnabled(prev => !prev),
    playCue: (cue: SoundCue) => soundEngine.playCue(cue),
    unlockAudio: () => {
      void soundEngine.unlock();
    },
  }), [soundEnabled]);

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSound() {
  const context = useContext(SoundContext);
  if (!context) throw new Error('useSound must be used within SoundProvider');
  return context;
}
