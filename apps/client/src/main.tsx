import { applyTheme, themeMono } from '@snake/design-tokens';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

applyTheme(themeMono);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
