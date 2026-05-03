import React, { useEffect, useRef, useState } from "react";
import {
  PanResponder,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hap, hapHeavy, hapSel, playSoundError, playSoundOk, speakWord } from "../../../lib/audio";
import { SpeedMode, SPEEDS } from "../../../lib/constants";
import { H, W } from "../../../lib/dimensions";
import { SREngine } from "../../../lib/sr-engine";
import type { Level, Word } from "../../../words";
import { PauseOverlay, SoundWarningBanner } from "../components/GameHeader";

export default function PinballGame({
  sr, speed, level, onBack,
}: {
  sr: SREngine;
  speed: SpeedMode;
  level: Level;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const pool = sr.getPool();
  const spd = SPEEDS[speed];
  const SPEED_MULT = spd.base / 90;

  const HEADER_H = insets.top + 175;
  const GAME_H = H - HEADER_H - insets.bottom;
  const BALL_R2 = 18;
  const PAD_W = W / 3;
  const PAD_H = 14;
  const PAD_Y = GAME_H * 0.82;
  const BKT_Y = GAME_H * 0.88;
  const BKT_H = GAME_H * 0.12;
  const BUMP_POSITIONS = [
    { x: W * 0.25, y: GAME_H * 0.22 },
    { x: W * 0.75, y: GAME_H * 0.22 },
    { x: W * 0.15, y: GAME_H * 0.45 },
    { x: W * 0.85, y: GAME_H * 0.45 },
  ];

  const [target, setTarget] = useState(() => sr.next());
  const targetRef = useRef(target);
  targetRef.current = target;

  const mkBuckets = (tgt: Word) => {
    const wrongs = pool.filter((w) => w.tr !== tgt.tr).sort(() => Math.random() - 0.5).slice(0, 2);
    const all = [tgt, ...wrongs].sort(() => Math.random() - 0.5);
    const bw = W / 3;
    return all.map((w, i) => ({ word: w, isCorrect: w.tr === tgt.tr, x: i * bw, w: bw }));
  };
  const [buckets, setBuckets] = useState(() => mkBuckets(target));
  const bucketsRef = useRef(buckets);
  bucketsRef.current = buckets;

  const bxRef = useRef(W / 2);
  const byRef = useRef(GAME_H * 0.12);
  const vxRef = useRef((Math.random() - 0.5) * 100 * SPEED_MULT);
  const vyRef = useRef(90 * SPEED_MULT);
  const [bPos, setBPos] = useState({ x: W / 2, y: GAME_H * 0.12 });
  const padRef = useRef(W / 2 - PAD_W / 2);
  const [padX, setPadX] = useState(W / 2 - PAD_W / 2);
  const [hitBump, setHitBump] = useState<number | null>(null);
  const [lives, setLives] = useState(5);
  const livesRef = useRef(5);
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const [streak, setStreak] = useState(0);
  const streakRef = useRef(0);
  const [learned, setLearned] = useState(sr.count());
  const [gameOver, setGameOver] = useState(false);
  const [pbRestartKey, setPbRestartKey] = useState(0);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const isOver = useRef(false);
  const rafRef = useRef(0);
  const ltRef = useRef(0);
  const [flash, setFlash] = useState<{ text: string; ok: boolean } | null>(null);
  const flashTm = useRef<any>(null);
  const processingRef = useRef(false);

  const generateRandomBumpers = () => {
    const positions: { x: number; y: number }[] = [];
    const bumperRadius = 22, padding = 40;
    while (positions.length < 4) {
      let valid = true;
      const newX = Math.random() * (W - 2 * padding) + padding;
      const newY = Math.random() * (GAME_H * 0.5 - 2 * padding) + padding;
      for (const p of positions) {
        if (Math.hypot(newX - p.x, newY - p.y) < bumperRadius * 4) valid = false;
      }
      if (valid) positions.push({ x: newX, y: newY });
    }
    return positions;
  };

  const [bumpers, setBumpers] = useState(BUMP_POSITIONS);
  const bumpsRef = useRef(BUMP_POSITIONS);
  bumpsRef.current = bumpers;

  const togglePause = () => { pausedRef.current = !pausedRef.current; setPaused((p) => !p); };
  const resetBall = () => {
    bxRef.current = W / 2 + (Math.random() - 0.5) * W * 0.3;
    byRef.current = GAME_H * 0.12;
    vxRef.current = (Math.random() - 0.5) * 100 * SPEED_MULT;
    vyRef.current = 90 * SPEED_MULT;
    processingRef.current = false;
  };
  const showFlash = (text: string, ok: boolean) => {
    if (flashTm.current) clearTimeout(flashTm.current);
    setFlash({ text, ok });
    flashTm.current = setTimeout(() => setFlash(null), 900);
  };
  const nextQ = () => {
    const nt = sr.next();
    targetRef.current = nt;
    setTarget(nt);
    const nb = mkBuckets(nt);
    setBuckets(nb);
    bucketsRef.current = nb;
    resetBall();
  };

  useEffect(() => {
    isOver.current = false;
    resetBall();
    ltRef.current = performance.now();
    const loop = (now: number) => {
      if (isOver.current) return;
      if (pausedRef.current) { ltRef.current = now; rafRef.current = requestAnimationFrame(loop); return; }
      const dt = Math.min((now - ltRef.current) / 1000, 0.04);
      ltRef.current = now;
      let bx = bxRef.current, by = byRef.current, vx = vxRef.current, vy = vyRef.current;
      vy += 200 * dt;
      bx += vx * dt;
      by += vy * dt;
      if (bx < BALL_R2) { bx = BALL_R2; vx = Math.abs(vx); }
      if (bx > W - BALL_R2) { bx = W - BALL_R2; vx = -Math.abs(vx); }
      if (by < BALL_R2) { by = BALL_R2; vy = Math.abs(vy) * 0.7; }
      bumpsRef.current.forEach((b, i) => {
        const dx = bx - b.x, dy = by - b.y, r = 22, d = Math.hypot(dx, dy);
        if (d < BALL_R2 + r) {
          const nx = dx / d, ny = dy / d;
          const spd2 = Math.max(Math.hypot(vx, vy), 160 * SPEED_MULT);
          vx = nx * spd2; vy = ny * spd2;
          bx = b.x + nx * (BALL_R2 + r + 1); by = b.y + ny * (BALL_R2 + r + 1);
          setHitBump(i);
          setTimeout(() => setHitBump(null), 120);
          hapSel();
        }
      });
      const px = padRef.current;
      if (by + BALL_R2 >= PAD_Y && by + BALL_R2 <= PAD_Y + PAD_H + 6 && bx >= px && bx <= px + PAD_W && vy > 0) {
        vy = -Math.abs(vy) * 0.9;
        by = PAD_Y - BALL_R2;
        vx = ((bx - (px + PAD_W / 2)) / (PAD_W / 2)) * 180 * SPEED_MULT;
        hap();
      }
      if (by + BALL_R2 >= BKT_Y && !processingRef.current) {
        processingRef.current = true;
        const bkts = bucketsRef.current;
        const hitBucket = bkts.find((bk) => bx >= bk.x && bx <= bk.x + bk.w);
        const nearBucket = hitBucket ?? bkts.reduce((closest, bk) => Math.abs(bx - (bk.x + bk.w / 2)) < Math.abs(bx - (closest.x + closest.w / 2)) ? bk : closest);
        const bk = nearBucket;
        if (bk.isCorrect) {
          streakRef.current++; setStreak(streakRef.current);
          scoreRef.current += 10 + streakRef.current * 2; setScore(scoreRef.current);
          sr.record(bk.word, true); setLearned(sr.count());
          playSoundOk(); speakWord(bk.word.en); hap();
          showFlash(`✓ ${bk.word.tr}`, true);
          setTimeout(nextQ, 900);
        } else {
          streakRef.current = 0; setStreak(0);
          livesRef.current = Math.max(0, livesRef.current - 1); setLives(livesRef.current);
          sr.record(bk.word, false); hapHeavy(); playSoundError();
          showFlash(`✗ ${bk.word.tr} değil!`, false);
          if (livesRef.current <= 0) { isOver.current = true; setGameOver(true); }
          else setTimeout(resetBall, 700);
        }
        vx = 0; vy = 0;
      }
      bxRef.current = bx; byRef.current = by; vxRef.current = vx; vyRef.current = vy;
      setBPos({ x: bx, y: by });
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(rafRef.current); if (flashTm.current) clearTimeout(flashTm.current); };
  }, [speed, pbRestartKey]);

  const panPad = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => { const x = Math.max(0, Math.min(W - PAD_W, e.nativeEvent.pageX - PAD_W / 2)); padRef.current = x; setPadX(x); },
      onPanResponderMove: (e) => { const x = Math.max(0, Math.min(W - PAD_W, e.nativeEvent.pageX - PAD_W / 2)); padRef.current = x; setPadX(x); },
    }),
  ).current;

  const restart = () => {
    cancelAnimationFrame(rafRef.current);
    livesRef.current = 5; setLives(5);
    scoreRef.current = 0; setScore(0);
    streakRef.current = 0; setStreak(0);
    isOver.current = false;
    const nt = sr.next();
    targetRef.current = nt; setTarget(nt);
    const nb = mkBuckets(nt); setBuckets(nb); bucketsRef.current = nb;
    resetBall(); ltRef.current = performance.now();
    setGameOver(false); setPbRestartKey((k) => k + 1);
  };

  const sc = streak >= 5 ? "#f87171" : streak >= 3 ? "#fbbf24" : streak >= 1 ? "#22c55e" : "#94a3b8";

  return (
    <View style={{ flex: 1, backgroundColor: "#f0f4ff", paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <StatusBar backgroundColor="#f0f4ff" barStyle="dark-content" />
      {paused && <PauseOverlay onResume={togglePause} onMenu={onBack} />}

      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "rgba(148,163,184,0.15)" }}>
        <TouchableOpacity onPress={() => { hapSel(); onBack(); }} style={{ paddingVertical: 8, paddingHorizontal: 13, backgroundColor: "#f1f5f9", borderRadius: 10, borderWidth: 1.5, borderColor: "rgba(148,163,184,0.3)" }}>
          <Text style={{ fontSize: 13, color: "#64748b", fontWeight: "700" }}>← Menü</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={togglePause} style={{ paddingVertical: 7, paddingHorizontal: 9, marginLeft: 6, backgroundColor: "rgba(148,163,184,0.1)", borderRadius: 10 }}>
          <Text style={{ fontSize: 14 }}>⏸️</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center", gap: 2 }}>
          <Text style={{ fontSize: 16, fontWeight: "900", color: "#1e1b4b" }}>🎱 Kelime Pinball</Text>
          <View style={{ flexDirection: "row", gap: 5 }}>
            <View style={{ paddingHorizontal: 8, paddingVertical: 1, borderRadius: 50, backgroundColor: spd.color + "18", borderWidth: 1, borderColor: spd.color + "44" }}>
              <Text style={{ fontSize: 9, color: spd.color, fontWeight: "700" }}>{spd.label}</Text>
            </View>
            <View style={{ paddingHorizontal: 8, paddingVertical: 1, borderRadius: 50, backgroundColor: "rgba(99,102,241,0.12)", borderWidth: 1, borderColor: "rgba(99,102,241,0.3)" }}>
              <Text style={{ fontSize: 9, color: "#6366f1", fontWeight: "700" }}>📚 {level}</Text>
            </View>
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          <View style={{ flexDirection: "row", gap: 2 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Text key={i} style={{ fontSize: 12, opacity: i < lives ? 1 : 0.15 }}>❤️</Text>
            ))}
          </View>
          <Text style={{ fontSize: 11, fontWeight: "900", color: sc }}>⭐{score}{streak > 0 ? ` 🔥${streak}` : ""}</Text>
        </View>
      </View>

      <SoundWarningBanner />

      <View style={{ backgroundColor: "#fff", paddingVertical: 8, paddingHorizontal: 16, borderBottomWidth: 2, borderBottomColor: "rgba(99,102,241,0.2)", alignItems: "center", gap: 4 }}>
        <Text style={{ fontSize: 22, fontWeight: "900", color: "#1e1b4b" }}>{target.en}</Text>
        <Text style={{ fontSize: 10, color: "#94a3b8", letterSpacing: 2, textTransform: "uppercase", fontWeight: "700" }}>Topu doğru Türkçe kovaya düşür</Text>
        <TouchableOpacity onPress={() => { setBumpers(generateRandomBumpers()); hapSel(); }} style={{ paddingVertical: 8, paddingHorizontal: 16, backgroundColor: "rgba(99,102,241,0.1)", borderRadius: 10, borderWidth: 1.5, borderColor: "rgba(99,102,241,0.3)", marginTop: 4 }}>
          <Text style={{ fontSize: 13, color: "#6366f1", fontWeight: "800" }}>🔀 Engelleri Karıştır</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1, position: "relative", overflow: "hidden", backgroundColor: "#e8eeff" }} {...panPad.panHandlers}>
        {[0.33, 0.66].map((f, i) => (
          <View key={i} style={{ position: "absolute", top: 0, bottom: 0, left: W * f, width: 1, backgroundColor: "rgba(148,163,184,0.15)" }} />
        ))}

        {bumpers.map((b, i) => (
          <View key={i} style={{ position: "absolute", left: b.x - 22, top: b.y - 22, width: 44, height: 44, borderRadius: 22, backgroundColor: hitBump === i ? "rgba(251,191,36,0.7)" : "rgba(99,102,241,0.18)", borderWidth: 2.5, borderColor: hitBump === i ? "#f59e0b" : "#6366f1", alignItems: "center", justifyContent: "center", shadowColor: hitBump === i ? "#f59e0b" : "#6366f1", shadowOffset: { width: 0, height: 0 }, shadowOpacity: hitBump === i ? 0.8 : 0.2, shadowRadius: hitBump === i ? 10 : 4, elevation: hitBump === i ? 8 : 2 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: hitBump === i ? "#fbbf24" : "rgba(99,102,241,0.4)" }} />
          </View>
        ))}

        <View style={{ position: "absolute", left: bPos.x - BALL_R2, top: bPos.y - BALL_R2, width: BALL_R2 * 2, height: BALL_R2 * 2, borderRadius: BALL_R2, backgroundColor: "#1e1b4b", shadowColor: "#6366f1", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 6, elevation: 8, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: BALL_R2 * 0.45, fontWeight: "900", color: "#fff", textAlign: "center", paddingHorizontal: 2 }} numberOfLines={1} adjustsFontSizeToFit>{target?.en ?? ""}</Text>
        </View>

        <View style={{ position: "absolute", left: padX, top: PAD_Y, width: PAD_W, height: PAD_H, borderRadius: PAD_H / 2, backgroundColor: "#6366f1", shadowColor: "#6366f1", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 6 }} />

        {buckets.map((bk, i) => (
          <View key={i} style={{ position: "absolute", left: bk.x, top: BKT_Y, width: bk.w, height: BKT_H, backgroundColor: bk.isCorrect ? "rgba(34,197,94,0.18)" : "rgba(148,163,184,0.1)", borderWidth: 2, borderColor: bk.isCorrect ? "#22c55e" : "rgba(148,163,184,0.4)", borderBottomLeftRadius: 16, borderBottomRightRadius: 16, borderTopWidth: 3, borderTopColor: bk.isCorrect ? "#22c55e" : "rgba(148,163,184,0.5)", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: "900", textAlign: "center", color: bk.isCorrect ? "#16a34a" : "#475569", lineHeight: 16 }} numberOfLines={2}>{bk.word.tr}</Text>
          </View>
        ))}

        {buckets.map((bk, i) => (
          <View key={`arrow-${i}`} style={{ position: "absolute", left: bk.x + bk.w / 2 - 12, top: BKT_Y - 22, width: 24, height: 16, alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: bk.isCorrect ? "#22c55e" : "rgba(148,163,184,0.4)" }}>▼</Text>
          </View>
        ))}

        {flash && (
          <View style={{ position: "absolute", top: GAME_H * 0.08, left: 0, right: 0, alignItems: "center", zIndex: 99, pointerEvents: "none" }}>
            <View style={{ backgroundColor: flash.ok ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.12)", borderRadius: 12, paddingVertical: 8, paddingHorizontal: 18, borderWidth: 1.5, borderColor: flash.ok ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.35)" }}>
              <Text style={{ fontSize: 13, fontWeight: "900", color: flash.ok ? "#16a34a" : "#ef4444", textAlign: "center" }}>{flash.text}</Text>
            </View>
          </View>
        )}
      </View>

      {gameOver && (
        <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.92)", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <Text style={{ fontSize: 52, marginBottom: 10 }}>🎱</Text>
          <Text style={{ fontSize: 26, fontWeight: "900", color: "#fff", marginBottom: 4 }}>Oyun Bitti!</Text>
          <Text style={{ fontSize: 14, color: "#fbbf24", marginBottom: 4 }}>Skor: ⭐{score}</Text>
          <Text style={{ fontSize: 13, color: "#34d399", marginBottom: 24 }}>Öğrenilen: 📚{learned}</Text>
          <TouchableOpacity onPress={restart} style={{ backgroundColor: "#6366f1", paddingVertical: 14, paddingHorizontal: 44, borderRadius: 50 }}>
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>Tekrar Oyna</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
