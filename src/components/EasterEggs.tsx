// biome-ignore-all lint/security/noSecrets: 日本語 UI 文言が高エントロピー文字列として誤検知されるため。
"use client";

import { useEffect, useRef, useState } from "react";
import "./EasterEggs.css";

/* =========================================================
   🥚 隠し要素いろいろ（このコンポーネントを layout に 1 つ置くだけ）

   1. コナミコマンド ↑↑↓↓←→←→ B A
        → フィルム吹雪が舞い、サイトが VHS/CRT モードに切替。
          もう一度入れると通常モードへ戻る。
   2. ロゴ(data-egg-logo)を素早く 7 回クリック
        → 映画のエンドロール風スタッフロール。

   ※ もう 1 つ、ページソース(view-source)に忍ばせた AA コメントが
     layout.tsx 側にあり、そこに 1・2 の遊び方のヒントを置いている。
   ========================================================= */

const KONAMI = [
  "arrowup",
  "arrowup",
  "arrowdown",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "arrowleft",
  "arrowright",
  "b",
  "a",
];

const CONFETTI_EMOJIS = ["🎬", "🍿", "🎞️", "📼", "⭐", "🎥"];

type Particle = {
  id: string;
  left: number;
  emoji: string;
  size: number;
  duration: number;
  delay: number;
  spin: number;
};

type Toast = { id: number; msg: string };

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

export default function EasterEggs() {
  const [vhs, setVhs] = useState(false);
  const [confetti, setConfetti] = useState<Particle[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [credits, setCredits] = useState(false);
  const buffer = useRef<string[]>([]);

  // <html> に VHS クラスを付け外し
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("egg-vhs", vhs);
    return () => root.classList.remove("egg-vhs");
  }, [vhs]);

  // コナミコマンド検知（吹雪 + VHS トグル）
  useEffect(() => {
    const showToast = (msg: string) => {
      const id = Date.now();
      setToast({ id, msg });
      window.setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 2600);
    };

    const fireConfetti = () => {
      const batch: Particle[] = Array.from({ length: 44 }, (_, i) => ({
        id: `${Date.now()}-${i}`,
        left: Math.random() * 100,
        emoji: CONFETTI_EMOJIS[(Math.random() * CONFETTI_EMOJIS.length) | 0],
        size: 20 + Math.random() * 22,
        duration: 2.6 + Math.random() * 2.6,
        delay: Math.random() * 0.8,
        spin: (Math.random() * 2 - 1) * 540,
      }));
      setConfetti(batch);
      window.setTimeout(() => setConfetti([]), 6200);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const key = e.key.toLowerCase();
      buffer.current = [...buffer.current, key].slice(-KONAMI.length);
      if (buffer.current.join(",") !== KONAMI.join(",")) return;

      buffer.current = [];
      fireConfetti();
      setVhs((v) => {
        const next = !v;
        showToast(
          next ? "🥚 隠しモード発動！ VHS ▶ ON" : "📼 通常モードに戻した",
        );
        return next;
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ロゴ 7 連打でスタッフロール
  useEffect(() => {
    let count = 0;
    let last = 0;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest("[data-egg-logo]")) return;
      const now = Date.now();
      count = now - last < 900 ? count + 1 : 1;
      last = now;
      // 連打の 2 発目以降はロゴの遷移を抑止（毎回ホームへ飛ぶジャンクを防ぐ）。
      // キャプチャ段階なので Next の Link が defaultPrevented を見る前に走る。
      if (count >= 2) e.preventDefault();
      if (count >= 7) {
        count = 0;
        setCredits(true);
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return (
    <>
      {confetti.length > 0 && (
        <div className="egg-layer" aria-hidden="true">
          {confetti.map((p) => (
            <span
              key={p.id}
              className="egg-confetti"
              style={
                {
                  left: `${p.left}%`,
                  fontSize: `${p.size}px`,
                  animationDuration: `${p.duration}s`,
                  animationDelay: `${p.delay}s`,
                  "--egg-spin": `${p.spin}deg`,
                } as React.CSSProperties
              }
            >
              {p.emoji}
            </span>
          ))}
        </div>
      )}

      {vhs && (
        <div className="egg-vhs-overlay" aria-hidden="true">
          <div className="egg-vhs-hud egg-vhs-hud--rec">
            <span className="egg-vhs-dot" />
            REC
          </div>
          <div className="egg-vhs-hud egg-vhs-hud--mode">▶ PLAY　SP</div>
          <div className="egg-vhs-hud egg-vhs-hud--tc">
            <VhsTimecode />
          </div>
        </div>
      )}

      {toast && <output className="egg-toast">{toast.msg}</output>}

      {credits && <CreditsOverlay onClose={() => setCredits(false)} />}
    </>
  );
}

/* カムコーダー風タイムコード（H:MM:SS:FF、約 30fps 表示） */
function VhsTimecode() {
  const [frames, setFrames] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const id = window.setInterval(() => {
      setFrames(Math.floor((performance.now() - start) / (1000 / 30)));
    }, 66);
    return () => window.clearInterval(id);
  }, []);

  const pad = (n: number) => String(n).padStart(2, "0");
  const ff = frames % 30;
  const totalSec = Math.floor(frames / 30);
  const ss = totalSec % 60;
  const mm = Math.floor(totalSec / 60) % 60;
  const hh = Math.floor(totalSec / 3600);
  return <>{`${hh}:${pad(mm)}:${pad(ss)}:${pad(ff)}`}</>;
}

/* 映画のエンドロール風スタッフロール */
const CREDITS: Array<[string, string]> = [
  ["監督 / DIRECTOR", "あなた（いま画面を見ている人）"],
  ["原作 / ORIGINAL", "サブスク動画のみんな"],
  ["主演 / STARRING", "数々の名シーン"],
  ["切り抜き / CLIPPED BY", "コミュニティのみなさま"],
  ["撮影 / CAMERA", "Next.js 16"],
  ["美術 / ART", "Tailwind CSS v4"],
  ["編集 / EDITOR", "React 19"],
  ["音楽 / MUSIC", "♪ あなたの脳内 BGM"],
  ["特別協力 / SPECIAL THANKS", "全ユーザーのみなさま"],
  ["🥚 隠し玉 / EASTER EGG", "これを見つけたあなたに乾杯"],
];

function CreditsOverlay({ onClose }: { onClose: () => void }) {
  // 開いた直後は閉じない。7 発目を通り越した“行き過ぎクリック”での即閉じを防ぐ。
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 600);
    return () => window.clearTimeout(t);
  }, []);

  const dismiss = () => {
    if (ready) onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="egg-credits"
      role="dialog"
      aria-modal="true"
      aria-label="スタッフロール"
    >
      <button
        type="button"
        className="egg-credits-backdrop"
        aria-label="閉じる"
        onClick={dismiss}
      />
      <div className="egg-credits-scroll" onAnimationEnd={onClose}>
        <div className="egg-credits-title">🎬 サブスク切り抜き</div>
        <div className="egg-credits-sub">STAFF ROLL</div>
        {CREDITS.map(([role, name]) => (
          <div className="egg-credits-row" key={role}>
            <span className="egg-credits-role">{role}</span>
            <span className="egg-credits-name">{name}</span>
          </div>
        ))}
        <div className="egg-credits-fin">FIN</div>
      </div>
      <button type="button" className="egg-credits-skip" onClick={dismiss}>
        スキップ / Esc
      </button>
    </div>
  );
}
