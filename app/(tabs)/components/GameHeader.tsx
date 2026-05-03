import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hapSel } from "../../../lib/audio";
import type { Word } from "../../../words";

// ─── Pause Overlay ──────────────────────────────────────────
export function PauseOverlay({
  onResume,
  onMenu,
}: {
  onResume: () => void;
  onMenu: () => void;
}) {
  return (
    <View
      style={{
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(15,23,42,0.88)",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999,
      }}
    >
      <Text style={{ fontSize: 48, marginBottom: 8 }}>⏸️</Text>
      <Text style={{ fontSize: 26, fontWeight: "900", color: "#fff", marginBottom: 4 }}>
        Duraklatıldı
      </Text>
      <Text style={{ fontSize: 13, color: "#94a3b8", marginBottom: 32 }}>
        Kaldığın yerden devam edebilirsin
      </Text>
      <TouchableOpacity
        onPress={onResume}
        style={{
          backgroundColor: "#3b82f6",
          paddingVertical: 14,
          paddingHorizontal: 48,
          borderRadius: 50,
          marginBottom: 12,
          width: 220,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>▶ Devam Et</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onMenu}
        style={{
          backgroundColor: "rgba(255,255,255,0.1)",
          paddingVertical: 14,
          paddingHorizontal: 48,
          borderRadius: 50,
          width: 220,
          alignItems: "center",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.15)",
        }}
      >
        <Text style={{ color: "#94a3b8", fontWeight: "700", fontSize: 15 }}>← Ana Menü</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Game Header ────────────────────────────────────────────
export function GameHeader({
  title,
  streak,
  learned,
  onBack,
  level,
  speed,
  onPause,
}: {
  title: string;
  streak: number;
  learned: number;
  onBack: () => void;
  level?: string;
  speed?: string;
  onPause?: () => void;
}) {
  const sc =
    streak >= 10 ? "#f87171"
    : streak >= 5 ? "#fbbf24"
    : streak >= 2 ? "#34d399"
    : "#94a3b8";
  return (
    <View style={gh.wrap}>
      <TouchableOpacity
        onPress={() => { hapSel(); onBack(); }}
        style={gh.back}
      >
        <Text style={gh.backTxt}>← Menü</Text>
      </TouchableOpacity>
      {onPause && (
        <TouchableOpacity
          onPress={onPause}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 10,
            marginLeft: 6,
            backgroundColor: "rgba(148,163,184,0.12)",
            borderRadius: 10,
            borderWidth: 1,
            borderColor: "rgba(148,163,184,0.2)",
          }}
        >
          <Text style={{ fontSize: 16 }}>⏸️</Text>
        </TouchableOpacity>
      )}
      <View style={{ flex: 1, alignItems: "center" }}>
        <Text style={gh.title}>{title}</Text>
        {(level || speed) && (
          <View style={{ flexDirection: "row", gap: 6, marginTop: 2 }}>
            {level && (
              <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 50, backgroundColor: "rgba(59,130,246,0.1)", borderWidth: 1, borderColor: "rgba(59,130,246,0.2)" }}>
                <Text style={{ fontSize: 10, color: "#3b82f6", fontWeight: "700" }}>{level}</Text>
              </View>
            )}
            {speed && (
              <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 50, backgroundColor: "rgba(148,163,184,0.1)", borderWidth: 1, borderColor: "rgba(148,163,184,0.2)" }}>
                <Text style={{ fontSize: 10, color: "#64748b", fontWeight: "700" }}>{speed}</Text>
              </View>
            )}
          </View>
        )}
      </View>
      <View style={gh.right}>
        <Text style={[gh.streak, { color: sc }]}>{streak > 0 ? `🔥${streak}` : "—"}</Text>
        <Text style={gh.learned}>📚{learned}</Text>
      </View>
    </View>
  );
}

const gh = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(148,163,184,0.2)" },
  back: { paddingVertical: 11, paddingHorizontal: 18, backgroundColor: "#fff", borderRadius: 14, borderWidth: 1.5, borderColor: "rgba(148,163,184,0.3)" },
  backTxt: { fontSize: 15, color: "#334155", fontWeight: "900" },
  title: { textAlign: "center", fontSize: 18, fontWeight: "900", color: "#1e1b4b", letterSpacing: 0.5 },
  right: { alignItems: "flex-end", gap: 3, minWidth: 58 },
  streak: { fontSize: 18, fontWeight: "900" },
  learned: { fontSize: 13, fontWeight: "800", color: "#fbbf24" },
});

// ─── Steps (onboarding indicator) ───────────────────────────
export function Steps({ step, total }: { step: number; total: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 6, justifyContent: "center", marginBottom: 24 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{
            height: 4,
            width: i < step ? 28 : 14,
            borderRadius: 2,
            backgroundColor: i < step ? "#60a5fa" : "rgba(148,163,184,0.35)",
          }}
        />
      ))}
    </View>
  );
}

// ─── Screen wrapper ──────────────────────────────────────────
export function Screen({
  children,
  bg = "#1e1b4b",
  style = {},
}: {
  children: React.ReactNode;
  bg?: string;
  style?: object;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: bg,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        ...style,
      }}
    >
      <StatusBar hidden={false} backgroundColor={bg} barStyle="dark-content" />
      {children}
      {__DEV__ && (
        <View
          style={{
            position: "absolute",
            top: insets.top + 4,
            right: 4,
            backgroundColor: "rgba(255,0,0,0.85)",
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 4,
            zIndex: 9999,
          }}
        >
          <Text style={{ color: "white", fontSize: 10, fontWeight: "900" }}>
            T:{Math.round(insets.top)} B:{Math.round(insets.bottom)} P:{Platform.OS}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Sound Warning Banner ────────────────────────────────────
export function SoundWarningBanner() {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }).start(() => setVisible(false));
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;
  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        backgroundColor: "rgba(251,191,36,0.18)",
        paddingVertical: 6,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(251,191,36,0.3)",
      }}
    >
      <Text style={{ fontSize: 15 }}>🔊</Text>
      <Text style={{ fontSize: 11, color: "#d97706", fontWeight: "700", flex: 1 }}>
        Sesi aç! Kelimelerin okunuşu söyleniyor.
      </Text>
    </Animated.View>
  );
}

// ─── Word Toast (wrong answer popup) ────────────────────────
const ts = StyleSheet.create({
  wrap: { position: "absolute", bottom: 90, left: 14, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#ffffff", borderRadius: 50, paddingVertical: 7, paddingHorizontal: 16, borderWidth: 1, borderColor: "rgba(148,163,184,0.12)", zIndex: 100 },
  en: { color: "#1e1b4b", fontWeight: "700", fontSize: 13 },
  arr: { color: "#94a3b8", fontSize: 11 },
  tr: { color: "#c084fc", fontWeight: "700", fontSize: 13 },
});

export function WordToast({ word, visible }: { word: Word | null; visible: boolean }) {
  if (!word) return null;
  return (
    <View style={[ts.wrap, { opacity: visible ? 1 : 0 }]}>
      <Text style={ts.en}>{word.en}</Text>
      <Text style={ts.arr}>→</Text>
      <Text style={ts.tr}>{word.tr}</Text>
    </View>
  );
}
