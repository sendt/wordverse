import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Base dimensions — Pixel 7 / iPhone 14 standardı (~390×844)
const BASE_W = 390;
const BASE_H = 844;

/**
 * Tüm bileşenlerde tutarlı layout için merkezi hook.
 * - W, H: reaktif ekran boyutları (döndürme/split-screen dahil)
 * - insets: status bar + nav bar yükseklikleri
 * - scale(n): genişliğe göre orantılı ölçek
 * - ms(n, f): moderate scale — fontlar için (varsayılan %50 ölçek)
 * - safeH: kullanılabilir içerik yüksekliği (status bar + nav bar çıkartılmış)
 */
export function useLayout() {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const scale = (n: number) => n * (W / BASE_W);
  const vs = (n: number) => n * (H / BASE_H);
  const ms = (n: number, factor = 0.5) => n + (scale(n) - n) * factor;

  const safeH = H - insets.top - insets.bottom;

  return { W, H, insets, scale, vs, ms, safeH };
}
