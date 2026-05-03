import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hap } from "../../../lib/audio";
import { SREngine } from "../../../lib/sr-engine";
import type { Word } from "../../../words";

function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <View
      style={{
        marginHorizontal: 14,
        marginTop: 10,
        marginBottom: 4,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#f1f5f9",
        borderRadius: 12,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.3)",
      }}
    >
      <Text style={{ fontSize: 14, color: "#94a3b8", marginRight: 8 }}>🔍</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Kelime ara... (EN veya TR)"
        placeholderTextColor="#94a3b8"
        style={{ flex: 1, fontSize: 13, color: "#1e293b", paddingVertical: 10 }}
        autoCapitalize="none"
        returnKeyType="search"
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChange("")}>
          <Text style={{ fontSize: 16, color: "#94a3b8", paddingLeft: 8 }}>
            ✕
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function LearnedWordsScreen({
  sr,
  onBack,
  onRemove,
  onReset,
}: {
  sr: SREngine;
  onBack: () => void;
  onRemove: (en: string) => void;
  onReset: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [words, setWords] = useState<
    { word: Word; correct: number; seen: number }[]
  >(() => {
    const mem = (sr as any).mem as Record<
      string,
      { seen: number; correct: number; nextAt: number }
    >;
    return Object.entries(mem)
      .map(([en, m]) => ({
        word: { en, tr: sr.getPool().find((w) => w.en === en)?.tr ?? "" },
        correct: m.correct,
        seen: m.seen,
      }))
      .filter((x) => x.word.tr && x.correct > 0)
      .sort((a, b) => a.word.en.localeCompare(b.word.en, "tr"));
  });
  const [filter, setFilter] = useState<"all" | "strong" | "weak">("all");
  const [search, setSearch] = useState("");

  const filtered = words
    .filter((w) => {
      if (filter === "strong") return w.correct >= 3;
      if (filter === "weak") return w.correct < 3 && w.seen > 0;
      return true;
    })
    .filter((w) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        w.word.en.toLowerCase().includes(q) ||
        w.word.tr.toLowerCase().includes(q)
      );
    });

  const remove = (en: string) => {
    setWords((ws) => ws.filter((w) => w.word.en !== en));
    onRemove(en);
    hap(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View
      style={{ flex: 1, backgroundColor: "#f8faff", paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <StatusBar backgroundColor="#f8faff" barStyle="dark-content" />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 14,
          paddingVertical: 11,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(148,163,184,0.15)",
          backgroundColor: "#fff",
        }}
      >
        <TouchableOpacity
          onPress={onBack}
          style={{
            paddingVertical: 6,
            paddingHorizontal: 10,
            backgroundColor: "#f1f5f9",
            borderRadius: 10,
            borderWidth: 1,
            borderColor: "rgba(148,163,184,0.25)",
          }}
        >
          <Text style={{ fontSize: 12, color: "#64748b", fontWeight: "700" }}>
            ← Geri
          </Text>
        </TouchableOpacity>
        <Text
          style={{
            flex: 1,
            textAlign: "center",
            fontSize: 16,
            fontWeight: "900",
            color: "#1e1b4b",
          }}
        >
          📚 Öğrenilen Kelimeler
        </Text>
        <TouchableOpacity
          onPress={onReset}
          style={{
            paddingVertical: 6,
            paddingHorizontal: 8,
            backgroundColor: "rgba(239,68,68,0.07)",
            borderRadius: 8,
            borderWidth: 1,
            borderColor: "rgba(239,68,68,0.2)",
          }}
        >
          <Text style={{ fontSize: 10, color: "#ef4444", fontWeight: "700" }}>
            🗑️ Sıfırla
          </Text>
        </TouchableOpacity>
      </View>

      <SearchBar value={search} onChange={setSearch} />
      {/* Filter tabs */}
      <View
        style={{
          flexDirection: "row",
          gap: 8,
          padding: 12,
          backgroundColor: "#fff",
          borderBottomWidth: 1,
          borderBottomColor: "rgba(148,163,184,0.1)",
        }}
      >
        {(
          [
            ["all", "Tümü"],
            ["strong", "💪 Güçlü"],
            ["weak", "⚠️ Tekrar Et"],
          ] as const
        ).map(([k, label]) => (
          <TouchableOpacity
            key={k}
            onPress={() => setFilter(k)}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 10,
              alignItems: "center",
              backgroundColor: filter === k ? "#3b82f6" : "#f1f5f9",
              borderWidth: 1,
              borderColor: filter === k ? "#3b82f6" : "rgba(148,163,184,0.25)",
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: filter === k ? "#fff" : "#64748b",
              }}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length === 0 ? (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontSize: 32, marginBottom: 12 }}>🌱</Text>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#94a3b8" }}>
            Henüz kelime yok
          </Text>
          <Text style={{ fontSize: 13, color: "#cbd5e1", marginTop: 4 }}>
            Oyun oynayınca burası dolacak!
          </Text>
        </View>
      ) : (
        <View
          style={
            {
              fontSize: 9,
              color: "#94a3b8",
              paddingHorizontal: 16,
              paddingVertical: 8,
            } as any
          }
        >
          <Text style={{ fontSize: 10, color: "#94a3b8", letterSpacing: 1 }}>
            ← sola kaydır → listeden çıkar (daha fazla göster)
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ paddingBottom: Math.max(40, insets.bottom + 16) }}>
        {filtered.map((item, idx) => (
          <View
            key={item.word.en}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#fff",
              marginHorizontal: 14,
              marginTop: 8,
              borderRadius: 14,
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.15)",
              shadowColor: "#94a3b8",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.06,
              shadowRadius: 4,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "900",
                  color: "#1e293b",
                  marginBottom: 2,
                }}
              >
                {item.word.en}
              </Text>
              <Text
                style={{ fontSize: 13, color: "#64748b", fontWeight: "600" }}
              >
                {item.word.tr}
              </Text>
            </View>
            {/* Strength + count */}
            <View style={{ alignItems: "center", marginRight: 10, gap: 2 }}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "900",
                  color:
                    item.correct >= 5
                      ? "#f59e0b"
                      : item.correct >= 3
                        ? "#22c55e"
                        : "#60a5fa",
                }}
              >
                {item.correct}x
              </Text>
              <View style={{ flexDirection: "row", gap: 2 }}>
                {[1, 2, 3].map((i) => (
                  <View
                    key={i}
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 3,
                      backgroundColor:
                        i * 2 <= item.correct
                          ? "#22c55e"
                          : "rgba(148,163,184,0.2)",
                    }}
                  />
                ))}
              </View>
            </View>
            {/* Öğrenmedim button */}
            <TouchableOpacity
              onPress={() => remove(item.word.en)}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 10,
                backgroundColor: "rgba(239,68,68,0.06)",
                borderRadius: 8,
                borderWidth: 1,
                borderColor: "rgba(239,68,68,0.18)",
              }}
            >
              <Text
                style={{ fontSize: 10, color: "#ef4444", fontWeight: "700" }}
              >
                Öğrenmedim
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}