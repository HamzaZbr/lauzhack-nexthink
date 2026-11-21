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
  /** Description de l'invitation (ordre du jour, documents), sans les liens. */
  notes?: string;
  /** Sites web utiles à ce bloc (ex. github.com) : onglets à mettre devant, jamais fermés. */
  sites?: string[];
  /** Mots-clés de documents (ex. budget_q4) : cherchés sur le Mac et ouverts avant le bloc. */
  docs?: string[];
}

/** Une action que l'agent propose. Le LLM choisit `tool` dans le catalogue ; le code décide du risque. */
export interface ProposedAction {
  id: string;
  tool: string;
  target: string;
  reason: string;
  risk: Risk;
  args?: Record<string, unknown>;
  /** Pour le tri des onglets par l'IA : le détail onglet par onglet (l'utilisateur peut en décocher). */
  tabs?: TabVerdict[];
}

export interface TabVerdict {
  title: string;
  url: string;
  domain: string;
  close: boolean;
  reason: string;
}

export interface TriageInfo {
  used: boolean;
  latencyMs: number;
  model: string;
  kept?: number;
  closed?: number;
  error?: string;
  cached?: boolean;
}

export interface TriageResponse {
  verdicts: TabVerdict[] | null;
  ai: TriageInfo | null;
  blockTitle: string | null;
}

export interface CalendarInfo {
  source: "demo" | "url" | "file";
  label: string;
  events: number;
  error?: string;
  loadedAt?: string;
}

export interface ClockState {
  hhmm: string;
  demo: boolean;
}

export interface CleanupItem {
  id: string;
  tool: "clean_cache" | "empty_trash" | "trash_old_downloads";
  label: string;
  explain: string;
  sizeMb: number | null; // null = taille inconnue (accès refusé)
  risk: Risk;
}

export interface DayPlanResult {
  blocks: DayBlock[];
  summary: string;
  source: "llm" | "fallback";
  latencyMs: number;
  error?: string;
}

export interface PreflightPlan {
  block: DayBlock;
  /** Plus rien de prévu aujourd'hui : le pre-flight ne fait que les vérifications. */
  idle?: boolean;
  minutesBefore: number;
  actions: ProposedAction[];
  snapshot: DeviceSnapshot;
  /** Ce qu'a fait l'IA pour ce plan (tri des onglets). */
  ai?: TriageInfo;
}

export interface ActionLogEntry {
  id: string;
  at: string; // ISO
  tool: string;
  target: string;
  risk: Risk;
  status: "done" | "undone" | "failed" | "simulated";
  detail: string;
  undoable: boolean;
  /** Gain estimé (pour le récap de la semaine) */
  freedMb?: number;
  /** Nombre d'éléments concernés : onglets fermés, problèmes détectés… */
  items?: number;
  /** Espace disque libéré (nettoyage de la pause café). */
  freedDiskMb?: number;
}

/** Une demande d'exécution : un outil du catalogue + sa cible. */
export interface ActionRequest {
  tool: string;
  target: string;
  /** Arguments structurés (ex. liste d'URL d'onglets). */
  args?: Record<string, unknown>;
}

export interface ToolInfo {
  tool: string;
  label: string;
  risk: Risk;
  description: string;
}

/* ---------- Capteurs ---------- */

export interface AppUsage {
  name: string; // ex. "Google Chrome"
  memMb: number; // RAM totale (process + helpers)
  cpu: number; // % CPU cumulé
  processes: number;
}

export interface ChromeTab {
  window: number;
  index: number;
  title: string;
  url: string;
  /** Onglet affiché en ce moment dans sa fenêtre. */
  active?: boolean;
}

export type IssueLevel = "info" | "warn" | "critical";
export interface DeviceIssue {
  id: string;
  level: IssueLevel;
  message: string;
}

export interface DeviceSnapshot {
  at: string; // ISO
  battery: { percent: number; charging: boolean } | null;
  disk: { freeGb: number; totalGb: number } | null;
  memory: { totalGb: number; usedGb: number } | null;
  wifi: { rssi: number; noise: number | null } | null;
  apps: AppUsage[]; // triées par RAM décroissante
  chromeTabs: ChromeTab[] | null; // null si Chrome fermé ou accès refusé
  issues: DeviceIssue[];
}

export type PopupKind = "morning" | "preflight" | "coffee" | "evening";

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
  snapshot(fresh?: boolean): Promise<DeviceSnapshot>;
  catalog(): Promise<ToolInfo[]>;
  planPreflight(): Promise<PreflightPlan>;
  runActions(requests: ActionRequest[]): Promise<ActionLogEntry[]>;
  undo(id: string): Promise<ActionLogEntry | null>;
  journal(): Promise<ActionLogEntry[]>;
  day(): Promise<DayBlock[]>;
  planDay(text: string): Promise<DayPlanResult>;
  calendarInfo(): Promise<CalendarInfo>;
  reloadCalendar(): Promise<CalendarInfo>;
  clock(): Promise<ClockState>;
  setClock(hhmm: string | null): Promise<ClockState>;
  triageTabs(fresh?: boolean): Promise<TriageResponse>;
  tabsFeedback(keptDomains: string[], closedDomains: string[]): Promise<void>;
  cleanupPlan(): Promise<CleanupItem[]>;
  tomorrow(): Promise<DayBlock[]>;
  carryOver(): Promise<string>;
  setCarryOver(text: string): Promise<void>;
  onEvent(cb: (event: { type: string; payload?: unknown }) => void): () => void;
}
