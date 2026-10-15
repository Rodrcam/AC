// Login con el mismo flujo que join.html (ventana emergente), pero sin escribir
// en tempusers: solo comprueba que el correo está en "canteen".
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
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
  // Se bloquean los dos botones: un segundo login cancelaría el primero (auth/cancelled-popup-request)
  buttons.forEach((b) => (b.disabled = true));
  msg.textContent = "";

  try {
    logger.info(`Intentando signInWithPopup para ${type}`);
    const result = await signInWithPopup(auth, createProvider(type));
    await checkUser(result.user);
  } catch (e) {
    logger.error(`Error en autenticación con ${type}`, {
      message: e.message,
      code: e.code || 'unknown',
      stack: e.stack
    });
    buttons.forEach((b) => (b.disabled = false));
    if (e.code === "auth/popup-blocked") {
      msg.textContent = "El navegador ha bloqueado la ventana de inicio de sesión. Permite las ventanas emergentes para esta web.";
    } else if (e.code === "auth/popup-closed-by-user") {
      msg.textContent = "Has cerrado la ventana antes de terminar.";
    } else {
      msg.textContent = "No se pudo iniciar sesión.";
    }
  }
}

// Comprueba el correo y entra en gestión
async function checkUser(user) {
  const email = emailOf(user);
  logger.auth(`Usuario autenticado: ${user.uid}`, { email: email || 'No disponible' });

  if (await isAuthorized(email)) {
    logger.success(`Correo autorizado en canteen/${email}`);
    logger.info(`Redirigiendo a gestion.html`);
    window.location.replace("./gestion.html");
  } else {
    logger.error(`Correo no autorizado: ${email}`);
    await signOut(auth);
    msg.textContent = `El correo ${email || "(desconocido)"} no está autorizado para gestionar el menú.`;
    buttons.forEach((b) => (b.disabled = false));
  }
}

// Si ya había una sesión abierta, entra directamente
const stopListening = onAuthStateChanged(auth, (user) => {
  stopListening();
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
