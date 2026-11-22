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

export const MASCOT_SIZE = { width: 280, height: 220 };

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
    y: area.y + area.height - MASCOT_SIZE.height, // collé au bord bas : le chien dépasse du bord
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
  mascot.on("closed", () => {
    mascot = null;
    if (eyeTimer) clearInterval(eyeTimer);
    eyeTimer = null;
  });
  // Les yeux suivent la souris : position du curseur relative aux yeux, ~20 fois par seconde.
  let last = "";
  eyeTimer = setInterval(() => {
    if (!mascot || mascot.isDestroyed() || !mascot.isVisible()) return;
    const p = screen.getCursorScreenPoint();
    const b = mascot.getBounds();
    const msg = `${p.x - (b.x + b.width - 80)},${p.y - (b.y + b.height - 50)}`;
    if (msg === last) return;
    last = msg;
    const [dx, dy] = msg.split(",").map(Number);
    mascot.webContents.send("event", { type: "cursor", payload: { dx, dy } });
  }, 50);
  load(mascot, "/mascot");
  return mascot;
}

export const hideMascot = () => mascot?.hide();

let eyeTimer: NodeJS.Timeout | null = null;
let dragFrom: { x: number; y: number } | null = null;
/** Déplacer la mascotte à la souris : début du glisser, puis décalage depuis ce début. */
export function mascotDragStart() {
  if (mascot && !mascot.isDestroyed()) {
    const [x, y] = mascot.getPosition();
    dragFrom = { x, y };
  }
}
export function mascotDragMove(dx: number, dy: number) {
  if (!mascot || mascot.isDestroyed() || !dragFrom) return;
  mascot.setPosition(Math.round(dragFrom.x + dx), Math.round(dragFrom.y + dy));
}

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
