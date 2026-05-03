import * as Clipboard from "expo-clipboard";
import React, { useState } from "react";
import { Alert, FlatList, Linking, ScrollView, SectionList, StatusBar, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { downloadSet, uploadSet } from "../../../firebase";
import { hap, hapSel } from "../../../lib/audio";
import { CustomSet } from "../../../lib/constants";
import { W } from "../../../lib/dimensions";
import { showToast } from "../components/ToastHost";
import { WORD_BANKS as ALL_WORDS } from "../../../words";
import type { Word } from "../../../words";

export default function CustomSetsScreen({
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
      style={{ flex: 1, backgroundColor: "#f0f4ff", paddingTop: insets.top, paddingBottom: insets.bottom }}
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