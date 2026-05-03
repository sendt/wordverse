export type GameId = "rush" | "falling" | "match" | "pairs" | "pinball";
export type ClassMode = "solo" | "class";
export type SpeedMode = "yavas" | "normal" | "hizli" | "auto";
export type GateState = "fall" | "ok" | "bad";

import type { Word } from "../words";

export type Gate = {
  id: number;
  word: Word;
  leftLabel: string;
  rightLabel: string;
  cLeft: boolean;
  y: number;
  state: GateState;
  opacity: number;
};

export interface CustomSet {
  id: string;
  name: string;
  words: { en: string; tr: string }[];
  addedAt: number;
  lastUsed?: number;
  shareCode?: string;
}

export const MAX_CUSTOM_SETS = 3;

export const GOALS = [
  {
    id: "gunluk" as const,
    icon: "💬",
    title: "Günlük Yaşam",
    sub: "Konuşma & günlük kelimeler",
    color: "#34d399",
    bg: "#064e3b",
  },
  {
    id: "akademi" as const,
    icon: "🎓",
    title: "Akademi & Sınav",
    sub: "YDS · YÖKDİL · Akademik İngilizce",
    color: "#60a5fa",
    bg: "#1e3a5f",
  },
];

export const LEVELS: { id: import("../words").Level; label: string; sub: string; color: string }[] = [
  { id: "A1", label: "A1", sub: "Başlangıç", color: "#34d399" },
  { id: "A2", label: "A2", sub: "Temel", color: "#60a5fa" },
  { id: "B1", label: "B1", sub: "Orta Altı", color: "#f59e0b" },
  { id: "B2", label: "B2", sub: "Orta Üstü", color: "#f97316" },
  { id: "C1", label: "C1", sub: "İleri", color: "#ec4899" },
  { id: "C2", label: "C2", sub: "Ustalık", color: "#a855f7" },
];

export const GAMES_META = [
  { id: "rush",    icon: "🚗", title: "Araba",         desc: "Sürükle, kapıdan geç",      color: "#60a5fa" },
  { id: "falling", icon: "☄️", title: "Falling",        desc: "Düşmeden yakala",           color: "#f87171" },
  { id: "match",   icon: "🔗", title: "Eşleştir",       desc: "Çiftleri bul",              color: "#34d399" },
  { id: "pairs",   icon: "🃏", title: "3310 Pairs",     desc: "Eşleri hafızandan bul",     color: "#f59e0b" },
  { id: "pinball", icon: "🎱", title: "Kelime Pinball", desc: "Doğru kova, topla vur!",    color: "#f59e0b" },
];

export const SPEEDS: Record<SpeedMode, { label: string; color: string; base: number }> = {
  yavas:  { label: "🐢 Yavaş",    color: "#34d399", base: 52  },
  normal: { label: "⚡ Normal",   color: "#60a5fa", base: 90  },
  hizli:  { label: "🔥 Hızlı",   color: "#f87171", base: 140 },
  auto:   { label: "🤖 Otomatik", color: "#c084fc", base: 70  },
};
