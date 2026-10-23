import type { SessionView } from './types';

export const terminal = (status: SessionView['status']) => status === 'completed' || status === 'abandoned';

export function outcomeUrl(session: Pick<SessionView, 'id' | 'status' | 'returnUrl' | 'abandonUrl'>) {
  const url = new URL(session.status === 'abandoned' ? session.abandonUrl || session.returnUrl : session.returnUrl);
  url.searchParams.set('onboardingSession', session.id);
  url.searchParams.set('onboardingStatus', session.status === 'completed' ? 'success' : 'abandoned');
  return url.toString();
}
