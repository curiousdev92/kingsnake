import { applyTheme, themeMono } from '@snake/design-tokens';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Gallery } from './Gallery';
import { OnlineApp } from './OnlineApp';

applyTheme(themeMono);

/** `#ui` shows the ui-kit gallery, `#online` plays against the game-server; anything else is the offline sandbox. */
function Root() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onHash = () => setHash(location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  if (hash === '#ui') return <Gallery />;
  if (hash === '#online') return <OnlineApp />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
