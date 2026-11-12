import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import {CloudApp} from './CloudApp';
import {cloudMode} from './cloud';
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {cloudMode ? <CloudApp /> : <App />}
  </React.StrictMode>,
);
