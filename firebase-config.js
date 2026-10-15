// Configuración compartida de Firebase (misma app web que ariseclub join.html).
// Esta config es pública por diseño: la seguridad la ponen las reglas de Firestore.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

export const app = initializeApp({
  apiKey: "AIzaSyAdRctmMezyRBFVJBYZ8jufDqRmyARk790",
  authDomain: "arise-a3be8.firebaseapp.com",
  projectId: "arise-a3be8",
  storageBucket: "arise-a3be8.firebasestorage.app",
  messagingSenderId: "454589771976",
  appId: "1:454589771976:web:bebcc57c4b569e3974b5fd"
});

export const auth = getAuth(app);
export const db = getFirestore(app);

// Colecciones de la cafetería
export const MENUS = "canteen_menus";   // canteen_menus/{YYYY-MM-DD}
export const ADMINS = "canteen";       // canteen/{email en minúsculas} = correo autorizado

export function emailOf(user) {
  const provider = user.providerData[0];
  return ((provider && provider.email) || user.email || "").trim().toLowerCase();
}

// Un correo está autorizado si existe el documento canteen/{email}
export async function isAuthorized(email) {
  if (!email) return false;
  try {
    const snap = await getDoc(doc(db, ADMINS, email));
    return snap.exists();
  } catch (e) {
    // permission-denied también significa "no autorizado"
    console.warn("[AUTH] No se pudo comprobar la autorización", e.code || e);
    return false;
  }
}

export const SECTIONS = [
  { key: "primeros", label: "Plato del día" },
  { key: "postres", label: "Postre" }
];

// Fecha local en formato YYYY-MM-DD (sin desfase UTC)
export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromISODate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatLongDate(s) {
  return fromISODate(s).toLocaleDateString("es-ES", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
}
