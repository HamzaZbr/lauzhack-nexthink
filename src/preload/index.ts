import { contextBridge, ipcRenderer } from "electron";
import type { ActionRequest, PopupKind, PreflightApi } from "../shared/types";

const api: PreflightApi = {
  info: () => ipcRenderer.invoke("app:info"),
  pingLlm: () => ipcRenderer.invoke("llm:ping"),
  openPopup: (kind: PopupKind) => ipcRenderer.invoke("popup:open", kind),
  closePopup: () => ipcRenderer.invoke("popup:close"),
  popupAnswer: (kind: PopupKind, data: unknown) => ipcRenderer.invoke("popup:answer", kind, data),
  showDashboard: (view?: string) => ipcRenderer.invoke("dashboard:show", view),
  snapshot: (fresh?: boolean) => ipcRenderer.invoke("device:snapshot", fresh),
  displays: () => ipcRenderer.invoke("device:displays"),
  shortcuts: () => ipcRenderer.invoke("shortcuts:get"),
  mascotClick: () => ipcRenderer.invoke("mascot:click"),
  mascotMenu: () => ipcRenderer.invoke("mascot:menu"),
  toggleShortcut: (id: string, on: boolean) => ipcRenderer.invoke("shortcuts:toggle", id, on),
  runShortcut: (id: string) => ipcRenderer.invoke("shortcuts:run", id),
  catalog: () => ipcRenderer.invoke("actions:catalog"),
  planPreflight: () => ipcRenderer.invoke("preflight:plan"),
  runActions: (requests: ActionRequest[]) => ipcRenderer.invoke("actions:run", requests),
  undo: (id: string) => ipcRenderer.invoke("actions:undo", id),
  journal: () => ipcRenderer.invoke("journal:list"),
  day: () => ipcRenderer.invoke("day:get"),
  planDay: (text: string) => ipcRenderer.invoke("day:plan", text),
  calendarInfo: () => ipcRenderer.invoke("calendar:info"),
  reloadCalendar: () => ipcRenderer.invoke("calendar:reload"),
  clock: () => ipcRenderer.invoke("clock:get"),
  setClock: (hhmm: string | null, nextDay?: boolean) => ipcRenderer.invoke("clock:set", hhmm, nextDay),
  triageTabs: (fresh?: boolean) => ipcRenderer.invoke("tabs:triage", fresh),
  tabsFeedback: (kept: string[], closed: string[]) => ipcRenderer.invoke("tabs:feedback", kept, closed),
  cleanupPlan: () => ipcRenderer.invoke("cleanup:plan"),
  tomorrow: () => ipcRenderer.invoke("day:tomorrow"),
  carryOver: () => ipcRenderer.invoke("carry:get"),
  setCarryOver: (text: string) => ipcRenderer.invoke("carry:set", text),
  onEvent: (cb) => {
    const listener = (_e: unknown, event: { type: string; payload?: unknown }) => cb(event);
    ipcRenderer.on("event", listener);
    return () => ipcRenderer.removeListener("event", listener);
  },
};

contextBridge.exposeInMainWorld("api", api);
