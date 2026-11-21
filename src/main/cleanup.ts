/**
 * Nettoyage pendant la pause café : ce qu'on peut libérer sur le disque SANS perdre de travail.
 * - caches reconstructibles (npm, pip, Homebrew, Gradle, Xcode, Spotify) : liste FERMÉE de dossiers, rien d'autre ;
 * - la Corbeille (vidée par le Finder) ;
 * - les vieux téléchargements (> 30 jours) : déplacés dans la Corbeille, donc récupérables.
 * Ce fichier mesure ; la suppression passe par le registre d'actions (risque, journal, mode simulation).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CleanupItem } from "../shared/types";

const run = promisify(execFile);
const H = homedir();

/** Les seuls dossiers que l'agent a le droit de supprimer. Tous se reconstruisent tout seuls. */
export const CACHE_DIRS: Record<string, { label: string; path: string; explain: string }> = {
  npm: { label: "Cache npm", path: join(H, ".npm/_cacache"), explain: "paquets JavaScript déjà téléchargés, re-téléchargés si besoin" },
  pip: { label: "Cache pip", path: join(H, "Library/Caches/pip"), explain: "paquets Python déjà téléchargés" },
  brew: { label: "Cache Homebrew", path: join(H, "Library/Caches/Homebrew"), explain: "installateurs Homebrew déjà utilisés" },
  gradle: { label: "Cache Gradle (Android / Kotlin)", path: join(H, ".gradle/caches"), explain: "dépendances Gradle, re-téléchargées au prochain build" },
  xcode: { label: "Xcode DerivedData", path: join(H, "Library/Developer/Xcode/DerivedData"), explain: "fichiers de compilation Xcode, refaits au prochain build" },
  spotify: { label: "Cache Spotify", path: join(H, "Library/Caches/com.spotify.client"), explain: "musique mise en cache par Spotify" },
};

const OLD_DAYS = 30;

/** Taille d'un dossier en Mo (du -sk), null si illisible ou absent. */
export async function sizeMb(path: string): Promise<number | null> {
  try {
    const { stdout } = await run("du", ["-sk", path], { timeout: 15_000 });
    const kb = Number(stdout.trim().split(/\s+/)[0]);
    return Number.isFinite(kb) ? Math.round(kb / 1024) : null;
  } catch {
    return null;
  }
}

/** Fichiers de ~/Downloads plus vieux que 30 jours (au premier niveau seulement). */
export async function oldDownloads(): Promise<Array<{ path: string; mb: number }>> {
  const dir = join(H, "Downloads");
  const limit = Date.now() - OLD_DAYS * 24 * 3600_000;
  try {
    const names = (await readdir(dir)).filter((n) => !n.startsWith("."));
    const items = await Promise.all(
      names.map(async (n) => {
        try {
          const st = await stat(join(dir, n));
          if (!st.isFile() || st.mtimeMs > limit) return null;
          return { path: join(dir, n), mb: st.size / 1024 / 1024 };
        } catch {
          return null;
        }
      }),
    );
    return items.filter((x): x is { path: string; mb: number } => !!x).sort((a, b) => b.mb - a.mb).slice(0, 200);
  } catch {
    return [];
  }
}

/** Ce qu'on pourrait libérer, avec les tailles. Les entrées vides ou absentes sont retirées. */
export async function cleanupPlan(): Promise<CleanupItem[]> {
  const caches = await Promise.all(
    Object.entries(CACHE_DIRS).map(async ([id, c]): Promise<CleanupItem> => ({
      id,
      tool: "clean_cache",
      label: c.label,
      explain: `${c.explain}.`,
      sizeMb: await sizeMb(c.path),
      risk: "confirm",
    })),
  );
  const trash = await sizeMb(join(H, ".Trash"));
  const downloads = await oldDownloads();
  const dlMb = Math.round(downloads.reduce((s, d) => s + d.mb, 0));
  const items: CleanupItem[] = [
    ...caches.filter((c) => (c.sizeMb ?? 0) >= 20),
    {
      id: "trash",
      tool: "empty_trash",
      label: "Vider la Corbeille",
      explain: "définitif : les fichiers de la Corbeille ne pourront plus être récupérés.",
      sizeMb: trash,
      risk: "ask",
    },
  ];
  if (downloads.length)
    items.push({
      id: "downloads",
      tool: "trash_old_downloads",
      label: `${downloads.length} vieux téléchargement${downloads.length > 1 ? "s" : ""} (> ${OLD_DAYS} jours)`,
      explain: "déplacés dans la Corbeille : récupérables tant qu'elle n'est pas vidée.",
      sizeMb: dlMb,
      risk: "ask",
    });
  return items.sort((a, b) => (b.sizeMb ?? 0) - (a.sizeMb ?? 0));
}
