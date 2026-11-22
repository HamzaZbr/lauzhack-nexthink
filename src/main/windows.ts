/** Fenêtres : le dashboard, et les petits pop-ups (brief du matin, pre-flight, café). */
import { BrowserWindow, screen } from "electron";
import { join } from "node:path";
import type { PopupKind } from "../shared/types";

let dashboard: BrowserWindow | null = null;
let popup: BrowserWindow | null = null;
let mascot: BrowserWindow | null = null;
/** Appelé à chaque ouverture de pop-up (la mascotte l'annonce). */
let onPopup: (kind: PopupKind) => void = () => {};
export const setPopupListener = (fn: (kind: PopupKind) => void) => {
  onPopup = fn;
};

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
  coffee: { width: 460, height: 560 },
  evening: { width: 460, height: 640 },
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
  onPopup(kind);
}

export const MASCOT_SIZE = { width: 260, height: 210 };

/**
 * La mascotte : un petit personnage dans le coin bas droit, toujours devant, fond transparent.
 * Au démarrage, c'est la seule fenêtre visible : clic → brief du matin, puis le tableau de bord.
 */
export function showMascot() {
  if (mascot && !mascot.isDestroyed()) {
    mascot.showInactive();
    return mascot;
  }
  const area = screen.getPrimaryDisplay().workArea;
  mascot = new BrowserWindow({
    ...MASCOT_SIZE,
    x: area.x + area.width - MASCOT_SIZE.width - 12,
    y: area.y + area.height - MASCOT_SIZE.height - 8,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    show: false,
    backgroundColor: "#00000000",
    webPreferences,
  });
  mascot.setAlwaysOnTop(true, "floating");
  mascot.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mascot.once("ready-to-show", () => mascot?.showInactive());
  mascot.on("closed", () => (mascot = null));
  load(mascot, "/mascot");
  return mascot;
}

export const hideMascot = () => mascot?.hide();

/** Fait parler la mascotte : humeur + bulle de texte. */
export function toMascot(mood: "idle" | "alert" | "happy" | "talk", text?: string) {
  if (mascot && !mascot.isDestroyed()) mascot.webContents.send("event", { type: "mascot", payload: { mood, text } });
}

export function closePopup() {
  if (popup && !popup.isDestroyed()) popup.close();
}

/** Envoie un événement au dashboard s'il est ouvert. */
export function toDashboard(type: string, payload?: unknown) {
  if (dashboard && !dashboard.isDestroyed()) dashboard.webContents.send("event", { type, payload });
}
