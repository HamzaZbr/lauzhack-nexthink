/**
 * Capteurs macOS : ce que l'agent « voit » du poste.
 * Tout passe par des commandes système lancées SANS shell (execFile), en lecture seule.
 * Les fonctions parse* sont pures pour pouvoir les tester sans Mac.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AppUsage, ChromeTab, DeviceIssue, DeviceSnapshot, DisplayInfo } from "../shared/types";

const run = promisify(execFile);

async function sh(cmd: string, args: string[], timeoutMs = 4000): Promise<string | null> {
  try {
    const { stdout } = await run(cmd, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 });
    return stdout;
  } catch {
    return null;
  }
}

/* ---------- Parseurs (purs) ---------- */

/** `pmset -g batt` → "… 'InternalBattery-0' (id=…)\t83%; charging; 1:02 remaining" */
export function parseBattery(out: string): DeviceSnapshot["battery"] {
  const m = out.match(/(\d+)%;\s*([^;]+);/);
  if (!m) return null;
  const state = m[2].trim().toLowerCase();
  return { percent: Number(m[1]), charging: state === "charging" || state === "charged" || out.includes("AC Power") };
}

/** `df -k <vol>` → 2e ligne : Filesystem 1024-blocks Used Available Capacity … */
export function parseDisk(out: string): DeviceSnapshot["disk"] {
  const line = out.trim().split("\n")[1];
  if (!line) return null;
  const cols = line.trim().split(/\s+/);
  const total = Number(cols[1]);
  const avail = Number(cols[3]);
  if (!Number.isFinite(total) || !Number.isFinite(avail)) return null;
  const gb = (kb: number) => Math.round((kb / 1024 / 1024) * 10) / 10;
  return { totalGb: gb(total), freeGb: gb(avail) };
}

/** `vm_stat` + taille de la RAM → mémoire « utilisée » ≈ active + wired + compressée. */
export function parseMemory(vmStat: string, memBytes: number): DeviceSnapshot["memory"] {
  const pageSize = Number(vmStat.match(/page size of (\d+) bytes/)?.[1] ?? 16384);
  const pages = (label: string) => Number(vmStat.match(new RegExp(`${label}:\\s+(\\d+)`))?.[1] ?? 0);
  const used = (pages("Pages active") + pages("Pages wired down") + pages("Pages occupied by compressor")) * pageSize;
  if (!memBytes) return null;
  const gb = (b: number) => Math.round((b / 1024 ** 3) * 10) / 10;
  return { totalGb: gb(memBytes), usedGb: gb(used) };
}

/** Nom d'app à partir du chemin d'un process : "/Applications/Google Chrome.app/Contents/…" → "Google Chrome". */
export function appNameFromPath(path: string): string | null {
  const m = path.match(/\/([^/]+)\.app\//);
  return m ? m[1] : null;
}

/** Process système qu'on ne montre pas (et qu'on ne touchera jamais). */
const SYSTEM_PREFIXES = ["/System/", "/usr/", "/sbin/", "/bin/", "/Library/Apple/"];

/** `ps -axo pid=,rss=,%cpu=,comm=` → usage regroupé par app (le process principal + ses helpers). */
export function parseProcesses(out: string): AppUsage[] {
  const byApp = new Map<string, AppUsage>();
  for (const raw of out.split("\n")) {
    const m = raw.trim().match(/^(\d+)\s+(\d+)\s+([\d.,]+)\s+(.+)$/);
    if (!m) continue;
    const [, , rss, cpu, comm] = m;
    if (SYSTEM_PREFIXES.some((p) => comm.startsWith(p))) continue;
    const name = appNameFromPath(comm);
    if (!name) continue;
    const app = byApp.get(name) ?? { name, memMb: 0, cpu: 0, processes: 0 };
    app.memMb += Number(rss) / 1024;
    app.cpu += Number(cpu.replace(",", "."));
    app.processes += 1;
    byApp.set(name, app);
  }
  return [...byApp.values()]
    .map((a) => ({ ...a, memMb: Math.round(a.memMb), cpu: Math.round(a.cpu * 10) / 10 }))
    .sort((a, b) => b.memMb - a.memMb);
}

/** `system_profiler SPAirPortDataType -json` → force du signal du réseau courant. */
export function parseWifi(json: string): DeviceSnapshot["wifi"] {
  try {
    const data = JSON.parse(json);
    const ifaces = data?.SPAirPortDataType?.[0]?.spairport_airport_interfaces ?? [];
    for (const iface of ifaces) {
      const sn: string | undefined = iface?.spairport_current_network_information?.spairport_signal_noise;
      if (!sn) continue;
      const nums = sn.match(/-?\d+/g)?.map(Number) ?? [];
      if (nums.length) return { rssi: nums[0], noise: nums[1] ?? null };
    }
  } catch {
    /* JSON invalide */
  }
  return null;
}

/** Sortie AppleScript : une ligne par onglet, champs séparés par une tabulation : fenêtre, index, titre, URL, actif (0/1). */
export function parseChromeTabs(out: string): ChromeTab[] {
  return out
    .split("\n")
    .map((l) => l.split("\t"))
    .filter((c) => c.length >= 4)
    .map(([w, i, title, url, active]) => ({ window: Number(w), index: Number(i), title, url, active: active?.trim() === "1" }));
}

/** Règles simples : ce qui mérite d'être signalé avant un meeting. */
export function detectIssues(s: Omit<DeviceSnapshot, "issues">): DeviceIssue[] {
  const issues: DeviceIssue[] = [];
  if (s.battery && !s.battery.charging && s.battery.percent < 20)
    issues.push({ id: "battery", level: s.battery.percent < 10 ? "critical" : "warn", message: `Batterie à ${s.battery.percent} %, pas en charge.` });
  if (s.disk && s.disk.freeGb < 10)
    issues.push({ id: "disk", level: s.disk.freeGb < 3 ? "critical" : "warn", message: `Plus que ${s.disk.freeGb} Go libres sur le disque.` });
  if (s.memory && s.memory.usedGb / s.memory.totalGb > 0.85)
    issues.push({ id: "memory", level: "warn", message: `Mémoire presque pleine : ${s.memory.usedGb} / ${s.memory.totalGb} Go.` });
  if (s.wifi && s.wifi.rssi < -70)
    issues.push({ id: "wifi", level: s.wifi.rssi < -80 ? "critical" : "warn", message: `Wi-Fi faible (${s.wifi.rssi} dBm) : risque de coupure en appel.` });
  if (s.chromeTabs) {
    const dupes = s.chromeTabs.length - new Set(s.chromeTabs.map((t) => t.url)).size;
    if (dupes >= 3) issues.push({ id: "tabs", level: "info", message: `${dupes} onglets Chrome en double.` });
  }
  return issues;
}

/* ---------- Lecture du système ---------- */

// Dans un bloc « tell Chrome », le mot « tab » désigne un onglet : on prend les séparateurs par leur code.
const CHROME_TABS_SCRIPT = `
if application "Google Chrome" is running then
  set TB to character id 9
  set LF to character id 10
  set out to ""
  tell application "Google Chrome"
    set wi to 0
    repeat with w in windows
      set wi to wi + 1
      set ti to 0
      set act to active tab index of w
      repeat with t in tabs of w
        set ti to ti + 1
        set isAct to "0"
        if ti = act then set isAct to "1"
        set out to out & (wi as text) & TB & (ti as text) & TB & (title of t) & TB & (URL of t) & TB & isAct & LF
      end repeat
    end repeat
  end tell
  return out
end if
return ""`;

/** TABS_SCOPE=front dans .env : seulement la fenêtre Chrome au premier plan (pour tester ou faire la démo). */
export const tabsScope = (): "front" | "all" => (process.env.TABS_SCOPE === "front" ? "front" : "all");

export async function readChromeTabs(): Promise<ChromeTab[] | null> {
  const out = await sh("osascript", ["-e", CHROME_TABS_SCRIPT], 5000);
  if (out === null) return null;
  const tabs = parseChromeTabs(out);
  // Dans AppleScript, la fenêtre 1 est celle au premier plan.
  return tabsScope() === "front" ? tabs.filter((t) => t.window === 1) : tabs;
}

let wifiCache: { at: number; value: DeviceSnapshot["wifi"] } | null = null;

/** system_profiler est lent (1-3 s) : on garde le résultat 60 s. */
async function readWifi(): Promise<DeviceSnapshot["wifi"]> {
  if (wifiCache && Date.now() - wifiCache.at < 60_000) return wifiCache.value;
  const out = await sh("system_profiler", ["SPAirPortDataType", "-json"], 8000);
  const value = out ? parseWifi(out) : null;
  wifiCache = { at: Date.now(), value };
  return value;
}

/** `system_profiler SPDisplaysDataType -json` → écrans externes (tout écran qui n'est pas l'écran intégré). */
export function parseDisplays(json: string): DisplayInfo | null {
  try {
    const gpus = (JSON.parse(json).SPDisplaysDataType ?? []) as Array<{ spdisplays_ndrvs?: Array<Record<string, unknown>> }>;
    const screens = gpus.flatMap((g) => g.spdisplays_ndrvs ?? []);
    const external = screens.filter((d) => d.spdisplays_connection_type !== "spdisplays_internal");
    return { external: external.length, names: external.map((d) => String(d._name ?? "écran externe")).slice(0, 3) };
  } catch {
    return null;
  }
}

/** Écrans branchés. Lu seulement quand un bloc demande d'en avoir un (system_profiler est lent). */
export async function readDisplays(): Promise<DisplayInfo | null> {
  const out = await sh("system_profiler", ["SPDisplaysDataType", "-json"], 8000);
  return out ? parseDisplays(out) : null;
}

let last: DeviceSnapshot | null = null;

/** Photo de l'état du poste. `fresh=false` renvoie la dernière photo si elle a moins de 10 s. */
export async function takeSnapshot(fresh = true): Promise<DeviceSnapshot> {
  if (!fresh && last && Date.now() - new Date(last.at).getTime() < 10_000) return last;
  const [batt, disk, vm, memsize, ps, wifi, tabs] = await Promise.all([
    sh("pmset", ["-g", "batt"]),
    sh("df", ["-k", "/System/Volumes/Data"]).then((o) => o ?? sh("df", ["-k", "/"])),
    sh("vm_stat", []),
    sh("sysctl", ["-n", "hw.memsize"]),
    sh("ps", ["-axo", "pid=,rss=,%cpu=,comm="]),
    readWifi(),
    readChromeTabs(),
  ]);
  const base = {
    at: new Date().toISOString(),
    battery: batt ? parseBattery(batt) : null,
    disk: disk ? parseDisk(disk) : null,
    memory: vm && memsize ? parseMemory(vm, Number(memsize.trim())) : null,
    wifi,
    apps: ps ? parseProcesses(ps) : [],
    chromeTabs: tabs,
  };
  last = { ...base, issues: detectIssues(base) };
  return last;
}
