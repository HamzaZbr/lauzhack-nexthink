import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

type Mood = "idle" | "alert" | "happy" | "talk";

/** De combien la tête est cachée sous le bord de l'écran, selon l'humeur (en unités du dessin). */
const PEEK: Record<Mood, number> = { idle: 34, talk: 10, alert: 0, happy: 4 };

/**
 * Sparky, la mascotte : un petit chien qui dépasse du bord bas de l'écran.
 * Au calme, on ne voit que ses oreilles et ses yeux, qui suivent ta souris.
 * Quand il a quelque chose à dire, il sort la tête ; content, il tire la langue.
 * Clic : commencer la journée (puis le tableau de bord). Glisser : le déplacer. Clic droit : le menu.
 */
export function Mascot() {
  const [mood, setMood] = useState<Mood>("idle");
  const [text, setText] = useState<string | null>("Salut, je suis Sparky. Clique-moi pour commencer ta journée.");
  const [blink, setBlink] = useState(false);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const hideTimer = useRef<number | undefined>(undefined);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  useEffect(() => {
    // Fenêtre transparente : pas de fond blanc.
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.overflow = "hidden";
    const off = window.api.onEvent((e) => {
      if (e.type === "cursor") {
        // Les yeux regardent la souris : décalage des pupilles, 3,2 unités au plus.
        const { dx, dy } = e.payload as { dx: number; dy: number };
        const d = Math.hypot(dx, dy) || 1;
        const k = (Math.min(1, d / 220) * 3.2) / d;
        setLook({ x: dx * k, y: dy * k });
        return;
      }
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
    const b = window.setInterval(() => {
      setBlink(true);
      window.setTimeout(() => setBlink(false), 130);
    }, 3800);
    return () => {
      off();
      window.clearInterval(b);
    };
  }, []);

  const spring = { type: "spring" as const, stiffness: 260, damping: 18 };
  const headY = PEEK[mood];
  const earTilt = mood === "alert" ? 18 : mood === "happy" ? 8 : 0;

  return (
    <div className="mascot-root">
      <AnimatePresence>
        {text ? (
          <motion.button
            key={text}
            type="button"
            className="mascot-bubble"
            data-mood={mood}
            initial={{ opacity: 0, y: 10, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6 }}
            transition={spring}
            onClick={() => setText(null)}
          >
            {text}
          </motion.button>
        ) : null}
      </AnimatePresence>

      <button
        type="button"
        className="mascot-body"
        aria-label="Sparky : commencer ma journée"
        title="Clic : commencer · Glisser : déplacer · Clic droit : menu"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.screenX, y: e.screenY, moved: false };
          window.api.mascotDragStart();
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.screenX - d.x;
          const dy = e.screenY - d.y;
          if (!d.moved && Math.hypot(dx, dy) > 4) d.moved = true;
          if (d.moved) window.api.mascotDrag(dx, dy);
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved) void window.api.mascotClick();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          void window.api.mascotMenu();
        }}
      >
        <svg viewBox="0 0 150 130" width="150" height="130" aria-hidden="true">
          <defs>
            <clipPath id="above-edge">
              <rect x="0" y="0" width="150" height="122" />
            </clipPath>
          </defs>

          {/* La tête sort de derrière le bord (clip), avec un ressort */}
          <g clipPath="url(#above-edge)">
            <motion.g initial={{ y: 60 }} animate={{ y: mood === "idle" ? [headY, headY - 2.5, headY] : headY }} transition={mood === "idle" ? { duration: 3.4, repeat: Infinity, ease: "easeInOut" } : spring}>
              <motion.g animate={{ rotate: mood === "happy" ? [0, -6, 6, -3, 0] : 0 }} transition={{ duration: 0.8 }} style={{ transformBox: "view-box", originX: "75px", originY: "100px" }}>
                {/* oreilles */}
                <motion.path d="M46 52c-14 1-22 17-17 34 2 6 10 6 13 0l10-27z" fill="#8A5A2B" animate={{ rotate: -earTilt }} transition={spring} style={{ transformBox: "view-box", originX: "48px", originY: "54px" }} />
                <motion.path d="M104 52c14 1 22 17 17 34-2 6-10 6-13 0l-10-27z" fill="#8A5A2B" animate={{ rotate: earTilt }} transition={spring} style={{ transformBox: "view-box", originX: "102px", originY: "54px" }} />
                {/* tête */}
                <path d="M75 40c22 0 36 16 36 37 0 22-16 36-36 36S39 99 39 77c0-21 14-37 36-37z" fill="#E2A65B" stroke="#B9783A" strokeWidth="2" />
                <ellipse cx="90" cy="70" rx="11" ry="10" fill="#C98A45" />
                <ellipse cx="75" cy="92" rx="17" ry="12" fill="#F6E1C3" />
                {/* yeux qui suivent la souris */}
                {mood === "happy" ? (
                  <>
                    <path d="M58 72q6-7 12 0" stroke="#2A1A0E" strokeWidth="3.2" fill="none" strokeLinecap="round" />
                    <path d="M80 72q6-7 12 0" stroke="#2A1A0E" strokeWidth="3.2" fill="none" strokeLinecap="round" />
                  </>
                ) : (
                  <>
                    <motion.ellipse cx="64" cy="71" rx="7" fill="#FFFDF8" stroke="#2A1A0E" strokeWidth="1.2" animate={{ ry: blink ? 0.8 : mood === "alert" ? 8.5 : 7.5 }} transition={{ duration: 0.08 }} />
                    <motion.ellipse cx="86" cy="71" rx="7" fill="#FFFDF8" stroke="#2A1A0E" strokeWidth="1.2" animate={{ ry: blink ? 0.8 : mood === "alert" ? 8.5 : 7.5 }} transition={{ duration: 0.08 }} />
                    {!blink ? (
                      <>
                        <motion.circle r="3.6" fill="#2A1A0E" animate={{ cx: 64 + look.x, cy: 71 + look.y }} transition={{ type: "spring", stiffness: 400, damping: 30 }} />
                        <motion.circle r="3.6" fill="#2A1A0E" animate={{ cx: 86 + look.x, cy: 71 + look.y }} transition={{ type: "spring", stiffness: 400, damping: 30 }} />
                        <motion.circle r="1.2" fill="#fff" animate={{ cx: 65.3 + look.x, cy: 69.6 + look.y }} transition={{ type: "spring", stiffness: 400, damping: 30 }} />
                        <motion.circle r="1.2" fill="#fff" animate={{ cx: 87.3 + look.x, cy: 69.6 + look.y }} transition={{ type: "spring", stiffness: 400, damping: 30 }} />
                      </>
                    ) : null}
                  </>
                )}
                {/* truffe */}
                <path d="M69 85q6-4 12 0q-1 5-6 6q-5-1-6-6z" fill="#2A1A0E" />
                {/* bouche */}
                {mood === "talk" || mood === "alert" ? (
                  <motion.ellipse cx="75" cy="98" rx="4.8" fill="#7A2E1F" animate={{ ry: mood === "talk" ? [2, 4, 2] : 4.8 }} transition={mood === "talk" ? { duration: 0.35, repeat: 6 } : spring} />
                ) : (
                  <path d="M68 95q3.5 4 7 0q3.5 4 7 0" stroke="#2A1A0E" strokeWidth="2" fill="none" strokeLinecap="round" />
                )}
                {mood === "happy" ? <path d="M71 97h8v7a4 4 0 0 1-8 0z" fill="#E86F6F" stroke="#B94A4A" strokeWidth="1" /> : null}
                {/* collier */}
                <path d="M50 108q25 10 50 0" stroke="#1F3A5F" strokeWidth="5" fill="none" strokeLinecap="round" />
                <circle cx="75" cy="114" r="4.5" fill="#E9B54A" stroke="#B9862A" strokeWidth="1.2" />
              </motion.g>
            </motion.g>
          </g>

          {/* le bord de l'écran, et les pattes qui s'y accrochent */}
          <rect x="18" y="121" width="114" height="2" rx="1" fill="rgba(0,0,0,0.18)" />
          <motion.g animate={{ y: mood === "idle" ? 2 : 0 }} transition={spring}>
            <ellipse cx="54" cy="122" rx="10" ry="6" fill="#F6E1C3" stroke="#B9783A" strokeWidth="1.6" />
            <ellipse cx="96" cy="122" rx="10" ry="6" fill="#F6E1C3" stroke="#B9783A" strokeWidth="1.6" />
            <path d="M50 120v4M54 119v5M58 120v4M92 120v4M96 119v5M100 120v4" stroke="#B9783A" strokeWidth="1.1" strokeLinecap="round" />
          </motion.g>

          {/* « ! » quand il a une suggestion */}
          <AnimatePresence>
            {mood === "alert" ? (
              <motion.g initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={spring} style={{ transformBox: "view-box", originX: "128px", originY: "30px" }}>
                <circle cx="128" cy="30" r="11" fill="#ED705A" />
                <rect x="126.5" y="22" width="3" height="10" rx="1.5" fill="#fff" />
                <circle cx="128" cy="36" r="1.8" fill="#fff" />
              </motion.g>
            ) : null}
          </AnimatePresence>
        </svg>
      </button>
    </div>
  );
}
