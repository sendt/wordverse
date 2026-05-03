import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hap, hapHeavy, playSoundError, playSoundOk, speakWord } from "../../../lib/audio";
import { Gate, SpeedMode, SPEEDS } from "../../../lib/constants";
import { H, W } from "../../../lib/dimensions";
import { SREngine } from "../../../lib/sr-engine";
import type { Level, Word } from "../../../words";
import { PauseOverlay, SoundWarningBanner, WordToast } from "../components/GameHeader";

// ─── Rush constants ──────────────────────────────────────────
const RUSH_LIVES = 5;
const GATE_H = 56;
const GAP = 8;
const BALL_R = 18;
const HORIZ_Y = 0.05;
const ROAD_W_BOT = W * 0.88;
const ROAD_W_TOP = W * 0.22;

const roadEdge = (y: number, h: number = H) => {
  const pct = Math.max(0, Math.min(1, (y / h - HORIZ_Y) / (1 - HORIZ_Y)));
  const half = ROAD_W_TOP / 2 + (ROAD_W_BOT / 2 - ROAD_W_TOP / 2) * pct;
  return { left: W / 2 - half, right: W / 2 + half, width: half * 2, pct };
};

const gateScale = (y: number, h: number = H) => {
  const { pct } = roadEdge(y, h);
  return 0.1 + pct * 0.9;
};

let _gid = 0;
function makeGate(sr: SREngine): Gate {
  const w = sr.next(), p = sr.getPool();
  let x: Word;
  do { x = p[Math.floor(Math.random() * p.length)]; } while (x.tr === w.tr);
  const cl = Math.random() < 0.5;
  return {
    id: _gid++,
    word: w,
    cLeft: cl,
    leftLabel: cl ? w.tr : x.tr,
    rightLabel: cl ? x.tr : w.tr,
    y: -GATE_H - 10,
    state: "fall",
    opacity: 1,
  };
}

const TopDownCar = (
  <View style={{ width: 48, height: 72, alignItems: "center" }}>
    <View style={{ position: "absolute", top: 8, left: 4, right: 4, bottom: 8, backgroundColor: "#e2e8f0", borderRadius: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4 }}>
      <View style={{ position: "absolute", top: 6, left: 6, right: 6, height: 14, backgroundColor: "#1e293b", borderRadius: 6, opacity: 0.85 }} />
      <View style={{ position: "absolute", bottom: 6, left: 7, right: 7, height: 11, backgroundColor: "#1e293b", borderRadius: 5, opacity: 0.75 }} />
      <View style={{ position: "absolute", top: 24, left: 6, right: 6, height: 12, backgroundColor: "#cbd5e1", borderRadius: 4 }} />
      <View style={{ position: "absolute", top: 3, left: 4, width: 8, height: 4, backgroundColor: "#fef9c3", borderRadius: 2 }} />
      <View style={{ position: "absolute", top: 3, right: 4, width: 8, height: 4, backgroundColor: "#fef9c3", borderRadius: 2 }} />
      <View style={{ position: "absolute", bottom: 3, left: 4, width: 7, height: 4, backgroundColor: "#ef4444", borderRadius: 2 }} />
      <View style={{ position: "absolute", bottom: 3, right: 4, width: 7, height: 4, backgroundColor: "#ef4444", borderRadius: 2 }} />
    </View>
    <View style={{ position: "absolute", top: 10, left: 0, width: 7, height: 12, backgroundColor: "#1e293b", borderRadius: 3 }} />
    <View style={{ position: "absolute", bottom: 10, left: 0, width: 7, height: 12, backgroundColor: "#1e293b", borderRadius: 3 }} />
    <View style={{ position: "absolute", top: 10, right: 0, width: 7, height: 12, backgroundColor: "#1e293b", borderRadius: 3 }} />
    <View style={{ position: "absolute", bottom: 10, right: 0, width: 7, height: 12, backgroundColor: "#1e293b", borderRadius: 3 }} />
  </View>
);

export default function WordRushGame({
  sr, speed, level, onBack,
}: {
  sr: SREngine;
  speed: SpeedMode;
  level: Level;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  // Gerçek oyun alanı yüksekliği — onLayout ile ölçülür
  const gvHRef = useRef(H - insets.top - 110 - insets.bottom); // başlangıç tahmini
  const [gvH, setGvH] = useState(gvHRef.current);
  const base = SPEEDS[speed].base, isAuto = speed === "auto";
  const bXA = useRef(new Animated.Value(W / 2)).current;
  const bXR = useRef(W / 2);
  const bYA = useRef(new Animated.Value(gvHRef.current * 0.84)).current;
  const bYR = useRef(gvHRef.current * 0.84);
  const spdR = useRef(base), strR = useRef(0), livesR = useRef(RUSH_LIVES);
  const rafR = useRef(0), ltR = useRef(0);
  const gRef = useRef<Gate[]>([]);
  const isOver = useRef(false);

  const [gates, setGates] = useState<Gate[]>([]);
  const [cw, setCw] = useState("");
  const [flashCw, setFlashCw] = useState(false);
  const flashTmR = useRef<any>(null);
  const wordAnim = useRef(new Animated.Value(1)).current;
  const [streak, setStreak] = useState(0);
  const [lives, setLives] = useState(RUSH_LIVES);
  const [learned, setLearned] = useState(sr.count());
  const [gameOver, setGameOver] = useState(false);
  const [wrongWord, setWrongWord] = useState<Word | null>(null);
  const toastTm = useRef<any>(null);
  const showWrong = (w: Word) => {
    if (toastTm.current) clearTimeout(toastTm.current);
    setWrongWord(w);
    toastTm.current = setTimeout(() => setWrongWord(null), 1200);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (e) => {
        if (isOver.current) return;
        const { left, right } = roadEdge(bYR.current, gameH);
        const x = Math.max(left + 24, Math.min(right - 24, e.nativeEvent.pageX));
        const rawYG = e.nativeEvent.pageY - (insets?.top ?? 0) - 80;
        const y = Math.max(H * HORIZ_Y + 40, Math.min(gvHRef.current * 0.9, rawYG));
        bXR.current = x; bXA.setValue(x);
        bYR.current = y; bYA.setValue(y);
      },
      onPanResponderMove: (e) => {
        if (isOver.current) return;
        const { left, right } = roadEdge(bYR.current, gameH);
        const x = Math.max(left + 24, Math.min(right - 24, e.nativeEvent.pageX));
        const rawY = e.nativeEvent.pageY - (insets?.top ?? 0) - 80;
        const y = Math.max(H * HORIZ_Y + 40, Math.min(gvHRef.current * 0.9, rawY));
        bXR.current = x; bXA.setValue(x);
        bYR.current = y; bYA.setValue(y);
      },
    }),
  ).current;

  const [rushRestartKey, setRushRestartKey] = useState(0);
  const [roadOffset, setRoadOffset] = useState(0);
  const roadOffsetRef = useRef(0);
  const [pausedRush, setPausedRush] = useState(false);
  const pausedRushRef = useRef(false);
  const togglePauseRush = () => {
    pausedRushRef.current = !pausedRushRef.current;
    setPausedRush((p) => !p);
  };

  useEffect(() => {
    isOver.current = false;
    const first = makeGate(sr);
    first.y = H * HORIZ_Y + 20;
    gRef.current = [first];
    setGates([first]);
    setCw(first.word.en);
    setTimeout(() => {
      Animated.sequence([
        Animated.timing(wordAnim, { toValue: 1.6, duration: 220, useNativeDriver: true }),
        Animated.spring(wordAnim, { toValue: 1, friction: 4, tension: 70, useNativeDriver: true }),
      ]).start();
    }, 200);

    ltR.current = performance.now();
    let frame = 0;
    const loop = (now: number) => {
      if (isOver.current) return;
      if (pausedRushRef.current) { ltR.current = now; rafR.current = requestAnimationFrame(loop); return; }
      const dt = Math.min((now - ltR.current) / 1000, 0.05);
      ltR.current = now;
      let list = gRef.current, changed = false;
      list = list.map((g) =>
        g.state !== "fall"
          ? { ...g, opacity: Math.max(0, g.opacity - dt * 3) }
          : { ...g, y: g.y + spdR.current * dt },
      );
      let added = false;
      list = list.map((gate) => {
        if (gate.state !== "fall") return gate;
        const carY = bYR.current, carX = bXR.current;
        const gateTop = gate.y - GATE_H * 0.5, gateBot = gate.y + GATE_H * 0.5;
        if (gateTop > carY + 20 || gateBot < carY - 20) return gate;
        const { left, right } = roadEdge(carY, gameH);
        const isLeft = carX < W / 2;
        const hit = isLeft === gate.cLeft;
        if (hit) {
          strR.current++;
          spdR.current = Math.min(spdR.current + (isAuto ? 2 : 3), base * 1.25);
          setStreak(strR.current);
          hap();
          playSoundOk();
          speakWord(gate.word.en);
        } else {
          strR.current = 0;
          spdR.current = Math.max(spdR.current - (isAuto ? 6 : 5), base * 0.75);
          setStreak(0);
          livesR.current = Math.max(0, livesR.current - 1);
          setLives(livesR.current);
          showWrong(gate.word);
          hapHeavy();
          playSoundError();
          if (livesR.current <= 0) {
            isOver.current = true;
            cancelAnimationFrame(rafR.current);
            setGameOver(true);
            return gate;
          }
        }
        sr.record(gate.word, hit);
        setLearned(sr.count());
        if (!added) {
          added = true;
          const nx = makeGate(sr);
          gRef.current = [...gRef.current, nx];
          setCw(nx.word.en);
          Animated.sequence([
            Animated.timing(wordAnim, { toValue: 1.45, duration: 160, useNativeDriver: true }),
            Animated.spring(wordAnim, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
          ]).start();
        }
        changed = true;
        return { ...gate, state: hit ? ("ok" as const) : ("bad" as const) };
      });
      list = list.filter((g) => g.y < gvHRef.current + 100 && g.opacity > 0.02);
      if (!list.find((g) => g.state === "fall") && !isOver.current) {
        const nx = makeGate(sr);
        list = [...list, nx];
        setCw(nx.word.en);
        changed = true;
      }
      roadOffsetRef.current = (roadOffsetRef.current + spdR.current * dt) % 60;
      if (frame % 3 === 0) setRoadOffset(roadOffsetRef.current);
      gRef.current = list;
      frame++;
      if (frame % 2 === 0 || changed) setGates([...list]);
      rafR.current = requestAnimationFrame(loop);
    };
    rafR.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafR.current);
      if (toastTm.current) clearTimeout(toastTm.current);
    };
  }, [sr, base, isAuto, rushRestartKey]);

  const restart = () => {
    cancelAnimationFrame(rafR.current);
    livesR.current = RUSH_LIVES; strR.current = 0; spdR.current = base;
    setLives(RUSH_LIVES); setStreak(0); setWrongWord(null);
    isOver.current = false;
    const first = makeGate(sr);
    first.y = H * HORIZ_Y + 20;
    gRef.current = [first]; setGates([first]); setCw(first.word.en);
    setGameOver(false);
    setRushRestartKey((k) => k + 1);
  };

  const sc =
    streak >= 10 ? "#f87171"
    : streak >= 5 ? "#fbbf24"
    : streak >= 2 ? "#34d399"
    : "#94a3b8";
  const sp = SPEEDS[speed];

  return (
    <View style={{ flex: 1, backgroundColor: "#1a1a2e", paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {pausedRush && <PauseOverlay onResume={togglePauseRush} onMenu={onBack} />}
      <StatusBar backgroundColor="#1a1a2e" barStyle="light-content" />

      {/* Header */}
      <View style={{ backgroundColor: "#1a1a2e", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, gap: 6 }}>
          <TouchableOpacity
            onPress={() => { if (isOver.current) { onBack(); return; } hap(); onBack(); }}
            style={{ paddingVertical: 8, paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 10 }}
          >
            <Text style={{ fontSize: 13, color: "#94a3b8", fontWeight: "700" }}>← Menü</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={togglePauseRush}
            style={{ paddingVertical: 8, paddingHorizontal: 10, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 10 }}
          >
            <Text style={{ fontSize: 15 }}>⏸️</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <View style={{ flexDirection: "row", gap: 2 }}>
            {Array.from({ length: RUSH_LIVES }).map((_, i) => (
              <Text key={i} style={{ fontSize: 15, opacity: i < lives ? 1 : 0.15 }}>❤️</Text>
            ))}
          </View>
          <Text style={{ fontSize: 12, fontWeight: "900", color: sc }}>{streak > 0 ? `🔥${streak}` : ""}</Text>
        </View>
        <SoundWarningBanner />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 14, paddingBottom: 12, paddingTop: 8, gap: 8 }}>
          <Animated.Text style={{ fontSize: 22, fontWeight: "900", color: "#fff", letterSpacing: 1, transform: [{ scale: wordAnim }], textShadowColor: "rgba(99,102,241,0.6)", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 }}>
            {cw}
          </Animated.Text>
          <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 50, backgroundColor: sp.color + "22", borderWidth: 1, borderColor: sp.color + "44" }}>
            <Text style={{ fontSize: 11, color: sp.color, fontWeight: "700" }}>{sp.label}</Text>
          </View>
          {level && (
            <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 50, backgroundColor: "rgba(99,102,241,0.15)", borderWidth: 1, borderColor: "rgba(99,102,241,0.3)" }}>
              <Text style={{ fontSize: 11, color: "#6366f1", fontWeight: "700" }}>📚 {level}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Road */}
      <View
        style={{ flex: 1, overflow: "hidden", position: "relative" }}
        onLayout={e => {
          const h = e.nativeEvent.layout.height;
          if (h > 50 && Math.abs(h - gvHRef.current) > 5) {
            gvHRef.current = h;
            setGvH(h);
            const newY = h * 0.84;
            bYA.setValue(newY);
            bYR.current = newY;
          }
        }}
        {...pan.panHandlers}
      >
        <View style={{ position: "absolute", inset: 0, backgroundColor: "#2d3748" }} />
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: gvH * HORIZ_Y, backgroundColor: "#1e2d3d", opacity: 0.6 }} />

        {/* Sarı kenar noktaları */}
        {Array.from({ length: 22 }).map((_, i) => {
          const spacing = 55;
          const rawY = H * HORIZ_Y + i * spacing + roadOffset - spacing;
          if (rawY < H * HORIZ_Y - 10 || rawY > gvH) return null;
          const t = Math.max(0, (rawY / gvH - HORIZ_Y) / (1 - HORIZ_Y));
          const { left, right } = roadEdge(rawY, gvH);
          const thick = Math.max(2, t * 6);
          const h = Math.max(3, t * 10);
          return (
            <React.Fragment key={i}>
              <View style={{ position: "absolute", top: rawY, left, width: thick, height: h, backgroundColor: "#f59e0b", opacity: 0.7 + t * 0.2, borderRadius: 1 }} />
              <View style={{ position: "absolute", top: rawY, left: right - thick, width: thick, height: h, backgroundColor: "#f59e0b", opacity: 0.7 + t * 0.2, borderRadius: 1 }} />
            </React.Fragment>
          );
        })}

        {/* Kesik orta çizgi */}
        {Array.from({ length: 22 }).map((_, i) => {
          const spacing = 60;
          const rawY = H * HORIZ_Y + i * spacing + roadOffset - spacing;
          if (rawY < H * HORIZ_Y || rawY > gvH) return null;
          const t = (rawY / gvH - HORIZ_Y) / (1 - HORIZ_Y);
          const h = Math.max(4, t * 28);
          return (
            <View key={i} style={{ position: "absolute", top: rawY, left: W / 2 - 2, width: Math.max(2, t * 5), height: h, borderRadius: 2, backgroundColor: `rgba(255,255,255,${0.15 + t * 0.15})` }} />
          );
        })}

        {/* Kapılar */}
        {gates.map((gate) => {
          const sc2 = gateScale(gate.y, gvH);
          const { left, width } = roadEdge(gate.y, gvH);
          const lG = gate.state === "ok" && gate.cLeft, rG = gate.state === "ok" && !gate.cLeft;
          const lR = gate.state === "bad" && gate.cLeft, rR = gate.state === "bad" && !gate.cLeft;
          const gw = width / 2 - GAP * sc2;
          const gh2 = GATE_H * sc2;
          return (
            <View key={gate.id} style={{ position: "absolute", top: gate.y - gh2 / 2, left, width, flexDirection: "row", gap: GAP * sc2, opacity: gate.opacity }}>
              <View style={{ width: gw, height: gh2, borderRadius: 10 * sc2, backgroundColor: lG ? "rgba(52,211,153,0.15)" : lR ? "rgba(239,68,68,0.15)" : "rgba(99,102,241,0.08)", borderWidth: lG || lR ? 2.5 * sc2 : 1.5 * sc2, borderColor: lG ? "#34d399" : lR ? "#f87171" : "#6366f1", alignItems: "center", justifyContent: "center" }}>
                {gate.leftLabel.includes("/") ? gate.leftLabel.split("/").map((p: string, pi: number) => (
                  <Text key={pi} style={{ color: lG ? "#34d399" : lR ? "#f87171" : "#f1f5f9", fontWeight: "900", fontSize: Math.max(8, 12 * sc2), textAlign: "center" }}>{p.trim()}</Text>
                )) : (
                  <Text style={{ color: lG ? "#34d399" : lR ? "#f87171" : "#f1f5f9", fontWeight: "900", fontSize: Math.max(9, 14 * sc2), letterSpacing: 0.5, textAlign: "center" }} numberOfLines={2} adjustsFontSizeToFit>{gate.leftLabel}</Text>
                )}
              </View>
              <View style={{ width: gw, height: gh2, borderRadius: 10 * sc2, backgroundColor: rG ? "rgba(52,211,153,0.15)" : rR ? "rgba(239,68,68,0.15)" : "rgba(99,102,241,0.08)", borderWidth: rG || rR ? 2.5 * sc2 : 1.5 * sc2, borderColor: rG ? "#34d399" : rR ? "#f87171" : "#6366f1", alignItems: "center", justifyContent: "center" }}>
                {gate.rightLabel.includes("/") ? gate.rightLabel.split("/").map((p: string, pi: number) => (
                  <Text key={pi} style={{ color: rG ? "#34d399" : rR ? "#f87171" : "#f1f5f9", fontWeight: "900", fontSize: Math.max(8, 12 * sc2), textAlign: "center" }}>{p.trim()}</Text>
                )) : (
                  <Text style={{ color: rG ? "#34d399" : rR ? "#f87171" : "#f1f5f9", fontWeight: "900", fontSize: Math.max(9, 14 * sc2), letterSpacing: 0.5, textAlign: "center" }} numberOfLines={2} adjustsFontSizeToFit>{gate.rightLabel}</Text>
                )}
              </View>
            </View>
          );
        })}

        {wrongWord && (
          <View style={{ position: "absolute", top: 10, alignSelf: "center", zIndex: 99, backgroundColor: "rgba(15,23,42,0.9)", borderRadius: 10, paddingVertical: 5, paddingHorizontal: 12, borderWidth: 1, borderColor: "rgba(248,113,113,0.4)" }}>
            <Text style={{ fontSize: 12, fontWeight: "800", color: "#f87171" }}>{wrongWord.en} = {wrongWord.tr}</Text>
          </View>
        )}

        <Animated.View style={{ position: "absolute", top: 0, left: 0, transform: [{ translateX: Animated.subtract(bXA, 24) }, { translateY: Animated.subtract(bYA, 36) }], width: 48, height: 72 }}>
          {TopDownCar}
        </Animated.View>

        <Text style={{ position: "absolute", bottom: 14, alignSelf: "center", color: "rgba(255,255,255,0.12)", fontSize: 11, letterSpacing: 2 }}>
          parmağını sürükle
        </Text>
      </View>

      {gameOver && (
        <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.92)", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <Text style={{ fontSize: 52, marginBottom: 10 }}>🏎️</Text>
          <Text style={{ fontSize: 26, fontWeight: "900", color: "#fff", marginBottom: 4 }}>Oyun Bitti!</Text>
          <Text style={{ fontSize: 13, color: "#34d399", marginBottom: 24 }}>Öğrenilen: 📚{learned}</Text>
          <TouchableOpacity onPress={restart} style={{ backgroundColor: "#3b82f6", paddingVertical: 14, paddingHorizontal: 44, borderRadius: 50 }}>
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16, letterSpacing: 1 }}>Tekrar Oyna</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
