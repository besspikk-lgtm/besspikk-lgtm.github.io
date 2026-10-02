/* Alex_bes😈 — спільне підключення Firebase (Auth + Firestore, клієнтський SDK, план Spark). Без Storage. */
export const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD5_dbpCMwmr7eu026qfqblotw1vTDkQW4',
  authDomain: 'alexbes-shop.firebaseapp.com',
  projectId: 'alexbes-shop',
  storageBucket: 'alexbes-shop.firebasestorage.app',
  messagingSenderId: '322069286375',
  appId: '1:322069286375:web:9d97843b89e1bd75424142'
};
export const ADMIN_EMAIL = 'besspikk@gmail.com';

// Local emulators: only on localhost/127.0.0.1 and only with ?emu=1 (remembered for the tab via sessionStorage).
export function useEmulators() {
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if (!local) return false;
  try {
    const q = new URLSearchParams(location.search).get('emu');
    if (q === '1') sessionStorage.setItem('alexbes_emu', '1');
    if (q === '0') sessionStorage.removeItem('alexbes_emu');
    return sessionStorage.getItem('alexbes_emu') === '1';
  } catch (e) { return new URLSearchParams(location.search).get('emu') === '1'; }
}

let ready = null;
export function loadFirebase() {
  if (ready) return ready;
  ready = (async () => {
    const [appM, authM, fsM] = await Promise.all([
      import(SDK + 'firebase-app.js'),
      import(SDK + 'firebase-auth.js'),
      import(SDK + 'firebase-firestore.js')
    ]);
    const app = appM.initializeApp(FIREBASE_CONFIG);
    const auth = authM.getAuth(app);
    auth.languageCode = 'uk';
    const db = fsM.getFirestore(app);
    const emu = useEmulators();
    if (emu) {
      authM.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      fsM.connectFirestoreEmulator(db, '127.0.0.1', 8080);
    }
    return { app, auth, db, A: authM, F: fsM, emu };
  })();
  return ready;
}

export function isAdminUser(u) {
  return !!(u && u.email && u.email.toLowerCase() === ADMIN_EMAIL && u.emailVerified);
}

// Firebase Auth error codes -> Ukrainian messages
export function authErr(e) {
  const c = (e && e.code) || '';
  const m = {
    'auth/invalid-email': 'Невірний формат email.',
    'auth/missing-email': 'Вкажіть email.',
    'auth/missing-password': 'Вкажіть пароль.',
    'auth/weak-password': 'Пароль надто простий — щонайменше 6 символів.',
    'auth/email-already-in-use': 'Цей email уже зареєстровано. Увійдіть або скористайтеся «Забули пароль?».',
    'auth/invalid-credential': 'Невірний email або пароль.',
    'auth/wrong-password': 'Невірний email або пароль.',
    'auth/user-not-found': 'Користувача з таким email не знайдено.',
    'auth/user-disabled': 'Акаунт заблоковано.',
    'auth/too-many-requests': 'Забагато спроб. Спробуйте пізніше.',
    'auth/network-request-failed': 'Немає з’єднання з мережею. Спробуйте ще раз.',
    'auth/popup-closed-by-user': 'Вікно входу закрито.',
    'auth/cancelled-popup-request': 'Вікно входу закрито.',
    'auth/unauthorized-domain': 'Цей домен не дозволено для входу (налаштування Firebase).',
    'auth/operation-not-allowed': 'Цей спосіб входу вимкнено в налаштуваннях Firebase.',
    'auth/account-exists-with-different-credential': 'Акаунт з цим email уже існує — увійдіть іншим способом (email або Google).',
    'auth/requires-recent-login': 'Увійдіть ще раз і повторіть дію.'
  };
  if (m[c]) return m[c];
  if (/permission-denied/.test(c)) return 'Немає доступу (правила безпеки).';
  if (/unavailable/.test(c)) return 'Сервер недоступний. Перевірте з’єднання.';
  return 'Помилка: ' + (c || (e && e.message) || 'невідома');
}

// Google: popup first; if the popup is blocked / unsupported (some mobile in-app browsers) — redirect.
export async function googleSignIn(fb) {
  const { A, auth } = fb;
  const prov = new A.GoogleAuthProvider();
  prov.setCustomParameters({ prompt: 'select_account' });
  try {
    return await A.signInWithPopup(auth, prov);
  } catch (e) {
    if (e && /popup-blocked|operation-not-supported-in-environment|web-storage-unsupported/.test(e.code || '')) {
      await A.signInWithRedirect(auth, prov);
      return null;
    }
    throw e;
  }
}

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
