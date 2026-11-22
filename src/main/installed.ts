/**
 * Apps réellement installées sur le Mac. Une invitation dit « Excel » ou « Teams » ;
 * sur un Mac sans Microsoft Office, on ouvre Numbers / Pages / Keynote, et on ne propose pas Teams
 * (le lien du meeting s'ouvre alors dans le navigateur).
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DIRS = ["/Applications", "/System/Applications", join(homedir(), "Applications")];

/** Nom demandé → noms d'app à chercher, puis l'équivalent Apple si rien n'est trouvé. */
const CANDIDATES: Array<[RegExp, string[], string | null]> = [
  [/^(microsoft )?excel$/i, ["Microsoft Excel"], "Numbers"],
  [/^(microsoft )?word$/i, ["Microsoft Word"], "Pages"],
  [/^(microsoft )?powerpoint$/i, ["Microsoft PowerPoint"], "Keynote"],
  [/^(microsoft )?teams$/i, ["Microsoft Teams", "Microsoft Teams (work or school)", "Microsoft Teams classic"], null],
  [/^zoom(\.us)?$/i, ["zoom.us"], null],
  [/^webex$/i, ["Webex", "Cisco Webex Meetings"], null],
  [/^(google )?chrome$/i, ["Google Chrome"], null],
];

const cache = new Map<string, string | null>();

export const isInstalled = (app: string) => DIRS.some((d) => existsSync(join(d, `${app}.app`)));

/** L'app à ouvrir pour ce nom, ou null si rien d'installé ne convient. */
export function resolveApp(name: string): string | null {
  if (cache.has(name)) return cache.get(name)!;
  let out: string | null = null;
  const rule = CANDIDATES.find(([re]) => re.test(name.trim()));
  if (rule) {
    const [, names, fallback] = rule;
    out = names.find(isInstalled) ?? (fallback && isInstalled(fallback) ? fallback : null);
  } else out = isInstalled(name) ? name : null; // pas installée (ou ailleurs que dans Applications) : on ne la propose pas
  cache.set(name, out);
  return out;
}

/** Applique resolveApp à une liste (sans doublons, sans les apps absentes). */
export const resolveApps = (apps: string[]) => [...new Set(apps.map(resolveApp).filter((a): a is string => !!a))];
