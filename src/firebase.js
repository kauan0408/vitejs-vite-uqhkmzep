// src/firebase.js
import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  initializeFirestore,
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA6cdF26jyRSuclkPNjcHNFpLey5GuM5Q4",
  authDomain: "financas-offline.firebaseapp.com",
  projectId: "financas-offline",
  storageBucket: "financas-offline.firebasestorage.app",
  messagingSenderId: "353840341280",
  appId: "1:353840341280:web:1ac5be0ca48ba34f7fb745",
  measurementId: "G-7RTK0Z27RM",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.setCustomParameters({
  prompt: "select_account",
});

export function loginComGoogle() {
  return signInWithPopup(auth, provider);
}

export function logout() {
  return signOut(auth);
}

// Campos opcionais vazios (undefined) não interrompem o salvamento inteiro.
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
});

export async function salvarDados(uid, tipo, dados) {
  if (!uid || !tipo) return;
  const ref = doc(db, "usuarios", uid, "dados", tipo);
  await setDoc(ref, dados, { merge: true });
}

export async function carregarDados(uid, tipo) {
  if (!uid || !tipo) return null;
  const ref = doc(db, "usuarios", uid, "dados", tipo);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data();
}
