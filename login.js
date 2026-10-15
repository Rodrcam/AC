// Login con el mismo flujo que join.html, pero por redirección (sin ventana emergente)
// y sin escribir en tempusers: solo comprueba que el correo está en "canteen".
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { auth, emailOf, isAuthorized } from "./firebase-config.js";

const logger = {
  info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
  success: (msg, data) => console.log(`[SUCCESS] ✅ ${msg}`, data || ''),
  error: (msg, data) => console.error(`[ERROR] ❌ ${msg}`, data || ''),
  auth: (msg, data) => console.log(`[AUTH] 🔐 ${msg}`, data || '')
};

const msg = document.getElementById("loginMsg");
const buttons = [document.getElementById("googleBtn"), document.getElementById("microsoftBtn")];

if (new URLSearchParams(location.search).get("error") === "no-autorizado") {
  msg.textContent = "Ese correo no está autorizado para gestionar el menú.";
}

function createProvider(type) {
  logger.info(`Creando proveedor de autenticación: ${type}`);
  if (type === "google") {
    const p = new GoogleAuthProvider();
    p.addScope("email");
    p.addScope("profile");
    p.setCustomParameters({
      prompt: "select_account"
    });
    return p;
  }
  const p = new OAuthProvider("microsoft.com");
  p.addScope("email");
  p.addScope("openid");
  p.addScope("profile");
  p.setCustomParameters({
    prompt: "select_account"
  });
  return p;
}

async function handleAuth(button, type) {
  logger.auth(`Iniciando autenticación con ${type}`);
  buttons.forEach((b) => (b.disabled = true));
  try {
    logger.info(`Intentando signInWithRedirect para ${type}`);
    await signInWithRedirect(auth, createProvider(type));
  } catch (e) {
    logger.error(`Error en autenticación con ${type}`, { message: e.message, code: e.code || 'unknown' });
    buttons.forEach((b) => (b.disabled = false));
    msg.textContent = "No se pudo iniciar sesión.";
  }
}

// Al volver de Google/Microsoft: comprobar el correo y entrar en gestión
async function checkUser(user) {
  const email = emailOf(user);
  logger.auth(`Usuario autenticado: ${user.uid}`, { email: email || 'No disponible' });

  if (await isAuthorized(email)) {
    logger.success(`Correo autorizado en canteen/${email}`);
    window.location.replace("./gestion.html");
  } else {
    logger.error(`Correo no autorizado: ${email}`);
    await signOut(auth);
    msg.textContent = `El correo ${email || "(desconocido)"} no está autorizado para gestionar el menú.`;
    buttons.forEach((b) => (b.disabled = false));
  }
}

getRedirectResult(auth).catch((e) => {
  logger.error("Error al volver del inicio de sesión", { message: e.message, code: e.code || 'unknown' });
  msg.textContent = "No se pudo iniciar sesión.";
});

onAuthStateChanged(auth, (user) => {
  if (user) checkUser(user);
});

document.getElementById("googleBtn").addEventListener("click", function() {
  logger.info('Click en botón Google');
  handleAuth(this, "google");
});

document.getElementById("microsoftBtn").addEventListener("click", function() {
  logger.info('Click en botón Microsoft');
  handleAuth(this, "microsoft");
});

logger.info('Aplicación inicializada correctamente');
