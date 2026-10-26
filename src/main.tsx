import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/sora/300.css";
import "@fontsource/sora/400.css";
import "@fontsource/sora/500.css";
import "@fontsource/sora/600.css";
import "./index.css";
import App from "./App.tsx";
import { importHandover } from "./lib/desktop";
import { flushVault, hydrateFromVault, startVaultSync } from "./lib/vault";
import { installForgeFetch } from "./lib/forgeFetch";

// The desktop relays for Cloudflare and NVIDIA only answer the app's own page.
installForgeFetch();

// Before the app reads its storage: if you just switched between the window
// and your browser, your settings, keys and list are waiting to be carried in.
// First the vault (the file the app keeps everything in — lib/vault.ts), then
// any handover, which is newer still.
(window as unknown as { __flushVault?: () => Promise<void> }).__flushVault = flushVault;
hydrateFromVault()
  .then(() => importHandover())
  .finally(() => {
  startVaultSync();
  ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
});
