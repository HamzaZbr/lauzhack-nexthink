import React from "react";
import ReactDOM from "react-dom/client";
import "reactflow/dist/style.css";
import "./theme/tokens.css";
import "./styles.css";
import "./app.css";
import "./theme/motion.css"; // en dernier : la couche motion surcharge les styles de base (comme dans Contagion)
import { App } from "./App";
import { Popup } from "./popup/Popup";
import { Mascot } from "./mascot/Mascot";
import type { PopupKind } from "@shared/types";

// Une seule UI pour toutes les fenêtres : le hash dit quel écran afficher.
// #/app/<vue> → tableau de bord ; #/popup/<type> → pop-up ; #/mascot → la mascotte.
const [, area, name] = window.location.hash.replace(/^#/, "").split("/");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {area === "mascot" ? <Mascot /> : area === "popup" ? <Popup kind={(name as PopupKind) || "morning"} /> : <App initialView={name} />}
  </React.StrictMode>,
);
