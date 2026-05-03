import React, { useEffect, useRef, useState } from "react";
import { Animated, Text } from "react-native";

let _toastTimeout: any = null;
let _setToastGlobal: ((msg: string | null) => void) | null = null;

export function showToast(msg: string, ms = 1800) {
  if (_setToastGlobal) {
    if (_toastTimeout) clearTimeout(_toastTimeout);
    _setToastGlobal(msg);
    _toastTimeout = setTimeout(() => {
      if (_setToastGlobal) _setToastGlobal(null);
    }, ms);
  }
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    _setToastGlobal = setMsg;
    return () => { _setToastGlobal = null; };
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
