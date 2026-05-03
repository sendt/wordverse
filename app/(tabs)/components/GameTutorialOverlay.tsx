import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface Props {
  gameId: string;
  title: string;
  icon: string;
  steps: string[];
}

export function GameTutorialOverlay({ gameId, title, icon, steps }: Props) {
  const [visible, setVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<any>(null);

  useEffect(() => {
    AsyncStorage.getItem(`wv_seen_${gameId}`).then((val) => {
      if (!val) {
        setVisible(true);
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
        timerRef.current = setTimeout(dismiss, 5000);
      }
    });
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const dismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    AsyncStorage.setItem(`wv_seen_${gameId}`, "1");
    Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() =>
      setVisible(false),
    );
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFillObject,
        {
          opacity: fadeAnim,
          backgroundColor: "rgba(15,23,42,0.94)",
          zIndex: 1000,
          alignItems: "center",
          justifyContent: "center",
          padding: 28,
        },
      ]}
    >
      <TouchableOpacity activeOpacity={1} onPress={dismiss} style={{ alignItems: "center", width: "100%" }}>
        <Text style={{ fontSize: 56, marginBottom: 10 }}>{icon}</Text>
        <Text style={{ fontSize: 20, fontWeight: "900", color: "#fff", marginBottom: 4, textAlign: "center" }}>
          {title}
        </Text>
        <Text style={{ fontSize: 12, color: "#6366f1", letterSpacing: 2, marginBottom: 24, textTransform: "uppercase", fontWeight: "700" }}>
          Nasıl oynanır?
        </Text>

        {steps.map((step, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14, width: "100%" }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: "#6366f1", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
              <Text style={{ color: "#fff", fontSize: 13, fontWeight: "900" }}>{i + 1}</Text>
            </View>
            <Text style={{ color: "#e2e8f0", fontSize: 15, flex: 1, lineHeight: 24 }}>{step}</Text>
          </View>
        ))}

        <View style={{ marginTop: 20, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ color: "#475569", fontSize: 12 }}>Dokun veya 5sn bekle</Text>
          <Text style={{ color: "#6366f1", fontSize: 14 }}>→</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}
