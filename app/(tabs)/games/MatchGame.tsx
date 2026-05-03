import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hap, hapHeavy, hapSel, playSoundError, playSoundOk, speakWord } from "../../../lib/audio";
import { SpeedMode } from "../../../lib/constants";
import { SREngine } from "../../../lib/sr-engine";
import type { Level, Word } from "../../../words";
import { PauseOverlay, SoundWarningBanner } from "../components/GameHeader";

const MATCH_TIME = 45;

export default function MatchGame({
  sr, speed, level, onBack,
}: {
  sr: SREngine;
  speed: SpeedMode;
  level: Level;
  onBack: () => void;
}) {
  const [pausedMatch, setPausedMatch] = useState(false);
  const togglePauseMatch = () => setPausedMatch((p) => !p);
  const insets = useSafeAreaInsets();
  const [pairCount, setPairCount] = useState(2);
  const pairCountRef = useRef<number>(2);
  const mkR = (n: number) => {
    const ws = sr.getUnique(n);
    return { ws, right: [...ws].sort(() => Math.random() - 0.5) };
  };
  const [round, setRound] = useState(() => mkR(2));
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [selEn, setSelEn] = useState<string | null>(null);
  const [selTr, setSelTr] = useState<string | null>(null);
  const [wrongEn, setWrongEn] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [lives, setLives] = useState(4);
  const [gameOver, setGameOver] = useState(false);
  const livesRef = useRef(4);
  const [learned, setLearned] = useState(sr.count());
  const [wrongHint, setWrongHint] = useState<Word | null>(null);
  const hintTm = useRef<any>(null);
  const showWrongHint = (w: Word) => {
    if (hintTm.current) clearTimeout(hintTm.current);
    setWrongHint(w);
    hintTm.current = setTimeout(() => setWrongHint(null), 1400);
  };
  const [matchTime, setMatchTime] = useState(MATCH_TIME);
  const matchTimeRef = useRef(MATCH_TIME);
  const matchTimerRef = useRef<any>(null);
  const startMatchTimer = () => {
    matchTimeRef.current = MATCH_TIME;
    setMatchTime(MATCH_TIME);
    if (matchTimerRef.current) clearInterval(matchTimerRef.current);
    matchTimerRef.current = setInterval(() => {
      if (pausedMatch) return;
      matchTimeRef.current--;
      setMatchTime(matchTimeRef.current);
      if (matchTimeRef.current <= 0) { clearInterval(matchTimerRef.current); setGameOver(true); }
    }, 1000);
  };
  useEffect(() => { startMatchTimer(); return () => clearInterval(matchTimerRef.current); }, []);

  useEffect(() => {
    if (!selEn || !selTr) return;
    if (selEn === selTr) {
      const nm = new Set([...matched, selEn]);
      setMatched(nm);
      const w = round.ws.find((x) => x.en === selEn)!;
      sr.record(w, true);
      setStreak((s) => s + 1);
      setLearned(sr.count());
      hap(Haptics.ImpactFeedbackStyle.Light);
      playSoundOk();
      speakWord(w.en);
      setSelEn(null);
      setSelTr(null);
      if (nm.size === round.ws.length) {
        setTimeout(() => {
          const next = Math.min(pairCountRef.current + 1, 10);
          pairCountRef.current = next;
          setPairCount(next);
          setRound(mkR(next));
          setMatched(new Set());
          setSelEn(null);
          setSelTr(null);
          matchTimeRef.current = MATCH_TIME;
          setMatchTime(MATCH_TIME);
        }, 400);
      }
    } else {
      const wrongWord = round.ws.find((x) => x.en === selEn) || round.right.find((x) => x.en === selTr);
      setWrongEn(selEn);
      livesRef.current = Math.max(0, livesRef.current - 1);
      setLives(livesRef.current);
      if (wrongWord) showWrongHint(wrongWord);
      hapHeavy();
      playSoundError();
      if (livesRef.current <= 0) setTimeout(() => setGameOver(true), 400);
      setTimeout(() => { setWrongEn(null); setSelEn(null); setSelTr(null); }, 450);
    }
  }, [selEn, selTr]);

  const tapEn = (en: string) => { if (matched.has(en)) return; setSelEn(en); };
  const tapTr = (en: string) => { if (matched.has(en)) return; setSelTr(en); };

  return (
    <View style={{ flex: 1, backgroundColor: "#f0f4ff", paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <StatusBar backgroundColor="#f0f4ff" barStyle="dark-content" />
      {pausedMatch && <PauseOverlay onResume={togglePauseMatch} onMenu={onBack} />}
      <SoundWarningBanner />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(148,163,184,0.15)" }}>
        <TouchableOpacity onPress={() => { hapSel(); onBack(); }} style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "rgba(148,163,184,0.25)" }}>
          <Text style={{ fontSize: 12, color: "#94a3b8", fontWeight: "700" }}>← Menü</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={togglePauseMatch} style={{ paddingVertical: 6, paddingHorizontal: 8, backgroundColor: "rgba(148,163,184,0.1)", borderRadius: 10, marginLeft: 4 }}>
          <Text style={{ fontSize: 14 }}>⏸️</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center", gap: 2 }}>
          <Text style={{ fontSize: 16, fontWeight: "900", color: "#1e1b4b" }}>🔗 Eşleştir</Text>
          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 50, backgroundColor: "rgba(52,211,153,0.12)", borderWidth: 1, borderColor: "rgba(52,211,153,0.3)" }}>
            <Text style={{ fontSize: 9, color: "#34d399", fontWeight: "700", letterSpacing: 1 }}>SEVİYE {pairCount}/10 · {level}</Text>
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: matchTime <= 10 ? "rgba(239,68,68,0.1)" : "rgba(148,163,184,0.08)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 50 }}>
            <Text style={{ fontSize: 16 }}>{matchTime <= 10 ? "💥" : "⏱️"}</Text>
            <Text style={{ fontSize: 15, fontWeight: "900", color: matchTime <= 10 ? "#ef4444" : matchTime <= 20 ? "#f97316" : "#64748b" }}>{matchTime}s</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 2 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Text key={i} style={{ fontSize: 14, opacity: i < lives ? 1 : 0.15 }}>❤️</Text>
            ))}
          </View>
        </View>
      </View>

      {wrongHint && (
        <View style={{ marginHorizontal: 14, marginTop: 8, backgroundColor: "rgba(254,242,242,0.97)", borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: "rgba(248,113,113,0.3)" }}>
          <Text style={{ fontSize: 12, fontWeight: "800", color: "#ef4444" }}>{wrongHint?.en} = {wrongHint?.tr}</Text>
        </View>
      )}

      <View style={{ flex: 1, padding: 14, justifyContent: "center" }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, gap: 8 }}>
            {round.ws.map((w) => {
              const isM = matched.has(w.en), isS = selEn === w.en, isW = wrongEn === w.en;
              return (
                <TouchableOpacity key={`en-${w.en}`} onPress={() => tapEn(w.en)} disabled={isM}
                  style={{ padding: 14, borderRadius: 14, minHeight: 52, justifyContent: "center", backgroundColor: isM ? "rgba(148,163,184,0.06)" : isS ? "rgba(59,130,246,0.1)" : isW ? "rgba(248,113,113,0.08)" : "#ffffff", borderWidth: 1.5, borderColor: isM ? "rgba(148,163,184,0.08)" : isS ? "rgba(96,165,250,.6)" : isW ? "rgba(248,113,113,.5)" : "rgba(148,163,184,0.3)", alignItems: "center" }}
                >
                  <Text style={{ fontWeight: "800", fontSize: 14, color: isM ? "rgba(148,163,184,0.25)" : isS ? "#3b82f6" : isW ? "#ef4444" : "#1e293b", textDecorationLine: isM ? "line-through" : "none" }}>{w.en}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            {round.right.map((item) => {
              const isM = matched.has(item.en), isS = selTr === item.en;
              return (
                <TouchableOpacity key={`tr-${item.en}`} onPress={() => tapTr(item.en)} disabled={isM}
                  style={{ padding: 14, borderRadius: 14, minHeight: 52, justifyContent: "center", backgroundColor: isM ? "rgba(148,163,184,0.06)" : isS ? "rgba(251,191,36,.12)" : "#ffffff", borderWidth: 1.5, borderColor: isM ? "rgba(148,163,184,0.08)" : isS ? "rgba(251,191,36,.6)" : "rgba(251,191,36,.25)", alignItems: "center" }}
                >
                  <Text style={{ fontWeight: "800", fontSize: 14, color: isM ? "rgba(148,163,184,0.25)" : isS ? "#d97706" : "#92400e", textDecorationLine: isM ? "line-through" : "none" }}>{item.tr}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      {gameOver && (
        <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.88)", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <Text style={{ fontSize: 52, marginBottom: 10 }}>💔</Text>
          <Text style={{ fontSize: 26, fontWeight: "900", color: "#fff", marginBottom: 4 }}>Oyun Bitti!</Text>
          <Text style={{ fontSize: 13, color: "#34d399", marginBottom: 24 }}>Öğrenilen: 📚{learned}</Text>
          <TouchableOpacity
            onPress={() => { setGameOver(false); livesRef.current = 4; setLives(4); setStreak(0); pairCountRef.current = 2; setPairCount(2); setRound(mkR(2)); setMatched(new Set()); setSelEn(null); setSelTr(null); matchTimeRef.current = MATCH_TIME; setMatchTime(MATCH_TIME); }}
            style={{ backgroundColor: "#3b82f6", paddingVertical: 14, paddingHorizontal: 44, borderRadius: 50 }}
          >
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16, letterSpacing: 1 }}>Tekrar Oyna</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
