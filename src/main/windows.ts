/** Fenêtres : le dashboard, et les petits pop-ups (brief du matin, pre-flight, café). */
import { BrowserWindow, screen } from "electron";
import { join } from "node:path";
import type { PopupKind } from "../shared/types";

let dashboard: BrowserWindow | null = null;
let popup: BrowserWindow | null = null;

const webPreferences = {
  preload: join(__dirname, "../preload/index.js"),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
};

/** Charge l'UI : le serveur Vite en dev, les fichiers construits sinon. Le hash choisit l'écran. */
function load(win: BrowserWindow, hash: string) {
  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) void win.loadURL(`${devUrl}#${hash}`);
  else void win.loadFile(join(__dirname, "../renderer/index.html"), { hash });
}

export function showDashboard(view = "today") {
  if (dashboard && !dashboard.isDestroyed()) {
    dashboard.webContents.send("event", { type: "navigate", payload: view });
    dashboard.show();
    dashboard.focus();
    return dashboard;
  }
  dashboard = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    show: false,
    title: "Preflight",
    titleBarStyle: "hiddenInset",
    backgroundColor: "#ffffff",
    webPreferences,
  });
  dashboard.once("ready-to-show", () => dashboard?.show());
  dashboard.on("closed", () => (dashboard = null));
  load(dashboard, `/app/${view}`);
  return dashboard;
}

const POPUP_SIZE: Record<PopupKind, { width: number; height: number }> = {
  morning: { width: 440, height: 460 },
  preflight: { width: 440, height: 600 },
  coffee: { width: 400, height: 300 },
};

/** Ouvre un pop-up en haut à droite de l'écran, au-dessus de tout, sans barre de titre. */
export function openPopup(kind: PopupKind) {
  if (popup && !popup.isDestroyed()) popup.close();
  const { width, height } = POPUP_SIZE[kind];
  // Sur l'écran où se trouve la souris (utile avec un écran externe).
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  popup = new BrowserWindow({
    width,
    height,
    x: area.x + area.width - width - 16,
    y: area.y + 16,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: "#ffffff",
    webPreferences,
  });
  popup.setVisibleOnAllWorkspaces(true);
  popup.once("ready-to-show", () => popup?.showInactive());
  popup.on("closed", () => (popup = null));
  load(popup, `/popup/${kind}`);
}

export function closePopup() {
  if (popup && !popup.isDestroyed()) popup.close();
}

/** Envoie un événement au dashboard s'il est ouvert. */
export function toDashboard(type: string, payload?: unknown) {
  if (dashboard && !dashboard.isDestroyed()) dashboard.webContents.send("event", { type, payload });
}
