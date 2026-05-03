import React, { useState } from "react";
import { StatusBar, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hapSel, playMenuTick } from "../../../lib/audio";
import { GOALS, LEVELS } from "../../../lib/constants";
import { Steps } from "../components/GameHeader";
import { WORD_BANKS as ALL_WORDS } from "../../../words";
import type { Goal, Level } from "../../../words";

export default function LevelScreen({
  goal,
  onSelect,
  onBack,
}: {
  goal: Goal;
  onSelect: (l: Level) => void;
  onBack: () => void;
}) {
  const [sel, setSel] = useState<Level | null>(null);
  const insets = useSafeAreaInsets();
  const gm = GOALS.find((g) => g.id === goal)!;
  return (
    <View
      style={{ flex: 1, backgroundColor: "#f0f4ff", paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <StatusBar backgroundColor="#f0f4ff" barStyle="dark-content" />
      {/* Compact header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 10,
          gap: 10,
        }}
      >
        <TouchableOpacity
          onPress={onBack}
          style={{
            paddingVertical: 6,
            paddingHorizontal: 10,
            backgroundColor: "rgba(148,163,184,0.2)",
            borderRadius: 8,
          }}
        >
          <Text style={{ fontSize: 12, color: "#94a3b8", fontWeight: "700" }}>
            ← Geri
          </Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Steps step={2} total={3} />
        </View>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 50,
            backgroundColor: gm.bg,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "700", color: gm.color }}>
            {gm.icon} {gm.title}
          </Text>
        </View>
      </View>
      <Text
        style={{
          fontSize: 13,
          color: "#94a3b8",
          fontWeight: "600",
          textAlign: "center",
          marginBottom: 8,
        }}
      >
        Seviyeni seç
      </Text>
      {/* Levels - compact, no scroll */}
      <View
        style={{
          flex: 1,
          paddingHorizontal: 14,
          gap: 6,
          justifyContent: "center",
        }}
      >
        {LEVELS.map((lv) => {
          const wc = ALL_WORDS[goal][lv.id]?.length ?? 0;
          return (
            <TouchableOpacity
              key={lv.id}
              onPress={() => {
                setSel(lv.id);
                hapSel();
                playMenuTick();
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: sel === lv.id ? lv.color + "14" : "#ffffff",
                borderWidth: 1.5,
                borderColor:
                  sel === lv.id ? lv.color : "rgba(148,163,184,0.25)",
                borderRadius: 14,
                paddingVertical: 10,
                paddingHorizontal: 14,
              }}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  borderWidth: 1.5,
                  borderColor: lv.color + "55",
                  backgroundColor: lv.color + "18",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{ fontSize: 13, fontWeight: "900", color: lv.color }}
                >
                  {lv.label}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "800",
                    color: sel === lv.id ? lv.color : "#1e293b",
                  }}
                >
                  {lv.sub}
                </Text>
                <Text style={{ fontSize: 10, color: "#94a3b8" }}>
                  {wc} kelime
                </Text>
              </View>
              {sel === lv.id && (
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: lv.color,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{ color: "#fff", fontWeight: "900", fontSize: 10 }}
                  >
                    ✓
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity
        onPress={() => {
          if (sel) {
            playMenuTick();
            onSelect(sel);
          }
        }}
        style={{
          margin: 14,
          marginBottom: Math.max(14, insets.bottom + 8),
          paddingVertical: 14,
          borderRadius: 50,
          alignItems: "center",
          backgroundColor: sel ? "#3b82f6" : "rgba(148,163,184,0.3)",
        }}
      >
        <Text
          style={{
            fontSize: 15,
            fontWeight: "900",
            color: sel ? "#fff" : "#94a3b8",
            letterSpacing: 1,
          }}
        >
          Devam Et →
        </Text>
      </TouchableOpacity>
    </View>
  );
}