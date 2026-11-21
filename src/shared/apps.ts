/** Règles sur les apps, partagées entre l'agent et l'UI. */

/** Jamais proposées à la fermeture : le système, nos outils de dev, et Preflight lui-même. */
export const PROTECTED_APPS = [
  "Finder", "Dock", "SystemUIServer", "loginwindow", "System Settings", "System Preferences",
  "Electron", "Preflight", "Claude", "Terminal", "iTerm", "iTerm2", "Visual Studio Code", "Code", "Cursor",
];

/** Apps où il peut y avoir un document non sauvegardé : les fermer passe en risque « demande ». */
export const DOCUMENT_APPS = [
  "Microsoft Word", "Microsoft Excel", "Microsoft PowerPoint", "Pages", "Numbers", "Keynote", "TextEdit", "Preview",
];

export const isProtected = (name: string) =>
  PROTECTED_APPS.some((p) => name.toLowerCase() === p.toLowerCase()) || /helper|agent$|daemon$/i.test(name);

export const isDocumentApp = (name: string) => DOCUMENT_APPS.some((p) => name.toLowerCase() === p.toLowerCase());

/** « Teams » (dans un bloc) correspond à « Microsoft Teams » (process). */
export const appMatches = (wanted: string, appName: string) => {
  const a = wanted.toLowerCase();
  const b = appName.toLowerCase();
  return b.includes(a) || a.includes(b) || (a === "chrome" && b === "google chrome");
};
