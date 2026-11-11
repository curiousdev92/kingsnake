import { applyTheme, themeMono } from "@snake/design-tokens";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initAccount } from "./account";
import { App } from "./App";
import { Gallery } from "./Gallery";
import { OnlineApp } from "./OnlineApp";
import { useRoute } from "./routes";
import { SettingsPage } from "./Settings";
import { installUiSounds } from "./sound";

applyTheme(themeMono);
void initAccount();
installUiSounds();

/** Home (and online play) by default; `#practice` is offline play, `#settings` the settings page. */
function Root() {
  const route = useRoute();
  if (route === "gallery") return <Gallery />;
  if (route === "practice") return <App />;
  if (route === "settings") return <SettingsPage />;
  return <OnlineApp />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
