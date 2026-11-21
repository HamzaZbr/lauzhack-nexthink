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
  setClock: (hhmm: string | null) => ipcRenderer.invoke("clock:set", hhmm),
  onEvent: (cb) => {
    const listener = (_e: unknown, event: { type: string; payload?: unknown }) => cb(event);
    ipcRenderer.on("event", listener);
    return () => ipcRenderer.removeListener("event", listener);
  },
};

contextBridge.exposeInMainWorld("api", api);
