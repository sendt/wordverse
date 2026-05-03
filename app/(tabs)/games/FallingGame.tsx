import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hap, hapHeavy, playSoundError, playSoundOk, speakWord } from "../../../lib/audio";
import { SpeedMode, SPEEDS } from "../../../lib/constants";
import { W } from "../../../lib/dimensions";
import { SREngine } from "../../../lib/sr-engine";
import type { Level, Word } from "../../../words";
import { GameHeader, PauseOverlay, SoundWarningBanner } from "../components/GameHeader";

const FALL_LIVES = 3;

const MOTIV = [
  "Süper! 🔥", "Aferin! ✨", "Harika! 🎯", "Mükemmel! 💫",
  "Devam et! 🚀", "Oo! 👏", "Ooo! 🌟", "İnanılmaz! ⚡", "Çok iyi! 🎉",
];

export default function FallingGame({
  sr, speed, level, onBack,
}: {
  sr: SREngine;
  speed: SpeedMode;
  level: Level;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const pool = sr.getPool();
  const mkQ = () => {
    const w = sr.next();
    const wr = [...pool].sort(() => Math.random() - 0.5).filter((x) => x.tr !== w.tr).slice(0, 3);
    return { word: w, opts: [w.tr, ...wr.map((x) => x.tr)].sort(() => Math.random() - 0.5), pct: 0 };
  };
  const [q, setQ] = useState(mkQ);
  const [streak, setStreak] = useState(0);
  const [learned, setLearned] = useState(sr.count());
  const [done, setDone] = useState(false);
  const [wrongPopup, setWrongPopup] = useState<Word | null>(null);
  const [correctMsg, setCorrectMsg] = useState<string | null>(null);
  const [greenFlash, setGreenFlash] = useState(false);
  const [lives, setLives] = useState(FALL_LIVES);
  const livesRef = useRef(FALL_LIVES);
  const [gameOver, setGameOver] = useState(false);
  const [fallRestartKey, setFallRestartKey] = useState(0);
  const fallSpeed = SPEEDS[speed].base / 5.5;
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const rafR = useRef(0), ltR = useRef(performance.now()), fallR = useRef(0),
    spdR = useRef(fallSpeed), hintTm = useRef<any>(null), greenTm = useRef<any>(null);

  const showWrongPopup = (w: Word) => {
    if (hintTm.current) clearTimeout(hintTm.current);
    setWrongPopup(w);
    hintTm.current = setTimeout(() => setWrongPopup(null), 1600);
  };
  const showCorrect = (s: number) => {
    setCorrectMsg(MOTIV[Math.min(s, MOTIV.length - 1)]);
    setGreenFlash(true);
    if (greenTm.current) clearTimeout(greenTm.current);
    greenTm.current = setTimeout(() => { setCorrectMsg(null); setGreenFlash(false); }, 700);
  };
  const nextQ = useCallback(() => {
    fallR.current = 0; ltR.current = performance.now(); setQ(mkQ()); setDone(false);
  }, []);

  useEffect(() => {
    cancelAnimationFrame(rafR.current);
    const tick = (now: number) => {
      if (pausedRef.current) { ltR.current = now; rafR.current = requestAnimationFrame(tick); return; }
      const dt = Math.min((now - ltR.current) / 1000, 0.05);
      ltR.current = now;
      fallR.current = Math.min(fallR.current + spdR.current * dt, 100);
      setQ((q) => ({ ...q, pct: fallR.current }));
      if (fallR.current >= 100) {
        sr.record(q.word, false);
        showWrongPopup(q.word);
        setStreak(0);
        livesRef.current = Math.max(0, livesRef.current - 1);
        setLives(livesRef.current);
        if (livesRef.current <= 0) { setGameOver(true); return; }
        setTimeout(nextQ, 800);
      } else rafR.current = requestAnimationFrame(tick);
    };
    rafR.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafR.current);
  }, [q.word, nextQ, fallRestartKey]);

  const answer = (opt: string) => {
    if (done) return;
    cancelAnimationFrame(rafR.current);
    setDone(true);
    const ok = opt === q.word.tr;
    sr.record(q.word, ok);
    setLearned(sr.count());
    if (ok) {
      const ns = streak + 1;
      setStreak(ns);
      showCorrect(ns - 1);
      hap(Haptics.ImpactFeedbackStyle.Light);
      playSoundOk();
      speakWord(q.word.en);
    } else {
      showWrongPopup(q.word);
      setStreak(0);
      livesRef.current = Math.max(0, livesRef.current - 1);
      setLives(livesRef.current);
      playSoundError();
      hapHeavy();
      if (livesRef.current <= 0) { setGameOver(true); return; }
    }
    setTimeout(nextQ, ok ? 700 : 800);
  };

  const danger = q.pct > 70;
  const togglePause = () => { pausedRef.current = !pausedRef.current; setPaused((p) => !p); };

  return (
    <View style={{ flex: 1, backgroundColor: greenFlash ? "#f0fdf4" : danger ? "#fff1f2" : "#f0f9ff", paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <StatusBar backgroundColor="#f0f4ff" barStyle="dark-content" />
      <GameHeader title="🪂 Kurtar!" streak={streak} learned={learned} onBack={onBack} level={level} speed={SPEEDS[speed].label} onPause={togglePause} />
      <SoundWarningBanner />
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 4, paddingVertical: 6, backgroundColor: "#fff" }}>
        {Array.from({ length: FALL_LIVES }).map((_, i) => (
          <Text key={i} style={{ fontSize: 16, opacity: i < lives ? 1 : 0.15 }}>❤️</Text>
        ))}
      </View>
      {paused && <PauseOverlay onResume={togglePause} onMenu={onBack} />}

      <View style={{ flex: 1, padding: 14 }}>
        {/* Düşüş alanı */}
        <View style={{ flex: 1, borderRadius: 20, marginBottom: 12, overflow: "hidden", backgroundColor: danger ? "#fff1f2" : "#f0f9ff", borderWidth: 1.5, borderColor: danger ? "rgba(239,68,68,0.3)" : "rgba(186,230,253,0.5)", position: "relative" }}>
          <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 28, backgroundColor: danger ? "rgba(239,68,68,0.12)" : "rgba(148,163,184,0.08)", borderTopWidth: 2, borderTopColor: danger ? "rgba(239,68,68,0.3)" : "rgba(148,163,184,0.2)", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 14 }}>{""}</Text>
          </View>
          <View style={{ position: "absolute", bottom: 28, left: 0, right: 0, height: 3 }}>
            <View style={{ height: "100%", width: `${q.pct}%`, backgroundColor: danger ? "#ef4444" : q.pct > 45 ? "#f59e0b" : "#3b82f6", borderRadius: 3 }} />
          </View>
          <View style={{ position: "absolute", alignSelf: "center", top: `${Math.min(q.pct * 0.76, 72)}%` as any, alignItems: "center" }}>
            <Text style={{ fontSize: danger ? 30 : 26, marginBottom: 4 }}>{"🪂"}</Text>
            <View style={{ backgroundColor: danger ? "rgba(239,68,68,0.1)" : "rgba(59,130,246,0.08)", borderRadius: 14, paddingVertical: 8, paddingHorizontal: 16, borderWidth: danger ? 2 : 1.5, borderColor: danger ? "rgba(239,68,68,0.4)" : "rgba(59,130,246,0.2)" }}>
              <Text style={{ fontSize: 28, fontWeight: "900", color: danger ? "#ef4444" : "#1e293b", letterSpacing: 2, textAlign: "center" }}>{q.word.en}</Text>
            </View>
          </View>
          <Text style={{ position: "absolute", top: 10, alignSelf: "center", fontSize: 9, color: danger ? "rgba(239,68,68,0.5)" : "rgba(148,163,184,0.5)", letterSpacing: 3, textTransform: "uppercase", fontWeight: "700" }}>
            {danger ? "HIZLA KURTAR! ⚡" : "Türkçesini seç"}
          </Text>
        </View>

        {/* Cevap butonları */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {q.opts.map((opt, i) => (
            <TouchableOpacity
              key={`${opt}-${i}`}
              onPress={() => answer(opt)}
              style={{ width: (W - 52) / 2, paddingVertical: 20, borderRadius: 16, backgroundColor: "#ffffff", borderWidth: 1.5, borderColor: "rgba(148,163,184,0.28)", alignItems: "center", shadowColor: "#94a3b8", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 }}
            >
              <Text style={{ color: "#334155", fontWeight: "800", fontSize: 16 }}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {gameOver && (
        <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.9)", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <Text style={{ fontSize: 52, marginBottom: 10 }}>🪂</Text>
          <Text style={{ fontSize: 26, fontWeight: "900", color: "#fff", marginBottom: 4 }}>Yere Çakıldı!</Text>
          <Text style={{ fontSize: 13, color: "#34d399", marginBottom: 24 }}>Öğrenilen: 📚{learned}</Text>
          <TouchableOpacity
            onPress={() => { livesRef.current = FALL_LIVES; setLives(FALL_LIVES); setGameOver(false); setStreak(0); fallR.current = 0; setFallRestartKey((k) => k + 1); }}
            style={{ backgroundColor: "#3b82f6", paddingVertical: 14, paddingHorizontal: 44, borderRadius: 50 }}
          >
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>Tekrar Oyna</Text>
          </TouchableOpacity>
        </View>
      )}

      {correctMsg && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 98, alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <Text style={{ fontSize: 42, fontWeight: "900", color: "#16a34a", textShadowColor: "rgba(34,197,94,0.3)", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 16 }}>{correctMsg}</Text>
        </View>
      )}

      {wrongPopup && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 99, alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <View style={{ backgroundColor: "rgba(254,242,242,0.98)", borderRadius: 20, paddingVertical: 28, paddingHorizontal: 36, borderWidth: 2, borderColor: "rgba(239,68,68,0.35)", shadowColor: "#ef4444", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 24, alignItems: "center", maxWidth: 280 }}>
            <Text style={{ fontSize: 13, color: "#94a3b8", letterSpacing: 2, textTransform: "uppercase", fontWeight: "700", marginBottom: 8 }}>Doğru Cevap</Text>
            <Text style={{ fontSize: 32, fontWeight: "900", color: "#ef4444", letterSpacing: 2, marginBottom: 4 }}>{wrongPopup.en}</Text>
            <View style={{ width: 40, height: 2, backgroundColor: "rgba(239,68,68,0.3)", marginBottom: 8 }} />
            <Text style={{ fontSize: 22, fontWeight: "800", color: "#1e293b" }}>{wrongPopup.tr}</Text>
          </View>
        </View>
      )}
    </View>
  );
}
