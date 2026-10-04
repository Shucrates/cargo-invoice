export type NotifyTone = 'error' | 'info' | 'success';

export interface NotifyDetail {
  message: string;
  tone: NotifyTone;
}

export const NOTIFY_EVENT = 'app:notify';

/** Non-blocking replacement for `alert()`. Rendered by `<Toaster />`. */
export function notify(message: string, tone: NotifyTone = 'error') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<NotifyDetail>(NOTIFY_EVENT, { detail: { message, tone } }));
}
