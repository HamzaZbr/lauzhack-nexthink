/** Types partagés entre le process main (agent, capteurs, actions) et l'UI. */

/** Niveau de risque d'une action : décide si l'agent peut la faire seul. */
export type Risk = "auto" | "confirm" | "ask";

export type BlockKind = "meeting" | "focus" | "free";

/** Un bloc de la journée : un événement du calendrier ou une tâche « invisible » ajoutée le matin. */
export interface DayBlock {
  id: string;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  title: string;
  kind: BlockKind;
  source: "calendar" | "morning";
  apps: string[];
  link?: string;
}

/** Une action que l'agent propose. Le LLM choisit `tool` dans le catalogue ; le code décide du risque. */
export interface ProposedAction {
  id: string;
  tool: string;
  target: string;
  reason: string;
  risk: Risk;
}

export interface ActionLogEntry {
  id: string;
  at: string; // ISO
  tool: string;
  target: string;
  status: "done" | "undone" | "failed" | "skipped";
  undoable: boolean;
}

export type PopupKind = "morning" | "preflight" | "coffee";

export interface LlmPingResult {
  ok: boolean;
  model: string;
  latencyMs: number;
  message?: string;
  error?: string;
}

export interface AppInfo {
  hasKey: boolean;
  model: string;
  platform: string;
}

/** Ce que le preload expose à l'UI sous `window.api`. */
export interface PreflightApi {
  info(): Promise<AppInfo>;
  pingLlm(): Promise<LlmPingResult>;
  openPopup(kind: PopupKind): Promise<void>;
  closePopup(): Promise<void>;
  popupAnswer(kind: PopupKind, data: unknown): Promise<void>;
  showDashboard(view?: string): Promise<void>;
  onEvent(cb: (event: { type: string; payload?: unknown }) => void): () => void;
}
