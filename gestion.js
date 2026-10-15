// Página de gestión (requiere sesión de login.html): OCR de la foto y edición manual.
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { auth, db, MENUS, SECTIONS, toISODate, emailOf, isAuthorized } from "./firebase-config.js";
import { parseMenu } from "./ocr-parser.js";

const $ = (id) => document.getElementById(id);
let currentEmail = "";

// ---------- Sesión: sin usuario autorizado se vuelve a login.html ----------

$("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.replace("./login.html");
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace("./login.html");
    return;
  }
  const email = emailOf(user);
  if (await isAuthorized(email)) {
    currentEmail = email;
    $("userEmail").textContent = email;
    $("loading").hidden = true;
    $("editorView").hidden = false;
    loadMenu();
  } else {
    await signOut(auth);
    window.location.replace("./login.html?error=no-autorizado");
  }
});

// ---------- Editor de platos ----------

function addDish(section, value = "") {
  const li = document.createElement("li");
  li.className = "edit-item";

  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.placeholder = "Nombre del plato";

  const move = document.createElement("select");
  move.title = "Mover a otra sección";
  for (const s of SECTIONS) {
    const opt = document.createElement("option");
    opt.value = s.key;
    opt.textContent = s.label;
    opt.selected = s.key === section;
    move.appendChild(opt);
  }
  move.addEventListener("change", () => $(`edit-${move.value}`).appendChild(li));

  const del = document.createElement("button");
  del.type = "button";
  del.className = "btn-icon";
  del.textContent = "✕";
  del.title = "Eliminar";
  del.addEventListener("click", () => li.remove());

  li.append(input, move, del);
  $(`edit-${section}`).appendChild(li);
  return input;
}

function setMenu(data) {
  for (const { key } of SECTIONS) {
    $(`edit-${key}`).innerHTML = "";
    for (const dish of data[key] || []) addDish(key, dish);
  }
  $("notesInput").value = data.notas || "";
}

function readMenu() {
  const data = {};
  for (const { key } of SECTIONS) {
    data[key] = [...$(`edit-${key}`).querySelectorAll("input")]
      .map((i) => i.value.trim())
      .filter(Boolean);
  }
  data.notas = $("notesInput").value.trim();
  return data;
}

document.querySelectorAll(".add-btn").forEach((btn) =>
  btn.addEventListener("click", () => addDish(btn.dataset.section).focus())
);

$("clearBtn").addEventListener("click", () => {
  if (confirm("¿Vaciar todos los platos del editor? (No se borra nada hasta que guardes)")) setMenu({});
});

// ---------- Carga y guardado en Firestore ----------

$("menuDate").value = toISODate(new Date());
$("menuDate").addEventListener("change", loadMenu);

async function loadMenu() {
  const date = $("menuDate").value;
  if (!date) return;
  $("saveMsg").textContent = "";
  try {
    const snap = await getDoc(doc(db, MENUS, date));
    setMenu(snap.exists() ? snap.data() : {});
    if (snap.exists()) $("saveMsg").textContent = "Menú existente cargado para esta fecha.";
  } catch (e) {
    console.error("[MENU] Error al cargar", e);
    $("saveMsg").textContent = "No se pudo cargar el menú de esta fecha.";
  }
}

$("saveBtn").addEventListener("click", async () => {
  const date = $("menuDate").value;
  if (!date) {
    $("saveMsg").textContent = "Elige una fecha.";
    return;
  }
  const data = readMenu();
  if (!data.primeros.length && !data.segundos.length && !data.postres.length) {
    $("saveMsg").textContent = "El menú está vacío.";
    return;
  }
  $("saveBtn").disabled = true;
  $("saveMsg").textContent = "Guardando…";
  try {
    await setDoc(doc(db, MENUS, date), {
      ...data,
      fecha: date,
      updatedBy: currentEmail,
      updatedAt: serverTimestamp()
    });
    $("saveMsg").textContent = `Menú del ${date} guardado.`;
  } catch (e) {
    console.error("[MENU] Error al guardar", e);
    $("saveMsg").textContent = e.code === "permission-denied"
      ? "Sin permiso para guardar. Revisa las reglas de Firestore."
      : "No se pudo guardar el menú.";
  } finally {
    $("saveBtn").disabled = false;
  }
});

// ---------- Foto + OCR (Tesseract.js, todo en el navegador) ----------

let selectedFile = null;

$("photoInput").addEventListener("change", (e) => {
  selectedFile = e.target.files[0] || null;
  $("ocrBtn").disabled = !selectedFile;
  $("ocrMsg").textContent = "";
  if (selectedFile) {
    $("photoPreview").src = URL.createObjectURL(selectedFile);
    $("photoPreview").hidden = false;
  }
});

// Escala de grises + contraste y tamaño razonable para mejorar el OCR
async function preprocess(file) {
  const img = await createImageBitmap(file);
  const maxSide = 2000;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.filter = "grayscale(1) contrast(1.4)";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

$("ocrBtn").addEventListener("click", async () => {
  if (!selectedFile) return;
  $("ocrBtn").disabled = true;
  $("ocrProgress").hidden = false;
  $("ocrProgress").value = 0;
  $("ocrMsg").textContent = "Preparando OCR (la primera vez descarga el idioma español)…";

  try {
    const canvas = await preprocess(selectedFile);
    const { data } = await Tesseract.recognize(canvas, "spa", {
      logger: (m) => {
        if (m.status === "recognizing text") {
          $("ocrProgress").value = m.progress;
          $("ocrMsg").textContent = `Reconociendo texto… ${Math.round(m.progress * 100)}%`;
        }
      }
    });

    $("rawText").textContent = data.text;
    $("rawBox").hidden = false;

    const parsed = parseMenu(data.text);
    // Lo que no tenía cabecera va a "Primeros" para recolocarlo a mano
    parsed.primeros.push(...parsed.sinClasificar);

    const total = parsed.primeros.length + parsed.segundos.length + parsed.postres.length;
    if (!total) {
      $("ocrMsg").textContent = "No se reconocieron platos. Prueba con otra foto o escríbelos a mano.";
      return;
    }

    const hasContent = readMenu();
    if ((hasContent.primeros.length || hasContent.segundos.length || hasContent.postres.length) &&
        !confirm("Ya hay platos en el editor. ¿Reemplazarlos por los reconocidos?")) {
      $("ocrMsg").textContent = "Reconocimiento descartado.";
      return;
    }

    setMenu({ ...parsed, notas: $("notesInput").value });
    $("ocrMsg").textContent = parsed.sinClasificar.length
      ? `${total} platos reconocidos. Algunos no tenían sección y se han puesto en Primeros: muévelos con el selector.`
      : `${total} platos reconocidos. Revísalos y pulsa Guardar.`;
  } catch (e) {
    console.error("[OCR] Error", e);
    $("ocrMsg").textContent = "Error al reconocer la imagen.";
  } finally {
    $("ocrBtn").disabled = false;
    $("ocrProgress").hidden = true;
  }
});
