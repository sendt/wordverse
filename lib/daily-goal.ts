import AsyncStorage from "@react-native-async-storage/async-storage";

export const DAILY_GOAL = 10;
const KEY = "wv_daily_v1";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export async function getDailyProgress(
  currentTotal: number,
): Promise<{ done: number; goal: number }> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
      await AsyncStorage.setItem(KEY, JSON.stringify({ date: todayStr(), base: currentTotal }));
      return { done: 0, goal: DAILY_GOAL };
    }
    const data = JSON.parse(raw);
    if (data.date !== todayStr()) {
      // Yeni gün — baseline sıfırla
      await AsyncStorage.setItem(KEY, JSON.stringify({ date: todayStr(), base: currentTotal }));
      return { done: 0, goal: DAILY_GOAL };
    }
    return { done: Math.max(0, currentTotal - (data.base ?? 0)), goal: DAILY_GOAL };
  } catch {
    return { done: 0, goal: DAILY_GOAL };
  }
}
