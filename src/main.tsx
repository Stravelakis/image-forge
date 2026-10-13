import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/sora/300.css";
import "@fontsource/sora/400.css";
import "@fontsource/sora/500.css";
import "@fontsource/sora/600.css";
import "./index.css";
import App from "./App.tsx";
import { importHandover } from "./lib/desktop";

// Before the app reads its storage: if you just switched between the window
// and your browser, your settings, keys and list are waiting to be carried in.
importHandover().finally(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
});
