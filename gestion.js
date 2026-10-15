// Página de gestión (requiere sesión de login.html): OCR de la foto y edición manual.
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { auth, db, MENUS, SECTIONS, toISODate, emailOf, isAuthorized } from "./firebase-config.js";
import { findColumns, findPostre, findPrice, findCell, cleanCell, weekdayIndex, DAYS } from "./ocr-parser.js";

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

function isEmpty(data) {
  return SECTIONS.every(({ key }) => !data[key] || data[key].length === 0);
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
  if (isEmpty(data)) {
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

// Recorta la celda en un lienzo aparte, en blanco y negro y con margen blanco.
// Binarizar a mano evita que Tesseract confunda el fondo gris del papel con tinta.
function cropCell(source, rect, scale = 2, pad = 20) {
  // Se amplía la celda: Tesseract acierta más con letras de unos 30 px
  const w = rect.width * scale, h = rect.height * scale;
  const big = document.createElement("canvas");
  big.width = w;
  big.height = h;
  const bctx = big.getContext("2d");
  bctx.imageSmoothingQuality = "high";
  bctx.drawImage(source, rect.left, rect.top, rect.width, rect.height, 0, 0, w, h);
  const pixels = bctx.getImageData(0, 0, w, h);
  const d = pixels.data;

  // La celda es casi toda fondo: lo que esté bastante por debajo de la media es tinta
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += d[i];
  const threshold = sum / (d.length / 4) - 50;
  const ink = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) ink[p] = d[p * 4] < threshold ? 1 : 0;

  // Borra las líneas de la tabla: manchas conectadas mucho más altas o anchas que una letra
  const seen = new Uint8Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (!ink[start] || seen[start]) continue;
    const comp = [start];
    seen[start] = 1;
    let x0 = w, x1 = 0, y0 = h, y1 = 0;
    for (let k = 0; k < comp.length; k++) {
      const p = comp[k], x = p % w, y = (p - x) / w;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= w * h || seen[q] || !ink[q]) continue;
        if ((q === p - 1 || q === p + 1) && Math.floor(q / w) !== y) continue;
        seen[q] = 1;
        comp.push(q);
      }
    }
    if (y1 - y0 > h * 0.25 || x1 - x0 > w * 0.6) for (const p of comp) ink[p] = 0;
  }
  for (let p = 0; p < w * h; p++) d[p * 4] = d[p * 4 + 1] = d[p * 4 + 2] = ink[p] ? 0 : 255;

  const out = document.createElement("canvas");
  out.width = w + pad * 2;
  out.height = h + pad * 2;
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.putImageData(pixels, pad, pad);
  return out;
}

const DAY_LABELS = ["lunes", "martes", "miércoles", "jueves", "viernes"];

// Hoja semanal: se localiza la columna del día de la fecha elegida y se lee solo esa celda
$("ocrBtn").addEventListener("click", async () => {
  if (!selectedFile) return;

  const date = $("menuDate").value;
  const dayIndex = date ? weekdayIndex(date) : -1;
  if (dayIndex < 0) {
    $("ocrMsg").textContent = "Elige una fecha de lunes a viernes: la hoja solo tiene esos días.";
    return;
  }

  $("ocrBtn").disabled = true;
  $("ocrProgress").hidden = false;
  $("ocrProgress").value = 0;
  $("ocrMsg").textContent = "Preparando OCR (la primera vez descarga el idioma español)…";

  let step = "Leyendo la hoja";
  let worker;
  try {
    worker = await Tesseract.createWorker("spa", 1, {
      logger: (m) => {
        if (m.status === "recognizing text") {
          $("ocrProgress").value = m.progress;
          $("ocrMsg").textContent = `${step}… ${Math.round(m.progress * 100)}%`;
        }
      }
    });
    const canvas = await preprocess(selectedFile);

    // 1ª pasada: toda la hoja, para encontrar las cabeceras de los días y el postre
    const { data } = await worker.recognize(canvas);
    $("rawText").textContent = data.text;
    $("rawBox").hidden = false;

    const cols = findColumns(data.words);
    if (!cols) {
      $("ocrMsg").textContent = "No encontré los días de la semana en la foto. Prueba con una foto más recta o escribe el plato a mano.";
      return;
    }
    const postre = findPostre(data.lines);
    const price = findPrice(data.lines);
    const bottomY = (postre || price)?.bbox.y0 ?? cols.headerBottom + Math.abs(cols.spacing);

    // 2ª pasada: solo la celda del día elegido, leída como un bloque de texto
    const rect = findCell(cols, dayIndex, bottomY, canvas.width);
    let plato = "";
    if (rect) {
      step = `Leyendo el plato del ${DAY_LABELS[dayIndex]}`;
      await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK });
      const cell = await worker.recognize(cropCell(canvas, rect));
      plato = cleanCell(cell.data.lines);
      console.log(`[OCR] Celda de ${DAYS[dayIndex]}`, rect, cell.data.text);
    }

    if (!plato) {
      $("ocrMsg").textContent = `No pude leer el plato del ${DAY_LABELS[dayIndex]}. Escríbelo a mano.`;
      return;
    }

    if (!isEmpty(readMenu()) && !confirm("Ya hay datos en el editor. ¿Reemplazarlos por los reconocidos?")) {
      $("ocrMsg").textContent = "Reconocimiento descartado.";
      return;
    }

    setMenu({
      primeros: [plato],
      postres: postre?.text ? [postre.text] : [],
      // El precio se lee mal (letra muy clara), así que las notas no se rellenan solas
      notas: $("notesInput").value
    });
    $("ocrMsg").textContent = `Plato del ${DAY_LABELS[dayIndex]} reconocido. Revísalo y pulsa Guardar.`;
  } catch (e) {
    console.error("[OCR] Error", e);
    $("ocrMsg").textContent = "Error al reconocer la imagen.";
  } finally {
    if (worker) await worker.terminate();
    $("ocrBtn").disabled = false;
    $("ocrProgress").hidden = true;
  }
});
