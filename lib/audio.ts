import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";

export const settings = {
  haptic: false,
  sound: true,
  bgMusic: false,
  menuSound: true,
  bgVolume: 0.35,
};

// ─── Haptics ────────────────────────────────────────────────
export const hap = (style?: any) => {
  if (settings.haptic)
    Haptics.impactAsync(style ?? Haptics.ImpactFeedbackStyle.Light);
};
export const hapSel = () => {
  if (settings.haptic) Haptics.selectionAsync();
};
export const hapHeavy = () => {
  if (settings.haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
};

// ─── WAV generator ──────────────────────────────────────────
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

export async function playSoundOk() {
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

export async function playSoundError() {
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

export function speakWord(word: string) {
  if (!settings.sound) return;
  try {
    Speech.speak(word, { language: "en-US", pitch: 1.0, rate: 0.85 });
  } catch (_) {}
}

// ─── Menü tık sesi ──────────────────────────────────────────
export async function playMenuTick() {
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

// ─── Arka plan müziği ───────────────────────────────────────
let _bgSound: any = null;
let _bgState: "stopped" | "loading" | "playing" = "stopped";

export async function startBgMusic() {
  if (!settings.bgMusic) return;
  if (_bgState === "playing" || _bgState === "loading") return;
  _bgState = "loading";
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    });
    if (_bgSound) {
      await _bgSound.setVolumeAsync(settings.bgVolume);
      await _bgSound.playAsync();
    } else {
      const { sound } = await Audio.Sound.createAsync(
        require("../assets/appmsc.mp3"),
        { isLooping: true, volume: settings.bgVolume, shouldPlay: true },
      );
      _bgSound = sound;
    }
    _bgState = "playing";
  } catch (_) {
    _bgState = "stopped";
  }
}

export async function stopBgMusic() {
  if (_bgState === "stopped") return;
  _bgState = "stopped";
  try {
    if (_bgSound) await _bgSound.pauseAsync();
  } catch (_) {}
}

export async function setBgVolume(vol: number) {
  settings.bgVolume = vol;
  try {
    if (_bgSound) await _bgSound.setVolumeAsync(vol);
  } catch (_) {}
}

export async function toggleBgMusic(on: boolean) {
  settings.bgMusic = on;
  if (on) {
    await startBgMusic();
  } else {
    await stopBgMusic();
  }
}
