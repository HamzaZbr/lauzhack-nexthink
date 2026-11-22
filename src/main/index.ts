/**
 * Process principal : barre de menu, fenêtres, IPC.
 * C'est ici que vivront l'agent, le planificateur (T-5 min avant chaque bloc), les capteurs et les actions.
 */
import { app, ipcMain, Menu, Tray } from "electron";
import { join } from "node:path";
import { config as loadEnv } from "dotenv";
import { hasKey, model, ping } from "./llm";
import { closePopup, openPopup, showDashboard, toDashboard } from "./windows";
import { catalog, getJournal, initJournal, runActions, undo } from "./actions";
import { planPreflight } from "./planner";
import { readDisplays, takeSnapshot } from "./sensors";
import { getDay, onDayChange } from "./day";
import { getTriage, planDay } from "./agent";
import { getCarryOver, recordFeedback, setCarryOver } from "./prefs";
import { cleanupPlan } from "./cleanup";
import { nextBlock } from "./planner";
import { calendarInfo, ensureToday, loadCalendar, tomorrowBlocks } from "./calendar";
import { clockState, setDemoTime } from "./clock";
import { resetScheduler, startScheduler } from "./scheduler";
import type { ActionRequest, PopupKind } from "../shared/types";

loadEnv({ path: join(app.getAppPath(), ".env") });

let tray: Tray | null = null;

function createTray() {
  tray = new Tray(join(__dirname, "../../resources/trayTemplate.png"));
  tray.setToolTip("Preflight");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Ouvrir le tableau de bord", click: () => showDashboard() },
      { type: "separator" },
      { label: "Brief du matin", click: () => openPopup("morning") },
      { label: "Pre-flight (meeting dans 5 min)", click: () => openPopup("preflight") },
      { label: "Pause café", click: () => openPopup("coffee") },
      { label: "Bilan de la journée", click: () => openPopup("evening") },
      { type: "separator" },
      { label: "Quitter", role: "quit" },
    ]),
  );
}

function registerIpc() {
  ipcMain.handle("app:info", () => ({ hasKey: hasKey(), model: model(), platform: process.platform }));
  ipcMain.handle("llm:ping", () => ping());
  ipcMain.handle("popup:open", (_e, kind: PopupKind) => openPopup(kind));
  ipcMain.handle("popup:close", () => closePopup());
  ipcMain.handle("popup:answer", (_e, kind: PopupKind, data: unknown) => {
    // Plus tard : le brief du matin part au LLM pour découper la journée en blocs,
    // le pre-flight lance les actions validées. Pour l'instant on transmet au dashboard.
    toDashboard("popup-answer", { kind, data });
    closePopup();
  });
  ipcMain.handle("dashboard:show", (_e, view?: string) => {
    showDashboard(view);
  });
  ipcMain.handle("device:snapshot", (_e, fresh?: boolean) => takeSnapshot(fresh ?? true));
  ipcMain.handle("device:displays", () => readDisplays());
  ipcMain.handle("actions:catalog", () => catalog());
  ipcMain.handle("preflight:plan", () => planPreflight());
  ipcMain.handle("actions:run", (_e, requests: ActionRequest[]) => runActions(requests));
  ipcMain.handle("actions:undo", (_e, id: string) => undo(id));
  ipcMain.handle("journal:list", () => getJournal());
  ipcMain.handle("day:get", () => getDay());
  ipcMain.handle("day:plan", async (_e, text: string) => {
    const res = await planDay(String(text ?? "").slice(0, 500));
    if (res.blocks.length) setCarryOver("");
    return res;
  });
  ipcMain.handle("calendar:info", () => calendarInfo());
  ipcMain.handle("cleanup:plan", () => cleanupPlan());
  ipcMain.handle("day:tomorrow", () => tomorrowBlocks());
  ipcMain.handle("carry:get", () => getCarryOver());
  ipcMain.handle("carry:set", (_e, text: string) => setCarryOver(String(text ?? "")));
  ipcMain.handle("tabs:triage", async (_e, fresh?: boolean) => {
    const snap = await takeSnapshot(false);
    const block = nextBlock();
    if (!snap.chromeTabs || snap.chromeTabs.length < 3) return { verdicts: null, ai: null, blockTitle: block?.title ?? null };
    const t = await getTriage(snap.chromeTabs, block, !!fresh);
    return { verdicts: t.info.used ? t.verdicts : null, ai: t.info, blockTitle: block?.title ?? null };
  });
  ipcMain.handle("tabs:feedback", (_e, kept: string[], closed: string[]) =>
    recordFeedback((kept ?? []).filter((d) => typeof d === "string").slice(0, 50), (closed ?? []).filter((d) => typeof d === "string").slice(0, 50)),
  );
  ipcMain.handle("calendar:reload", () => loadCalendar());
  ipcMain.handle("clock:get", () => clockState());
  ipcMain.handle("clock:set", async (_e, value: string | null, nextDay?: boolean) => {
    setDemoTime(typeof value === "string" && /^\d{2}:\d{2}$/.test(value) ? value : null, nextDay === true);
    await ensureToday(); // nouveau jour → meetings du jour rechargés, tâches d'hier oubliées
    toDashboard("clock-updated", clockState());
    toDashboard("calendar-updated", calendarInfo());
    resetScheduler();
    return clockState();
  });
}

app.whenReady().then(async () => {
  initJournal((journal) => toDashboard("journal-updated", journal));
  onDayChange((day) => toDashboard("day-updated", day));
  registerIpc();
  await loadCalendar();
  startScheduler();
  createTray();
  showDashboard();
  // « Dès que le PC s'allume » : le brief du matin s'ouvre au lancement.
  openPopup("morning");
  // Lancement à l'ouverture de session, seulement pour l'app installée (pas en dev).
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });
});

// L'app reste dans la barre de menu quand on ferme le dashboard.
app.on("window-all-closed", () => {
  /* on ne quitte pas */
});
app.on("activate", () => showDashboard());
