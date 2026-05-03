import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, FlatList, SectionList, StatusBar, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hap, hapSel } from "../../../lib/audio";
import { CustomSet } from "../../../lib/constants";
import { H, W } from "../../../lib/dimensions";
import { WORD_BANKS as ALL_WORDS } from "../../../words";
import type { Word } from "../../../words";

export default function SetBuilderScreen({
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
      style={{ flex: 1, backgroundColor: "#f0f4ff", paddingTop: insets.top, paddingBottom: insets.bottom }}
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
                contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
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
                  paddingBottom: insets.bottom + 20,
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
          contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 20 }}
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
