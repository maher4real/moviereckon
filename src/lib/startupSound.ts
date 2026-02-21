const STARTUP_SOUND_PENDING_KEY = "startupSoundPending";
const STARTUP_SOUND_PLAYED_KEY = "startupSoundPlayed";
const STARTUP_SOUND_ENABLED_KEY = "startupSoundEnabled";

export const STARTUP_SOUND_SRC = "/startupintro.mp3";

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

export const isStartupSoundPending = () => safeGetSession(STARTUP_SOUND_PENDING_KEY) === "1";

export const clearStartupSoundPending = () => {
  safeRemoveSession(STARTUP_SOUND_PENDING_KEY);
};

export const hasStartupSoundPlayed = () => safeGetSession(STARTUP_SOUND_PLAYED_KEY) === "1";

export const markStartupSoundPlayed = () => {
  safeSetSession(STARTUP_SOUND_PLAYED_KEY, "1");
  safeRemoveSession(STARTUP_SOUND_PENDING_KEY);
};

// Optional user setting; default is enabled if not set.
export const isStartupSoundEnabled = () => {
  const value = safeGetLocal(STARTUP_SOUND_ENABLED_KEY);
  return value !== "0" && value !== "false";
};
