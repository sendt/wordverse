import AsyncStorage from "@react-native-async-storage/async-storage";
import { Audio } from "expo-av";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  AppState,
  Dimensions,
  Easing,
  FlatList,
  Image,
  Linking,
  PanResponder,
  Platform,
  ScrollView,
  SectionList,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { deleteSet, downloadSet, uploadSet } from "../../firebase";
import { WORD_BANKS as ALL_WORDS, Goal, Level, Word } from "../../words";

// Ekran boyutları — dinamik (farklı cihazlar için)
let W = Dimensions.get("window").width;
let H = Dimensions.get("window").height;
Dimensions.addEventListener("change", ({ window }) => {
  W = window.width;
  H = window.height;
});

// ─── Global settings (haptic + sound) ───────
const settings = {
  haptic: false,
  sound: true,
  bgMusic: false,
  menuSound: true,
  bgVolume: 0.35,
};

// ─── Arka plan müziği — TEK instance, singleton ───────────────
let _bgSound: any = null;
let _bgState: "stopped" | "loading" | "playing" = "stopped";

async function startBgMusic() {
  if (!settings.bgMusic) return;
  if (_bgState === "playing" || _bgState === "loading") return; // zaten çalıyor
  _bgState = "loading";
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    });
    if (_bgSound) {
      // Mevcut objeyi kullan, sadece play et
      await _bgSound.setVolumeAsync(settings.bgVolume);
      await _bgSound.playAsync();
    } else {
      // İlk kez oluştur
      const { sound } = await Audio.Sound.createAsync(
        require("../../assets/appmsc.mp3"),
        { isLooping: true, volume: settings.bgVolume, shouldPlay: true },
      );
      _bgSound = sound;
    }
    _bgState = "playing";
  } catch (_) {
    _bgState = "stopped";
  }
}

async function stopBgMusic() {
  if (_bgState === "stopped") return;
  _bgState = "stopped";
  try {
    if (_bgSound) await _bgSound.pauseAsync();
  } catch (_) {}
}

async function setBgVolume(vol: number) {
  settings.bgVolume = vol;
  try {
    if (_bgSound) await _bgSound.setVolumeAsync(vol);
  } catch (_) {}
}

async function toggleBgMusic(on: boolean) {
  settings.bgMusic = on;
  if (on) {
    await startBgMusic();
  } else {
    await stopBgMusic();
  }
}

// Menü tık sesi — hafif
async function playMenuTick() {
  if (!settings.menuSound) return;
  try {
    const freq = 880,
      ms = 60;
    const sr2 = 8000,
      n = Math.floor((sr2 * ms) / 1000),
      buf = new Uint8Array(44 + n);
    const w32 = (o: number, v: number) => {
      buf[o] = v & 255;
      buf[o + 1] = (v >> 8) & 255;
      buf[o + 2] = (v >> 16) & 255;
      buf[o + 3] = (v >> 24) & 255;
    };
    const w16 = (o: number, v: number) => {
      buf[o] = v & 255;
      buf[o + 1] = (v >> 8) & 255;
    };
    const ws = (o: number, s: string) => {
      for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i);
    };
    ws(0, "RIFF");
    w32(4, 36 + n);
    ws(8, "WAVE");
    ws(12, "fmt ");
    w32(16, 16);
    w16(20, 1);
    w16(22, 1);
    w32(24, sr2);
    w32(28, sr2);
    w16(32, 1);
    w16(34, 8);
    ws(36, "data");
    w32(40, n);
    for (let i = 0; i < n; i++) {
      const t = i / sr2,
        env = Math.exp(-12 * t);
      buf[44 + i] = Math.round(
        (Math.sin(2 * Math.PI * freq * t) * env * 0.5 + 1) * 127.5,
      );
    }
    let b = "";
    buf.forEach((x) => (b += String.fromCharCode(x)));
    const { sound } = await Audio.Sound.createAsync(
      { uri: `data:audio/wav;base64,${btoa(b)}` },
      { volume: 0.3 },
    );
    await sound.playAsync();
    setTimeout(() => sound.unloadAsync(), 500);
  } catch (_) {}
}
const hap = (style?: any) => {
  if (settings.haptic)
    Haptics.impactAsync(style ?? Haptics.ImpactFeedbackStyle.Light);
};
const hapSel = () => {
  if (settings.haptic) Haptics.selectionAsync();
};
const hapHeavy = () => {
  if (settings.haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
};

// ─────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────
// type Word      = { en: string; tr: string }; — from words.ts
// type Goal      = 'akademi' | 'yds' | 'gunluk'; — from words.ts
// type Level     = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'; — from words.ts
type GameId = "rush" | "falling" | "match" | "pairs" | "pinball";
type ClassMode = "solo" | "class"; // solo = kendi başına, class = öğretmen kodu ile
type SpeedMode = "yavas" | "normal" | "hizli" | "auto";
type GateState = "fall" | "ok" | "bad";
type Gate = {
  id: number;
  word: Word;
  leftLabel: string;
  rightLabel: string;
  cLeft: boolean;
  y: number;
  state: GateState;
  opacity: number;
};

// ─────────────────────────────────────────────────────────
// WORD BANKS — replace with: import { WORD_BANKS as ALL_WORDS } from '../../words';
// ─────────────────────────────────────────────────────────
// Words imported from ../../words.ts

// ─────────────────────────────────────────────────────────
// META
// ─────────────────────────────────────────────────────────
const MAX_CUSTOM_SETS = 3;

const GOALS = [
  {
    id: "gunluk" as Goal,
    icon: "💬",
    title: "Günlük Yaşam",
    sub: "Konuşma & günlük kelimeler",
    color: "#34d399",
    bg: "#064e3b",
  },
  {
    id: "akademi" as Goal,
    icon: "🎓",
    title: "Akademi & Sınav",
    sub: "YDS · YÖKDİL · Akademik İngilizce",
    color: "#60a5fa",
    bg: "#1e3a5f",
  },
];
// Online class option shown separately in GoalScreen
const LEVELS: { id: Level; label: string; sub: string; color: string }[] = [
  { id: "A1", label: "A1", sub: "Başlangıç", color: "#34d399" },
  { id: "A2", label: "A2", sub: "Temel", color: "#60a5fa" },
  { id: "B1", label: "B1", sub: "Orta Altı", color: "#f59e0b" },
  { id: "B2", label: "B2", sub: "Orta Üstü", color: "#f97316" },
  { id: "C1", label: "C1", sub: "İleri", color: "#ec4899" },
  { id: "C2", label: "C2", sub: "Ustalık", color: "#a855f7" },
];
const GAMES_META = [
  {
    id: "rush",
    icon: "🚗",
    title: "Araba",
    desc: "Sürükle, kapıdan geç",
    color: "#60a5fa",
  },
  {
    id: "falling",
    icon: "☄️",
    title: "Falling",
    desc: "Düşmeden yakala",
    color: "#f87171",
  },
  {
    id: "match",
    icon: "🔗",
    title: "Eşleştir",
    desc: "Çiftleri bul",
    color: "#34d399",
  },
  {
    id: "pairs",
    icon: "🃏",
    title: "3310 Pairs",
    desc: "Eşleri hafızandan bul",
    color: "#f59e0b",
  },
  {
    id: "pinball",
    icon: "🎱",
    title: "Kelime Pinball",
    desc: "Doğru kova, topla vur!",
    color: "#f59e0b",
  },
];
const SPEEDS: Record<
  SpeedMode,
  { label: string; color: string; base: number }
> = {
  yavas: { label: "🐢 Yavaş", color: "#34d399", base: 52 },
  normal: { label: "⚡ Normal", color: "#60a5fa", base: 90 },
  hizli: { label: "🔥 Hızlı", color: "#f87171", base: 140 },
  auto: { label: "🤖 Otomatik", color: "#c084fc", base: 70 },
};

// ─────────────────────────────────────────────────────────
// SPACED REPETITION
// ─────────────────────────────────────────────────────────
const SR_IV = [6, 20, 60, 150, 400]; // Daha az tekrar

class SREngine {
  private pool: Word[];
  mem: Record<string, { seen: number; correct: number; nextAt: number }> = {};
  private n = 0;
  constructor(w: Word[]) {
    this.pool = [...w].sort(() => Math.random() - 0.5);
  }
  next(): Word {
    this.n++;
    const due = this.pool.filter((w) => this.mem[w.en]?.nextAt <= this.n);
    if (due.length)
      return due.sort(
        (a, b) => this.mem[a.en].nextAt - this.mem[b.en].nextAt,
      )[0];
    const un = this.pool.filter((w) => !this.mem[w.en]);
    if (un.length) return un[0];
    return this.pool[Math.floor(Math.random() * this.pool.length)];
  }
  record(w: Word, ok: boolean) {
    const m = this.mem[w.en];
    const cc = (m?.correct ?? 0) + (ok ? 1 : 0);
    const idx = ok
      ? Math.min(cc, SR_IV.length - 1)
      : Math.max(0, (m?.seen ?? 0) > 1 ? 1 : 0);
    this.mem[w.en] = {
      seen: (m?.seen ?? 0) + 1,
      correct: cc,
      nextAt: this.n + SR_IV[idx],
    };
    this.save();
  }
  getUnique(n: number): Word[] {
    const res: Word[] = [],
      used = new Set<string>();
    const due = this.pool.filter(
      (w) => this.mem[w.en]?.nextAt <= this.n && !used.has(w.en),
    );
    for (const w of due) {
      if (res.length >= n) break;
      res.push(w);
      used.add(w.en);
    }
    const un = this.pool.filter((w) => !this.mem[w.en] && !used.has(w.en));
    for (const w of un) {
      if (res.length >= n) break;
      res.push(w);
      used.add(w.en);
    }
    for (const w of this.pool) {
      if (res.length >= n) break;
      if (!used.has(w.en)) {
        res.push(w);
        used.add(w.en);
      }
    }
    return res;
  }
  count() {
    return Object.keys(this.mem).length;
  }
  getPool() {
    return this.pool;
  }
  getMem() {
    return this.mem;
  }
  save() {
    try {
      const data = JSON.stringify({ mem: this.mem, n: this.n });
      (global as any).__wv_sr = data;
      AsyncStorage.setItem("wv_sr_data", data).catch(() => {});
    } catch (e) {}
  }
  async load() {
    try {
      // Önce global'den dene (hızlı)
      let raw = (global as any).__wv_sr;
      // Yoksa AsyncStorage'dan yükle (kalıcı)
      if (!raw) {
        raw = await AsyncStorage.getItem("wv_sr_data");
        if (raw) (global as any).__wv_sr = raw;
      }
      if (raw) {
        const d = JSON.parse(raw);
        this.mem = d.mem ?? {};
        this.n = d.n ?? 0;
      }
    } catch (e) {}
  }
  async reset() {
    this.mem = {};
    this.n = 0;
    try {
      (global as any).__wv_sr = null;
      await AsyncStorage.removeItem("wv_sr_data");
    } catch (e) {}
  }
}

// ─────────────────────────────────────────────────────────
// SOUND
// ─────────────────────────────────────────────────────────
function makeWAV(freq: number, ms: number, decay = 7): string {
  const sr = 8000,
    n = Math.floor((sr * ms) / 1000),
    buf = new Uint8Array(44 + n);
  const w32 = (o: number, v: number) => {
    buf[o] = v & 255;
    buf[o + 1] = (v >> 8) & 255;
    buf[o + 2] = (v >> 16) & 255;
    buf[o + 3] = (v >> 24) & 255;
  };
  const w16 = (o: number, v: number) => {
    buf[o] = v & 255;
    buf[o + 1] = (v >> 8) & 255;
  };
  const ws = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i);
  };
  ws(0, "RIFF");
  w32(4, 36 + n);
  ws(8, "WAVE");
  ws(12, "fmt ");
  w32(16, 16);
  w16(20, 1);
  w16(22, 1);
  w32(24, sr);
  w32(28, sr);
  w16(32, 1);
  w16(34, 8);
  ws(36, "data");
  w32(40, n);
  for (let i = 0; i < n; i++) {
    const t = i / sr,
      env = Math.exp(-decay * t);
    buf[44 + i] = Math.round(
      (Math.sin(2 * Math.PI * freq * t) * env * 0.8 + 1) * 127.5,
    );
  }
  let b = "";
  buf.forEach((x) => (b += String.fromCharCode(x)));
  return btoa(b);
}
const W_OK = makeWAV(880, 180, 7),
  W_OK2 = makeWAV(1108, 120, 9);
const W_WRONG = makeWAV(380, 280, 6),
  W_WRONG2 = makeWAV(190, 280, 5);
async function playSoundOk() {
  if (!settings.sound) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    });
    const [{ sound: s1 }, { sound: s2 }] = await Promise.all([
      Audio.Sound.createAsync(
        { uri: `data:audio/wav;base64,${W_OK}` },
        { volume: 0.7 },
      ),
      Audio.Sound.createAsync(
        { uri: `data:audio/wav;base64,${W_OK2}` },
        { volume: 0.4 },
      ),
    ]);
    await Promise.all([s1.playAsync(), s2.playAsync()]);
    setTimeout(() => {
      s1.unloadAsync();
      s2.unloadAsync();
    }, 600);
  } catch (_) {}
}

function speakWord(word: string) {
  if (!settings.sound) return;
  try {
    Speech.speak(word, {
      language: "en-US",
      pitch: 1.0,
      rate: 0.85,
    });
  } catch (_) {}
}

async function playSoundError() {
  if (!settings.sound) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    });
    const [{ sound: s1 }, { sound: s2 }] = await Promise.all([
      Audio.Sound.createAsync(
        { uri: `data:audio/wav;base64,${W_WRONG}` },
        { volume: 1.0 },
      ),
      Audio.Sound.createAsync(
        { uri: `data:audio/wav;base64,${W_WRONG2}` },
        { volume: 0.8 },
      ),
    ]);
    await Promise.all([s1.playAsync(), s2.playAsync()]);
    setTimeout(() => {
      s1.unloadAsync();
      s2.unloadAsync();
    }, 400);
  } catch (_) {}
}

// ─────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────
// TOAST — kısa bildirim mesajı
// ─────────────────────────────────────────────────────────
let _toastTimeout: any = null;
let _setToastGlobal: ((msg: string | null) => void) | null = null;

function showToast(msg: string, ms = 1800) {
  if (_setToastGlobal) {
    if (_toastTimeout) clearTimeout(_toastTimeout);
    _setToastGlobal(msg);
    _toastTimeout = setTimeout(() => {
      if (_setToastGlobal) _setToastGlobal(null);
    }, ms);
  }
}

function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    _setToastGlobal = setMsg;
    return () => {
      _setToastGlobal = null;
    };
  }, []);
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: msg ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [msg]);
  if (!msg) return null;
  return (
    <Animated.View
      style={{
        position: "absolute",
        bottom: 80,
        alignSelf: "center",
        zIndex: 99999,
        opacity: fadeAnim,
        backgroundColor: "rgba(15,23,42,0.88)",
        borderRadius: 50,
        paddingVertical: 10,
        paddingHorizontal: 22,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
        {msg}
      </Text>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────
// SOUND WARNING BANNER — tüm oyunlarda kullanılır
// 3 saniye sonra otomatik solar, bir kez gösterilir
// ─────────────────────────────────────────────────────────
function SoundWarningBanner() {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // 2.5sn göster, sonra solar
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
      <Text
        style={{ fontSize: 11, color: "#d97706", fontWeight: "700", flex: 1 }}
      >
        Sesi aç! Kelimelerin okunuşu söyleniyor.
      </Text>
    </Animated.View>
  );
}

function WordToast({ word, visible }: { word: Word | null; visible: boolean }) {
  if (!word) return null;
  return (
    <View style={[ts.wrap, { opacity: visible ? 1 : 0 }]}>
      <Text style={ts.en}>{word.en}</Text>
      <Text style={ts.arr}>→</Text>
      <Text style={ts.tr}>{word.tr}</Text>
    </View>
  );
}
const ts = StyleSheet.create({
  wrap: {
    position: "absolute",
    bottom: 90,
    left: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    borderRadius: 50,
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.12)",
    zIndex: 100,
  },
  en: { color: "#1e1b4b", fontWeight: "700", fontSize: 13 },
  arr: { color: "#94a3b8", fontSize: 11 },
  tr: { color: "#c084fc", fontWeight: "700", fontSize: 13 },
});

// ─────────────────────────────────────────────────────────
// SCREEN WRAPPER — handles safe area properly
// ─────────────────────────────────────────────────────────
function Screen({
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
        paddingBottom: Math.max(insets.bottom, Platform.OS === "android" ? 32 : 0),
        ...style,
      }}
    >
      <StatusBar hidden={false} backgroundColor={bg} barStyle="dark-content" />
      {children}
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// GAME HEADER
// ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────
// PAUSE OVERLAY — tüm oyunlarda kullanılır
// ─────────────────────────────────────────────────────────
function PauseOverlay({
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
      <Text
        style={{
          fontSize: 26,
          fontWeight: "900",
          color: "#fff",
          marginBottom: 4,
        }}
      >
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
        <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>
          ▶ Devam Et
        </Text>
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
        <Text style={{ color: "#94a3b8", fontWeight: "700", fontSize: 15 }}>
          ← Ana Menü
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function GameHeader({
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
    streak >= 10
      ? "#f87171"
      : streak >= 5
        ? "#fbbf24"
        : streak >= 2
          ? "#34d399"
          : "#94a3b8";
  return (
    <View style={gh.wrap}>
      <TouchableOpacity
        onPress={() => {
          hapSel();
          onBack();
        }}
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
              <View
                style={{
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                  borderRadius: 50,
                  backgroundColor: "rgba(59,130,246,0.1)",
                  borderWidth: 1,
                  borderColor: "rgba(59,130,246,0.2)",
                }}
              >
                <Text
                  style={{ fontSize: 10, color: "#3b82f6", fontWeight: "700" }}
                >
                  {level}
                </Text>
              </View>
            )}
            {speed && (
              <View
                style={{
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                  borderRadius: 50,
                  backgroundColor: "rgba(148,163,184,0.1)",
                  borderWidth: 1,
                  borderColor: "rgba(148,163,184,0.2)",
                }}
              >
                <Text
                  style={{ fontSize: 10, color: "#64748b", fontWeight: "700" }}
                >
                  {speed}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
      <View style={gh.right}>
        <Text style={[gh.streak, { color: sc }]}>
          {streak > 0 ? `🔥${streak}` : "—"}
        </Text>
        <Text style={gh.learned}>📚{learned}</Text>
      </View>
    </View>
  );
}
const gh = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148,163,184,0.2)",
  },
  back: {
    paddingVertical: 11,
    paddingHorizontal: 18,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(148,163,184,0.3)",
  },
  backTxt: { fontSize: 15, color: "#334155", fontWeight: "900" },
  title: {
    textAlign: "center",
    fontSize: 18,
    fontWeight: "900",
    color: "#1e1b4b",
    letterSpacing: 0.5,
  },
  right: { alignItems: "flex-end", gap: 3, minWidth: 58 },
  streak: { fontSize: 18, fontWeight: "900" },
  learned: { fontSize: 13, fontWeight: "800", color: "#fbbf24" },
});

// ─────────────────────────────────────────────────────────
// STEP INDICATOR
// ─────────────────────────────────────────────────────────
function Steps({ step, total }: { step: number; total: number }) {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 6,
        justifyContent: "center",
        marginBottom: 24,
      }}
    >
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

// ─────────────────────────────────────────────────────────
// ONBOARDING STEP 1: GOAL
// ─────────────────────────────────────────────────────────
function GoalScreen({
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
              source={require("../../assets/icon.png")}
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
      <View
        style={{
          position: "absolute",
          top: insets.top + 12,
          right: 20,
          zIndex: 100,
        }}
      >
        <TouchableOpacity
          onPress={() => {
            playMenuTick();
            setShowSettings(true);
          }}
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: "rgba(99,102,241,0.1)",
            borderWidth: 1,
            borderColor: "rgba(99,102,241,0.25)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 18 }}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{
          alignItems: "center",
          padding: 24,
          paddingTop: insets.top + 24,
          paddingBottom: Math.max(40, insets.bottom + 24),
        }}
      >
        {/* Globe — emoji + glow, sade ama etkili */}
        <View style={{ alignItems: "center", marginBottom: 14 }}>
          <Animated.View
            style={{
              transform: [{ rotate: rotateY }, { scale: scaleGlobe }],
              shadowColor: "#3b82f6",
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.5,
              shadowRadius: 24,
            }}
          >
            <Text style={{ fontSize: 76 }}>🌍</Text>
          </Animated.View>
          {/* Glow ring */}
          <Animated.View
            style={{
              position: "absolute",
              width: 90,
              height: 90,
              borderRadius: 45,
              borderWidth: 1,
              borderColor: `rgba(59,130,246,0.25)`,
              transform: [{ scale: scaleGlobe }],
            }}
          />
          {/* Shadow */}
          <View
            style={{
              width: 60,
              height: 10,
              borderRadius: 30,
              marginTop: -4,
              backgroundColor: "rgba(59,130,246,0.12)",
            }}
          />
        </View>
        <Text
          style={{
            fontSize: 28,
            fontWeight: "900",
            color: "#1e1b4b",
            letterSpacing: 3,
            marginBottom: 4,
          }}
        >
          WORDVERSE
        </Text>
        <Text
          style={{
            fontSize: 11,
            color: "#94a3b8",
            letterSpacing: 3,
            textTransform: "uppercase",
            marginBottom: 28,
          }}
        >
          Oynayarak İngilizce Öğren
        </Text>
        <Steps step={1} total={3} />
        <Text
          style={{
            fontSize: 15,
            color: "#64748b",
            fontWeight: "700",
            marginBottom: 16,
            textAlign: "center",
          }}
        >
          Ne için öğreniyorsun?
        </Text>
        <View style={{ width: "100%", gap: 12, marginBottom: 32 }}>
          {GOALS.map((g) => (
            <TouchableOpacity
              key={g.id}
              onPress={() => {
                setSel(g.id);
                hapSel();
                playMenuTick();
              }}
              style={{
                width: "100%",
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                backgroundColor: sel === g.id ? g.color + "18" : "#ffffff",
                borderWidth: 1.5,
                borderColor:
                  sel === g.id ? g.color + "77" : "rgba(148,163,184,0.3)",
                borderRadius: 18,
                padding: 16,
              }}
            >
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  backgroundColor: g.bg,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 24 }}>{g.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontWeight: "800",
                    fontSize: 15,
                    color: sel === g.id ? g.color : "#1e293b",
                    marginBottom: 3,
                  }}
                >
                  {g.title}
                </Text>
                <Text style={{ fontSize: 12, color: "#94a3b8" }}>{g.sub}</Text>
              </View>
              {sel === g.id && (
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: g.color,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{ color: "#fff", fontWeight: "900", fontSize: 11 }}
                  >
                    ✓
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
        {/* Online Class Card */}
        <TouchableOpacity
          onPress={() => {
            hapSel();
            playMenuTick();
            if (onCustomSets) onCustomSets();
          }}
          style={{
            width: "100%",
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            backgroundColor: "rgba(245,158,11,0.06)",
            borderWidth: 1.5,
            borderColor: "rgba(245,158,11,0.45)",
            borderRadius: 18,
            padding: 16,
            marginTop: 4,
          }}
        >
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              backgroundColor: "#1e1b4b",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 24 }}>🏫</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginBottom: 3,
              }}
            >
              <Text
                style={{ fontWeight: "800", fontSize: 15, color: "#6366f1" }}
              >
                Hazır Kelime Seti
              </Text>
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 50,
                  backgroundColor: "#f59e0b",
                  shadowColor: "#f59e0b",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.5,
                  shadowRadius: 6,
                  elevation: 4,
                }}
              >
                <Text
                  style={{
                    fontSize: 9,
                    color: "#fff",
                    fontWeight: "900",
                    letterSpacing: 1,
                  }}
                >
                  ✨ YENİ
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 12, color: "#94a3b8" }}>
              6 haneli kod ile set paylaş & indir
            </Text>
          </View>
          <Text style={{ fontSize: 18, color: "rgba(99,102,241,0.4)" }}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            if (sel) {
              playMenuTick();
              onSelect(sel);
            }
          }}
          style={{
            width: "100%",
            paddingVertical: 16,
            borderRadius: 50,
            alignItems: "center",
            backgroundColor: sel ? "#3b82f6" : "rgba(148,163,184,0.3)",
            borderWidth: sel ? 0 : 1,
            borderColor: "rgba(148,163,184,0.35)",
            marginTop: 16,
            marginBottom: Math.max(8, insets.bottom),
          }}
        >
          <Text
            style={{
              fontSize: 15,
              fontWeight: "900",
              color: sel ? "#fff" : "#94a3b8",
              letterSpacing: 1.5,
            }}
          >
            Devam Et →
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            hapSel();
            setShowSupport(true);
          }}
          style={{
            marginTop: 16,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingVertical: 10,
            paddingHorizontal: 20,
            borderRadius: 50,
            backgroundColor: "rgba(251,191,36,0.1)",
            borderWidth: 1,
            borderColor: "rgba(251,191,36,0.3)",
          }}
        >
          <Text style={{ fontSize: 13 }}>☕</Text>
          <Text style={{ fontSize: 12, color: "#d97706", fontWeight: "700" }}>
            Reklamsız · Destek olmak ister misiniz?
          </Text>
        </TouchableOpacity>
        <Text
          style={{
            fontSize: 10,
            color: "#94a3b8",
            marginTop: 10,
            letterSpacing: 2,
          }}
        >
          Ücretsiz · Offline çalışır
        </Text>
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// ONBOARDING STEP 2: LEVEL
// ─────────────────────────────────────────────────────────
function LevelScreen({
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
      style={{ flex: 1, backgroundColor: "#f0f4ff", paddingTop: insets.top }}
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

// ─────────────────────────────────────────────────────────
// HOME SCREEN — STEP 3
// ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────
// LEARNED WORDS SCREEN
// ─────────────────────────────────────────────────────────
// Search bar component
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

function LearnedWordsScreen({
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
      style={{ flex: 1, backgroundColor: "#f8faff", paddingTop: insets.top }}
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

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
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

// ─── Setting toggle button ──────────────────
// Arka plan müziği satırı — toggle + kaydırmalı ses barı
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

function HomeScreen({
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
                source={require("../../assets/icon.png")}
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
            fontSize: 9,
            color: "#94a3b8",
            letterSpacing: 4,
            textTransform: "uppercase",
            fontWeight: "700",
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
            fontSize: 9,
            color: "#94a3b8",
            letterSpacing: 4,
            textTransform: "uppercase",
            fontWeight: "700",
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

// ─────────────────────────────────────────────────────────
// GAME 1: WORD RUSH — Perspektifli yol
// Yol ufka doğru daralıyor (3D his).
// Kapılar uzaktan küçük gelip büyüyor, araba altta.
// ─────────────────────────────────────────────────────────
const RUSH_LIVES = 5;
const GATE_H = 56;
const GAP = 8;
const BALL_R = 18;
const BALL_Y = H * 0.82;

// Perspektif: y=0 (ufuk) → dar, y=H (alt) → geniş
const HORIZ_Y = 0.05; // ufuk noktası (ekranın %5'i — neredeyse üst)
const ROAD_W_BOT = W * 0.88; // altta yol genişliği
const ROAD_W_TOP = W * 0.22; // üstte yol genişliği

// Verilen y koordinatına göre yolun sol/sağ kenarını hesapla
const roadEdge = (y: number) => {
  const pct = Math.max(0, Math.min(1, (y / H - HORIZ_Y) / (1 - HORIZ_Y)));
  const half = ROAD_W_TOP / 2 + (ROAD_W_BOT / 2 - ROAD_W_TOP / 2) * pct;
  return { left: W / 2 - half, right: W / 2 + half, width: half * 2, pct };
};

// Gate y pozisyonuna göre ölçek
const gateScale = (y: number) => {
  const { pct } = roadEdge(y);
  return 0.1 + pct * 0.9;
};

let _gid = 0;
function makeGate(sr: SREngine): Gate {
  const w = sr.next(),
    p = sr.getPool();
  let x: Word;
  do {
    x = p[Math.floor(Math.random() * p.length)];
  } while (x.tr === w.tr);
  const cl = Math.random() < 0.5;
  return {
    id: _gid++,
    word: w,
    cLeft: cl,
    leftLabel: cl ? w.tr : x.tr,
    rightLabel: cl ? x.tr : w.tr,
    y: -GATE_H - 10,
    state: "fall",
    opacity: 1,
  };
}

// Kuşbakışı araba — View kompozisyonu
const TopDownCar = (
  <View style={{ width: 48, height: 72, alignItems: "center" }}>
    {/* Gövde */}
    <View
      style={{
        position: "absolute",
        top: 8,
        left: 4,
        right: 4,
        bottom: 8,
        backgroundColor: "#e2e8f0",
        borderRadius: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
      }}
    >
      {/* Ön cam */}
      <View
        style={{
          position: "absolute",
          top: 6,
          left: 6,
          right: 6,
          height: 14,
          backgroundColor: "#1e293b",
          borderRadius: 6,
          opacity: 0.85,
        }}
      />
      {/* Arka cam */}
      <View
        style={{
          position: "absolute",
          bottom: 6,
          left: 7,
          right: 7,
          height: 11,
          backgroundColor: "#1e293b",
          borderRadius: 5,
          opacity: 0.75,
        }}
      />
      {/* Orta çizgi */}
      <View
        style={{
          position: "absolute",
          top: 24,
          left: 6,
          right: 6,
          height: 12,
          backgroundColor: "#cbd5e1",
          borderRadius: 4,
        }}
      />
      {/* Ön farlar */}
      <View
        style={{
          position: "absolute",
          top: 3,
          left: 4,
          width: 8,
          height: 4,
          backgroundColor: "#fef9c3",
          borderRadius: 2,
        }}
      />
      <View
        style={{
          position: "absolute",
          top: 3,
          right: 4,
          width: 8,
          height: 4,
          backgroundColor: "#fef9c3",
          borderRadius: 2,
        }}
      />
      {/* Arka stop lambaları */}
      <View
        style={{
          position: "absolute",
          bottom: 3,
          left: 4,
          width: 7,
          height: 4,
          backgroundColor: "#ef4444",
          borderRadius: 2,
        }}
      />
      <View
        style={{
          position: "absolute",
          bottom: 3,
          right: 4,
          width: 7,
          height: 4,
          backgroundColor: "#ef4444",
          borderRadius: 2,
        }}
      />
    </View>
    {/* Sol lastikler */}
    <View
      style={{
        position: "absolute",
        top: 10,
        left: 0,
        width: 7,
        height: 12,
        backgroundColor: "#1e293b",
        borderRadius: 3,
      }}
    />
    <View
      style={{
        position: "absolute",
        bottom: 10,
        left: 0,
        width: 7,
        height: 12,
        backgroundColor: "#1e293b",
        borderRadius: 3,
      }}
    />
    {/* Sağ lastikler */}
    <View
      style={{
        position: "absolute",
        top: 10,
        right: 0,
        width: 7,
        height: 12,
        backgroundColor: "#1e293b",
        borderRadius: 3,
      }}
    />
    <View
      style={{
        position: "absolute",
        bottom: 10,
        right: 0,
        width: 7,
        height: 12,
        backgroundColor: "#1e293b",
        borderRadius: 3,
      }}
    />
  </View>
);

function WordRushGame({
  sr,
  speed,
  level,
  onBack,
}: {
  sr: SREngine;
  speed: SpeedMode;
  level: Level;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const base = SPEEDS[speed].base,
    isAuto = speed === "auto";
  const bXA = useRef(new Animated.Value(W / 2)).current;
  const bXR = useRef(W / 2);
  const bYA = useRef(new Animated.Value(BALL_Y)).current;
  const bYR = useRef(BALL_Y);
  const spdR = useRef(base),
    strR = useRef(0),
    livesR = useRef(RUSH_LIVES);
  const rafR = useRef(0),
    ltR = useRef(0);
  const gRef = useRef<Gate[]>([]);
  const isOver = useRef(false);

  const [gates, setGates] = useState<Gate[]>([]);
  const [cw, setCw] = useState("");
  const [flashCw, setFlashCw] = useState(false);
  const flashTmR = useRef<any>(null);
  const wordAnim = useRef(new Animated.Value(1)).current;
  const [streak, setStreak] = useState(0);
  const [lives, setLives] = useState(RUSH_LIVES);
  const [learned, setLearned] = useState(sr.count());
  const [gameOver, setGameOver] = useState(false);
  const [wrongWord, setWrongWord] = useState<Word | null>(null);
  const toastTm = useRef<any>(null);
  const showWrong = (w: Word) => {
    if (toastTm.current) clearTimeout(toastTm.current);
    setWrongWord(w);
    toastTm.current = setTimeout(() => setWrongWord(null), 1200);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (e) => {
        if (isOver.current) return;
        const { left, right } = roadEdge(bYR.current);
        const x = Math.max(
          left + 24,
          Math.min(right - 24, e.nativeEvent.pageX),
        );
        const rawYG = e.nativeEvent.pageY - (insets?.top ?? 0) - 80;
        const y = Math.max(H * HORIZ_Y + 40, Math.min(H * 0.9, rawYG));
        bXR.current = x;
        bXA.setValue(x);
        bYR.current = y;
        bYA.setValue(y);
      },
      onPanResponderMove: (e, gs) => {
        if (isOver.current) return;
        const { left, right } = roadEdge(bYR.current);
        const x = Math.max(
          left + 24,
          Math.min(right - 24, e.nativeEvent.pageX),
        );
        const rawY = e.nativeEvent.pageY - (insets?.top ?? 0) - 80;
        const y = Math.max(H * HORIZ_Y + 40, Math.min(H * 0.9, rawY));
        bXR.current = x;
        bXA.setValue(x);
        bYR.current = y;
        bYA.setValue(y);
      },
    }),
  ).current;

  const [rushRestartKey, setRushRestartKey] = useState(0);
  const [roadOffset, setRoadOffset] = useState(0);
  const roadOffsetRef = useRef(0);
  const [pausedRush, setPausedRush] = useState(false);
  const pausedRushRef = useRef(false);
  const togglePauseRush = () => {
    pausedRushRef.current = !pausedRushRef.current;
    setPausedRush((p) => !p);
  };
  const startRushTimer = () => {}; // süre kısıtı yok

  useEffect(() => {
    isOver.current = false;
    const first = makeGate(sr);
    first.y = H * HORIZ_Y + 20;
    gRef.current = [first];
    setGates([first]);
    setCw(first.word.en);
    // İlk kelime animasyonu
    setTimeout(() => {
      Animated.sequence([
        Animated.timing(wordAnim, {
          toValue: 1.6,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(wordAnim, {
          toValue: 1,
          friction: 4,
          tension: 70,
          useNativeDriver: true,
        }),
      ]).start();
    }, 200);
    ltR.current = performance.now();
    let frame = 0;
    const loop = (now: number) => {
      if (isOver.current) return;
      if (pausedRushRef.current) {
        ltR.current = now;
        rafR.current = requestAnimationFrame(loop);
        return;
      }
      const dt = Math.min((now - ltR.current) / 1000, 0.05);
      ltR.current = now;
      let list = gRef.current,
        changed = false;
      list = list.map((g) =>
        g.state !== "fall"
          ? { ...g, opacity: Math.max(0, g.opacity - dt * 3) }
          : { ...g, y: g.y + spdR.current * dt },
      );
      let added = false;
      list = list.map((gate) => {
        if (gate.state !== "fall") return gate;
        const carY = bYR.current;
        const carX = bXR.current;
        // Kapı arabanın Y pozisyonuna ulaştı mı? (arabanın etrafında ±GATE_H/2)
        const gateTop = gate.y - GATE_H * 0.5;
        const gateBot = gate.y + GATE_H * 0.5;
        if (gateTop > carY + 20 || gateBot < carY - 20) return gate;
        // X: araba hangi şeritte?
        const { left, right } = roadEdge(carY);
        const isLeft = carX < W / 2;
        const hit = isLeft === gate.cLeft;
        if (hit) {
          strR.current++;
          spdR.current = Math.min(spdR.current + (isAuto ? 2 : 3), base * 1.25);
          setStreak(strR.current);
          hap(Haptics.ImpactFeedbackStyle.Light);
          playSoundOk();
          speakWord(gate.word.en);
        } else {
          strR.current = 0;
          spdR.current = Math.max(spdR.current - (isAuto ? 6 : 5), base * 0.75);
          setStreak(0);
          livesR.current = Math.max(0, livesR.current - 1);
          setLives(livesR.current);
          showWrong(gate.word);
          hapHeavy();
          playSoundError();
          if (livesR.current <= 0) {
            isOver.current = true;
            cancelAnimationFrame(rafR.current);
            setGameOver(true);
            return gate;
          }
        }
        sr.record(gate.word, hit);
        setLearned(sr.count());
        if (!added) {
          added = true;
          const nx = makeGate(sr);
          gRef.current = [...gRef.current, nx];
          setCw(nx.word.en);
          Animated.sequence([
            Animated.timing(wordAnim, {
              toValue: 1.45,
              duration: 160,
              useNativeDriver: true,
            }),
            Animated.spring(wordAnim, {
              toValue: 1,
              friction: 4,
              tension: 80,
              useNativeDriver: true,
            }),
          ]).start();
        }
        changed = true;
        return { ...gate, state: hit ? ("ok" as const) : ("bad" as const) };
      });
      list = list.filter((g) => g.y < H + 100 && g.opacity > 0.02);
      if (!list.find((g) => g.state === "fall") && !isOver.current) {
        const nx = makeGate(sr);
        list = [...list, nx];
        setCw(nx.word.en);
        changed = true;
      }
      roadOffsetRef.current = (roadOffsetRef.current + spdR.current * dt) % 60;
      if (frame % 3 === 0) setRoadOffset(roadOffsetRef.current);
      gRef.current = list;
      frame++;
      if (frame % 2 === 0 || changed) setGates([...list]);
      rafR.current = requestAnimationFrame(loop);
    };
    rafR.current = requestAnimationFrame(loop);
    startRushTimer();
    return () => {
      cancelAnimationFrame(rafR.current);
      if (toastTm.current) clearTimeout(toastTm.current);
    };
  }, [sr, base, isAuto, rushRestartKey]);

  const restart = () => {
    cancelAnimationFrame(rafR.current);
    livesR.current = RUSH_LIVES;
    strR.current = 0;
    spdR.current = base;
    setLives(RUSH_LIVES);
    setStreak(0);
    setWrongWord(null);
    isOver.current = false;
    const first = makeGate(sr);
    first.y = H * HORIZ_Y + 20;
    gRef.current = [first];
    setGates([first]);
    setCw(first.word.en);
    setGameOver(false);
    setRushRestartKey((k) => k + 1);
  };

  const sc =
    streak >= 10
      ? "#f87171"
      : streak >= 5
        ? "#fbbf24"
        : streak >= 2
          ? "#34d399"
          : "#94a3b8";
  const sp = SPEEDS[speed];

  return (
    <View
      style={{ flex: 1, backgroundColor: "#1a1a2e", paddingTop: insets.top }}
    >
      {pausedRush && (
        <PauseOverlay onResume={togglePauseRush} onMenu={onBack} />
      )}
      <StatusBar backgroundColor="#1a1a2e" barStyle="light-content" />

      {/* Header */}
      <View
        style={{
          backgroundColor: "#1a1a2e",
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.08)",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 14,
            paddingTop: 12,
            paddingBottom: 8,
            gap: 8,
          }}
        >
          <TouchableOpacity
            onPress={() => {
              hapSel();
              onBack();
            }}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 14,
              backgroundColor: "rgba(255,255,255,0.08)",
              borderRadius: 10,
            }}
          >
            <Text style={{ fontSize: 13, color: "#94a3b8", fontWeight: "700" }}>
              ← Menü
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={togglePauseRush}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 10,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderRadius: 10,
            }}
          >
            <Text style={{ fontSize: 15 }}>⏸️</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <View style={{ flexDirection: "row", gap: 2 }}>
            {Array.from({ length: RUSH_LIVES }).map((_, i) => (
              <Text
                key={i}
                style={{ fontSize: 15, opacity: i < lives ? 1 : 0.15 }}
              >
                ❤️
              </Text>
            ))}
          </View>
          <Text style={{ fontSize: 12, fontWeight: "900", color: sc }}>
            {streak > 0 ? `🔥${streak}` : ""}
          </Text>
        </View>
        <SoundWarningBanner />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 14,
            paddingBottom: 12,
            paddingTop: 8,
            gap: 8,
          }}
        >
          {/* Animasyonlu kelime */}
          <Animated.Text
            style={{
              fontSize: 22,
              fontWeight: "900",
              color: "#fff",
              letterSpacing: 1,
              transform: [{ scale: wordAnim }],
              textShadowColor: "rgba(99,102,241,0.6)",
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 8,
            }}
          >
            {cw}
          </Animated.Text>
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 50,
              backgroundColor: sp.color + "22",
              borderWidth: 1,
              borderColor: sp.color + "44",
            }}
          >
            <Text style={{ fontSize: 11, color: sp.color, fontWeight: "700" }}>
              {sp.label}
            </Text>
          </View>
          {level && (
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 50,
                backgroundColor: "rgba(99,102,241,0.15)",
                borderWidth: 1,
                borderColor: "rgba(99,102,241,0.3)",
              }}
            >
              <Text
                style={{ fontSize: 11, color: "#6366f1", fontWeight: "700" }}
              >
                📚 {level}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Road — perspektif */}
      <View
        style={{ flex: 1, overflow: "hidden", position: "relative" }}
        {...pan.panHandlers}
      >
        {/* Koyu yol zemini */}
        <View
          style={{ position: "absolute", inset: 0, backgroundColor: "#2d3748" }}
        />
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: H * HORIZ_Y,
            backgroundColor: "#1e2d3d",
            opacity: 0.6,
          }}
        />

        {/* Hareketli sarı kenar noktaları */}
        {Array.from({ length: 22 }).map((_, i) => {
          const spacing = 55;
          const rawY = H * HORIZ_Y + i * spacing + roadOffset - spacing;
          if (rawY < H * HORIZ_Y - 10 || rawY > H) return null;
          const t = Math.max(0, (rawY / H - HORIZ_Y) / (1 - HORIZ_Y));
          const { left, right } = roadEdge(rawY);
          const thick = Math.max(2, t * 6);
          const h = Math.max(3, t * 10);
          return (
            <React.Fragment key={i}>
              <View
                style={{
                  position: "absolute",
                  top: rawY,
                  left: left,
                  width: thick,
                  height: h,
                  backgroundColor: "#f59e0b",
                  opacity: 0.7 + t * 0.2,
                  borderRadius: 1,
                }}
              />
              <View
                style={{
                  position: "absolute",
                  top: rawY,
                  left: right - thick,
                  width: thick,
                  height: h,
                  backgroundColor: "#f59e0b",
                  opacity: 0.7 + t * 0.2,
                  borderRadius: 1,
                }}
              />
            </React.Fragment>
          );
        })}

        {/* Hareketli kesik orta çizgi */}
        {Array.from({ length: 22 }).map((_, i) => {
          const spacing = 60;
          const rawY = H * HORIZ_Y + i * spacing + roadOffset - spacing;
          if (rawY < H * HORIZ_Y || rawY > H) return null;
          const t = (rawY / H - HORIZ_Y) / (1 - HORIZ_Y);
          const h = Math.max(4, t * 28);
          return (
            <View
              key={i}
              style={{
                position: "absolute",
                top: rawY,
                left: W / 2 - 2,
                width: Math.max(2, t * 5),
                height: h,
                borderRadius: 2,
                backgroundColor: `rgba(255,255,255,${0.15 + t * 0.15})`,
              }}
            />
          );
        })}

        {/* Kapılar */}
        {gates.map((gate) => {
          const sc2 = gateScale(gate.y);
          const { left, width } = roadEdge(gate.y);
          const lG = gate.state === "ok" && gate.cLeft,
            rG = gate.state === "ok" && !gate.cLeft;
          const lR = gate.state === "bad" && gate.cLeft,
            rR = gate.state === "bad" && !gate.cLeft;
          const gw = width / 2 - GAP * sc2;
          const gh = GATE_H * sc2;
          return (
            <View
              key={gate.id}
              style={{
                position: "absolute",
                top: gate.y - gh / 2,
                left: left,
                width: width,
                flexDirection: "row",
                gap: GAP * sc2,
                opacity: gate.opacity,
              }}
            >
              {/* Sol şerit */}
              <View
                style={{
                  width: gw,
                  height: gh,
                  borderRadius: 10 * sc2,
                  backgroundColor: lG
                    ? "rgba(52,211,153,0.15)"
                    : lR
                      ? "rgba(239,68,68,0.15)"
                      : "rgba(99,102,241,0.08)",
                  borderWidth: lG || lR ? 2.5 * sc2 : 1.5 * sc2,
                  borderColor: lG ? "#34d399" : lR ? "#f87171" : "#6366f1",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {gate.leftLabel.includes("/") ? (
                  gate.leftLabel.split("/").map((p: string, pi: number) => (
                    <Text
                      key={pi}
                      style={{
                        color: lG ? "#34d399" : lR ? "#f87171" : "#f1f5f9",
                        fontWeight: "900",
                        fontSize: Math.max(8, 12 * sc2),
                        textAlign: "center",
                      }}
                    >
                      {p.trim()}
                    </Text>
                  ))
                ) : (
                  <Text
                    style={{
                      color: lG ? "#34d399" : lR ? "#f87171" : "#f1f5f9",
                      fontWeight: "900",
                      fontSize: Math.max(9, 14 * sc2),
                      letterSpacing: 0.5,
                      textAlign: "center",
                    }}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                  >
                    {gate.leftLabel}
                  </Text>
                )}
              </View>
              {/* Sağ şerit */}
              <View
                style={{
                  width: gw,
                  height: gh,
                  borderRadius: 10 * sc2,
                  backgroundColor: rG
                    ? "rgba(52,211,153,0.15)"
                    : rR
                      ? "rgba(239,68,68,0.15)"
                      : "rgba(99,102,241,0.08)",
                  borderWidth: rG || rR ? 2.5 * sc2 : 1.5 * sc2,
                  borderColor: rG ? "#34d399" : rR ? "#f87171" : "#6366f1",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {gate.rightLabel.includes("/") ? (
                  gate.rightLabel.split("/").map((p: string, pi: number) => (
                    <Text
                      key={pi}
                      style={{
                        color: rG ? "#34d399" : rR ? "#f87171" : "#f1f5f9",
                        fontWeight: "900",
                        fontSize: Math.max(8, 12 * sc2),
                        textAlign: "center",
                      }}
                    >
                      {p.trim()}
                    </Text>
                  ))
                ) : (
                  <Text
                    style={{
                      color: rG ? "#34d399" : rR ? "#f87171" : "#f1f5f9",
                      fontWeight: "900",
                      fontSize: Math.max(9, 14 * sc2),
                      letterSpacing: 0.5,
                      textAlign: "center",
                    }}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                  >
                    {gate.rightLabel}
                  </Text>
                )}
              </View>
            </View>
          );
        })}

        {/* Yanlış kelime hint */}
        {wrongWord && (
          <View
            style={{
              position: "absolute",
              top: 10,
              alignSelf: "center",
              zIndex: 99,
              backgroundColor: "rgba(15,23,42,0.9)",
              borderRadius: 10,
              paddingVertical: 5,
              paddingHorizontal: 12,
              borderWidth: 1,
              borderColor: "rgba(248,113,113,0.4)",
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "800", color: "#f87171" }}>
              {wrongWord.en} = {wrongWord.tr}
            </Text>
          </View>
        )}

        {/* Araba — kuşbakışı SVG */}
        <Animated.View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            transform: [
              { translateX: Animated.subtract(bXA, 24) },
              { translateY: Animated.subtract(bYA, 36) },
            ],
            width: 48,
            height: 72,
          }}
        >
          {TopDownCar}
        </Animated.View>

        <Text
          style={{
            position: "absolute",
            bottom: 14,
            alignSelf: "center",
            color: "rgba(255,255,255,0.12)",
            fontSize: 11,
            letterSpacing: 2,
          }}
        >
          parmağını sürükle
        </Text>
      </View>

      {gameOver && (
        <View
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: "rgba(15,23,42,0.92)",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
          }}
        >
          <Text style={{ fontSize: 52, marginBottom: 10 }}>🏎️</Text>
          <Text
            style={{
              fontSize: 26,
              fontWeight: "900",
              color: "#fff",
              marginBottom: 4,
            }}
          >
            Oyun Bitti!
          </Text>
          <Text style={{ fontSize: 13, color: "#34d399", marginBottom: 24 }}>
            Öğrenilen: 📚{learned}
          </Text>
          <TouchableOpacity
            onPress={restart}
            style={{
              backgroundColor: "#3b82f6",
              paddingVertical: 14,
              paddingHorizontal: 44,
              borderRadius: 50,
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
              Tekrar Oyna
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// GAME 2: FALLING
// ─────────────────────────────────────────────────────────
function FallingGame({
  sr,
  speed,
  level,
  onBack,
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
    const wr = [...pool]
      .sort(() => Math.random() - 0.5)
      .filter((x) => x.tr !== w.tr)
      .slice(0, 3);
    return {
      word: w,
      opts: [w.tr, ...wr.map((x) => x.tr)].sort(() => Math.random() - 0.5),
      pct: 0,
    };
  };
  const [q, setQ] = useState(mkQ);
  const [streak, setStreak] = useState(0);
  const [learned, setLearned] = useState(sr.count());
  const MOTIV = [
    "Süper! 🔥",
    "Aferin! ✨",
    "Harika! 🎯",
    "Mükemmel! 💫",
    "Devam et! 🚀",
    "Oo! 👏",
    "Ooo! 🌟",
    "İnanılmaz! ⚡",
    "Çok iyi! 🎉",
  ];
  const [done, setDone] = useState(false);
  const [wrongPopup, setWrongPopup] = useState<Word | null>(null);
  const [correctMsg, setCorrectMsg] = useState<string | null>(null);
  const [greenFlash, setGreenFlash] = useState(false);
  const FALL_LIVES = 3;
  const [lives, setLives] = useState(FALL_LIVES);
  const livesRef = useRef(FALL_LIVES);
  const [gameOver, setGameOver] = useState(false);
  const [fallRestartKey, setFallRestartKey] = useState(0);
  const fallSpeed = SPEEDS[speed].base / 5.5;
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const rafR = useRef(0),
    ltR = useRef(performance.now()),
    fallR = useRef(0),
    spdR = useRef(fallSpeed),
    hintTm = useRef<any>(null),
    greenTm = useRef<any>(null);
  const showWrongPopup = (w: Word) => {
    if (hintTm.current) clearTimeout(hintTm.current);
    setWrongPopup(w);
    hintTm.current = setTimeout(() => setWrongPopup(null), 1600);
  };
  const showCorrect = (streak: number) => {
    const msg = MOTIV[Math.min(streak, MOTIV.length - 1)];
    setCorrectMsg(msg);
    setGreenFlash(true);
    if (greenTm.current) clearTimeout(greenTm.current);
    greenTm.current = setTimeout(() => {
      setCorrectMsg(null);
      setGreenFlash(false);
    }, 700);
  };
  const nextQ = useCallback(() => {
    fallR.current = 0;
    ltR.current = performance.now();
    setQ(mkQ());
    setDone(false);
  }, []);
  useEffect(() => {
    cancelAnimationFrame(rafR.current);
    const tick = (now: number) => {
      if (pausedRef.current) {
        ltR.current = now;
        rafR.current = requestAnimationFrame(tick);
        return;
      }
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
        if (livesRef.current <= 0) {
          setGameOver(true);
          return;
        }
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
      if (livesRef.current <= 0) {
        setGameOver(true);
        return;
      }
    }
    setTimeout(nextQ, ok ? 700 : 800);
  };
  const danger = q.pct > 70;
  const togglePause = () => {
    pausedRef.current = !pausedRef.current;
    setPaused((p) => !p);
  };
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: greenFlash
          ? "#f0fdf4"
          : danger
            ? "#fff1f2"
            : "#f0f9ff",
        paddingTop: insets.top,
      }}
    >
      <StatusBar backgroundColor="#f0f4ff" barStyle="dark-content" />
      <GameHeader
        title="🪂 Kurtar!"
        streak={streak}
        learned={learned}
        onBack={onBack}
        level={level}
        speed={SPEEDS[speed].label}
        onPause={togglePause}
      />
      <SoundWarningBanner />
      {/* Canlar */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          gap: 4,
          paddingVertical: 6,
          backgroundColor: "#fff",
        }}
      >
        {Array.from({ length: FALL_LIVES }).map((_, i) => (
          <Text key={i} style={{ fontSize: 16, opacity: i < lives ? 1 : 0.15 }}>
            ❤️
          </Text>
        ))}
      </View>
      {paused && <PauseOverlay onResume={togglePause} onMenu={onBack} />}
      <View style={{ flex: 1, padding: 14 }}>
        {/* Düşüş alanı — hikayeleştirilmiş */}
        <View
          style={{
            flex: 1,
            borderRadius: 20,
            marginBottom: 12,
            overflow: "hidden",
            backgroundColor: danger ? "#fff1f2" : "#f0f9ff",
            borderWidth: 1.5,
            borderColor: danger
              ? "rgba(239,68,68,0.3)"
              : "rgba(186,230,253,0.5)",
            position: "relative",
          }}
        >
          {/* Zemin — kırık cam efekti */}
          <View
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 28,
              backgroundColor: danger
                ? "rgba(239,68,68,0.12)"
                : "rgba(148,163,184,0.08)",
              borderTopWidth: 2,
              borderTopColor: danger
                ? "rgba(239,68,68,0.3)"
                : "rgba(148,163,184,0.2)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 14 }}>{""}</Text>
          </View>
          {/* Düşüş sayacı çizgisi */}
          <View
            style={{
              position: "absolute",
              bottom: 28,
              left: 0,
              right: 0,
              height: 3,
            }}
          >
            <View
              style={{
                height: "100%",
                width: `${q.pct}%`,
                backgroundColor: danger
                  ? "#ef4444"
                  : q.pct > 45
                    ? "#f59e0b"
                    : "#3b82f6",
                borderRadius: 3,
              }}
            />
          </View>
          {/* Düşen nesne */}
          <View
            style={{
              position: "absolute",
              alignSelf: "center",
              top: `${Math.min(q.pct * 0.76, 72)}%` as any,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: danger ? 30 : 26, marginBottom: 4 }}>
              {"🪂"}
            </Text>
            <View
              style={{
                backgroundColor: danger
                  ? "rgba(239,68,68,0.1)"
                  : "rgba(59,130,246,0.08)",
                borderRadius: 14,
                paddingVertical: 8,
                paddingHorizontal: 16,
                borderWidth: danger ? 2 : 1.5,
                borderColor: danger
                  ? "rgba(239,68,68,0.4)"
                  : "rgba(59,130,246,0.2)",
              }}
            >
              <Text
                style={{
                  fontSize: 28,
                  fontWeight: "900",
                  color: danger ? "#ef4444" : "#1e293b",
                  letterSpacing: 2,
                  textAlign: "center",
                }}
              >
                {q.word.en}
              </Text>
            </View>
          </View>
          {/* Üst ipucu */}
          <Text
            style={{
              position: "absolute",
              top: 10,
              alignSelf: "center",
              fontSize: 9,
              color: danger ? "rgba(239,68,68,0.5)" : "rgba(148,163,184,0.5)",
              letterSpacing: 3,
              textTransform: "uppercase",
              fontWeight: "700",
            }}
          >
            {danger ? "HIZLA KURTAR! ⚡" : "Türkçesini seç"}
          </Text>
        </View>
        {/* Cevap butonları */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {q.opts.map((opt, i) => (
            <TouchableOpacity
              key={`${opt}-${i}`}
              onPress={() => answer(opt)}
              style={{
                width: (W - 52) / 2,
                paddingVertical: 20,
                borderRadius: 16,
                backgroundColor: "#ffffff",
                borderWidth: 1.5,
                borderColor: "rgba(148,163,184,0.28)",
                alignItems: "center",
                shadowColor: "#94a3b8",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.08,
                shadowRadius: 4,
                elevation: 2,
              }}
            >
              <Text
                style={{ color: "#334155", fontWeight: "800", fontSize: 16 }}
              >
                {opt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      {/* Game Over */}
      {gameOver && (
        <View
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: "rgba(15,23,42,0.9)",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
          }}
        >
          <Text style={{ fontSize: 52, marginBottom: 10 }}>🪂</Text>
          <Text
            style={{
              fontSize: 26,
              fontWeight: "900",
              color: "#fff",
              marginBottom: 4,
            }}
          >
            Yere Çakıldı!
          </Text>
          <Text style={{ fontSize: 13, color: "#34d399", marginBottom: 24 }}>
            Öğrenilen: 📚{learned}
          </Text>
          <TouchableOpacity
            onPress={() => {
              livesRef.current = FALL_LIVES;
              setLives(FALL_LIVES);
              setGameOver(false);
              setStreak(0);
              fallR.current = 0;
              setFallRestartKey((k) => k + 1);
            }}
            style={{
              backgroundColor: "#3b82f6",
              paddingVertical: 14,
              paddingHorizontal: 44,
              borderRadius: 50,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>
              Tekrar Oyna
            </Text>
          </TouchableOpacity>
        </View>
      )}
      {/* Correct motivational message */}
      {correctMsg && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 98,
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <Text
            style={{
              fontSize: 42,
              fontWeight: "900",
              color: "#16a34a",
              textShadowColor: "rgba(34,197,94,0.3)",
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 16,
            }}
          >
            {correctMsg}
          </Text>
        </View>
      )}
      {/* Wrong popup — centered, big */}
      {wrongPopup && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 99,
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <View
            style={{
              backgroundColor: "rgba(254,242,242,0.98)",
              borderRadius: 20,
              paddingVertical: 28,
              paddingHorizontal: 36,
              borderWidth: 2,
              borderColor: "rgba(239,68,68,0.35)",
              shadowColor: "#ef4444",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.2,
              shadowRadius: 24,
              alignItems: "center",
              maxWidth: 280,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                color: "#94a3b8",
                letterSpacing: 2,
                textTransform: "uppercase",
                fontWeight: "700",
                marginBottom: 8,
              }}
            >
              Doğru Cevap
            </Text>
            <Text
              style={{
                fontSize: 32,
                fontWeight: "900",
                color: "#ef4444",
                letterSpacing: 2,
                marginBottom: 4,
              }}
            >
              {wrongPopup.en}
            </Text>
            <View
              style={{
                width: 40,
                height: 2,
                backgroundColor: "rgba(239,68,68,0.3)",
                marginBottom: 8,
              }}
            />
            <Text style={{ fontSize: 22, fontWeight: "800", color: "#1e293b" }}>
              {wrongPopup.tr}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// GAME 4: MATCH
// ─────────────────────────────────────────────────────────
function MatchGame({
  sr,
  speed,
  level,
  onBack,
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
  const [matched, setMatched] = useState<Set<string>>(new Set()); // set of en keys
  const [selEn, setSelEn] = useState<string | null>(null); // selected left card (en key)
  const [selTr, setSelTr] = useState<string | null>(null); // selected right card (en key)
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
  const MATCH_TIME = 45;
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
      if (matchTimeRef.current <= 0) {
        clearInterval(matchTimerRef.current);
        setGameOver(true);
      }
    }, 1000);
  };
  useEffect(() => {
    startMatchTimer();
    return () => clearInterval(matchTimerRef.current);
  }, []);

  // After both sides selected, check match
  useEffect(() => {
    if (!selEn || !selTr) return;
    if (selEn === selTr) {
      // Correct!
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
          // Reset timer for new level
          matchTimeRef.current = MATCH_TIME;
          setMatchTime(MATCH_TIME);
        }, 400);
      }
    } else {
      // Wrong
      const wrongWord =
        round.ws.find((x) => x.en === selEn) ||
        round.right.find((x) => x.en === selTr);
      setWrongEn(selEn);
      livesRef.current = Math.max(0, livesRef.current - 1);
      setLives(livesRef.current);
      if (wrongWord) showWrongHint(wrongWord);
      hapHeavy();
      playSoundError();
      if (livesRef.current <= 0) setTimeout(() => setGameOver(true), 400);
      setTimeout(() => {
        setWrongEn(null);
        setSelEn(null);
        setSelTr(null);
      }, 450);
    }
  }, [selEn, selTr]);

  const tapEn = (en: string) => {
    if (matched.has(en)) return;
    setSelEn(en);
  };
  const tapTr = (en: string) => {
    if (matched.has(en)) return;
    setSelTr(en);
  };

  return (
    <View
      style={{ flex: 1, backgroundColor: "#f0f4ff", paddingTop: insets.top }}
    >
      <StatusBar backgroundColor="#f0f4ff" barStyle="dark-content" />
      {pausedMatch && (
        <PauseOverlay onResume={togglePauseMatch} onMenu={onBack} />
      )}
      <SoundWarningBanner />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 14,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(148,163,184,0.15)",
        }}
      >
        <TouchableOpacity
          onPress={() => {
            hapSel();
            onBack();
          }}
          style={{
            paddingVertical: 6,
            paddingHorizontal: 10,
            backgroundColor: "#fff",
            borderRadius: 10,
            borderWidth: 1,
            borderColor: "rgba(148,163,184,0.25)",
          }}
        >
          <Text style={{ fontSize: 12, color: "#94a3b8", fontWeight: "700" }}>
            ← Menü
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={togglePauseMatch}
          style={{
            paddingVertical: 6,
            paddingHorizontal: 8,
            backgroundColor: "rgba(148,163,184,0.1)",
            borderRadius: 10,
            marginLeft: 4,
          }}
        >
          <Text style={{ fontSize: 14 }}>⏸️</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center", gap: 2 }}>
          <Text style={{ fontSize: 16, fontWeight: "900", color: "#1e1b4b" }}>
            🔗 Eşleştir
          </Text>
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 50,
              backgroundColor: "rgba(52,211,153,0.12)",
              borderWidth: 1,
              borderColor: "rgba(52,211,153,0.3)",
            }}
          >
            <Text
              style={{
                fontSize: 9,
                color: "#34d399",
                fontWeight: "700",
                letterSpacing: 1,
              }}
            >
              SEVİYE {pairCount}/10 · {level}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 3,
              backgroundColor:
                matchTime <= 10
                  ? "rgba(239,68,68,0.1)"
                  : "rgba(148,163,184,0.08)",
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 50,
            }}
          >
            <Text style={{ fontSize: 16 }}>
              {matchTime <= 10 ? "💥" : "⏱️"}
            </Text>
            <Text
              style={{
                fontSize: 15,
                fontWeight: "900",
                color:
                  matchTime <= 10
                    ? "#ef4444"
                    : matchTime <= 20
                      ? "#f97316"
                      : "#64748b",
              }}
            >
              {matchTime}s
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 2 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Text
                key={i}
                style={{ fontSize: 14, opacity: i < lives ? 1 : 0.15 }}
              >
                ❤️
              </Text>
            ))}
          </View>
        </View>
      </View>
      {wrongHint && (
        <View
          style={{
            marginHorizontal: 14,
            marginTop: 8,
            backgroundColor: "rgba(254,242,242,0.97)",
            borderRadius: 10,
            paddingVertical: 6,
            paddingHorizontal: 12,
            borderWidth: 1,
            borderColor: "rgba(248,113,113,0.3)",
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "800", color: "#ef4444" }}>
            {wrongHint?.en} = {wrongHint?.tr}
          </Text>
        </View>
      )}
      <View style={{ flex: 1, padding: 14, justifyContent: "center" }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, gap: 8 }}>
            {round.ws.map((w) => {
              const isM = matched.has(w.en);
              const isS = selEn === w.en;
              const isW = wrongEn === w.en;
              return (
                <TouchableOpacity
                  key={`en-${w.en}`}
                  onPress={() => tapEn(w.en)}
                  disabled={isM}
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    minHeight: 52,
                    justifyContent: "center",
                    backgroundColor: isM
                      ? "rgba(148,163,184,0.06)"
                      : isS
                        ? "rgba(59,130,246,0.1)"
                        : isW
                          ? "rgba(248,113,113,0.08)"
                          : "#ffffff",
                    borderWidth: 1.5,
                    borderColor: isM
                      ? "rgba(148,163,184,0.08)"
                      : isS
                        ? "rgba(96,165,250,.6)"
                        : isW
                          ? "rgba(248,113,113,.5)"
                          : "rgba(148,163,184,0.3)",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontWeight: "800",
                      fontSize: 14,
                      color: isM
                        ? "rgba(148,163,184,0.25)"
                        : isS
                          ? "#3b82f6"
                          : isW
                            ? "#ef4444"
                            : "#1e293b",
                      textDecorationLine: isM ? "line-through" : "none",
                    }}
                  >
                    {w.en}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            {round.right.map((item) => {
              const isM = matched.has(item.en);
              const isS = selTr === item.en;
              return (
                <TouchableOpacity
                  key={`tr-${item.en}`}
                  onPress={() => tapTr(item.en)}
                  disabled={isM}
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    minHeight: 52,
                    justifyContent: "center",
                    backgroundColor: isM
                      ? "rgba(148,163,184,0.06)"
                      : isS
                        ? "rgba(251,191,36,.12)"
                        : "#ffffff",
                    borderWidth: 1.5,
                    borderColor: isM
                      ? "rgba(148,163,184,0.08)"
                      : isS
                        ? "rgba(251,191,36,.6)"
                        : "rgba(251,191,36,.25)",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontWeight: "800",
                      fontSize: 14,
                      color: isM
                        ? "rgba(148,163,184,0.25)"
                        : isS
                          ? "#d97706"
                          : "#92400e",
                      textDecorationLine: isM ? "line-through" : "none",
                    }}
                  >
                    {item.tr}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
      {gameOver && (
        <View
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: "rgba(15,23,42,0.88)",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
          }}
        >
          <Text style={{ fontSize: 52, marginBottom: 10 }}>💔</Text>
          <Text
            style={{
              fontSize: 26,
              fontWeight: "900",
              color: "#fff",
              marginBottom: 4,
            }}
          >
            Oyun Bitti!
          </Text>
          <Text style={{ fontSize: 13, color: "#34d399", marginBottom: 24 }}>
            Öğrenilen: 📚{learned}
          </Text>
          <TouchableOpacity
            onPress={() => {
              setGameOver(false);
              livesRef.current = 4;
              setLives(4);
              setStreak(0);
              pairCountRef.current = 2;
              setPairCount(2);
              setRound(mkR(2));
              setMatched(new Set());
              setSelEn(null);
              setSelTr(null);
              matchTimeRef.current = MATCH_TIME;
              setMatchTime(MATCH_TIME);
            }}
            style={{
              backgroundColor: "#3b82f6",
              paddingVertical: 14,
              paddingHorizontal: 44,
              borderRadius: 50,
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
              Tekrar Oyna
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// GAME 5: BALON AVCISI (AA style)
// Ortada İngilizce kelime, etrafında Türkçe kelimeler.
// Dogru Turkcey dokun - patlat!
// ─────────────────────────────────────────────────────────
// GAME 5: BALON AVCISI — Ok ile patlat!
// Her çubukta bir balon var. Ortada hedef (Türkçe).
// Ekrana bas → en alttaki çubuğun balonundan ok fırlar → merkeze doğru gider.
// Doğruysa patlat! Yanlışsa can git.
// Level 1: 3 spoke, her round +1, max 9
function BombExplosion({ onDone }: { onDone: () => void }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.8,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.5,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1.4,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
    hapHeavy();
    const t = setTimeout(() => onDone(), 2200);
    return () => clearTimeout(t);
  }, []);
  return (
    <View
      style={{
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(15,23,42,0.93)",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
      }}
    >
      <Animated.Text
        style={{ fontSize: 70, transform: [{ scale: scaleAnim }] }}
      >
        💣
      </Animated.Text>
      <Text
        style={{
          fontSize: 26,
          fontWeight: "900",
          color: "#fff",
          marginTop: 16,
        }}
      >
        BOOM!
      </Text>
      <Text style={{ fontSize: 14, color: "#94a3b8", marginTop: 6 }}>
        Yeni oyun başlıyor...
      </Text>
    </View>
  );
}

function PairsGame({
  sr,
  level,
  onBack,
}: {
  sr: SREngine;
  level: Level;
  onBack: () => void;
}) {
  const [pausedPairs, setPausedPairs] = useState(false);
  const togglePausePairs = () => setPausedPairs((p) => !p);
  const insets = useSafeAreaInsets();

  const mkDeck = useCallback(() => {
    const words = sr.getUnique(6); // 6 pairs = 12 cards (3x4)
    const cards = [
      ...words.map((w, i) => ({
        id: i * 2,
        word: w,
        side: "en" as const,
        flipped: false,
        matched: false,
        shake: false,
      })),
      ...words.map((w, i) => ({
        id: i * 2 + 1,
        word: w,
        side: "tr" as const,
        flipped: false,
        matched: false,
        shake: false,
      })),
    ].sort(() => Math.random() - 0.5);
    return cards;
  }, [sr]);

  type PCard = {
    id: number;
    word: Word;
    side: "en" | "tr";
    flipped: boolean;
    matched: boolean;
    shake: boolean;
  };
  const [deck, setDeck] = useState<PCard[]>(mkDeck);
  const firstRef = useRef<PCard | null>(null);
  const lockedRef = useRef(false);
  const [moves, setMoves] = useState(0);
  const [matchedN, setMatchedN] = useState(0);
  const [streak, setStreak] = useState(0);
  const [learned, setLearned] = useState(sr.count());
  const BOMB_SEC = 60; // 60 saniye
  const [elapsed, setElapsed] = useState(0);
  const [won, setWon] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const timerRef = useRef<any>(null);
  const startRef = useRef(Date.now());

  // Timer starts ONCE — not reset on every deck change
  useEffect(() => {
    startRef.current = Date.now();
    setElapsed(0);
    setTimeUp(false);
    timerRef.current = setInterval(() => {
      const e = Math.floor((Date.now() - startRef.current) / 1000);
      setElapsed(e);
      if (e >= BOMB_SEC) {
        clearInterval(timerRef.current);
        setTimeUp(true);
      }
    }, 500); // check every 500ms for smoother countdown
    return () => clearInterval(timerRef.current);
  }, []); // empty deps — only run ONCE on mount

  const tap = (card: PCard) => {
    if (lockedRef.current || card.flipped || card.matched) return;
    const prev = firstRef.current;
    // Flip tapped card immediately
    setDeck((d) =>
      d.map((c) => (c.id === card.id ? { ...c, flipped: true } : c)),
    );
    if (!prev) {
      firstRef.current = card;
      return;
    }
    // Second card tapped
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
      setDeck((d) =>
        d.map((c) =>
          c.word.en === card.word.en
            ? { ...c, matched: true, flipped: true }
            : c,
        ),
      );
      const nm = matchedN + 1;
      setMatchedN(nm);
      if (nm === 6) {
        clearInterval(timerRef.current);
        setWon(true);
      }
      lockedRef.current = false;
    } else {
      setStreak(0);
      // Shake wrong cards then flip back
      setDeck((d) =>
        d.map((c) =>
          c.id === card.id || c.id === prev.id ? { ...c, shake: true } : c,
        ),
      );
      setTimeout(() => {
        setDeck((d) =>
          d.map((c) =>
            !c.matched && (c.id === card.id || c.id === prev.id)
              ? { ...c, flipped: false, shake: false }
              : c,
          ),
        );
        lockedRef.current = false;
      }, 700);
    }
  };

  const newGame = () => {
    setDeck(mkDeck());
    firstRef.current = null;
    lockedRef.current = false;
    setMoves(0);
    setMatchedN(0);
    setStreak(0);
    setWon(false);
    setTimeUp(false);
    startRef.current = Date.now();
    setElapsed(0);
  };

  const COLS = 3;
  const CARD_W = Math.floor((W - 48) / COLS);
  const CARD_H = CARD_W * 0.72;
  const sc =
    streak >= 4
      ? "#f87171"
      : streak >= 2
        ? "#fbbf24"
        : streak >= 1
          ? "#34d399"
          : "#94a3b8";
  const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const secs = String(elapsed % 60).padStart(2, "0");

  return (
    <View
      style={{ flex: 1, backgroundColor: "#f8faff", paddingTop: insets.top }}
    >
      <StatusBar backgroundColor="#f8faff" barStyle="dark-content" />
      <SoundWarningBanner />

      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 14,
          paddingVertical: 16,
          backgroundColor: "#fff",
          borderBottomWidth: 1,
          borderBottomColor: "rgba(148,163,184,0.15)",
        }}
      >
        <TouchableOpacity
          onPress={() => {
            hapSel();
            onBack();
          }}
          style={{
            paddingVertical: 9,
            paddingHorizontal: 14,
            backgroundColor: "#f1f5f9",
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: "rgba(148,163,184,0.3)",
          }}
        >
          <Text style={{ fontSize: 14, color: "#64748b", fontWeight: "800" }}>
            ← Menü
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={togglePausePairs}
          style={{
            paddingVertical: 6,
            paddingHorizontal: 8,
            backgroundColor: "rgba(148,163,184,0.1)",
            borderRadius: 10,
            marginLeft: 4,
          }}
        >
          <Text style={{ fontSize: 14 }}>⏸️</Text>
        </TouchableOpacity>
        <Text
          style={{
            flex: 1,
            textAlign: "center",
            fontSize: 20,
            fontWeight: "900",
            color: "#1e1b4b",
          }}
        >
          🃏 Pairs
        </Text>
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 50,
            backgroundColor: "rgba(251,191,36,0.12)",
            borderWidth: 1,
            borderColor: "rgba(251,191,36,0.3)",
            alignSelf: "center",
            marginTop: 2,
          }}
        >
          <Text style={{ fontSize: 9, color: "#f59e0b", fontWeight: "700" }}>
            📚 {level}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 2, minWidth: 72 }}>
          {/* Compact bomb timer */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={{ fontSize: 16 }}>
              {BOMB_SEC - elapsed <= 5
                ? "💥"
                : BOMB_SEC - elapsed <= 20
                  ? "🔴"
                  : "💣"}
            </Text>
            <Text
              style={{
                fontSize: 15,
                fontWeight: "900",
                color:
                  BOMB_SEC - elapsed <= 10
                    ? "#ef4444"
                    : BOMB_SEC - elapsed <= 20
                      ? "#f97316"
                      : "#475569",
              }}
            >
              {Math.max(0, BOMB_SEC - elapsed)}s
            </Text>
          </View>
          {/* Horizontal fuse */}
          <View
            style={{
              width: 60,
              height: 5,
              backgroundColor: "rgba(148,163,184,0.2)",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                height: "100%",
                width: `${Math.max(0, (BOMB_SEC - elapsed) / BOMB_SEC) * 100}%`,
                backgroundColor:
                  BOMB_SEC - elapsed <= 10
                    ? "#ef4444"
                    : BOMB_SEC - elapsed <= 20
                      ? "#f97316"
                      : "#22c55e",
                borderRadius: 3,
              }}
            />
          </View>
          <Text style={{ fontSize: 10, color: sc, fontWeight: "700" }}>
            {streak > 0 ? `🔥${streak}` : ""} {moves}h
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 12,
          backgroundColor: "#fff",
          borderBottomWidth: 1,
          borderBottomColor: "rgba(148,163,184,0.08)",
        }}
      >
        <View
          style={{ height: 7, backgroundColor: "#f1f5f9", borderRadius: 4 }}
        >
          <View
            style={{
              height: "100%",
              width: `${(matchedN / 6) * 100}%`,
              backgroundColor: "#22c55e",
              borderRadius: 4,
            }}
          />
        </View>
        <Text
          style={{
            fontSize: 11,
            color: "#94a3b8",
            marginTop: 6,
            textAlign: "center",
          }}
        >
          {matchedN} / 6 eşleşti
        </Text>
      </View>

      {/* Cards */}
      <View style={{ flex: 1 }}>
        {/* Cards */}
        <View style={{ flex: 1, justifyContent: "center", padding: 12 }}>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              justifyContent: "center",
            }}
          >
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
                    width: CARD_W,
                    height: CARD_H,
                    borderRadius: 16,
                    backgroundColor: card.matched
                      ? "#f0fdf4"
                      : isFlipped
                        ? isEn
                          ? "#eff6ff"
                          : "#fefce8"
                        : "#fff",
                    borderWidth: 2,
                    borderColor: card.matched
                      ? "#86efac"
                      : isFirst
                        ? "#3b82f6"
                        : isFlipped
                          ? isEn
                            ? "#93c5fd"
                            : "#fde047"
                          : "rgba(148,163,184,0.3)",
                    alignItems: "center",
                    justifyContent: "center",
                    shadowColor: isFirst
                      ? "#3b82f6"
                      : card.matched
                        ? "#22c55e"
                        : "#94a3b8",
                    shadowOffset: { width: 0, height: isFirst ? 4 : 2 },
                    shadowOpacity: isFirst ? 0.4 : 0.1,
                    shadowRadius: isFirst ? 12 : 4,
                    elevation: isFirst ? 8 : 2,
                    transform: [
                      { scale: card.shake ? 0.93 : isFirst ? 1.04 : 1 },
                    ],
                  }}
                >
                  {isFlipped ? (
                    <>
                      <View
                        style={{
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 6,
                          marginBottom: 4,
                          backgroundColor: isEn
                            ? "rgba(59,130,246,0.1)"
                            : "rgba(250,204,21,0.15)",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 9,
                            fontWeight: "800",
                            color: isEn ? "#3b82f6" : "#d97706",
                            letterSpacing: 1,
                          }}
                        >
                          {isEn ? "EN" : "TR"}
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontSize: card.matched ? 12 : 13,
                          fontWeight: "900",
                          color: card.matched
                            ? "#16a34a"
                            : isEn
                              ? "#1d4ed8"
                              : "#92400e",
                          textAlign: "center",
                          paddingHorizontal: 4,
                        }}
                        numberOfLines={2}
                      >
                        {label}
                      </Text>
                    </>
                  ) : (
                    <Text
                      style={{ fontSize: 28, color: "rgba(148,163,184,0.4)" }}
                    >
                      ?
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
      {/* end flexDirection row */}

      {pausedPairs && (
        <PauseOverlay onResume={togglePausePairs} onMenu={onBack} />
      )}
      {/* Time's up */}
      {timeUp && !won && <BombExplosion onDone={newGame} />}

      {/* Win */}
      {won && (
        <View
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: "rgba(15,23,42,0.88)",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
          }}
        >
          <Text style={{ fontSize: 52, marginBottom: 12 }}>🎉</Text>
          <Text
            style={{
              fontSize: 26,
              fontWeight: "900",
              color: "#fff",
              marginBottom: 6,
            }}
          >
            Tebrikler!
          </Text>
          <Text style={{ fontSize: 14, color: "#94a3b8", marginBottom: 4 }}>
            {moves} hamlede tamamladın
          </Text>
          <Text style={{ fontSize: 14, color: "#94a3b8", marginBottom: 24 }}>
            Süre: {mins}:{secs}
          </Text>
          <TouchableOpacity
            onPress={newGame}
            style={{
              backgroundColor: "#3b82f6",
              paddingVertical: 14,
              paddingHorizontal: 44,
              borderRadius: 50,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>
              Tekrar Oyna
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// GAME 7: KELIME 2048
// Aynı kelimeyi yan yana getir → eş anlamlısına dönüşür!
// BIG+BIG=LARGE, LARGE+LARGE=HUGE, HUGE+HUGE=VAST
// ─────────────────────────────────────────────────────────
// Her grup: level 0,1,2,3 kelimeleri
function PinballGame({
  sr,
  speed,
  level,
  onBack,
}: {
  sr: SREngine;
  speed: SpeedMode;
  level: Level;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const pool = sr.getPool();
  const spd = SPEEDS[speed];
  const SPEED_MULT = spd.base / 90;

  // Layout — game area height computed after header (~180px)
  const HEADER_H = insets.top + 175;
  const GAME_H = H - HEADER_H;
  const BALL_R2 = 18;
  const PAD_W = W / 3;
  const PAD_H = 14;
  const PAD_Y = GAME_H * 0.82;
  const BKT_Y = GAME_H * 0.88;
  const BKT_H = GAME_H * 0.12;
  const BUMP_POSITIONS = [
    { x: W * 0.25, y: GAME_H * 0.22 },
    { x: W * 0.75, y: GAME_H * 0.22 },
    { x: W * 0.15, y: GAME_H * 0.45 },
    { x: W * 0.85, y: GAME_H * 0.45 },
  ];

  const [target, setTarget] = useState(() => sr.next());
  const targetRef = useRef(target);
  targetRef.current = target;

  const mkBuckets = (tgt: Word) => {
    const wrongs = pool
      .filter((w) => w.tr !== tgt.tr)
      .sort(() => Math.random() - 0.5)
      .slice(0, 2);
    const all = [tgt, ...wrongs].sort(() => Math.random() - 0.5);
    const bw = W / 3;
    return all.map((w, i) => ({
      word: w,
      isCorrect: w.tr === tgt.tr,
      x: i * bw,
      w: bw,
    }));
  };
  const [buckets, setBuckets] = useState(() => mkBuckets(target));
  const bucketsRef = useRef(buckets);
  bucketsRef.current = buckets;

  const bxRef = useRef(W / 2);
  const byRef = useRef(GAME_H * 0.12);
  const vxRef = useRef((Math.random() - 0.5) * 100 * SPEED_MULT);
  const vyRef = useRef(90 * SPEED_MULT);
  const [bPos, setBPos] = useState({ x: W / 2, y: GAME_H * 0.12 });

  const padRef = useRef(W / 2 - PAD_W / 2);
  const [padX, setPadX] = useState(W / 2 - PAD_W / 2);

  const [hitBump, setHitBump] = useState<number | null>(null);
  const [lives, setLives] = useState(5);
  const livesRef = useRef(5);
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const [streak, setStreak] = useState(0);
  const streakRef = useRef(0);
  const [learned, setLearned] = useState(sr.count());
  const [gameOver, setGameOver] = useState(false);
  const [pbRestartKey, setPbRestartKey] = useState(0);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const isOver = useRef(false);
  const rafRef = useRef(0);
  const ltRef = useRef(0);
  const [flash, setFlash] = useState<{ text: string; ok: boolean } | null>(
    null,
  );
  const flashTm = useRef<any>(null);
  const processingRef = useRef(false);

  // Bumper shuffle state
  const generateRandomBumpers = (): typeof BUMP_POSITIONS => {
    const positions = [];
    const bumperRadius = 22;
    const padding = 40;

    while (positions.length < 4) {
      let valid = true;
      const newX = Math.random() * (W - 2 * padding) + padding;
      const newY = Math.random() * (GAME_H * 0.5 - 2 * padding) + padding;

      // Check distance from other bumpers
      for (const p of positions) {
        const d = Math.hypot(newX - p.x, newY - p.y);
        if (d < bumperRadius * 4) valid = false;
      }

      if (valid) positions.push({ x: newX, y: newY });
    }
    return positions;
  };

  const [bumpers, setBumpers] = useState(BUMP_POSITIONS);
  const [readyToStart, setReadyToStart] = useState(true);
  const bumpsRef = useRef(BUMP_POSITIONS);
  bumpsRef.current = bumpers;

  const shuffleBumpers = () => {
    setBumpers(generateRandomBumpers());
    hapSel();
  };

  const togglePause = () => {
    pausedRef.current = !pausedRef.current;
    setPaused((p) => !p);
  };

  const resetBall = () => {
    bxRef.current = W / 2 + (Math.random() - 0.5) * W * 0.3;
    byRef.current = GAME_H * 0.12;
    vxRef.current = (Math.random() - 0.5) * 100 * SPEED_MULT;
    vyRef.current = 90 * SPEED_MULT;
    processingRef.current = false;
  };

  const showFlash = (text: string, ok: boolean) => {
    if (flashTm.current) clearTimeout(flashTm.current);
    setFlash({ text, ok });
    flashTm.current = setTimeout(() => setFlash(null), 900);
  };

  const nextQ = () => {
    const nt = sr.next();
    targetRef.current = nt;
    setTarget(nt);
    const nb = mkBuckets(nt);
    setBuckets(nb);
    bucketsRef.current = nb;
    resetBall();
  };

  useEffect(() => {
    isOver.current = false;
    resetBall();
    ltRef.current = performance.now();
    const loop = (now: number) => {
      if (isOver.current) return;
      if (pausedRef.current) {
        ltRef.current = now;
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      const dt = Math.min((now - ltRef.current) / 1000, 0.04);
      ltRef.current = now;

      let bx = bxRef.current;
      let by = byRef.current;
      let vx = vxRef.current;
      let vy = vyRef.current;

      vy += 200 * dt; // gravity
      bx += vx * dt;
      by += vy * dt;

      // Duvarlar
      if (bx < BALL_R2) {
        bx = BALL_R2;
        vx = Math.abs(vx);
      }
      if (bx > W - BALL_R2) {
        bx = W - BALL_R2;
        vx = -Math.abs(vx);
      }
      if (by < BALL_R2) {
        by = BALL_R2;
        vy = Math.abs(vy) * 0.7;
      }

      // Bumper çarpışma
      bumpsRef.current.forEach((b, i) => {
        const dx = bx - b.x;
        const dy = by - b.y;
        const r = 22;
        const d = Math.hypot(dx, dy);
        if (d < BALL_R2 + r) {
          const nx = dx / d;
          const ny = dy / d;
          const spd2 = Math.max(Math.hypot(vx, vy), 160 * SPEED_MULT);
          vx = nx * spd2;
          vy = ny * spd2;
          bx = b.x + nx * (BALL_R2 + r + 1);
          by = b.y + ny * (BALL_R2 + r + 1);
          setHitBump(i);
          setTimeout(() => setHitBump(null), 120);
          hapSel();
        }
      });

      // Kürek
      const px = padRef.current;
      if (
        by + BALL_R2 >= PAD_Y &&
        by + BALL_R2 <= PAD_Y + PAD_H + 6 &&
        bx >= px &&
        bx <= px + PAD_W &&
        vy > 0
      ) {
        vy = -Math.abs(vy) * 0.9;
        by = PAD_Y - BALL_R2;
        const rel = (bx - (px + PAD_W / 2)) / (PAD_W / 2);
        vx = rel * 180 * SPEED_MULT;
        hap();
      }

      // Kova — top düştü mü?
      if (by + BALL_R2 >= BKT_Y && !processingRef.current) {
        processingRef.current = true;
        const bkts = bucketsRef.current;
        let matched = false;
        // Topun merkezine göre hangi kovada olduğunu bul
        const hitBucket = bkts.find((bk) => bx >= bk.x && bx <= bk.x + bk.w);
        const nearBucket =
          hitBucket ??
          bkts.reduce((closest, bk) => {
            const bkCenter = bk.x + bk.w / 2;
            const closestCenter = closest.x + closest.w / 2;
            return Math.abs(bx - bkCenter) < Math.abs(bx - closestCenter)
              ? bk
              : closest;
          });
        // Sadece en yakın kovayı işle
        const bk = nearBucket;
        if (true) {
          matched = true;
          if (bk.isCorrect) {
            streakRef.current++;
            setStreak(streakRef.current);
            scoreRef.current += 10 + streakRef.current * 2;
            setScore(scoreRef.current);
            sr.record(bk.word, true);
            setLearned(sr.count());
            playSoundOk();
            speakWord(bk.word.en);
            hap();
            showFlash(`✓ ${bk.word.tr}`, true);
            setTimeout(nextQ, 900);
          } else {
            streakRef.current = 0;
            setStreak(0);
            livesRef.current = Math.max(0, livesRef.current - 1);
            setLives(livesRef.current);
            sr.record(bk.word, false);
            hapHeavy();
            playSoundError();
            showFlash(`✗ ${bk.word.tr} değil!`, false);
            if (livesRef.current <= 0) {
              isOver.current = true;
              setGameOver(true);
            } else setTimeout(resetBall, 700);
          }
        }
        if (!matched) {
          // Kovalar arasına düştü — can git
          livesRef.current = Math.max(0, livesRef.current - 1);
          setLives(livesRef.current);
          hapHeavy();
          playSoundError();
          showFlash("Kovaya düşür!", false);
          if (livesRef.current <= 0) {
            isOver.current = true;
            setGameOver(true);
          } else setTimeout(resetBall, 600);
        }
        vx = 0;
        vy = 0;
      }

      bxRef.current = bx;
      byRef.current = by;
      vxRef.current = vx;
      vyRef.current = vy;
      setBPos({ x: bx, y: by });
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (flashTm.current) clearTimeout(flashTm.current);
    };
  }, [speed, pbRestartKey]);

  const panPad = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const x = Math.max(
          0,
          Math.min(W - PAD_W, e.nativeEvent.pageX - PAD_W / 2),
        );
        padRef.current = x;
        setPadX(x);
      },
      onPanResponderMove: (e) => {
        const x = Math.max(
          0,
          Math.min(W - PAD_W, e.nativeEvent.pageX - PAD_W / 2),
        );
        padRef.current = x;
        setPadX(x);
      },
    }),
  ).current;

  const restart = () => {
    cancelAnimationFrame(rafRef.current);
    livesRef.current = 5;
    setLives(5);
    scoreRef.current = 0;
    setScore(0);
    streakRef.current = 0;
    setStreak(0);
    isOver.current = false;
    const nt = sr.next();
    targetRef.current = nt;
    setTarget(nt);
    const nb = mkBuckets(nt);
    setBuckets(nb);
    bucketsRef.current = nb;
    resetBall();
    ltRef.current = performance.now();
    setGameOver(false);
    setPbRestartKey((k) => k + 1);
  };

  const sc =
    streak >= 5
      ? "#f87171"
      : streak >= 3
        ? "#fbbf24"
        : streak >= 1
          ? "#22c55e"
          : "#94a3b8";

  return (
    <View
      style={{ flex: 1, backgroundColor: "#f0f4ff", paddingTop: insets.top }}
    >
      <StatusBar backgroundColor="#f0f4ff" barStyle="dark-content" />
      {paused && <PauseOverlay onResume={togglePause} onMenu={onBack} />}

      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 14,
          paddingVertical: 10,
          backgroundColor: "#fff",
          borderBottomWidth: 1,
          borderBottomColor: "rgba(148,163,184,0.15)",
        }}
      >
        <TouchableOpacity
          onPress={() => {
            hapSel();
            onBack();
          }}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 13,
            backgroundColor: "#f1f5f9",
            borderRadius: 10,
            borderWidth: 1.5,
            borderColor: "rgba(148,163,184,0.3)",
          }}
        >
          <Text style={{ fontSize: 13, color: "#64748b", fontWeight: "700" }}>
            ← Menü
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={togglePause}
          style={{
            paddingVertical: 7,
            paddingHorizontal: 9,
            marginLeft: 6,
            backgroundColor: "rgba(148,163,184,0.1)",
            borderRadius: 10,
          }}
        >
          <Text style={{ fontSize: 14 }}>⏸️</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center", gap: 2 }}>
          <Text style={{ fontSize: 16, fontWeight: "900", color: "#1e1b4b" }}>
            🎱 Kelime Pinball
          </Text>
          <View style={{ flexDirection: "row", gap: 5 }}>
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 1,
                borderRadius: 50,
                backgroundColor: spd.color + "18",
                borderWidth: 1,
                borderColor: spd.color + "44",
              }}
            >
              <Text
                style={{ fontSize: 9, color: spd.color, fontWeight: "700" }}
              >
                {spd.label}
              </Text>
            </View>
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 1,
                borderRadius: 50,
                backgroundColor: "rgba(99,102,241,0.12)",
                borderWidth: 1,
                borderColor: "rgba(99,102,241,0.3)",
              }}
            >
              <Text
                style={{ fontSize: 9, color: "#6366f1", fontWeight: "700" }}
              >
                📚 {level}
              </Text>
            </View>
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          <View style={{ flexDirection: "row", gap: 2 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Text
                key={i}
                style={{ fontSize: 12, opacity: i < lives ? 1 : 0.15 }}
              >
                ❤️
              </Text>
            ))}
          </View>
          <Text style={{ fontSize: 11, fontWeight: "900", color: sc }}>
            ⭐{score}
            {streak > 0 ? ` 🔥${streak}` : ""}
          </Text>
        </View>
      </View>

      <SoundWarningBanner />
      {/* Hedef */}
      <View
        style={{
          backgroundColor: "#fff",
          paddingVertical: 8,
          paddingHorizontal: 16,
          borderBottomWidth: 2,
          borderBottomColor: "rgba(99,102,241,0.2)",
          alignItems: "center",
          gap: 4,
        }}
      >
        <Text style={{ fontSize: 22, fontWeight: "900", color: "#1e1b4b" }}>
          {target.en}
        </Text>
        <Text
          style={{
            fontSize: 10,
            color: "#94a3b8",
            letterSpacing: 2,
            textTransform: "uppercase",
            fontWeight: "700",
          }}
        >
          Topu doğru Türkçe kovaya düşür
        </Text>
        <TouchableOpacity
          onPress={shuffleBumpers}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 16,
            backgroundColor: "rgba(99,102,241,0.1)",
            borderRadius: 10,
            borderWidth: 1.5,
            borderColor: "rgba(99,102,241,0.3)",
            marginTop: 4,
          }}
        >
          <Text style={{ fontSize: 13, color: "#6366f1", fontWeight: "800" }}>
            🔀 Engelleri Karıştır
          </Text>
        </TouchableOpacity>
      </View>

      {/* Oyun alanı */}
      <View
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#e8eeff",
        }}
        {...panPad.panHandlers}
      >
        {/* Arka plan çizgileri */}
        {[0.33, 0.66].map((f, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: W * f,
              width: 1,
              backgroundColor: "rgba(148,163,184,0.15)",
            }}
          />
        ))}

        {/* Bumper'lar */}
        {bumpers.map((b, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              left: b.x - 22,
              top: b.y - 22,
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor:
                hitBump === i
                  ? "rgba(251,191,36,0.7)"
                  : "rgba(99,102,241,0.18)",
              borderWidth: 2.5,
              borderColor: hitBump === i ? "#f59e0b" : "#6366f1",
              alignItems: "center",
              justifyContent: "center",
              shadowColor: hitBump === i ? "#f59e0b" : "#6366f1",
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: hitBump === i ? 0.8 : 0.2,
              shadowRadius: hitBump === i ? 10 : 4,
              elevation: hitBump === i ? 8 : 2,
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor:
                  hitBump === i ? "#fbbf24" : "rgba(99,102,241,0.4)",
              }}
            />
          </View>
        ))}

        {/* Top — kelime içinde */}
        <View
          style={{
            position: "absolute",
            left: bPos.x - BALL_R2,
            top: bPos.y - BALL_R2,
            width: BALL_R2 * 2,
            height: BALL_R2 * 2,
            borderRadius: BALL_R2,
            backgroundColor: "#1e1b4b",
            shadowColor: "#6366f1",
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.5,
            shadowRadius: 6,
            elevation: 8,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontSize: BALL_R2 * 0.45,
              fontWeight: "900",
              color: "#fff",
              textAlign: "center",
              paddingHorizontal: 2,
            }}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {target?.en ?? ""}
          </Text>
        </View>

        {/* Kürek */}
        <View
          style={{
            position: "absolute",
            left: padX,
            top: PAD_Y,
            width: PAD_W,
            height: PAD_H,
            borderRadius: PAD_H / 2,
            backgroundColor: "#6366f1",
            shadowColor: "#6366f1",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.5,
            shadowRadius: 8,
            elevation: 6,
          }}
        />

        {/* Kovalar — NET görünür */}
        {buckets.map((bk, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              left: bk.x,
              top: BKT_Y,
              width: bk.w,
              height: BKT_H,
              backgroundColor: bk.isCorrect
                ? "rgba(34,197,94,0.18)"
                : "rgba(148,163,184,0.1)",
              borderWidth: 2,
              borderColor: bk.isCorrect ? "#22c55e" : "rgba(148,163,184,0.4)",
              borderBottomLeftRadius: 16,
              borderBottomRightRadius: 16,
              borderTopWidth: 3,
              borderTopColor: bk.isCorrect
                ? "#22c55e"
                : "rgba(148,163,184,0.5)",
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 6,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "900",
                textAlign: "center",
                color: bk.isCorrect ? "#16a34a" : "#475569",
                lineHeight: 16,
              }}
              numberOfLines={2}
            >
              {bk.word.tr}
            </Text>
          </View>
        ))}

        {/* Ok işaretleri kovalar için */}
        {buckets.map((bk, i) => (
          <View
            key={`arrow-${i}`}
            style={{
              position: "absolute",
              left: bk.x + bk.w / 2 - 12,
              top: BKT_Y - 22,
              width: 24,
              height: 16,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: bk.isCorrect ? "#22c55e" : "rgba(148,163,184,0.4)",
              }}
            >
              ▼
            </Text>
          </View>
        ))}

        {/* Flash mesajı */}
        {flash && (
          <View
            style={{
              position: "absolute",
              top: GAME_H * 0.08,
              left: 0,
              right: 0,
              alignItems: "center",
              zIndex: 99,
              pointerEvents: "none",
            }}
          >
            <View
              style={{
                backgroundColor: flash.ok
                  ? "rgba(34,197,94,0.15)"
                  : "rgba(239,68,68,0.12)",
                borderRadius: 12,
                paddingVertical: 8,
                paddingHorizontal: 18,
                borderWidth: 1.5,
                borderColor: flash.ok
                  ? "rgba(34,197,94,0.4)"
                  : "rgba(239,68,68,0.35)",
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "900",
                  color: flash.ok ? "#16a34a" : "#ef4444",
                  textAlign: "center",
                }}
              >
                {flash.text}
              </Text>
            </View>
          </View>
        )}
      </View>

      {gameOver && (
        <View
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: "rgba(15,23,42,0.92)",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
          }}
        >
          <Text style={{ fontSize: 52, marginBottom: 10 }}>🎱</Text>
          <Text
            style={{
              fontSize: 26,
              fontWeight: "900",
              color: "#fff",
              marginBottom: 4,
            }}
          >
            Oyun Bitti!
          </Text>
          <Text style={{ fontSize: 14, color: "#fbbf24", marginBottom: 4 }}>
            Skor: ⭐{score}
          </Text>
          <Text style={{ fontSize: 13, color: "#34d399", marginBottom: 24 }}>
            Öğrenilen: 📚{learned}
          </Text>
          <TouchableOpacity
            onPress={restart}
            style={{
              backgroundColor: "#6366f1",
              paddingVertical: 14,
              paddingHorizontal: 44,
              borderRadius: 50,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>
              Tekrar Oyna
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// KELIME TETRİS
// Yukarıdan İngilizce blok düşer.
// Altta sürüklenen Türkçe blok var — doğru eşleşme = patlama!
// Sol/sağ sürükle veya tap ile yönlendir. Yığılırsa game over.
// ─────────────────────────────────────────────────────────

// ─── Custom word set type ───────────────
// ─── Custom Set type ───────────────────
interface CustomSet {
  id: string;
  name: string;
  words: { en: string; tr: string }[];
  addedAt: number;
  lastUsed?: number;
  shareCode?: string; // Firestore'daki 6 haneli kod
}

// ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────
// SET BUILDER SCREEN — Telefon Rehberi Stili
// ─────────────────────────────────────────────────────────
function SetBuilderScreen({
  allWords,
  onSave,
  onBack,
  initialSet,
}: {
  allWords: typeof ALL_WORDS;
  onSave: (set: CustomSet) => void;
  onBack: () => void;
  initialSet?: CustomSet | null;
}) {
  const insets = useSafeAreaInsets();
  const [setName, setSetName] = useState(initialSet?.name ?? "");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{ en: string; tr: string }[]>(
    initialSet?.words ?? [],
  );
  const [customEn, setCustomEn] = useState("");
  const [customTr, setCustomTr] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [activeTab, setActiveTab] = useState<"search" | "selected">("search");
  const sectionListRef = useRef<SectionList<any>>(null);
  const [activeLetter, setActiveLetter] = useState("");
  const [popupLetter, setPopupLetter] = useState("");
  const [listReady, setListReady] = useState(false);
  const [sections, setSections] = useState<
    { title: string; data: { en: string; tr: string }[] }[]
  >([]);
  const [allWordsList, setAllWordsList] = useState<
    { en: string; tr: string }[]
  >([]);

  // Kelime listesini DEFER et — ilk render'dan sonra hesapla
  useEffect(() => {
    const timer = setTimeout(() => {
      const map = new Map<string, { en: string; tr: string }>();
      Object.values(allWords).forEach((byLevel) =>
        Object.values(byLevel).forEach((ws) =>
          (ws as { en: string; tr: string }[]).forEach((w) => {
            if (!map.has(w.en)) map.set(w.en, w);
          }),
        ),
      );
      const sorted = Array.from(map.values()).sort((a, b) =>
        a.en.localeCompare(b.en),
      );
      setAllWordsList(sorted);

      const secMap = new Map<string, { en: string; tr: string }[]>();
      sorted.forEach((w) => {
        const letter = w.en[0].toUpperCase();
        if (!secMap.has(letter)) secMap.set(letter, []);
        secMap.get(letter)!.push(w);
      });
      const built = Array.from(secMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([letter, data]) => ({ title: letter, data }));
      setSections(built);
      setListReady(true);
    }, 50); // 50ms sonra hesapla — ekran önce açılsın
    return () => clearTimeout(timer);
  }, []);

  const alphabet = React.useMemo(
    () => sections.map((s) => s.title),
    [sections],
  );

  // Arama sonuçları
  const filtered =
    search.trim().length >= 1
      ? allWordsList.filter(
          (w) =>
            w.en.toLowerCase().includes(search.toLowerCase()) ||
            w.tr.toLowerCase().includes(search.toLowerCase()),
        )
      : null;

  const isSelected = (w: { en: string; tr: string }) =>
    selected.some((s) => s.en === w.en);

  const toggle = (w: { en: string; tr: string }) => {
    hapSel();
    if (isSelected(w)) setSelected((s) => s.filter((x) => x.en !== w.en));
    else setSelected((s) => [...s, w]);
  };

  const addCustom = () => {
    const en = customEn.trim().toUpperCase();
    const tr = customTr.trim();
    if (!en || !tr) return;
    if (selected.some((w) => w.en === en)) return;
    setSelected((s) => [...s, { en, tr }]);
    setCustomEn("");
    setCustomTr("");
    setShowAdd(false);
  };

  const save = () => {
    if (selected.length < 4) return;
    const id = initialSet?.id ?? "local_" + Date.now();
    const name =
      setName.trim() || "Setim " + new Date().toLocaleDateString("tr-TR");
    // shareCode'u koru — kaybolursa Firestore güncelleme bozulur
    onSave({
      id,
      name,
      words: selected,
      addedAt: initialSet?.addedAt ?? Date.now(),
      lastUsed: Date.now(),
      shareCode: initialSet?.shareCode,
    });
  };

  const ITEM_H = 54;
  const SEC_H = 32;

  // SectionList flat index hesaplama — her header+item sıralı sayılır
  // header(0) item(1) item(2) ... header(n) item(n+1) ...
  const getItemLayout = (_data: any, flatIndex: number) => {
    let offset = 0;
    let i = 0;
    for (let si = 0; si < sections.length; si++) {
      if (i === flatIndex) return { length: SEC_H, offset, index: flatIndex };
      offset += SEC_H;
      i++;
      for (let ii = 0; ii < sections[si].data.length; ii++) {
        if (i === flatIndex)
          return { length: ITEM_H, offset, index: flatIndex };
        offset += ITEM_H;
        i++;
      }
    }
    return { length: ITEM_H, offset, index: flatIndex };
  };

  const jumpToLetter = (letter: string) => {
    const idx = sections.findIndex((s) => s.title === letter);
    if (idx < 0 || !sectionListRef.current) return;
    setActiveLetter(letter);
    setPopupLetter(letter);
    setTimeout(() => {
      setActiveLetter("");
      setPopupLetter("");
    }, 1200);
    try {
      sectionListRef.current.scrollToLocation({
        sectionIndex: idx,
        itemIndex: 0,
        animated: false,
        viewOffset: 0,
      });
    } catch (e) {
      // fallback: scroll to top then retry
      sectionListRef.current?.scrollToLocation({
        sectionIndex: 0,
        itemIndex: 0,
        animated: false,
      });
      setTimeout(() => {
        sectionListRef.current?.scrollToLocation({
          sectionIndex: idx,
          itemIndex: 0,
          animated: false,
        });
      }, 100);
    }
  };

  const renderWordItem = ({ item }: { item: { en: string; tr: string } }) => {
    const sel = isSelected(item);
    return (
      <TouchableOpacity
        onPress={() => toggle(item)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: sel ? "rgba(99,102,241,0.07)" : "#fff",
          paddingVertical: 11,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(148,163,184,0.1)",
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: "800",
              color: sel ? "#6366f1" : "#1e293b",
            }}
          >
            {item.en}
          </Text>
          <Text style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>
            {item.tr}
          </Text>
        </View>
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: sel ? "#6366f1" : "#f1f5f9",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: sel ? 0 : 1.5,
            borderColor: "rgba(148,163,184,0.3)",
          }}
        >
          {sel && (
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "900" }}>
              ✓
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={{ flex: 1, backgroundColor: "#f0f4ff", paddingTop: insets.top }}
    >
      <StatusBar backgroundColor="#f0f4ff" barStyle="dark-content" />

      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: "#fff",
          borderBottomWidth: 1,
          borderBottomColor: "rgba(148,163,184,0.15)",
        }}
      >
        <TouchableOpacity
          onPress={onBack}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 14,
            backgroundColor: "#f1f5f9",
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: "rgba(148,163,184,0.3)",
          }}
        >
          <Text style={{ fontSize: 13, color: "#64748b", fontWeight: "800" }}>
            {"<"} Geri
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
          Set Oluştur
        </Text>
        <TouchableOpacity
          onPress={save}
          disabled={selected.length < 4}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 14,
            backgroundColor: selected.length >= 4 ? "#6366f1" : "#e2e8f0",
            borderRadius: 12,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: "900",
              color: selected.length >= 4 ? "#fff" : "#94a3b8",
            }}
          >
            {selected.length > 0 ? `Kaydet (${selected.length})` : "Kaydet"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Set adı */}
      <View
        style={{
          backgroundColor: "#fff",
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(148,163,184,0.1)",
        }}
      >
        <TextInput
          value={setName}
          onChangeText={setSetName}
          placeholder="Set adı (orn: IELTS Vocab...)"
          placeholderTextColor="#94a3b8"
          style={{
            backgroundColor: "#f8faff",
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 13,
            color: "#1e293b",
            borderWidth: 1.5,
            borderColor: "rgba(148,163,184,0.25)",
          }}
        />
      </View>

      {/* Tabs */}
      <View
        style={{
          flexDirection: "row",
          backgroundColor: "#fff",
          paddingHorizontal: 16,
          paddingVertical: 8,
          gap: 8,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(148,163,184,0.1)",
        }}
      >
        {(["search", "selected"] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 10,
              backgroundColor: activeTab === tab ? "#6366f1" : "#f1f5f9",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "800",
                color: activeTab === tab ? "#fff" : "#64748b",
              }}
            >
              {tab === "search"
                ? "Kelime Seç"
                : selected.length > 0
                  ? `Seçilenler (${selected.length})`
                  : "Seçilenler"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === "search" ? (
        <View style={{ flex: 1 }}>
          {/* Arama kutusu */}
          <View
            style={{
              backgroundColor: "#fff",
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: "rgba(148,163,184,0.08)",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#f8faff",
                borderRadius: 12,
                paddingHorizontal: 12,
                borderWidth: 1.5,
                borderColor: "rgba(148,163,184,0.25)",
              }}
            >
              <Text style={{ fontSize: 14, color: "#94a3b8", marginRight: 6 }}>
                🔍
              </Text>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="İngilizce veya Türkçe ara..."
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
                style={{
                  flex: 1,
                  fontSize: 13,
                  color: "#1e293b",
                  paddingVertical: 10,
                }}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch("")}>
                  <Text style={{ fontSize: 16, color: "#94a3b8" }}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Kendin ekle formu */}
          {showAdd && (
            <View
              style={{
                backgroundColor: "#fff",
                margin: 12,
                borderRadius: 14,
                padding: 14,
                borderWidth: 1.5,
                borderColor: "rgba(99,102,241,0.3)",
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "800",
                  color: "#1e1b4b",
                  marginBottom: 10,
                }}
              >
                Kelime Ekle
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                <TextInput
                  value={customEn}
                  onChangeText={(t) => setCustomEn(t.toUpperCase())}
                  placeholder="İngilizce"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="characters"
                  style={{
                    flex: 1,
                    backgroundColor: "#f8faff",
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 13,
                    color: "#1e293b",
                    borderWidth: 1.5,
                    borderColor: "rgba(148,163,184,0.25)",
                  }}
                />
                <TextInput
                  value={customTr}
                  onChangeText={setCustomTr}
                  placeholder="Türkçe"
                  placeholderTextColor="#94a3b8"
                  style={{
                    flex: 1,
                    backgroundColor: "#f8faff",
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 13,
                    color: "#1e293b",
                    borderWidth: 1.5,
                    borderColor: "rgba(148,163,184,0.25)",
                  }}
                />
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  onPress={addCustom}
                  disabled={!customEn || !customTr}
                  style={{
                    flex: 1,
                    backgroundColor:
                      customEn && customTr ? "#22c55e" : "#e2e8f0",
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: customEn && customTr ? "#fff" : "#94a3b8",
                      fontWeight: "800",
                      fontSize: 13,
                    }}
                  >
                    Ekle
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowAdd(false)}
                  style={{
                    flex: 1,
                    backgroundColor: "#f1f5f9",
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: "#64748b",
                      fontWeight: "700",
                      fontSize: 13,
                    }}
                  >
                    İptal
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Kelime listesi — ARAMA VARSA FlatList, yoksa SectionList */}
          <View style={{ flex: 1, flexDirection: "row" }}>
            {!listReady ? (
              <View
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 24, marginBottom: 8 }}>📚</Text>
                <Text style={{ fontSize: 13, color: "#94a3b8" }}>
                  Kelimeler yükleniyor...
                </Text>
              </View>
            ) : filtered !== null ? (
              // Arama sonuçları
              <FlatList
                data={filtered}
                keyExtractor={(item) => item.en}
                renderItem={renderWordItem}
                ListEmptyComponent={
                  <View style={{ alignItems: "center", padding: 32 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        color: "#94a3b8",
                        marginBottom: 12,
                      }}
                    >
                      Bulunamadı.
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        setCustomEn(search.toUpperCase());
                        setShowAdd(true);
                      }}
                      style={{
                        backgroundColor: "#6366f1",
                        borderRadius: 10,
                        paddingVertical: 9,
                        paddingHorizontal: 20,
                      }}
                    >
                      <Text
                        style={{
                          color: "#fff",
                          fontWeight: "800",
                          fontSize: 13,
                        }}
                      >
                        + Kendin Ekle
                      </Text>
                    </TouchableOpacity>
                  </View>
                }
                ListHeaderComponent={
                  !showAdd ? (
                    <TouchableOpacity
                      onPress={() => setShowAdd(true)}
                      style={{
                        margin: 12,
                        backgroundColor: "rgba(99,102,241,0.08)",
                        borderRadius: 12,
                        padding: 12,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        borderWidth: 1.5,
                        borderColor: "rgba(99,102,241,0.2)",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          color: "#6366f1",
                          fontWeight: "700",
                        }}
                      >
                        + Listede yok mu? Kendin ekle
                      </Text>
                    </TouchableOpacity>
                  ) : null
                }
                contentContainerStyle={{ paddingBottom: 100 }}
              />
            ) : (
              // Alfabetik SectionList
              <SectionList
                ref={sectionListRef}
                sections={sections}
                keyExtractor={(item) => item.en}
                renderItem={renderWordItem}
                renderSectionHeader={({ section }) => (
                  <View
                    style={{
                      backgroundColor: "#e8eeff",
                      paddingHorizontal: 16,
                      paddingVertical: 6,
                      borderBottomWidth: 1,
                      borderBottomColor: "rgba(148,163,184,0.15)",
                      height: 32,
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "900",
                        color: "#6366f1",
                        letterSpacing: 2,
                      }}
                    >
                      {section.title}
                    </Text>
                  </View>
                )}
                ListHeaderComponent={
                  !showAdd ? (
                    <TouchableOpacity
                      onPress={() => setShowAdd(true)}
                      style={{
                        margin: 12,
                        backgroundColor: "rgba(99,102,241,0.08)",
                        borderRadius: 12,
                        padding: 12,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        borderWidth: 1.5,
                        borderColor: "rgba(99,102,241,0.2)",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          color: "#6366f1",
                          fontWeight: "700",
                        }}
                      >
                        + Listede yok mu? Kendin ekle
                      </Text>
                    </TouchableOpacity>
                  ) : null
                }
                contentContainerStyle={{
                  paddingBottom: 100,
                  paddingRight: Math.max(28, Math.min(42, W * 0.09)) + 4,
                }}
                stickySectionHeadersEnabled={true}
                initialNumToRender={20}
                maxToRenderPerBatch={30}
                windowSize={10}
                style={{ flex: 1 }}
                getItemLayout={getItemLayout}
                onScrollToIndexFailed={(info) => {
                  // fallback: biraz bekle sonra tekrar dene
                  setTimeout(() => {
                    sectionListRef.current?.scrollToLocation({
                      sectionIndex: info.index,
                      itemIndex: 0,
                      animated: true,
                    });
                  }, 300);
                }}
              />
            )}

            {/* Ortada büyük harf popup — contacts app gibi */}
            {popupLetter !== "" && (
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 36,
                  bottom: 0,
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "none",
                }}
              >
                <View
                  style={{
                    width: 90,
                    height: 90,
                    backgroundColor: "rgba(99,102,241,0.92)",
                    borderRadius: 18,
                    alignItems: "center",
                    justifyContent: "center",
                    shadowColor: "#6366f1",
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.4,
                    shadowRadius: 16,
                    elevation: 16,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 52,
                      fontWeight: "900",
                      color: "#fff",
                      letterSpacing: 2,
                    }}
                  >
                    {popupLetter}
                  </Text>
                </View>
              </View>
            )}

            {/* Alfabe sidebar — sadece search yoksa, listReady olduktan sonra */}
            {filtered === null &&
              listReady &&
              (() => {
                // Ekran yüksekliğine göre dinamik item yüksekliği
                const availH = H - 220; // header + tab + search için çıkar
                const itemH = Math.max(
                  14,
                  Math.min(22, Math.floor(availH / (alphabet.length || 1))),
                );
                const fontSize = Math.max(9, Math.min(13, itemH - 4));
                const sideW = Math.max(28, Math.min(42, W * 0.09));
                return (
                  <View
                    style={{
                      position: "absolute",
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: sideW,
                      justifyContent: "center",
                      alignItems: "center",
                      backgroundColor: "rgba(240,244,255,0.97)",
                      borderLeftWidth: 1,
                      borderLeftColor: "rgba(148,163,184,0.2)",
                    }}
                  >
                    {alphabet.map((letter) => {
                      const isActive = activeLetter === letter;
                      return (
                        <TouchableOpacity
                          key={letter}
                          onPress={() => jumpToLetter(letter)}
                          activeOpacity={0.5}
                          style={{
                            width: sideW - 6,
                            height: isActive ? itemH + 6 : itemH,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: isActive
                              ? "#6366f1"
                              : "transparent",
                            borderRadius: isActive ? 7 : 0,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: isActive ? fontSize + 3 : fontSize,
                              fontWeight: "900",
                              color: isActive ? "#fff" : "#64748b",
                            }}
                          >
                            {letter}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })()}
          </View>
        </View>
      ) : (
        // Seçilenler tab
        <FlatList
          data={selected}
          keyExtractor={(item) => item.en}
          contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <Text
                style={{ fontSize: 14, color: "#94a3b8", textAlign: "center" }}
              >
                Henüz kelime seçmedin
              </Text>
            </View>
          }
          ListHeaderComponent={
            <Text style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>
              {selected.length} kelime seçildi
              {selected.length < 4 ? " (min 4 gerekli)" : " ✓"}
            </Text>
          }
          renderItem={({ item }) => (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#fff",
                borderRadius: 12,
                padding: 12,
                marginBottom: 6,
                borderWidth: 1.5,
                borderColor: "rgba(99,102,241,0.2)",
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontSize: 14, fontWeight: "800", color: "#1e1b4b" }}
                >
                  {item.en}
                </Text>
                <Text style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>
                  {item.tr}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => toggle(item)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: "rgba(239,68,68,0.1)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{ color: "#ef4444", fontSize: 14, fontWeight: "900" }}
                >
                  ✕
                </Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {/* Kaydet butonu */}
      {selected.length >= 4 && (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: 16,
            backgroundColor: "rgba(255,255,255,0.97)",
            borderTopWidth: 1,
            borderTopColor: "rgba(148,163,184,0.15)",
          }}
        >
          <TouchableOpacity
            onPress={save}
            style={{
              backgroundColor: "#6366f1",
              borderRadius: 50,
              paddingVertical: 14,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>
              {`Kaydet — ${setName || "Setim"} (${selected.length} kelime)`}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// CUSTOM SETS SCREEN
// ─────────────────────────────────────────────────────────
function CustomSetsScreen({
  sets,
  onLoad,
  onPlay,
  onDelete,
  onBack,
  onBuild,
  onEdit,
  onShare,
  onImport,
}: {
  sets: CustomSet[];
  onLoad: (id: string, name: string) => Promise<{ ok: boolean; msg: string }>;
  onPlay: (set: CustomSet) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
  onBuild?: () => void;
  onEdit?: (set: CustomSet) => void;
  onShare?: (set: CustomSet) => void;
  onImport?: (code: string) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [importCode, setImportCode] = useState("");
  const [importing, setImporting] = useState(false);
  const [previewSetId, setPreviewSetId] = useState<string | null>(null);
  const [shareModalSet, setShareModalSet] = useState<CustomSet | null>(null);

  return (
    <View
      style={{ flex: 1, backgroundColor: "#f0f4ff", paddingTop: insets.top }}
    >
      <StatusBar backgroundColor="#f0f4ff" barStyle="dark-content" />

      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 14,
          backgroundColor: "#fff",
          borderBottomWidth: 1,
          borderBottomColor: "rgba(148,163,184,0.15)",
        }}
      >
        <TouchableOpacity
          onPress={onBack}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 14,
            backgroundColor: "#f1f5f9",
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: "rgba(148,163,184,0.3)",
          }}
        >
          <Text style={{ fontSize: 13, color: "#64748b", fontWeight: "800" }}>
            {"<"} Geri
          </Text>
        </TouchableOpacity>
        <Text
          style={{
            flex: 1,
            textAlign: "center",
            fontSize: 17,
            fontWeight: "900",
            color: "#1e1b4b",
          }}
        >
          Kelime Setleri
        </Text>
        {onBuild && (
          <TouchableOpacity
            onPress={() => {
              if (sets.length >= MAX_CUSTOM_SETS) {
                Alert.alert(
                  "Set Sınırı",
                  `En fazla ${MAX_CUSTOM_SETS} kelime seti oluşturabilirsin. Önce bir setini sil.`,
                  [{ text: "Tamam" }],
                );
                return;
              }
              onBuild();
            }}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 12,
              backgroundColor:
                sets.length >= MAX_CUSTOM_SETS ? "#cbd5e1" : "#6366f1",
              borderRadius: 12,
            }}
          >
            <Text style={{ fontSize: 12, color: "#fff", fontWeight: "800" }}>
              + Oluştur ({sets.length}/{MAX_CUSTOM_SETS})
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* İnternet / işlem durum banner'ı */}
      {msg && (
        <View
          style={{
            backgroundColor: msg.ok ? "#dcfce7" : "#fee2e2",
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: msg.ok
              ? "rgba(34,197,94,0.2)"
              : "rgba(239,68,68,0.2)",
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: "700",
              color: msg.ok ? "#16a34a" : "#dc2626",
              textAlign: "center",
            }}
          >
            {msg.text}
          </Text>
        </View>
      )}

      {/* Önizleme Modal */}
      {previewSetId &&
        (() => {
          const pset = sets.find((s) => s.id === previewSetId);
          if (!pset) return null;
          return (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(15,23,42,0.88)",
                zIndex: 9999,
                justifyContent: "center",
                padding: 20,
              }}
            >
              <View
                style={{
                  backgroundColor: "#fff",
                  borderRadius: 24,
                  maxHeight: "85%",
                }}
              >
                {/* Header */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: 20,
                    borderBottomWidth: 1,
                    borderBottomColor: "rgba(148,163,184,0.15)",
                  }}
                >
                  <View>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "900",
                        color: "#1e1b4b",
                      }}
                    >
                      📖 {pset.name}
                    </Text>
                    <Text
                      style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}
                    >
                      {pset.words.length} kelime
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setPreviewSetId(null)}>
                    <Text style={{ fontSize: 22, color: "#94a3b8" }}>✕</Text>
                  </TouchableOpacity>
                </View>
                {/* Kelime listesi */}
                <FlatList
                  data={pset.words}
                  keyExtractor={(w, i) => w.en + i}
                  contentContainerStyle={{ padding: 16 }}
                  renderItem={({ item, index }) => (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: 10,
                        paddingHorizontal: 4,
                        borderBottomWidth: 1,
                        borderBottomColor: "rgba(148,163,184,0.1)",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          color: "#cbd5e1",
                          fontWeight: "700",
                          width: 28,
                        }}
                      >
                        {index + 1}
                      </Text>
                      <Text
                        style={{
                          flex: 1,
                          fontSize: 14,
                          fontWeight: "800",
                          color: "#1e293b",
                        }}
                      >
                        {item.en}
                      </Text>
                      <Text
                        style={{
                          fontSize: 13,
                          color: "#64748b",
                          fontWeight: "600",
                        }}
                      >
                        {item.tr}
                      </Text>
                    </View>
                  )}
                />
              </View>
            </View>
          );
        })()}

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: Math.max(40, (insets?.bottom ?? 0) + 24),
        }}
      >
        {/* Kod ile İndir */}
        <View
          style={{
            backgroundColor: "#fff",
            borderRadius: 18,
            padding: 18,
            marginBottom: 16,
            borderWidth: 1.5,
            borderColor: "rgba(99,102,241,0.25)",
          }}
        >
          <Text
            style={{
              fontSize: 15,
              fontWeight: "900",
              color: "#1e1b4b",
              marginBottom: 4,
            }}
          >
            📥 Kod ile Set İndir
          </Text>
          <Text style={{ fontSize: 11, color: "#94a3b8", marginBottom: 12 }}>
            Arkadaşının paylaştığı 6 haneli kodu gir
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              value={importCode}
              onChangeText={(t) => setImportCode(t.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              autoCapitalize="characters"
              style={{
                flex: 1,
                backgroundColor: "#f8faff",
                borderRadius: 12,
                paddingHorizontal: 16,
                paddingVertical: 12,
                fontSize: 20,
                letterSpacing: 6,
                fontWeight: "900",
                color: "#1e1b4b",
                borderWidth: 1.5,
                borderColor: "rgba(99,102,241,0.3)",
                textAlign: "center",
              }}
              placeholderTextColor="#c4b5fd"
            />
            <TouchableOpacity
              onPress={async () => {
                if (importCode.length !== 6 || !onImport) return;
                setImporting(true);
                await onImport(importCode);
                setImportCode("");
                setImporting(false);
              }}
              disabled={importCode.length !== 6 || importing}
              style={{
                backgroundColor:
                  importCode.length === 6 ? "#6366f1" : "#e2e8f0",
                borderRadius: 12,
                paddingHorizontal: 18,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 22 }}>{importing ? "⏳" : "⬇️"}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Kayıtlı setler */}
        {sets.length > 0 && (
          <View>
            <Text
              style={{
                fontSize: 13,
                color: "#94a3b8",
                fontWeight: "700",
                letterSpacing: 2,
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              Kayitli Setler
            </Text>
            {[...sets]
              .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))
              .map((set) => (
                <View
                  key={set.id}
                  style={{
                    backgroundColor: "#fff",
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 10,
                    borderWidth: 1.5,
                    borderColor: "rgba(148,163,184,0.2)",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <Text style={{ fontSize: 20, marginRight: 10 }}>
                      {"📖"}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "800",
                          color: "#1e293b",
                        }}
                      >
                        {set.name}
                      </Text>
                      <Text
                        style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}
                      >
                        {set.words.length} kelime
                      </Text>
                    </View>
                    {deleteId === set.id ? (
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        <TouchableOpacity
                          onPress={() => {
                            onDelete(set.id);
                            setDeleteId(null);
                          }}
                          style={{
                            backgroundColor: "#ef4444",
                            borderRadius: 8,
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                          }}
                        >
                          <Text
                            style={{
                              color: "#fff",
                              fontSize: 11,
                              fontWeight: "700",
                            }}
                          >
                            Sil
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setDeleteId(null)}
                          style={{
                            backgroundColor: "#f1f5f9",
                            borderRadius: 8,
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                          }}
                        >
                          <Text
                            style={{
                              color: "#64748b",
                              fontSize: 11,
                              fontWeight: "700",
                            }}
                          >
                            Iptal
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() => setDeleteId(set.id)}
                        style={{ padding: 6 }}
                      >
                        <Text style={{ fontSize: 16, color: "#cbd5e1" }}>
                          {"🗑️"}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <View
                    style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}
                  >
                    <TouchableOpacity
                      onPress={() => onPlay(set)}
                      style={{
                        flex: 1,
                        backgroundColor: "#6366f1",
                        borderRadius: 12,
                        paddingVertical: 11,
                        alignItems: "center",
                        minWidth: 80,
                      }}
                    >
                      <Text
                        style={{
                          color: "#fff",
                          fontWeight: "900",
                          fontSize: 13,
                        }}
                      >
                        ▶ Oyna
                      </Text>
                    </TouchableOpacity>

                    {/* Önizle butonu — modal açar */}
                    <TouchableOpacity
                      onPress={() => setPreviewSetId(set.id)}
                      style={{
                        paddingHorizontal: 12,
                        backgroundColor: "#f1f5f9",
                        borderRadius: 12,
                        paddingVertical: 11,
                        alignItems: "center",
                        borderWidth: 1.5,
                        borderColor: "rgba(148,163,184,0.3)",
                      }}
                    >
                      <Text style={{ fontSize: 14 }}>👁️</Text>
                    </TouchableOpacity>

                    {/* Oluşturan için: Paylaş + Düzenle */}
                    {set.id.startsWith("local_") ? (
                      <>
                        {onShare && (
                          <TouchableOpacity
                            onPress={() => {
                              setShareModalSet(set);
                              if (onShare) onShare(set);
                            }}
                            style={{
                              paddingHorizontal: 12,
                              backgroundColor: "rgba(99,102,241,0.1)",
                              borderRadius: 12,
                              paddingVertical: 11,
                              alignItems: "center",
                              borderWidth: 1.5,
                              borderColor: "rgba(99,102,241,0.3)",
                            }}
                          >
                            <Text style={{ fontSize: 14 }}>📤</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          onPress={() => onEdit && onEdit(set)}
                          style={{
                            paddingHorizontal: 12,
                            backgroundColor: "#f1f5f9",
                            borderRadius: 12,
                            paddingVertical: 11,
                            alignItems: "center",
                            borderWidth: 1.5,
                            borderColor: "rgba(148,163,184,0.3)",
                          }}
                        >
                          <Text
                            style={{
                              color: "#64748b",
                              fontWeight: "700",
                              fontSize: 11,
                            }}
                          >
                            ✏️
                          </Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      /* İndiren için: Kod göster + Güncelle */
                      <>
                        {set.shareCode && (
                          <TouchableOpacity
                            onPress={() =>
                              Clipboard.setStringAsync(set.shareCode!).then(
                                () =>
                                  showToast(
                                    `📋 Kod kopyalandı: ${set.shareCode}`,
                                  ),
                              )
                            }
                            style={{
                              paddingHorizontal: 10,
                              backgroundColor: "rgba(245,158,11,0.1)",
                              borderRadius: 12,
                              paddingVertical: 11,
                              alignItems: "center",
                              borderWidth: 1.5,
                              borderColor: "rgba(245,158,11,0.3)",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: "900",
                                color: "#d97706",
                                letterSpacing: 2,
                              }}
                            >
                              {set.shareCode ?? ""}
                            </Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          onPress={async () => {
                            if (!onImport) return;
                            const code = set.id.split("_")[1];
                            if (code) {
                              setMsg({ text: "Güncelleniyor...", ok: true });
                              try {
                                await onImport(code);
                                setMsg({ text: "✅ Güncellendi!", ok: true });
                              } catch (_) {
                                setMsg({
                                  text: "📡 İnternet bağlantısı yok",
                                  ok: false,
                                });
                              }
                              setTimeout(() => setMsg(null), 3000);
                            }
                          }}
                          style={{
                            paddingHorizontal: 12,
                            backgroundColor: "#f1f5f9",
                            borderRadius: 12,
                            paddingVertical: 11,
                            alignItems: "center",
                            borderWidth: 1.5,
                            borderColor: "rgba(148,163,184,0.3)",
                          }}
                        >
                          <Text
                            style={{
                              color: "#64748b",
                              fontWeight: "700",
                              fontSize: 11,
                            }}
                          >
                            🔄
                          </Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              ))}
          </View>
        )}

        {sets.length === 0 && (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <Text
              style={{ fontSize: 14, color: "#94a3b8", textAlign: "center" }}
            >
              Henuz kayitli set yok
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

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
