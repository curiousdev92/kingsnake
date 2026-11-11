import { useEffect, useState } from 'react';

/**
 * Hash routes. The home screen is the default, so opening the game never drops the
 * player straight into a match. `?room=CODE` (an invite link) joins that private room.
 */
export type Route = 'home' | 'practice' | 'settings' | 'gallery';

function routeOf(hash: string): Route {
  if (hash === '#practice') return 'practice';
  if (hash === '#settings') return 'settings';
  // The component gallery is a development tool.
  if (hash === '#ui' && import.meta.env.DEV) return 'gallery';
  return 'home';
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => routeOf(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(routeOf(location.hash));
    window.addEventListener('hashchange', onChange);
    window.addEventListener('popstate', onChange);
    return () => {
      window.removeEventListener('hashchange', onChange);
      window.removeEventListener('popstate', onChange);
    };
  }, []);
  return route;
}

const HASH: Record<Exclude<Route, 'home'>, string> = { practice: '#practice', settings: '#settings', gallery: '#ui' };

/** Goes to a route. Home also drops `?room=`, so a reload lands on the home screen, not back in the room. */
export function navigate(route: Route): void {
  const url = route === 'home' ? location.pathname : `${location.pathname}${HASH[route]}`;
  history.pushState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export const goHome = () => navigate('home');
