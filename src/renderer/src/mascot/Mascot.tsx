import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

type Mood = "idle" | "alert" | "happy" | "talk";

/**
 * Bravo, la mascotte : un petit chien qui surveille ton écran. Oreilles tombantes au calme,
 * dressées quand il a une suggestion, langue sortie quand tout va bien.
 * Il reste dans le coin de l'écran, s'anime quand quelque chose arrive et parle par bulles.
 * Clic : commencer la journée (puis le tableau de bord). Clic droit : le menu.
 */
export function Mascot() {
  const [mood, setMood] = useState<Mood>("idle");
  const [text, setText] = useState<string | null>("Clique-moi pour commencer ta journée.");
  const [blink, setBlink] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Fenêtre transparente : pas de fond blanc.
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.overflow = "hidden";
    const off = window.api.onEvent((e) => {
      if (e.type !== "mascot") return;
      const p = e.payload as { mood: Mood; text?: string };
      setMood(p.mood);
      if (p.text) setText(p.text);
      window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => {
        setText(null);
        setMood("idle");
      }, 10_000);
    });
    // Clignement des yeux de temps en temps.
    const b = window.setInterval(() => {
      setBlink(true);
      window.setTimeout(() => setBlink(false), 140);
    }, 4200);
    return () => {
      off();
      window.clearInterval(b);
    };
  }, []);

  const bob =
    mood === "alert"
      ? { y: [0, -14, 0, -8, 0], transition: { duration: 0.9, repeat: 2 } }
      : mood === "happy"
        ? { y: [0, -6, 0], rotate: [0, -4, 4, 0], transition: { duration: 0.8 } }
        : { y: [0, -4, 0], transition: { duration: 3.2, repeat: Infinity, ease: "easeInOut" as const } };

  const eyeH = blink ? 1 : mood === "alert" ? 9 : 7;

  return (
    <div className="mascot-root">
      <AnimatePresence>
        {text ? (
          <motion.button
            key={text}
            type="button"
            className="mascot-bubble"
            data-mood={mood}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4 }}
            onClick={() => setText(null)}
          >
            {text}
          </motion.button>
        ) : null}
      </AnimatePresence>

      <div className="mascot-grip" title="Déplacer" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>

      <motion.button
        type="button"
        className="mascot-body"
        aria-label="Bravo : commencer ma journée"
        animate={bob}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => void window.api.mascotClick()}
        onContextMenu={(e) => {
          e.preventDefault();
          void window.api.mascotMenu();
        }}
      >
        <svg viewBox="0 0 120 120" width="108" height="108" aria-hidden="true">
          {/* ombre */}
          <ellipse cx="60" cy="113" rx="32" ry="5" fill="rgba(0,0,0,0.12)" />
          {/* corps */}
          <ellipse cx="60" cy="94" rx="27" ry="17" fill="#E2A65B" stroke="#B9783A" strokeWidth="2" />
          <ellipse cx="60" cy="99" rx="14" ry="9" fill="#F6E1C3" />
          {/* pattes */}
          <ellipse cx="46" cy="108" rx="7" ry="4.5" fill="#F6E1C3" stroke="#B9783A" strokeWidth="1.5" />
          <ellipse cx="74" cy="108" rx="7" ry="4.5" fill="#F6E1C3" stroke="#B9783A" strokeWidth="1.5" />
          {/* oreilles : tombantes au calme, dressées quand il a quelque chose à dire */}
          <g transform={mood === "alert" ? "rotate(-28 34 30)" : mood === "happy" ? "rotate(-10 34 30)" : undefined}>
            <path d="M36 26c-12 2-19 16-15 32 1 5 8 6 11 1l8-24z" fill="#8A5A2B" />
          </g>
          <g transform={mood === "alert" ? "rotate(28 86 30)" : mood === "happy" ? "rotate(10 86 30)" : undefined}>
            <path d="M84 26c12 2 19 16 15 32-1 5-8 6-11 1l-8-24z" fill="#8A5A2B" />
          </g>
          {/* tête */}
          <path d="M60 18c20 0 32 14 32 32 0 19-14 30-32 30S28 69 28 50c0-18 12-32 32-32z" fill="#E2A65B" stroke="#B9783A" strokeWidth="2" />
          {/* tache autour d'un œil */}
          <ellipse cx="74" cy="46" rx="10" ry="9" fill="#C98A45" />
          {/* museau */}
          <ellipse cx="60" cy="62" rx="15" ry="11" fill="#F6E1C3" />
          {/* yeux */}
          {mood === "happy" ? (
            <>
              <path d="M44 47q5-6 10 0" stroke="#2A1A0E" strokeWidth="3" fill="none" strokeLinecap="round" />
              <path d="M66 47q5-6 10 0" stroke="#2A1A0E" strokeWidth="3" fill="none" strokeLinecap="round" />
            </>
          ) : (
            <>
              <ellipse cx="49" cy="46" rx="4.2" ry={eyeH / 2 + 1} fill="#2A1A0E" />
              <ellipse cx="71" cy="46" rx="4.2" ry={eyeH / 2 + 1} fill="#2A1A0E" />
              {!blink ? <circle cx="50.3" cy="44.3" r="1.3" fill="#fff" /> : null}
              {!blink ? <circle cx="72.3" cy="44.3" r="1.3" fill="#fff" /> : null}
            </>
          )}
          {/* truffe */}
          <path d="M54 56q6-4 12 0q-1 5-6 6q-5-1-6-6z" fill="#2A1A0E" />
          {/* bouche */}
          {mood === "talk" || mood === "alert" ? (
            <ellipse cx="60" cy="68" rx="4.5" ry={mood === "alert" ? 4.5 : 3} fill="#7A2E1F" />
          ) : (
            <path d="M53 65q3.5 4 7 0q3.5 4 7 0" stroke="#2A1A0E" strokeWidth="2" fill="none" strokeLinecap="round" />
          )}
          {/* langue quand il est content */}
          {mood === "happy" ? <path d="M56 67h8v6a4 4 0 0 1-8 0z" fill="#E86F6F" stroke="#B94A4A" strokeWidth="1" /> : null}
          {/* collier avec médaille */}
          <path d="M38 76q22 10 44 0" stroke="#1F3A5F" strokeWidth="5" fill="none" strokeLinecap="round" />
          <circle cx="60" cy="83" r="4.5" fill="#E9B54A" stroke="#B9862A" strokeWidth="1.2" />
          {/* point d'exclamation quand il a une suggestion */}
          {mood === "alert" ? (
            <g>
              <circle cx="102" cy="18" r="11" fill="#ED705A" />
              <rect x="100.5" y="10" width="3" height="10" rx="1.5" fill="#fff" />
              <circle cx="102" cy="24" r="1.8" fill="#fff" />
            </g>
          ) : null}
        </svg>
      </motion.button>
    </div>
  );
}
