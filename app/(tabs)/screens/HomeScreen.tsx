import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { Image, ScrollView, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hap, hapSel, playMenuTick } from "../../../lib/audio";
import { GAMES_META, GOALS, LEVELS, SPEEDS, SpeedMode, GameId } from "../../../lib/constants";
import { W } from "../../../lib/dimensions";
import { SREngine } from "../../../lib/sr-engine";
import { showToast } from "../components/ToastHost";
import { Screen } from "../components/GameHeader";
import type { Goal, Level } from "../../../words";

export default function HomeScreen({
  goal,
  level,
  sr,
  onPlay,
  onBack,
  onGoal,
  onSets,
  onShowLearned,
  speed,
  onSpeedChange,
  activeSetName,
}: {
  goal: Goal;
  level: Level;
  sr: SREngine;
  onPlay: (id: GameId, sp: SpeedMode) => void;
  onBack: () => void;
  onSets?: () => void;
  onGoal: () => void;
  onShowLearned: () => void;
  speed: SpeedMode;
  onSpeedChange: (s: SpeedMode) => void;
  activeSetName?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const gm = GOALS.find((g) => g.id === goal)!;
  const lm = LEVELS.find((l) => l.id === level)!;
  // Bot widget computed values
  const _mem = sr.getMem();
  const _total = sr.getPool().length;
  const _learned = sr.count(); // toplam görülen kelime sayısı
  const _due = Object.values(_mem).filter(
    (m: any) => m.correct > 0 && m.correct < 2,
  ).length;
  const _pct = _total > 0 ? Math.round((_learned / _total) * 100) : 0;
  const _botMsg =
    _learned === 0
      ? "Henüz kelime öğrenilmedi. Hadi oynamaya başla! 🚀"
      : _learned < 10
        ? `${_learned} kelime öğrenildi, harika gidiyorsun! 💪`
        : _learned < 50
          ? `${_learned} kelime öğrenildi!${_due > 0 ? ` ${_due} tanesi tekrar bekliyor.` : ""} 🔥`
          : `${_learned} kelime — %${_pct} tamamlandı. ${_due > 0 ? `${_due} tanesi tekrar istiyor.` : "Hepsi güçlü!"} 🏆`;
  return (
    <View style={{ flex: 1, backgroundColor: "#f0f4ff" }}>
      <StatusBar backgroundColor="#f0f4ff" barStyle="dark-content" />

      <ScrollView
        contentContainerStyle={{
          padding: 14,
          paddingTop: insets.top + 12,
          paddingBottom: Math.max(36, insets.bottom + 20),
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <View>
            <Text
              style={{
                fontSize: 20,
                fontWeight: "900",
                color: "#1e1b4b",
                letterSpacing: 2,
              }}
            >
              WORDVERSE
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginTop: 4,
              }}
            >
              <TouchableOpacity
                onPress={onGoal}
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 50,
                  backgroundColor: gm.bg,
                  borderWidth: 1,
                  borderColor: gm.color + "44",
                }}
              >
                <Text
                  style={{ fontSize: 11, color: gm.color, fontWeight: "700" }}
                >
                  {gm.icon} {gm.title}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => (activeSetName && onSets ? onSets() : onBack())}
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 50,
                  backgroundColor: activeSetName
                    ? "rgba(99,102,241,0.12)"
                    : lm.color + "14",
                  borderWidth: 1,
                  borderColor: activeSetName
                    ? "rgba(99,102,241,0.4)"
                    : lm.color + "44",
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    color: activeSetName ? "#6366f1" : lm.color,
                    fontWeight: "700",
                  }}
                >
                  {activeSetName ? activeSetName : lm.label}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <TouchableOpacity
              onPress={() => onShowLearned()}
              style={{
                backgroundColor: "rgba(251,191,36,.12)",
                borderWidth: 1,
                borderColor: "rgba(251,191,36,.15)",
                borderRadius: 50,
                paddingVertical: 6,
                paddingHorizontal: 14,
              }}
            >
              <Text
                style={{ fontSize: 13, fontWeight: "800", color: "#fbbf24" }}
              >
                📚 {sr.count()}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 🤖 Kelime Asistanı — tıklanınca öğrenilenler sayfasına git */}
        <TouchableOpacity onPress={() => onShowLearned()} activeOpacity={0.8}>
          <View
            style={{
              backgroundColor:
                _learned === 0
                  ? "rgba(148,163,184,0.06)"
                  : "rgba(59,130,246,0.06)",
              borderRadius: 16,
              padding: 14,
              marginBottom: 18,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              borderWidth: 1,
              borderColor:
                _learned === 0
                  ? "rgba(148,163,184,0.12)"
                  : "rgba(59,130,246,0.12)",
            }}
          >
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: "#eff6ff",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(59,130,246,0.2)",
              }}
            >
              <Image
                source={require("../../../assets/icon.png")}
                style={{ width: 36, height: 36, borderRadius: 8 }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "800",
                  color: _learned === 0 ? "#94a3b8" : "#3b82f6",
                  marginBottom: 3,
                }}
              >
                Kelime Asistanı
              </Text>
              <Text style={{ fontSize: 12, color: "#475569", lineHeight: 17 }}>
                {_botMsg}
              </Text>
              {_learned > 0 && (
                <View
                  style={{
                    marginTop: 6,
                    height: 4,
                    backgroundColor: "rgba(148,163,184,0.2)",
                    borderRadius: 2,
                  }}
                >
                  <View
                    style={{
                      height: "100%",
                      width: `${Math.min(_pct, 100)}%`,
                      backgroundColor: "#3b82f6",
                      borderRadius: 2,
                    }}
                  />
                </View>
              )}
            </View>
            {_learned > 0 && (
              <Text
                style={{
                  fontSize: 9,
                  color: "#3b82f6",
                  marginTop: 4,
                  textAlign: "right",
                  fontWeight: "600",
                }}
              >
                Tümünü gör →
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Ayarlar dişli çark — sağ üst köşede zaten var, toggle'lar modal'e taşındı */}
        <Text
          style={{
            fontSize: 12,
            color: "#334155",
            letterSpacing: 3,
            textTransform: "uppercase",
            fontWeight: "800",
            marginBottom: 10,
            textAlign: "center",
          }}
        >
          OYUN HIZI
        </Text>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 22,
          }}
        >
          {(Object.keys(SPEEDS) as SpeedMode[]).map((k) => {
            const s = SPEEDS[k],
              active = speed === k;
            return (
              <TouchableOpacity
                key={k}
                onPress={() => {
                  onSpeedChange(k);
                  hapSel();
                  playMenuTick();
                }}
                style={{
                  flex: 1,
                  minWidth: "40%",
                  paddingVertical: 14,
                  alignItems: "center",
                  borderRadius: 14,
                  backgroundColor: active ? s.color + "1e" : "#ffffff",
                  borderWidth: 2,
                  borderColor: active ? s.color : "rgba(148,163,184,0.3)",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "900",
                    color: active ? s.color : "#64748b",
                  }}
                >
                  {s.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text
          style={{
            fontSize: 12,
            color: "#334155",
            letterSpacing: 3,
            textTransform: "uppercase",
            fontWeight: "800",
            marginBottom: 10,
            textAlign: "center",
          }}
        >
          OYUN SEÇ
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {GAMES_META.map((gme) => (
            <TouchableOpacity
              key={gme.id}
              onPress={() => {
                hap(Haptics.ImpactFeedbackStyle.Medium);
                playMenuTick();
                onPlay(gme.id as GameId, speed);
              }}
              style={{
                width: Math.floor((W - 48) / 2),
                backgroundColor: "#ffffff",
                borderWidth: 1.5,
                borderColor: "rgba(148,163,184,0.3)",
                borderRadius: 18,
                paddingVertical: 16,
                paddingHorizontal: 14,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Text style={{ fontSize: 26 }}>{gme.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "800",
                    color: "#1e293b",
                    marginBottom: 2,
                  }}
                >
                  {gme.title}
                </Text>
                <Text style={{ fontSize: 11, color: "#94a3b8" }}>
                  {gme.desc}
                </Text>
              </View>
              <View
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: gme.color,
                }}
              />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}