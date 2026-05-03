import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import React, { useEffect, useRef, useState } from "react";
import { Alert, AppState, Linking, Text, TouchableOpacity, View } from "react-native";
import { deleteSet, downloadSet, uploadSet } from "../../firebase";
import { WORD_BANKS as ALL_WORDS } from "../../words";
import type { Goal, Level } from "../../words";

import { playSoundOk, startBgMusic, stopBgMusic } from "../../lib/audio";
import { CustomSet, GameId, SpeedMode, MAX_CUSTOM_SETS } from "../../lib/constants";
import { SREngine } from "../../lib/sr-engine";
import { showToast, ToastHost } from "./components/ToastHost";
import type { Word } from "../../words";

import GoalScreen from "./screens/GoalScreen";
import LevelScreen from "./screens/LevelScreen";
import HomeScreen from "./screens/HomeScreen";
import LearnedWordsScreen from "./screens/LearnedWordsScreen";
import SetBuilderScreen from "./screens/SetBuilderScreen";
import CustomSetsScreen from "./screens/CustomSetsScreen";

import WordRushGame from "./games/WordRushGame";
import FallingGame from "./games/FallingGame";
import MatchGame from "./games/MatchGame";
import PairsGame from "./games/PairsGame";
import PinballGame from "./games/PinballGame";

export default function App() {
  const [screen, setScreen] = useState<
    "goal" | "level" | "home" | "game" | "learned" | "sets" | "builder"
  >("goal");
  const [goal, setGoal] = useState<Goal>("gunluk");
  const [level, setLevel] = useState<Level>("A1");
  const [gameId, setGameId] = useState<GameId>("rush");
  const [speed, setSpeed] = useState<SpeedMode>("normal");
  const [sr, setSr] = useState<SREngine | null>(null);
  const [customSets, setCustomSets] = useState<CustomSet[]>([]);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [editingSet, setEditingSet] = useState<CustomSet | null>(null);
  const [showMilestone, setShowMilestone] = useState<number | null>(null);
  const milestoneRef = React.useRef(0);
  const [loading, setLoading] = useState(false);

  // Load saved custom sets
  useEffect(() => {
    AsyncStorage.getItem("wv_custom_sets").then((raw) => {
      if (raw) {
        try {
          setCustomSets(JSON.parse(raw));
        } catch (_) {}
      }
    });
  }, []);

  // Arka plan müziği — tek bir merkezi kontrol noktası
  useEffect(() => {
    if (screen === "game") {
      stopBgMusic();
    } else {
      // setTimeout ile geciktir — render bitmeden Audio çağrısı sorun çıkarabilir
      const t = setTimeout(() => startBgMusic(), 100);
      return () => clearTimeout(t);
    }
  }, [screen]);

  // AppState — arka plana geçince dur
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        if (sr) sr.save();
        stopBgMusic();
      } else {
        if (screen !== "game") {
          setTimeout(() => startBgMusic(), 200);
        }
      }
    });
    return () => sub.remove();
  }, [sr, screen]);

  // Android hardware back button
  useEffect(() => {
    const sub = require("react-native").BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (screen === "game") {
          setScreen("home");
          return true;
        }
        if (screen === "learned") {
          setScreen("home");
          return true;
        }
        if (screen === "sets") {
          setScreen("goal");
          return true;
        }
        if (screen === "builder") {
          setScreen("sets");
          return true;
        }
        if (screen === "home") {
          setScreen("level");
          return true;
        }
        if (screen === "level") {
          setScreen("goal");
          return true;
        }
        return false;
      },
    );
    return () => sub.remove();
  }, [screen]);

  const handleSheetLoad = async (
    sheetId: string,
    name: string,
  ): Promise<{ ok: boolean; msg: string }> => {
    // Güncelleme değilse (aynı id yok) yeni ekleme sayılır
    const isUpdate = customSets.some((s: CustomSet) => s.id === sheetId);
    if (!isUpdate && customSets.length >= MAX_CUSTOM_SETS) {
      return {
        ok: false,
        msg: `En fazla ${MAX_CUSTOM_SETS} kelime seti oluşturabilirsin. Önce bir setini sil.`,
      };
    }
    try {
      const url =
        "https://docs.google.com/spreadsheets/d/" +
        sheetId +
        "/export?format=csv";
      const res = await fetch(url);
      if (!res.ok)
        return { ok: false, msg: "Sheet bulunamadi. ID kontrol et." };
      const rawText = await res.text();
      const lines = rawText.trim().split("\n").slice(1);
      const words: Word[] = lines
        .map((line: string) => {
          const parts = line.split(",");
          const en = (parts[0] ?? "").replace(/"/g, "").trim().toUpperCase();
          const tr = (parts[1] ?? "").replace(/"/g, "").trim();
          return { en, tr };
        })
        .filter((w: Word) => w.en && w.tr && w.en.length > 0);
      if (words.length < 4)
        return {
          ok: false,
          msg: "Cok az kelime (" + String(words.length) + "). En az 4 gerekli.",
        };
      const newSet: CustomSet = {
        id: sheetId,
        name: name || "Set " + String(customSets.length + 1),
        words,
        addedAt: Date.now(),
        lastUsed: Date.now(),
      };
      const updated = [
        ...customSets.filter((s: CustomSet) => s.id !== sheetId),
        newSet,
      ];
      setCustomSets(updated);
      await AsyncStorage.setItem("wv_custom_sets", JSON.stringify(updated));
      return { ok: true, msg: String(words.length) + " kelime yuklendi!" };
    } catch (e) {
      return {
        ok: false,
        msg: "Baglanti hatasi. Internet baglantini kontrol et.",
      };
    }
  };

  const handleSetPlay = (set: CustomSet) => {
    // Custom set için YENİ bir engine — eski SR verisi yüklenmesin
    const engine = new SREngine(set.words);
    setActiveSetId(set.id);
    setSr(engine);
    setLevel("A1");
    setGoal("gunluk");
    setScreen("home");
    // lastUsed güncelle
    const updated = customSets.map((s: CustomSet) =>
      s.id === set.id ? { ...s, lastUsed: Date.now() } : s,
    );
    setCustomSets(updated);
    AsyncStorage.setItem("wv_custom_sets", JSON.stringify(updated));
  };

  const handleDeleteSet = async (setId: string) => {
    // Sadece oluşturan silince Firestore'dan da sil
    // İndirenler silince sadece local'den silinir
    const set = customSets.find((s) => s.id === setId);
    if (set?.shareCode) {
      // Bu seti oluşturup paylaşan kişi siliyor → Firestore'dan da kaldır
      deleteSet(set.shareCode).catch(() => {});
    }
    const updated = customSets.filter((s) => s.id !== setId);
    setCustomSets(updated);
    await AsyncStorage.setItem("wv_custom_sets", JSON.stringify(updated));
  };

  const [shareResult, setShareResult] = useState<{
    code: string;
    isUpdate: boolean;
  } | null>(null);
  const [sharingSetId, setSharingSetId] = useState<string | null>(null);

  const handleShareSet = async (set: CustomSet) => {
    // customSets'ten güncel shareCode'u al (prop'tan gelen stale olabilir)
    const currentSet = customSets.find((s) => s.id === set.id) ?? set;
    const existingCode = currentSet.shareCode;
    setSharingSetId(set.id);
    try {
      const res = await uploadSet({
        name: set.name,
        words: set.words,
        existingCode,
      });
      if (res.ok) {
        await Clipboard.setStringAsync(res.code!);
        const updated = customSets.map((s: CustomSet) =>
          s.id === set.id ? { ...s, shareCode: res.code } : s,
        );
        setCustomSets(updated);
        await AsyncStorage.setItem("wv_custom_sets", JSON.stringify(updated));
        setShareResult({ code: res.code!, isUpdate: !!existingCode });
      } else {
        if (res.msg === "__offline__") {
          Alert.alert(
            "📡 İnternet Bağlantısı Yok",
            "Paylaşmak için internet bağlantısı gerekli. Bağlantını kontrol edip tekrar dene.",
            [{ text: "Tamam" }],
          );
        } else {
          Alert.alert("Hata", res.msg);
        }
      }
    } catch (e: any) {
      Alert.alert(
        "📡 İnternet Bağlantısı Yok",
        "Paylaşmak için internet bağlantısı gerekli. Bağlantını kontrol edip tekrar dene.",
        [{ text: "Tamam" }],
      );
    } finally {
      setSharingSetId(null);
    }
  };

  const handleImportSet = async (code: string) => {
    try {
      const res = await downloadSet(code);
      if (!res.ok || !res.words) {
        if (res.msg === "__offline__") {
          Alert.alert(
            "📡 İnternet Bağlantısı Yok",
            "Seti indirmek için internet bağlantısı gerekli. Bağlantını kontrol edip tekrar dene.",
            [{ text: "Tamam" }],
          );
        } else {
          Alert.alert("Hata", res.msg);
        }
        return;
      }
      // Aynı kod daha önce indirilmişse güncelle, yoksa yeni ekle
      const existingIdx = customSets.findIndex(
        (s) => s.id === "cloud_" + code + "_" + code,
      );
      // Yeni indirme ise set sayısı sınırını kontrol et
      if (existingIdx < 0 && customSets.length >= MAX_CUSTOM_SETS) {
        Alert.alert(
          "Set Sınırı",
          `En fazla ${MAX_CUSTOM_SETS} kelime seti ekleyebilirsin. Önce bir setini sil.`,
          [{ text: "Tamam" }],
        );
        return;
      }
      const newSet: CustomSet = {
        id: "cloud_" + code + "_" + code, // sabit id — güncelleme için
        name: res.name ?? "İndirilen Set",
        words: res.words,
        addedAt: Date.now(),
        lastUsed: Date.now(),
      };
      const updated =
        existingIdx >= 0
          ? customSets.map((s, i) => (i === existingIdx ? newSet : s))
          : [...customSets, newSet];
      setCustomSets(updated);
      await AsyncStorage.setItem("wv_custom_sets", JSON.stringify(updated));
      Alert.alert(
        "✅ İndirildi!",
        res.msg + "\nİnternet olmadan da oynayabilirsin!",
      );
    } catch (e: any) {
      Alert.alert(
        "📡 İnternet Bağlantısı Yok",
        "Seti indirmek için internet bağlantısı gerekli. Bağlantını kontrol edip tekrar dene.",
        [{ text: "Tamam" }],
      );
    }
  };

  const handleGoal = (g: Goal) => {
    setGoal(g);
    setActiveSetId(null); // custom set sıfırla
    setScreen("level");
  };
  const handleLevel = (l: Level) => {
    setLevel(l);
    setActiveSetId(null); // custom set sıfırla
    const words = ALL_WORDS[goal][l] ?? [];
    const engine = new SREngine(
      words.length > 0 ? words : ALL_WORDS[goal]["A1"],
    );
    setLoading(true);
    engine.load().then(() => {
      setSr(engine);
      setLoading(false);
      setScreen("home");
    });
  };
  const handlePlay = (id: GameId, sp: SpeedMode) => {
    setGameId(id);
    setSpeed(sp);
    setScreen("game");
  };
  const back = () => setScreen("home");
  const activeSetName = activeSetId
    ? (customSets.find((s: CustomSet) => s.id === activeSetId)?.name ?? null)
    : null;

  // Milestone kontrolü — sr kayıt sayısı 10'un katı olunca
  React.useEffect(() => {
    if (!sr) return;
    const count = sr.count();
    if (count > 0 && count % 10 === 0 && count !== milestoneRef.current) {
      milestoneRef.current = count;
      setShowMilestone(count);
      playSoundOk();
    }
  });

  if (screen === "goal")
    return (
      <GoalScreen
        onSelect={handleGoal}
        onCustomSets={() => setScreen("sets")}
        savedSetsCount={customSets.length}
      />
    );
  if (screen === "sets")
    return (
      <>
        {/* Paylaşım sonuç modal'i */}
        {shareResult &&
          (() => {
            const code = shareResult.code;
            const msg = `WordVerse'de "${customSets.find((s) => s.shareCode === code)?.name ?? "Kelime Seti"}" adlı kelime setini seninle paylaşmak istiyorum!\n\nUygulama içinde Kelime Setleri > Kod ile İndir bölümüne şu kodu gir:\n\n${code}\n\nWordVerse uygulamasını indir ve oyna! 🎮`;
            const waUrl = `whatsapp://send?text=${encodeURIComponent(msg)}`;
            const tgUrl = `tg://msg?text=${encodeURIComponent(msg)}`;
            const smsUrl = `sms:?body=${encodeURIComponent(msg)}`;
            return (
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 9999,
                  backgroundColor: "rgba(15,23,42,0.88)",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 24,
                }}
              >
                <View
                  style={{
                    backgroundColor: "#fff",
                    borderRadius: 28,
                    padding: 24,
                    width: "100%",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: 32, marginBottom: 6 }}>
                    {shareResult.isUpdate ? "🔄" : "🎉"}
                  </Text>
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: "900",
                      color: "#1e1b4b",
                      marginBottom: 2,
                    }}
                  >
                    {shareResult.isUpdate
                      ? "Set Güncellendi!"
                      : "Set Paylaşıldı!"}
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: "#94a3b8",
                      marginBottom: 16,
                      textAlign: "center",
                    }}
                  >
                    {shareResult.isUpdate
                      ? "İndirenler 🔄 butonu ile güncel listeyi indirebilir."
                      : "15 gün geçerli"}
                  </Text>

                  {/* Büyük kod kutusu */}
                  <View
                    style={{
                      backgroundColor: "#f0f4ff",
                      borderRadius: 16,
                      paddingVertical: 16,
                      paddingHorizontal: 24,
                      borderWidth: 2,
                      borderColor: "#6366f1",
                      marginBottom: 20,
                      width: "100%",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        color: "#6366f1",
                        fontWeight: "700",
                        letterSpacing: 2,
                        marginBottom: 6,
                      }}
                    >
                      PAYLAŞIM KODU
                    </Text>
                    <Text
                      style={{
                        fontSize: 38,
                        fontWeight: "900",
                        color: "#1e1b4b",
                        letterSpacing: 10,
                      }}
                    >
                      {code}
                    </Text>
                  </View>

                  {/* Paylaşım butonları */}
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 10,
                      width: "100%",
                      marginBottom: 12,
                    }}
                  >
                    {/* WhatsApp */}
                    <TouchableOpacity
                      onPress={() =>
                        Linking.openURL(waUrl).catch(() =>
                          showToast("WhatsApp yüklü değil"),
                        )
                      }
                      style={{
                        flex: 1,
                        backgroundColor: "#25D366",
                        borderRadius: 14,
                        paddingVertical: 14,
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Text style={{ fontSize: 22 }}>💬</Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: "#fff",
                          fontWeight: "800",
                        }}
                      >
                        WhatsApp
                      </Text>
                    </TouchableOpacity>

                    {/* Telegram */}
                    <TouchableOpacity
                      onPress={() =>
                        Linking.openURL(tgUrl).catch(() =>
                          showToast("Telegram yüklü değil"),
                        )
                      }
                      style={{
                        flex: 1,
                        backgroundColor: "#0088cc",
                        borderRadius: 14,
                        paddingVertical: 14,
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Text style={{ fontSize: 22 }}>✈️</Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: "#fff",
                          fontWeight: "800",
                        }}
                      >
                        Telegram
                      </Text>
                    </TouchableOpacity>

                    {/* SMS */}
                    <TouchableOpacity
                      onPress={() =>
                        Linking.openURL(smsUrl).catch(() =>
                          showToast("SMS açılamadı"),
                        )
                      }
                      style={{
                        flex: 1,
                        backgroundColor: "#6366f1",
                        borderRadius: 14,
                        paddingVertical: 14,
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Text style={{ fontSize: 22 }}>✉️</Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: "#fff",
                          fontWeight: "800",
                        }}
                      >
                        SMS
                      </Text>
                    </TouchableOpacity>

                    {/* Kopyala */}
                    <TouchableOpacity
                      onPress={() =>
                        Clipboard.setStringAsync(code).then(() =>
                          showToast("📋 Kod kopyalandı!"),
                        )
                      }
                      style={{
                        flex: 1,
                        backgroundColor: "#f1f5f9",
                        borderRadius: 14,
                        paddingVertical: 14,
                        alignItems: "center",
                        gap: 4,
                        borderWidth: 1.5,
                        borderColor: "rgba(148,163,184,0.3)",
                      }}
                    >
                      <Text style={{ fontSize: 22 }}>📋</Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: "#64748b",
                          fontWeight: "800",
                        }}
                      >
                        Kopyala
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    onPress={() => setShareResult(null)}
                    style={{ paddingVertical: 12, paddingHorizontal: 40 }}
                  >
                    <Text
                      style={{
                        color: "#94a3b8",
                        fontWeight: "700",
                        fontSize: 14,
                      }}
                    >
                      Kapat
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })()}
        <CustomSetsScreen
          sets={customSets}
          onLoad={handleSheetLoad}
          onPlay={handleSetPlay}
          onDelete={handleDeleteSet}
          onBack={() => setScreen("goal")}
          onBuild={() => {
            setEditingSet(null);
            setScreen("builder");
          }}
          onEdit={(set) => {
            setEditingSet(set);
            setScreen("builder");
          }}
          onShare={handleShareSet}
          onImport={handleImportSet}
        />
      </>
    );
  if (screen === "builder")
    return (
      <SetBuilderScreen
        allWords={ALL_WORDS}
        initialSet={editingSet}
        onSave={(set) => {
          const isUpdate = customSets.some((s: CustomSet) => s.id === set.id);
          if (!isUpdate && customSets.length >= MAX_CUSTOM_SETS) {
            Alert.alert(
              "Set Sınırı",
              `En fazla ${MAX_CUSTOM_SETS} kelime seti oluşturabilirsin. Önce bir setini sil.`,
              [{ text: "Tamam" }],
            );
            return;
          }
          const updated = [
            ...customSets.filter((s: CustomSet) => s.id !== set.id),
            set,
          ];
          setCustomSets(updated);
          AsyncStorage.setItem("wv_custom_sets", JSON.stringify(updated));
          setEditingSet(null);
          setScreen("sets");
        }}
        onBack={() => {
          setEditingSet(null);
          setScreen("sets");
        }}
      />
    );
  if (screen === "level")
    return (
      <LevelScreen
        goal={goal}
        onSelect={handleLevel}
        onBack={() => setScreen("goal")}
      />
    );
  if (loading || (!sr && screen === "home"))
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#f0f4ff",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 32, marginBottom: 12 }}>📚</Text>
        <Text style={{ fontSize: 16, fontWeight: "700", color: "#1e1b4b" }}>
          Kelimeler yükleniyor...
        </Text>
      </View>
    );
  if (!sr) return null;
  if (screen === "learned")
    return (
      <LearnedWordsScreen
        sr={sr}
        onBack={() => setScreen("home")}
        onRemove={(en) => {
          if (sr.mem[en]) delete sr.mem[en];
          sr.save();
        }}
        onReset={() => {
          sr.reset();
          setScreen("home");
        }}
      />
    );
  if (screen === "home")
    return (
      <>
        {showMilestone !== null && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.6)",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
            }}
          >
            <View
              style={{
                backgroundColor: "#fff",
                borderRadius: 24,
                padding: 32,
                alignItems: "center",
                margin: 32,
                shadowColor: "#6366f1",
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.3,
                shadowRadius: 20,
                elevation: 20,
              }}
            >
              <Text style={{ fontSize: 56, marginBottom: 8 }}>🎉</Text>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: "900",
                  color: "#1e1b4b",
                  marginBottom: 4,
                }}
              >
                Harika!
              </Text>
              <Text
                style={{
                  fontSize: 15,
                  color: "#6366f1",
                  fontWeight: "700",
                  marginBottom: 16,
                }}
              >
                {showMilestone} kelime öğrendin! 🏆
              </Text>
              <TouchableOpacity
                onPress={() => setShowMilestone(null)}
                style={{
                  backgroundColor: "#6366f1",
                  borderRadius: 50,
                  paddingVertical: 12,
                  paddingHorizontal: 32,
                }}
              >
                <Text
                  style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}
                >
                  Devam Et!
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        <HomeScreen
          goal={goal}
          level={level}
          sr={sr}
          onPlay={handlePlay}
          onBack={() => setScreen("level")}
          onGoal={() => setScreen("goal")}
          onSets={() => setScreen("sets")}
          onShowLearned={() => setScreen("learned")}
          speed={speed}
          onSpeedChange={setSpeed}
          activeSetName={activeSetName}
        />
        <ToastHost />
      </>
    );
  if (gameId === "rush")
    return (
      <WordRushGame
        sr={sr}
        speed={speed}
        level={(activeSetName ?? level) as Level}
        onBack={back}
      />
    );
  if (gameId === "falling")
    return (
      <FallingGame
        sr={sr}
        speed={speed}
        level={(activeSetName ?? level) as Level}
        onBack={back}
      />
    );
  if (gameId === "match")
    return (
      <MatchGame
        sr={sr}
        speed={speed}
        level={(activeSetName ?? level) as Level}
        onBack={back}
      />
    );
  if (gameId === "pairs")
    return (
      <PairsGame
        sr={sr}
        level={(activeSetName ?? level) as Level}
        onBack={back}
      />
    );
  if (gameId === "pinball")
    return (
      <PinballGame
        sr={sr}
        speed={speed}
        level={(activeSetName ?? level) as Level}
        onBack={back}
      />
    );
  return null;
}
