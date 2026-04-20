/**
 * Browser notification wrapper — handles permission state, settings, and firing.
 * Uses Web Notifications API with localStorage settings for preferences.
 */

const SETTINGS_KEYS = {
  BROWSER_ENABLED: 'nos.notifications.browser.enabled',
  ON_ITEM_DONE: 'nos.notifications.browser.onItemDone',
  ON_ITEM_FAILED: 'nos.notifications.browser.onItemFailed',
  ON_STAGE_TRANSITION: 'nos.notifications.browser.onStageTransition',
  ON_NEW_COMMENT: 'nos.notifications.browser.onNewComment',
  TOAST_MUTE: 'nos.notifications.toast.muteNonError',
} as const;

type SettingKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];

function getSetting(key: SettingKey): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const val = window.localStorage.getItem(key);
    // Default to true for certain settings
    if (val === null) {
      if (key === SETTINGS_KEYS.ON_ITEM_DONE || key === SETTINGS_KEYS.ON_ITEM_FAILED) {
        return true;
      }
      return false;
    }
    return val === '1';
  } catch {
    return false;
  }
}

function setSetting(key: SettingKey, value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // Storage unavailable
  }
}

// Re-export settings keys for external use
export { SETTINGS_KEYS };

export function isBrowserNotificationEnabled(): boolean {
  return getSetting(SETTINGS_KEYS.BROWSER_ENABLED);
}

export function isItemDoneNotificationEnabled(): boolean {
  return getSetting(SETTINGS_KEYS.ON_ITEM_DONE);
}

export function isItemFailedNotificationEnabled(): boolean {
  return getSetting(SETTINGS_KEYS.ON_ITEM_FAILED);
}

export function isStageTransitionNotificationEnabled(): boolean {
  return getSetting(SETTINGS_KEYS.ON_STAGE_TRANSITION);
}

export function isNewCommentNotificationEnabled(): boolean {
  return getSetting(SETTINGS_KEYS.ON_NEW_COMMENT);
}

export function isToastMuted(): boolean {
  return getSetting(SETTINGS_KEYS.TOAST_MUTE);
}

export function setBrowserNotificationEnabled(value: boolean): void {
  setSetting(SETTINGS_KEYS.BROWSER_ENABLED, value);
}

export function setItemDoneNotificationEnabled(value: boolean): void {
  setSetting(SETTINGS_KEYS.ON_ITEM_DONE, value);
}

export function setItemFailedNotificationEnabled(value: boolean): void {
  setSetting(SETTINGS_KEYS.ON_ITEM_FAILED, value);
}

export function setStageTransitionNotificationEnabled(value: boolean): void {
  setSetting(SETTINGS_KEYS.ON_STAGE_TRANSITION, value);
}

export function setNewCommentNotificationEnabled(value: boolean): void {
  setSetting(SETTINGS_KEYS.ON_NEW_COMMENT, value);
}

export function setToastMuted(value: boolean): void {
  setSetting(SETTINGS_KEYS.TOAST_MUTE, value);
}

/**
 * Request permission from the user. Returns the resulting permission state.
 */
export async function requestPermission(): Promise<'granted' | 'denied' | 'default'> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'default';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    return 'denied';
  }

  // Must be triggered by user gesture
  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted' ? 'granted' : permission === 'denied' ? 'denied' : 'default';
  } catch {
    return 'default';
  }
}

/**
 * Get current permission state without requesting.
 */
export function getPermissionState(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  return Notification.permission as 'granted' | 'denied' | 'default';
}

/**
 * Fire a browser notification if permissions and settings allow.
 */
export function notifyBrowser(options: {
  title: string;
  body?: string;
  icon?: string;
}): void {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  if (!isBrowserNotificationEnabled()) return;
  if (Notification.permission !== 'granted') return;

  try {
    new Notification(options.title, {
      body: options.body,
      icon: options.icon ?? '/icon.png',
    });
  } catch (err) {
    console.warn('Failed to show browser notification:', err);
  }
}

// Settings API for React components
export interface NotificationSettings {
  browserEnabled: boolean;
  onItemDone: boolean;
  onItemFailed: boolean;
  onStageTransition: boolean;
  onNewComment: boolean;
  muteNonError: boolean;
}

export function getNotificationSettings(): NotificationSettings {
  return {
    browserEnabled: isBrowserNotificationEnabled(),
    onItemDone: isItemDoneNotificationEnabled(),
    onItemFailed: isItemFailedNotificationEnabled(),
    onStageTransition: isStageTransitionNotificationEnabled(),
    onNewComment: isNewCommentNotificationEnabled(),
    muteNonError: isToastMuted(),
  };
}