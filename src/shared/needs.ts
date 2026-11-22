/**
 * Besoins d'un bloc : internet, écran externe, batterie, matériel à emporter.
 * Règles simples sur le texte (titre, description, lieu de l'invitation) + ce que le LLM a extrait du brief.
 * Fonctions pures : utilisables par le main et le renderer.
 */
import type { BlockNeeds, DayBlock, DeviceSnapshot, DisplayInfo } from "./types";

export const NO_NEEDS: BlockNeeds = { internet: false, display: false, power: false, gear: [] };

const LONG_BLOCK_MIN = 90;

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const durationMin = (b: Pick<DayBlock, "start" | "end">) => Math.max(0, minutes(b.end) - minutes(b.start));

/** Matériel reconnu dans le texte → nom affiché. */
const GEAR: Array<[RegExp, string]> = [
  [/\bhdmi\b|adaptateur|dongle|usb-?c/i, "adaptateur USB-C → HDMI"],
  [/chargeur|charger/i, "chargeur"],
  [/casque|écouteurs|ecouteurs|headset|airpods/i, "casque / écouteurs"],
  [/cl[ée] usb|usb key/i, "clé USB"],
  [/souris|mouse/i, "souris"],
];

/** Tu vas projeter ou présenter quelque chose. */
const DISPLAY = /pr[ée]sent(er|e|es|ons|ez)\b|pr[ée]sentation (devant|au |aux |en salle|au projecteur)|projecteur|beamer|projector|[ée]cran externe|pitch|soutenance|keynote|d[ée]mo devant/i;
const PREP = /(pr[ée]parer|r[ée]diger|[ée]crire|faire|finir|relire) (les |la |le |mes |mon |ma |sa |ses )?(slides|pitch|pr[ée]sentation|d[ée]mo|keynote)/i;
/** Le bloc a besoin du réseau. */
const ONLINE = /teams|zoom|webex|meet\.google|visio|en ligne|online|github|google drive|onedrive|sharepoint|notion|moodle|cloud|upload|d[ée]ployer|deploy|t[ée]l[ée]charger/i;
/** Bloc qui va durer ou loin d'une prise. */
const POWER = /atelier|workshop|journ[ée]e enti[èe]re|toute la journ[ée]e|hackathon|\btrain\b|\bcff\b|\bsbb\b|avion/i;

/** Besoins déduits du texte d'un bloc (invitation ou tâche). */
export function needsFromText(blob: string, opts: { link?: string; minutes?: number } = {}): BlockNeeds {
  // « préparer le pitch » n'est pas « présenter le pitch » : pas d'écran externe, sauf si un lieu de projection est cité.
  const prepOnly = PREP.test(blob) && !/projecteur|beamer|salle|devant/i.test(blob);
  const display = DISPLAY.test(blob) && !prepOnly;
  const power = POWER.test(blob) || (opts.minutes ?? 0) >= LONG_BLOCK_MIN;
  const gear = new Set<string>();
  for (const [re, name] of GEAR) if (re.test(blob)) gear.add(name);
  if (display) gear.add("adaptateur USB-C → HDMI");
  if (power) gear.add("chargeur");
  return { internet: !!opts.link || ONLINE.test(blob), display, power, gear: [...gear] };
}

/** Fusionne deux avis (règles + LLM) : un besoin vu par l'un des deux compte. */
export function mergeNeeds(a: BlockNeeds | undefined, b: BlockNeeds | undefined): BlockNeeds {
  const x = a ?? NO_NEEDS;
  const y = b ?? NO_NEEDS;
  return {
    internet: x.internet || y.internet,
    display: x.display || y.display,
    power: x.power || y.power,
    gear: [...new Set([...x.gear, ...y.gear])].slice(0, 4),
  };
}

export const hasNeeds = (n?: BlockNeeds) => !!n && (n.internet || n.display || n.power || n.gear.length > 0);

/** « Dans ton sac » : le matériel de plusieurs blocs, avec le premier bloc qui en a besoin. */
export function bagList(blocks: DayBlock[]): Array<{ item: string; for: string; at: string }> {
  const out = new Map<string, { item: string; for: string; at: string }>();
  for (const b of [...blocks].sort((p, q) => p.start.localeCompare(q.start)))
    for (const g of b.needs?.gear ?? []) if (!out.has(g)) out.set(g, { item: g, for: b.title, at: b.start });
  return [...out.values()];
}

/**
 * Compare ce dont le bloc a besoin (internet, batterie, écran, matériel) à l'état du Mac.
 * alerts = ce qu'il faut régler AVANT le bloc ; les autres lignes confirment que c'est bon.
 */
export function needsCheck(block: DayBlock, snap: DeviceSnapshot, displays: DisplayInfo | null): { lines: string[]; alerts: number } {
  const n = block.needs;
  const lines: string[] = [];
  const warn: string[] = [];
  if (!n) return { lines, alerts: 0 };
  // Les alertes passent en premier : c'est ce qu'il faut régler.
  const alert = (msg: string) => warn.push(`⚠ ${msg}`);
  if (n.internet) {
    if (!snap.wifi) alert(`« ${block.title} » a besoin d'internet et aucun Wi-Fi n'est détecté : si tu n'es pas sur un câble, active le partage de connexion de ton téléphone.`);
    else if (snap.wifi.rssi < -70) alert(`Wi-Fi faible (${snap.wifi.rssi} dBm) pour « ${block.title} » : rapproche-toi de la borne ou passe en partage de connexion.`);
    else lines.push(`Internet OK (Wi-Fi ${snap.wifi.rssi} dBm).`);
  }
  const mins = durationMin(block);
  if (n.power || mins >= 90) {
    const b = snap.battery;
    if (b && !b.charging && b.percent < 50) alert(`Bloc de ${mins >= 60 ? `${Math.round((mins / 60) * 10) / 10} h`.replace(".", ",") : `${mins} min`} et batterie à ${b.percent} % : branche le chargeur maintenant.`);
    else if (b) lines.push(b.charging ? "Sur secteur." : `Batterie à ${b.percent} %, ça tient.`);
  }
  if (n.display) {
    if (!displays) lines.push("Je n'ai pas pu lire les écrans branchés.");
    else if (displays.external === 0) alert(`Tu présentes à ${block.start} et aucun écran externe n'est branché : branche l'adaptateur HDMI maintenant, pas devant tout le monde.`);
    else lines.push(`Écran externe branché (${displays.names.join(", ")}).`);
  }
  if (n.gear.length) lines.push(`À avoir sous la main : ${n.gear.join(", ")}.`);
  return { lines: [...warn, ...lines], alerts: warn.length };
}

/** Ligne « écran » en direct, pour le pop-up qui surveille le branchement. */
export function displayLine(block: Pick<DayBlock, "start">, d: DisplayInfo): string {
  return d.external > 0
    ? `✓ Écran externe branché (${d.names.join(", ")}) : c'est bon pour ${block.start}.`
    : `⚠ Tu présentes à ${block.start} et aucun écran externe n'est branché : branche l'adaptateur HDMI maintenant, pas devant tout le monde.`;
}
