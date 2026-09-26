import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { importHandover } from "./lib/desktop";

// Before the app reads its storage: if you just switched between the window
// and your browser, your settings, keys and list are waiting to be carried in.
importHandover().finally(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
});
