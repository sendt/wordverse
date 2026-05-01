import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCODD8o8KJM01Yra47FdhxT0uf2gQdMCEs",
  authDomain: "wordverse-fedc7.firebaseapp.com",
  projectId: "wordverse-fedc7",
  storageBucket: "wordverse-fedc7.firebasestorage.app",
  messagingSenderId: "442918539915",
  appId: "1:442918539915:web:736f098da07e61153f7a8e",
  measurementId: "G-8KKJM8HMM6"
};

// Birden fazla initialize'ı önle
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

const SETS_COL = 'shared_sets';

/** 6 haneli benzersiz kod üretir — karışıklık yaratan I, O, 0, 1 yok */
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Seti Firestore'a yükler → benzersiz 6 haneli kod döner */
export async function uploadSet(set: {
  name: string;
  words: { en: string; tr: string }[];
  existingCode?: string;
}): Promise<{ ok: boolean; code?: string; msg: string }> {
  try {
    // Daha önce paylaşıldıysa aynı kodu güncelle
    if (set.existingCode) {
      const ref = doc(db, SETS_COL, set.existingCode);
      await setDoc(ref, {
        name: set.name,
        words: set.words,
        updatedAt: serverTimestamp(),
        expiresAt: Date.now() + 15 * 24 * 60 * 60 * 1000,
      }, { merge: true });
      return { ok: true, code: set.existingCode, msg: `Güncellendi: ${set.existingCode}` };
    }
    // Yeni kod üret
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = generateCode();
      const ref = doc(db, SETS_COL, code);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          name: set.name,
          words: set.words,
          createdAt: serverTimestamp(),
          expiresAt: Date.now() + 15 * 24 * 60 * 60 * 1000,
        });
        return { ok: true, code, msg: `Kod: ${code}` };
      }
    }
    return { ok: false, msg: 'Kod üretilemedi, tekrar dene.' };
  } catch (e: any) {
    return { ok: false, msg: 'Yükleme hatası: ' + e.message };
  }
}

/** Firestore'dan seti siler */
export async function deleteSet(code: string): Promise<void> {
  try {
    const ref = doc(db, SETS_COL, code.trim().toUpperCase());
    await deleteDoc(ref);
  } catch (_) {}
}

/** 6 haneli kodu Firestore'da arar → seti döner */
export async function downloadSet(code: string): Promise<{
  ok: boolean;
  name?: string;
  words?: { en: string; tr: string }[];
  msg: string;
}> {
  try {
    const ref = doc(db, SETS_COL, code.trim().toUpperCase());
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return { ok: false, msg: 'Kod bulunamadı. Kodu kontrol et.' };
    }
    const data = snap.data();
    // Süresi dolmuşsa Firestore'dan sil ve hata döndür
    if (data.expiresAt && data.expiresAt < Date.now()) {
      await deleteDoc(ref);
      return { ok: false, msg: 'Bu setin süresi dolmuş (15 gün). Tekrar paylaşılması gerekiyor.' };
    }
    return {
      ok: true,
      name: data.name,
      words: data.words,
      msg: `"${data.name}" seti indirildi!`,
    };
  } catch (e: any) {
    return { ok: false, msg: 'İndirme hatası: ' + e.message };
  }
}
