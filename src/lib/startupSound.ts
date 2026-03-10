const STARTUP_SOUND_PENDING_KEY = "startupSoundPending";
const STARTUP_SOUND_PLAYED_KEY = "startupSoundPlayed";
const STARTUP_SOUND_VERSION_KEY = "startupSoundVersion";
const STARTUP_SOUND_ENABLED_KEY = "startupSoundEnabled";
const STARTUP_SOUND_VERSION = "startupintro-20260221-v2";
const STARTUP_SOUND_VOLUME = 0.85;

export const STARTUP_SOUND_SRC = "/startupintro.mp3?v=20260221-v2";
export const HOME_HERO_READY_EVENT = "app:home-first-image-ready";

let startupAudio: HTMLAudioElement | null = null;
let homeHeroReady = false;
let isAudioPlaying = false;

const safeGetSession = (key: string) => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSetSession = (key: string, value: string) => {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Ignore storage errors (private mode, strict browser settings).
  }
};

const safeRemoveSession = (key: string) => {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Ignore storage errors (private mode, strict browser settings).
  }
};

const safeGetLocal = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const queueStartupSound = () => {
  safeSetSession(STARTUP_SOUND_PENDING_KEY, "1");
};

export const isStartupSoundPending = () =>
  safeGetSession(STARTUP_SOUND_PENDING_KEY) === "1";

export const clearStartupSoundPending = () => {
  safeRemoveSession(STARTUP_SOUND_PENDING_KEY);
};

export const hasStartupSoundPlayed = () =>
  safeGetSession(STARTUP_SOUND_PLAYED_KEY) === "1" &&
  safeGetSession(STARTUP_SOUND_VERSION_KEY) === STARTUP_SOUND_VERSION;

export const markStartupSoundPlayed = () => {
  safeSetSession(STARTUP_SOUND_PLAYED_KEY, "1");
  safeSetSession(STARTUP_SOUND_VERSION_KEY, STARTUP_SOUND_VERSION);
  safeRemoveSession(STARTUP_SOUND_PENDING_KEY);
  isAudioPlaying = false;
};

const getStartupAudio = () => {
  if (!startupAudio) {
    const audio = new Audio(STARTUP_SOUND_SRC);
    audio.preload = "auto";
    audio.volume = STARTUP_SOUND_VOLUME;
    startupAudio = audio;
  }
  return startupAudio;
};

export const warmStartupSound = () => {
  if (typeof window === "undefined") return;
  const audio = getStartupAudio();
  audio.load();
};

// Called from an explicit user gesture (login submit) to minimize autoplay delays later.
export const primeStartupSoundFromGesture = async () => {
  if (typeof window === "undefined") return;
  const audio = getStartupAudio();
  const prevMuted = audio.muted;
  const prevVolume = audio.volume;

  audio.muted = true;
  audio.volume = 0;

  try {
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
  } catch {
    // Ignore; manager has robust fallback logic.
  } finally {
    audio.muted = prevMuted;
    audio.volume = prevVolume || STARTUP_SOUND_VOLUME;
  }
};

export const playStartupSound = async () => {
  // Prevent double playback
  if (isAudioPlaying || hasStartupSoundPlayed()) {
    return;
  }

  isAudioPlaying = true;
  const audio = getStartupAudio();
  audio.muted = false;
  audio.volume = STARTUP_SOUND_VOLUME;
  audio.currentTime = 0;

  try {
    await audio.play();
  } catch (error) {
    isAudioPlaying = false;
    throw error;
  }
};

export const releaseStartupSoundAudio = () => {
  if (!startupAudio) return;
  startupAudio.pause();
  startupAudio.src = "";
  startupAudio = null;
  isAudioPlaying = false;
};

export const announceHomeHeroReady = () => {
  homeHeroReady = true;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(HOME_HERO_READY_EVENT));
};

export const consumeHomeHeroReady = () => {
  if (!homeHeroReady) return false;
  homeHeroReady = false;
  return true;
};

// Optional user setting; default is enabled if not set.
export const isStartupSoundEnabled = () => {
  const value = safeGetLocal(STARTUP_SOUND_ENABLED_KEY);
  return value !== "0" && value !== "false";
};
