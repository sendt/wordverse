import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hap, hapHeavy, hapSel, playSoundOk, speakWord } from "../../../lib/audio";
import { W } from "../../../lib/dimensions";
import { SREngine } from "../../../lib/sr-engine";
import type { Level, Word } from "../../../words";
import { PauseOverlay, SoundWarningBanner } from "../components/GameHeader";
import { GameTutorialOverlay } from "../components/GameTutorialOverlay";

const BOMB_SEC = 60;

function BombExplosion({ onDone }: { onDone: () => void }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.8, duration: 300, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 0.5, duration: 200, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1.4, duration: 200, useNativeDriver: true }),
    ]).start();
    hapHeavy();
    const t = setTimeout(() => onDone(), 2200);
    return () => clearTimeout(t);
  }, []);
  return (
    <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.93)", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <Animated.Text style={{ fontSize: 70, transform: [{ scale: scaleAnim }] }}>💣</Animated.Text>
      <Text style={{ fontSize: 26, fontWeight: "900", color: "#fff", marginTop: 16 }}>BOOM!</Text>
      <Text style={{ fontSize: 14, color: "#94a3b8", marginTop: 6 }}>Yeni oyun başlıyor...</Text>
    </View>
  );
}

export default function PairsGame({
  sr, level, onBack,
}: {
  sr: SREngine;
  level: Level;
  onBack: () => void;
}) {
  const [pausedPairs, setPausedPairs] = useState(false);
  const togglePausePairs = () => setPausedPairs((p) => !p);
  const insets = useSafeAreaInsets();

  const mkDeck = useCallback(() => {
    const words = sr.getUnique(6);
    const cards = [
      ...words.map((w, i) => ({ id: i * 2, word: w, side: "en" as const, flipped: false, matched: false, shake: false })),
      ...words.map((w, i) => ({ id: i * 2 + 1, word: w, side: "tr" as const, flipped: false, matched: false, shake: false })),
    ].sort(() => Math.random() - 0.5);
    return cards;
  }, [sr]);

  type PCard = { id: number; word: Word; side: "en" | "tr"; flipped: boolean; matched: boolean; shake: boolean };
  const [deck, setDeck] = useState<PCard[]>(mkDeck);
  const firstRef = useRef<PCard | null>(null);
  const lockedRef = useRef(false);
  const [moves, setMoves] = useState(0);
  const [matchedN, setMatchedN] = useState(0);
  const [streak, setStreak] = useState(0);
  const [learned, setLearned] = useState(sr.count());
  const [elapsed, setElapsed] = useState(0);
  const [won, setWon] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const timerRef = useRef<any>(null);
  const startRef = useRef(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    setElapsed(0);
    setTimeUp(false);
    timerRef.current = setInterval(() => {
      const e = Math.floor((Date.now() - startRef.current) / 1000);
      setElapsed(e);
      if (e >= BOMB_SEC) { clearInterval(timerRef.current); setTimeUp(true); }
    }, 500);
    return () => clearInterval(timerRef.current);
  }, []);

  const tap = (card: PCard) => {
    if (lockedRef.current || card.flipped || card.matched) return;
    const prev = firstRef.current;
    setDeck((d) => d.map((c) => (c.id === card.id ? { ...c, flipped: true } : c)));
    if (!prev) { firstRef.current = card; return; }
    firstRef.current = null;
    lockedRef.current = true;
    setMoves((m) => m + 1);
    const isMatch = prev.word.en === card.word.en;
    if (isMatch) {
      setStreak((s) => s + 1);
      sr.record(card.word, true);
      setLearned(sr.count());
      hap(Haptics.ImpactFeedbackStyle.Medium);
      playSoundOk();
      speakWord(card.word.en);
      setDeck((d) => d.map((c) => c.word.en === card.word.en ? { ...c, matched: true, flipped: true } : c));
      const nm = matchedN + 1;
      setMatchedN(nm);
      if (nm === 6) { clearInterval(timerRef.current); setWon(true); }
      lockedRef.current = false;
    } else {
      setStreak(0);
      setDeck((d) => d.map((c) => c.id === card.id || c.id === prev.id ? { ...c, shake: true } : c));
      setTimeout(() => {
        setDeck((d) => d.map((c) => !c.matched && (c.id === card.id || c.id === prev.id) ? { ...c, flipped: false, shake: false } : c));
        lockedRef.current = false;
      }, 700);
    }
  };

  const newGame = () => {
    setDeck(mkDeck()); firstRef.current = null; lockedRef.current = false;
    setMoves(0); setMatchedN(0); setStreak(0); setWon(false); setTimeUp(false);
    startRef.current = Date.now(); setElapsed(0);
  };

  const COLS = 3;
  const CARD_W = Math.floor((W - 48) / COLS);
  const CARD_H = CARD_W * 0.72;
  const sc = streak >= 4 ? "#f87171" : streak >= 2 ? "#fbbf24" : streak >= 1 ? "#34d399" : "#94a3b8";
  const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const secs = String(elapsed % 60).padStart(2, "0");

  return (
    <View style={{ flex: 1, backgroundColor: "#f8faff", paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <StatusBar backgroundColor="#f8faff" barStyle="dark-content" />
      <SoundWarningBanner />

      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 16, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "rgba(148,163,184,0.15)" }}>
        <TouchableOpacity onPress={() => { hapSel(); onBack(); }} style={{ paddingVertical: 9, paddingHorizontal: 14, backgroundColor: "#f1f5f9", borderRadius: 12, borderWidth: 1.5, borderColor: "rgba(148,163,184,0.3)" }}>
          <Text style={{ fontSize: 14, color: "#64748b", fontWeight: "800" }}>← Menü</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={togglePausePairs} style={{ paddingVertical: 6, paddingHorizontal: 8, backgroundColor: "rgba(148,163,184,0.1)", borderRadius: 10, marginLeft: 4 }}>
          <Text style={{ fontSize: 14 }}>⏸️</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 20, fontWeight: "900", color: "#1e1b4b" }}>🃏 Pairs</Text>
        <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 50, backgroundColor: "rgba(251,191,36,0.12)", borderWidth: 1, borderColor: "rgba(251,191,36,0.3)", alignSelf: "center", marginTop: 2 }}>
          <Text style={{ fontSize: 9, color: "#f59e0b", fontWeight: "700" }}>📚 {level}</Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 2, minWidth: 72 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={{ fontSize: 16 }}>{BOMB_SEC - elapsed <= 5 ? "💥" : BOMB_SEC - elapsed <= 20 ? "🔴" : "💣"}</Text>
            <Text style={{ fontSize: 15, fontWeight: "900", color: BOMB_SEC - elapsed <= 10 ? "#ef4444" : BOMB_SEC - elapsed <= 20 ? "#f97316" : "#475569" }}>{Math.max(0, BOMB_SEC - elapsed)}s</Text>
          </View>
          <View style={{ width: 60, height: 5, backgroundColor: "rgba(148,163,184,0.2)", borderRadius: 3, overflow: "hidden" }}>
            <View style={{ height: "100%", width: `${Math.max(0, (BOMB_SEC - elapsed) / BOMB_SEC) * 100}%`, backgroundColor: BOMB_SEC - elapsed <= 10 ? "#ef4444" : BOMB_SEC - elapsed <= 20 ? "#f97316" : "#22c55e", borderRadius: 3 }} />
          </View>
          <Text style={{ fontSize: 10, color: sc, fontWeight: "700" }}>{streak > 0 ? `🔥${streak}` : ""} {moves}h</Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "rgba(148,163,184,0.08)" }}>
        <View style={{ height: 7, backgroundColor: "#f1f5f9", borderRadius: 4 }}>
          <View style={{ height: "100%", width: `${(matchedN / 6) * 100}%`, backgroundColor: "#22c55e", borderRadius: 4 }} />
        </View>
        <Text style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, textAlign: "center" }}>{matchedN} / 6 eşleşti</Text>
      </View>

      <View style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: "center", padding: 12 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
            {deck.map((card) => {
              const isFlipped = card.flipped || card.matched;
              const isFirst = firstRef.current?.id === card.id;
              const label = card.side === "en" ? card.word.en : card.word.tr;
              const isEn = card.side === "en";
              return (
                <TouchableOpacity
                  key={card.id}
                  onPress={() => tap(card)}
                  activeOpacity={0.7}
                  style={{
                    width: CARD_W, height: CARD_H, borderRadius: 16,
                    backgroundColor: card.matched ? "#f0fdf4" : isFlipped ? isEn ? "#eff6ff" : "#fefce8" : "#fff",
                    borderWidth: 2,
                    borderColor: card.matched ? "#86efac" : isFirst ? "#3b82f6" : isFlipped ? isEn ? "#93c5fd" : "#fde047" : "rgba(148,163,184,0.3)",
                    alignItems: "center", justifyContent: "center",
                    shadowColor: isFirst ? "#3b82f6" : card.matched ? "#22c55e" : "#94a3b8",
                    shadowOffset: { width: 0, height: isFirst ? 4 : 2 },
                    shadowOpacity: isFirst ? 0.4 : 0.1, shadowRadius: isFirst ? 12 : 4,
                    elevation: isFirst ? 8 : 2,
                    transform: [{ scale: card.shake ? 0.93 : isFirst ? 1.04 : 1 }],
                  }}
                >
                  {isFlipped ? (
                    <>
                      <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginBottom: 4, backgroundColor: isEn ? "rgba(59,130,246,0.1)" : "rgba(250,204,21,0.15)" }}>
                        <Text style={{ fontSize: 9, fontWeight: "800", color: isEn ? "#3b82f6" : "#d97706", letterSpacing: 1 }}>{isEn ? "EN" : "TR"}</Text>
                      </View>
                      <Text style={{ fontSize: card.matched ? 12 : 13, fontWeight: "900", color: card.matched ? "#16a34a" : isEn ? "#1d4ed8" : "#92400e", textAlign: "center", paddingHorizontal: 4 }} numberOfLines={2}>{label}</Text>
                    </>
                  ) : (
                    <Text style={{ fontSize: 28, color: "rgba(148,163,184,0.4)" }}>?</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      {pausedPairs && <PauseOverlay onResume={togglePausePairs} onMenu={onBack} />}
      <GameTutorialOverlay
        gameId="pairs"
        title="🃏 Hafıza Kartları"
        icon="🃏"
        steps={[
          "Kartları çevir, eşleri bul",
          "EN ve TR kartlarını eşleştir",
          "60 saniyede bitir — patlama olmasın!",
        ]}
      />
      {timeUp && !won && <BombExplosion onDone={newGame} />}

      {won && (
        <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.88)", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <Text style={{ fontSize: 52, marginBottom: 12 }}>🎉</Text>
          <Text style={{ fontSize: 26, fontWeight: "900", color: "#fff", marginBottom: 6 }}>Tebrikler!</Text>
          <Text style={{ fontSize: 14, color: "#94a3b8", marginBottom: 4 }}>{moves} hamlede tamamladın</Text>
          <Text style={{ fontSize: 14, color: "#94a3b8", marginBottom: 24 }}>Süre: {mins}:{secs}</Text>
          <TouchableOpacity onPress={newGame} style={{ backgroundColor: "#3b82f6", paddingVertical: 14, paddingHorizontal: 44, borderRadius: 50 }}>
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>Tekrar Oyna</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
