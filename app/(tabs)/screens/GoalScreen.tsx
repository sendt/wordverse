import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  PanResponder,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hap, hapSel, playMenuTick, setBgVolume, settings, toggleBgMusic } from "../../../lib/audio";
import { GOALS } from "../../../lib/constants";
import { W } from "../../../lib/dimensions";
import { Steps } from "../components/GameHeader";
import type { Goal } from "../../../words";

function BgMusicRow() {
  const [on, setOn] = useState(settings.bgMusic);
  const [vol, setVol] = useState(settings.bgVolume);
  const barWidth = W - 48 - 56 - 40; // modal padding hesabı
  const panRef = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const x = e.nativeEvent.locationX;
        const newVol = Math.max(0.05, Math.min(1, x / barWidth));
        setVol(newVol);
        setBgVolume(newVol);
      },
      onPanResponderMove: (e) => {
        const x = e.nativeEvent.locationX;
        const newVol = Math.max(0.05, Math.min(1, x / barWidth));
        setVol(newVol);
        setBgVolume(newVol);
      },
    }),
  ).current;

  return (
    <View
      style={{
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(148,163,184,0.15)",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: on ? 14 : 0,
        }}
      >
        <View>
          <Text style={{ fontSize: 15, fontWeight: "800", color: "#1e293b" }}>
            🎵 Arka Plan Müziği
          </Text>
          <Text style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
            Menülerde çalar
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            const nv = !on;
            setOn(nv);
            toggleBgMusic(nv);
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 4,
            paddingVertical: 4,
          }}
        >
          <View
            style={{
              width: 46,
              height: 26,
              borderRadius: 13,
              backgroundColor: on ? "#6366f1" : "rgba(148,163,184,0.3)",
              justifyContent: "center",
              paddingHorizontal: 3,
              alignItems: on ? "flex-end" : "flex-start",
            }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: "#fff",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.2,
                shadowRadius: 2,
              }}
            />
          </View>
        </TouchableOpacity>
      </View>
      {on && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ fontSize: 13 }}>🔈</Text>
          {/* Kaydırmalı ses barı */}
          <View
            style={{ flex: 1, height: 28, justifyContent: "center" }}
            {...panRef.panHandlers}
          >
            {/* Arka plan */}
            <View
              style={{
                height: 5,
                backgroundColor: "rgba(148,163,184,0.2)",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  width: `${vol * 100}%` as any,
                  height: "100%",
                  backgroundColor: "#6366f1",
                  borderRadius: 3,
                }}
              />
            </View>
            {/* Thumb */}
            <View
              style={{
                position: "absolute",
                left: `${vol * 100}%` as any,
                marginLeft: -10,
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: "#6366f1",
                shadowColor: "#6366f1",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.4,
                shadowRadius: 4,
                top: 4,
              }}
            />
          </View>
          <Text style={{ fontSize: 13 }}>🔊</Text>
        </View>
      )}
    </View>
  );
}


function SettingToggle({
  icon,
  label,
  settingKey,
}: {
  icon: string;
  label: string;
  settingKey: "sound" | "haptic" | "bgMusic" | "menuSound";
}) {
  const [on, setOn] = useState((settings as any)[settingKey]);
  const toggle = () => {
    const nv = !on;
    setOn(nv);
    if (settingKey === "haptic") {
      settings.haptic = nv;
      if (nv) Haptics.selectionAsync();
    } else if (settingKey === "bgMusic") toggleBgMusic(nv);
    else if (settingKey === "menuSound") {
      settings.menuSound = nv;
    } else {
      (settings as any)[settingKey] = nv;
    }
  };
  return (
    <TouchableOpacity
      onPress={toggle}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 50,
        backgroundColor: on
          ? "rgba(99,102,241,0.12)"
          : "rgba(148,163,184,0.08)",
        borderWidth: 1.5,
        borderColor: on ? "rgba(99,102,241,0.3)" : "rgba(148,163,184,0.2)",
      }}
    >
      <Text style={{ fontSize: 14 }}>
        {on ? icon : "🔕" === icon ? "🔕" : icon === "🔔" ? "🔕" : "📴"}
      </Text>
      <Text
        style={{
          fontSize: 12,
          fontWeight: "700",
          color: on ? "#6366f1" : "#94a3b8",
        }}
      >
        {label}
      </Text>
      <View
        style={{
          width: 28,
          height: 16,
          borderRadius: 8,
          backgroundColor: on ? "#6366f1" : "rgba(148,163,184,0.3)",
          alignItems: on ? "flex-end" : "flex-start",
          paddingHorizontal: 2,
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: "#fff",
          }}
        />
      </View>
    </TouchableOpacity>
  );
}

export default function GoalScreen({
  onSelect,
  onCustomSets,
  savedSetsCount,
}: {
  onSelect: (g: Goal) => void;
  onCustomSets?: () => void;
  savedSetsCount?: number;
}) {
  const [sel, setSel] = useState<Goal | null>(null);
  const insets = useSafeAreaInsets();
  const [showSupport, setShowSupport] = useState(false);
  const [showClassModal, setShowClassModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => {
    // Sadece ilk açılışta göster
    if (!(global as any).__wv_welcomed) {
      (global as any).__wv_welcomed = true;
      return true;
    }
    return false;
  });

  // 3D rotating globe
  const spinAnim = useRef(new Animated.Value(0)).current;
  const tiltAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 4000,
        useNativeDriver: true,
        easing: Easing.linear,
      }),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(tiltAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.sin),
        }),
        Animated.timing(tiltAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.sin),
        }),
      ]),
    ).start();
  }, []);
  const rotateY = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  const rotateX = tiltAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["-15deg", "15deg"],
  });
  const scaleGlobe = tiltAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.06, 1],
  });

  return (
    <View style={{ flex: 1, backgroundColor: "#f0f4ff" }}>
      <StatusBar backgroundColor="#f0f4ff" barStyle="dark-content" />
      {/* Support modal */}
      {showSupport && (
        <View
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(15,23,42,0.85)",
            zIndex: 999,
            alignItems: "center",
            justifyContent: "center",
            padding: 28,
          }}
        >
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 24,
              padding: 28,
              width: "100%",
              alignItems: "center",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.25,
              shadowRadius: 30,
            }}
          >
            <Text style={{ fontSize: 36, marginBottom: 8 }}>🎮</Text>
            <Text
              style={{
                fontSize: 20,
                fontWeight: "900",
                color: "#1e1b4b",
                marginBottom: 6,
                textAlign: "center",
              }}
            >
              Reklamsız Deneyim
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: "#64748b",
                textAlign: "center",
                lineHeight: 22,
                marginBottom: 20,
              }}
            >
              Daha iyi bir öğrenme deneyimi için WordVerse, oyun esnasında
              hiçbir reklam göstermemektedir. 🚫📢 Uygulamayı geliştirmeye devam
              edebilmemiz için destek olmak ister misiniz?
            </Text>
            <TouchableOpacity
              onPress={() => {
                hap(Haptics.ImpactFeedbackStyle.Medium);
                setShowSupport(false);
              }}
              style={{
                width: "100%",
                paddingVertical: 14,
                borderRadius: 50,
                backgroundColor: "#3b82f6",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>
                ▶ Reklam İzle → +5 Kelime
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                hap(Haptics.ImpactFeedbackStyle.Medium);
                setShowSupport(false);
              }}
              style={{
                width: "100%",
                paddingVertical: 14,
                borderRadius: 50,
                backgroundColor: "rgba(251,191,36,0.15)",
                alignItems: "center",
                borderWidth: 1.5,
                borderColor: "rgba(251,191,36,0.5)",
                marginBottom: 10,
              }}
            >
              <Text
                style={{ color: "#d97706", fontWeight: "900", fontSize: 15 }}
              >
                ⭐ Uygulamayı Puanla
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowSupport(false)}
              style={{ paddingVertical: 10 }}
            >
              <Text style={{ fontSize: 12, color: "#94a3b8" }}>
                Şimdi değil
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {/* Welcome / Onboarding popup — sadece ilk açılışta */}
      {showWelcome && (
        <View
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(15,23,42,0.88)",
            zIndex: 999,
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 28,
              padding: 28,
              width: "100%",
              alignItems: "center",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.25,
              shadowRadius: 32,
            }}
          >
            <Image
              source={require("../../../assets/icon.png")}
              style={{
                width: 88,
                height: 88,
                borderRadius: 20,
                marginBottom: 14,
              }}
              resizeMode="cover"
            />
            <Text
              style={{
                fontSize: 22,
                fontWeight: "900",
                color: "#1e1b4b",
                marginBottom: 8,
                textAlign: "center",
              }}
            >
              WordVerse'e Hoş Geldin!
            </Text>
            <View
              style={{
                backgroundColor: "#f8faff",
                borderRadius: 16,
                padding: 16,
                marginBottom: 20,
                width: "100%",
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  color: "#475569",
                  lineHeight: 22,
                  textAlign: "center",
                }}
              >
                Bu uygulama sana{" "}
                <Text style={{ fontWeight: "800", color: "#3b82f6" }}>
                  öğretmeyi değil
                </Text>
                {", "}zaten öğrendiklerini{" "}
                <Text style={{ fontWeight: "800", color: "#22c55e" }}>
                  oynayarak pekiştirmeyi
                </Text>{" "}
                amaçlar. 🎮 Her oyun sonunda öğrenilen kelimeler otomatik
                kaydedilir. Ne kadar çok oynarsın, o kadar az tekrar görürsün!
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                gap: 10,
                width: "100%",
                marginBottom: 12,
              }}
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor: "#f0fdf4",
                  borderRadius: 12,
                  padding: 12,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 20, marginBottom: 4 }}>🎮</Text>
                <Text
                  style={{
                    fontSize: 11,
                    color: "#16a34a",
                    fontWeight: "700",
                    textAlign: "center",
                  }}
                >
                  Oynayarak Öğren
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  backgroundColor: "#eff6ff",
                  borderRadius: 12,
                  padding: 12,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 20, marginBottom: 4 }}>📚</Text>
                <Text
                  style={{
                    fontSize: 11,
                    color: "#3b82f6",
                    fontWeight: "700",
                    textAlign: "center",
                  }}
                >
                  Tekrar Azalır
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  backgroundColor: "#fefce8",
                  borderRadius: 12,
                  padding: 12,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 20, marginBottom: 4 }}>🏆</Text>
                <Text
                  style={{
                    fontSize: 11,
                    color: "#d97706",
                    fontWeight: "700",
                    textAlign: "center",
                  }}
                >
                  Seri Yap
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => setShowWelcome(false)}
              style={{
                width: "100%",
                paddingVertical: 15,
                borderRadius: 50,
                backgroundColor: "#3b82f6",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: "#fff",
                  fontWeight: "900",
                  fontSize: 16,
                  letterSpacing: 1,
                }}
              >
                Hadi Başlayalım! 🚀
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {/* Class modal */}
      {false &&
        showClassModal && ( // eski modal devre dışı
          <View
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "rgba(15,23,42,0.85)",
              zIndex: 999,
              alignItems: "center",
              justifyContent: "center",
              padding: 28,
            }}
          >
            <View
              style={{
                backgroundColor: "#fff",
                borderRadius: 24,
                padding: 28,
                width: "100%",
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 36, marginBottom: 8 }}>🏫</Text>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "900",
                  color: "#1e1b4b",
                  marginBottom: 6,
                }}
              >
                Hazır Kelime Seti
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: "#64748b",
                  textAlign: "center",
                  lineHeight: 22,
                  marginBottom: 20,
                }}
              >
                Bu özellik çok yakında geliyor! İngilizce öğretmenleri kendi
                kelime listelerini oluşturup öğrencilerine özel bir sınıf kodu
                paylaşabilecek. Öğrenciler kodu girerek sadece o kelimeleri
                oynayarak öğrenecek. 🎓
              </Text>
              <View
                style={{
                  width: "100%",
                  paddingVertical: 14,
                  borderRadius: 16,
                  backgroundColor: "#f1f5f9",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: "#94a3b8",
                    marginBottom: 6,
                    fontWeight: "700",
                  }}
                >
                  Sınıf Kodunu Gir
                </Text>
                <Text
                  style={{
                    fontSize: 28,
                    letterSpacing: 8,
                    color: "rgba(148,163,184,0.3)",
                    fontWeight: "900",
                  }}
                >
                  _ _ _ _ _ _
                </Text>
                <Text style={{ fontSize: 11, color: "#cbd5e1", marginTop: 6 }}>
                  Özellik geliştirme aşamasında
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowClassModal(false)}
                style={{
                  width: "100%",
                  paddingVertical: 14,
                  borderRadius: 50,
                  backgroundColor: "#6366f1",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}
                >
                  Beni Haberdar Et 🔔
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowClassModal(false)}
                style={{ paddingVertical: 8 }}
              >
                <Text style={{ fontSize: 12, color: "#94a3b8" }}>Kapat</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      {/* ⚙️ Ayarlar Modal — GoalScreen */}
      {showSettings && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15,23,42,0.85)",
            zIndex: 9999,
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 24,
              padding: 28,
              width: "100%",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.2,
              shadowRadius: 24,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 20,
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{ fontSize: 20, fontWeight: "900", color: "#1e1b4b" }}
              >
                ⚙️ Ayarlar
              </Text>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                <Text style={{ fontSize: 22, color: "#94a3b8" }}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={{ gap: 12 }}>
              {/* BgMusicRow — yeni müzik eklenince geri açılacak */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: "rgba(148,163,184,0.15)",
                }}
              >
                <View>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "800",
                      color: "#1e293b",
                    }}
                  >
                    🔔 Oyun Sesi
                  </Text>
                  <Text
                    style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}
                  >
                    Kelime okuma & efektler
                  </Text>
                </View>
                <SettingToggle icon="🔔" label="" settingKey="sound" />
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: "rgba(148,163,184,0.15)",
                }}
              >
                <View>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "800",
                      color: "#1e293b",
                    }}
                  >
                    🖱️ Menü Sesleri
                  </Text>
                  <Text
                    style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}
                  >
                    Buton tık sesleri
                  </Text>
                </View>
                <SettingToggle icon="🖱️" label="" settingKey="menuSound" />
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 12,
                }}
              >
                <View>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "800",
                      color: "#1e293b",
                    }}
                  >
                    📳 Titreşim
                  </Text>
                  <Text
                    style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}
                  >
                    Dokunma geri bildirimi
                  </Text>
                </View>
                <SettingToggle icon="📳" label="" settingKey="haptic" />
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Dişli çark — sağ üst */}
      <View style={{ position: "absolute", top: insets.top + 10, right: 16, zIndex: 100 }}>
        <TouchableOpacity
          onPress={() => { playMenuTick(); setShowSettings(true); }}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(99,102,241,0.1)", borderWidth: 1, borderColor: "rgba(99,102,241,0.25)", alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontSize: 17 }}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Ana içerik — scroll yok, tek ekrana sığdır */}
      <View style={{ flex: 1, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12, paddingHorizontal: 20 }}>
        {/* Başlık + Globe */}
        <View style={{ alignItems: "center", marginBottom: 12 }}>
          <Animated.View style={{ transform: [{ rotate: rotateY }, { scale: scaleGlobe }] }}>
            <Text style={{ fontSize: 52 }}>🌍</Text>
          </Animated.View>
          <Text style={{ fontSize: 22, fontWeight: "900", color: "#1e1b4b", letterSpacing: 3, marginTop: 4 }}>
            WORDVERSE
          </Text>
          <Text style={{ fontSize: 10, color: "#94a3b8", letterSpacing: 2, textTransform: "uppercase", marginTop: 2 }}>
            Oynayarak İngilizce Öğren
          </Text>
        </View>

        <Text style={{ fontSize: 13, color: "#475569", fontWeight: "700", marginBottom: 10, textAlign: "center" }}>
          Ne için öğreniyorsun?
        </Text>

        {/* 3 seçenek — hepsi aynı kapsayıcıda */}
        <View style={{ gap: 8, marginBottom: 14 }}>
          {GOALS.map((g) => (
            <TouchableOpacity
              key={g.id}
              onPress={() => { setSel(g.id); hapSel(); playMenuTick(); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: sel === g.id ? g.color + "18" : "#ffffff", borderWidth: 1.5, borderColor: sel === g.id ? g.color + "77" : "rgba(148,163,184,0.3)", borderRadius: 16, padding: 12 }}
            >
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: g.bg, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 22 }}>{g.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "800", fontSize: 14, color: sel === g.id ? g.color : "#1e293b", marginBottom: 2 }}>{g.title}</Text>
                <Text style={{ fontSize: 11, color: "#94a3b8" }}>{g.sub}</Text>
              </View>
              {sel === g.id && (
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: g.color, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#fff", fontWeight: "900", fontSize: 11 }}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}

          {/* Hazır Kelime Seti — aynı grup içinde */}
          <TouchableOpacity
            onPress={() => { hapSel(); playMenuTick(); if (onCustomSets) onCustomSets(); }}
            style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(99,102,241,0.06)", borderWidth: 1.5, borderColor: "rgba(99,102,241,0.3)", borderRadius: 16, padding: 12 }}
          >
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: "#1e1b4b", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 22 }}>🏫</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <Text style={{ fontWeight: "800", fontSize: 14, color: "#6366f1" }}>Hazır Kelime Seti</Text>
                <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 50, backgroundColor: "#f59e0b" }}>
                  <Text style={{ fontSize: 9, color: "#fff", fontWeight: "900" }}>✨ YENİ</Text>
                </View>
              </View>
              <Text style={{ fontSize: 11, color: "#94a3b8" }}>6 haneli kod ile set paylaş & indir</Text>
            </View>
            <Text style={{ fontSize: 18, color: "rgba(99,102,241,0.4)" }}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Devam Et */}
        <TouchableOpacity
          onPress={() => { if (sel) { playMenuTick(); onSelect(sel); } }}
          style={{ width: "100%", paddingVertical: 15, borderRadius: 50, alignItems: "center", backgroundColor: sel ? "#3b82f6" : "rgba(148,163,184,0.3)", marginBottom: 10 }}
        >
          <Text style={{ fontSize: 15, fontWeight: "900", color: sel ? "#fff" : "#94a3b8", letterSpacing: 1.5 }}>
            Devam Et →
          </Text>
        </TouchableOpacity>

        {/* Alt bilgi */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <TouchableOpacity onPress={() => { hapSel(); setShowSupport(true); }} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={{ fontSize: 12 }}>☕</Text>
            <Text style={{ fontSize: 11, color: "#d97706", fontWeight: "700" }}>Destek Ol</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 11, color: "#cbd5e1" }}>·</Text>
          <Text style={{ fontSize: 11, color: "#94a3b8" }}>Ücretsiz · Offline</Text>
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// ONBOARDING STEP 2: LEVEL
// ─────────────────────────────────────────────────────────