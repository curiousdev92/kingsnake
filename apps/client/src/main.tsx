import { applyTheme, themeMono } from '@snake/design-tokens';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initAccount } from './account';
import { installDemoSkinArt } from './game/demoSkinArt';
import { Gallery } from './Gallery';
import { OnlineApp } from './OnlineApp';
import { useRoute } from './routes';
import { SettingsPage } from './Settings';

applyTheme(themeMono);
installDemoSkinArt();
void initAccount();

/** Home (and online play) by default; `#practice` is offline play, `#settings` the settings page. */
function Root() {
  const route = useRoute();
  if (route === 'gallery') return <Gallery />;
  if (route === 'practice') return <App />;
  if (route === 'settings') return <SettingsPage />;
  return <OnlineApp />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
