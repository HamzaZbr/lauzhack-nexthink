import { contextBridge, ipcRenderer } from "electron";
import type { PopupKind, PreflightApi } from "../shared/types";

const api: PreflightApi = {
  info: () => ipcRenderer.invoke("app:info"),
  pingLlm: () => ipcRenderer.invoke("llm:ping"),
  openPopup: (kind: PopupKind) => ipcRenderer.invoke("popup:open", kind),
  closePopup: () => ipcRenderer.invoke("popup:close"),
  popupAnswer: (kind: PopupKind, data: unknown) => ipcRenderer.invoke("popup:answer", kind, data),
  showDashboard: (view?: string) => ipcRenderer.invoke("dashboard:show", view),
  onEvent: (cb) => {
    const listener = (_e: unknown, event: { type: string; payload?: unknown }) => cb(event);
    ipcRenderer.on("event", listener);
    return () => ipcRenderer.removeListener("event", listener);
  },
};

contextBridge.exposeInMainWorld("api", api);
