import React, { useRef, useState } from "react";
import {
  Animated,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { speakWord } from "../../../lib/audio";
import { SREngine } from "../../../lib/sr-engine";
import type { Word } from "../../../words";

export default function FlashcardScreen({
  sr,
  onDone,
}: {
  sr: SREngine;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();

  // Önce tekrar gereken kelimeleri, sonra yenileri göster
  const words: Word[] = sr.getUnique(15).length >= 4
    ? sr.getUnique(15)
    : [...sr.getPool()].sort(() => Math.random() - 0.5).slice(0, 15);

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [finished, setFinished] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const word = words[index];

  const flip = () => {
    if (flipped) return;
    setFlipped(true);
    if (word) speakWord(word.en);
  };

  const next = () => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      if (index >= words.length - 1) {
        setFinished(true);
      } else {
        setIndex((i) => i + 1);
        setFlipped(false);
      }
      Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    });
  };

  if (finished) {
    return (
      <View style={{ flex: 1, backgroundColor: "#f0f4ff", paddingTop: insets.top, paddingBottom: insets.bottom + 16, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <StatusBar backgroundColor="#f0f4ff" barStyle="dark-content" />
        <Text style={{ fontSize: 52, marginBottom: 16 }}>🎉</Text>
        <Text style={{ fontSize: 22, fontWeight: "900", color: "#1e1b4b", marginBottom: 8, textAlign: "center" }}>
          {words.length} kelimeyi gördün!
        </Text>
        <Text style={{ fontSize: 14, color: "#64748b", marginBottom: 36, textAlign: "center", lineHeight: 22 }}>
          Şimdi oynayarak pekiştir 💪
        </Text>
        <TouchableOpacity
          onPress={onDone}
          style={{ backgroundColor: "#3b82f6", paddingVertical: 16, paddingHorizontal: 52, borderRadius: 50 }}
        >
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>Oyuna Geç →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#f0f4ff", paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <StatusBar backgroundColor="#f0f4ff" barStyle="dark-content" />

      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(148,163,184,0.15)", backgroundColor: "#fff" }}>
        <TouchableOpacity
          onPress={onDone}
          style={{ paddingVertical: 7, paddingHorizontal: 14, backgroundColor: "#f1f5f9", borderRadius: 10, borderWidth: 1.5, borderColor: "rgba(148,163,184,0.3)" }}
        >
          <Text style={{ fontSize: 12, color: "#64748b", fontWeight: "700" }}>Atla →</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "900", color: "#1e1b4b" }}>
          📖 Kelimeleri Tanı
        </Text>
        <Text style={{ fontSize: 13, color: "#94a3b8", fontWeight: "700", minWidth: 40, textAlign: "right" }}>
          {index + 1}/{words.length}
        </Text>
      </View>

      {/* Progress bar */}
      <View style={{ height: 4, backgroundColor: "#e2e8f0" }}>
        <View
          style={{
            height: "100%",
            width: `${((index + 1) / words.length) * 100}%`,
            backgroundColor: "#6366f1",
            borderRadius: 2,
          }}
        />
      </View>

      {/* Kart */}
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Animated.View style={{ opacity: fadeAnim, width: "100%" }}>
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={flip}
            style={{ width: "100%" }}
          >
            {!flipped ? (
              // Ön yüz — İngilizce
              <View
                style={{
                  backgroundColor: "#1e1b4b",
                  borderRadius: 24,
                  paddingVertical: 48,
                  paddingHorizontal: 28,
                  alignItems: "center",
                  minHeight: 200,
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 11, color: "#6366f1", letterSpacing: 3, textTransform: "uppercase", fontWeight: "700", marginBottom: 16 }}>
                  İNGİLİZCE
                </Text>
                <Text style={{ fontSize: 36, fontWeight: "900", color: "#fff", textAlign: "center", letterSpacing: 1 }}>
                  {word?.en}
                </Text>
                <Text style={{ fontSize: 12, color: "#475569", marginTop: 28 }}>
                  Türkçesini biliyor musun? Dokun →
                </Text>
              </View>
            ) : (
              // Arka yüz — Türkçe
              <View
                style={{
                  backgroundColor: "#fff",
                  borderRadius: 24,
                  paddingVertical: 48,
                  paddingHorizontal: 28,
                  alignItems: "center",
                  minHeight: 200,
                  justifyContent: "center",
                  borderWidth: 2,
                  borderColor: "#6366f1",
                }}
              >
                <Text style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 3, textTransform: "uppercase", fontWeight: "700", marginBottom: 16 }}>
                  TÜRKÇE
                </Text>
                <Text style={{ fontSize: 32, fontWeight: "900", color: "#6366f1", textAlign: "center" }}>
                  {word?.tr}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 20, backgroundColor: "#f0f4ff", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 50 }}>
                  <Text style={{ fontSize: 14 }}>🔊</Text>
                  <Text style={{ fontSize: 13, color: "#64748b", fontWeight: "700" }}>{word?.en}</Text>
                </View>
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* Butonlar — sadece çevrilince görünür */}
        {flipped && (
          <View style={{ flexDirection: "row", gap: 12, marginTop: 24, width: "100%" }}>
            <TouchableOpacity
              onPress={next}
              style={{ flex: 1, paddingVertical: 16, borderRadius: 16, backgroundColor: "#f1f5f9", alignItems: "center", borderWidth: 1.5, borderColor: "rgba(148,163,184,0.3)" }}
            >
              <Text style={{ fontSize: 20, marginBottom: 2 }}>🤔</Text>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#64748b" }}>Tekrar Bak</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={next}
              style={{ flex: 1.5, paddingVertical: 16, borderRadius: 16, backgroundColor: "#22c55e", alignItems: "center" }}
            >
              <Text style={{ fontSize: 20, marginBottom: 2 }}>✓</Text>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#fff" }}>Biliyorum!</Text>
            </TouchableOpacity>
          </View>
        )}

        {!flipped && (
          <Text style={{ color: "#94a3b8", fontSize: 13, marginTop: 20 }}>
            Kartı çevirmek için dokun
          </Text>
        )}
      </View>
    </View>
  );
}
