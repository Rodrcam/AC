// Página de gestión (requiere sesión de login.html): se edita una semana entera, a mano
// o leyendo la foto de la hoja semanal con OCR.
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  doc,
  getDoc,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import {
  auth, db, MENUS, POSTRE, PRECIO_DEFECTO, DAY_NAMES,
  toISODate, fromISODate, addDays, mondayOf, emailOf, isAuthorized
} from "./firebase-config.js";
import { findColumns, findPostre, findPrice, findCell, findWeek, cleanCell } from "./ocr-parser.js";

const $ = (id) => document.getElementById(id);
let currentEmail = "";
let monday = mondayOf(toISODate(new Date()));

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
    setWeek(monday);
  } else {
    await signOut(auth);
    window.location.replace("./login.html?error=no-autorizado");
  }
});

// ---------- Editor de la semana ----------

$("postreFijo").textContent = POSTRE;
$("priceInput").value = PRECIO_DEFECTO;

const weekDates = () => DAY_NAMES.map((_, i) => addDays(monday, i));
const shortDate = (s) => fromISODate(s).toLocaleDateString("es-ES", { day: "numeric", month: "long" });
const dayInput = (i) => $(`plato-${i}`);
const festivoBox = (i) => $(`festivo-${i}`);
const isFestivo = (plato) => /^festivo$/i.test(plato);
let dirty = false; // cambios sin guardar en la semana mostrada

// Una fila por día: "Lunes 12 de octubre", el plato y la casilla de festivo
const grid = $("weekGrid");
DAY_NAMES.forEach((name, i) => {
  const row = document.createElement("div");
  row.className = "day-row";
  row.innerHTML = `
    <label for="plato-${i}">${name} <small id="date-${i}"></small></label>
    <input id="plato-${i}" type="text" placeholder="Plato del día" />
    <label class="toggle"><input id="festivo-${i}" type="checkbox" /> Festivo</label>`;
  grid.append(row);
  dayInput(i).addEventListener("input", () => (dirty = true));
  festivoBox(i).addEventListener("change", () => {
    setFestivo(i, festivoBox(i).checked);
    dirty = true;
  });
});

// Un día festivo se guarda con el plato "Festivo"
function setFestivo(i, on, plato = "") {
  festivoBox(i).checked = on;
  dayInput(i).disabled = on;
  dayInput(i).value = on ? "Festivo" : plato;
  dayInput(i).closest(".day-row").classList.toggle("is-festivo", on);
}

function readWeek() {
  return DAY_NAMES.map((_, i) => (festivoBox(i).checked ? "Festivo" : dayInput(i).value.trim()));
}

function fillWeek(platos) {
  DAY_NAMES.forEach((_, i) => setFestivo(i, isFestivo(platos[i] || ""), platos[i] || ""));
}

// "12 al 16 de octubre" o, si cambia el mes, "28 de septiembre al 2 de octubre"
function weekText(dates) {
  const [first, last] = [fromISODate(dates[0]), fromISODate(dates[4])];
  const from = first.getMonth() === last.getMonth() ? first.getDate() : shortDate(dates[0]);
  return `${from} al ${shortDate(dates[4])}`;
}

// Cambia la semana mostrada; con load = true trae lo que ya hay guardado
async function setWeek(newMonday, load = true) {
  monday = newMonday;
  const dates = weekDates();
  dates.forEach((d, i) => ($(`date-${i}`).textContent = shortDate(d)));
  $("weekLabel").textContent = weekText(dates);
  $("thisWeekBtn").hidden = monday === mondayOf(toISODate(new Date()));
  if (load) await loadWeek();
}

function goToWeek(newMonday) {
  if (dirty && !confirm("Hay cambios sin guardar en esta semana. ¿Cambiar de semana igualmente?")) return;
  setWeek(newMonday);
}

$("prevWeek").addEventListener("click", () => goToWeek(addDays(monday, -7)));
$("nextWeek").addEventListener("click", () => goToWeek(addDays(monday, 7)));
$("thisWeekBtn").addEventListener("click", () => goToWeek(mondayOf(toISODate(new Date()))));

$("priceInput").addEventListener("input", () => (dirty = true));

$("clearBtn").addEventListener("click", () => {
  if (confirm("¿Vaciar los platos de la semana? (No se borra nada hasta que guardes)")) {
    fillWeek([]);
    dirty = true;
  }
});

// ---------- Carga y guardado en Firestore ----------

// Los menús guardados antes del cambio a un solo plato tenían una lista "primeros"
const platoOf = (data) => (data.plato || (data.primeros || []).join(", ")).trim();

let savedDates = new Set(); // días de la semana que ya están en Firestore
let loading = 0;            // descarta la respuesta de una semana que ya no se muestra

async function loadWeek() {
  const token = ++loading;
  $("saveMsg").textContent = "";
  dirty = false;
  try {
    const dates = weekDates();
    const snaps = await Promise.all(dates.map((d) => getDoc(doc(db, MENUS, d))));
    if (token !== loading) return;
    savedDates = new Set(dates.filter((_, i) => snaps[i].exists()));
    fillWeek(snaps.map((s) => (s.exists() ? platoOf(s.data()) : "")));
    const saved = snaps.find((s) => s.exists() && s.data().precio);
    $("priceInput").value = saved ? saved.data().precio : PRECIO_DEFECTO;
    if (savedDates.size) $("saveMsg").textContent = `Cargados ${savedDates.size} días ya guardados de esta semana.`;
  } catch (e) {
    if (token !== loading) return;
    console.error("[MENU] Error al cargar", e);
    $("saveMsg").textContent = "No se pudo cargar el menú de esta semana.";
  }
}

$("saveBtn").addEventListener("click", async () => {
  const platos = readWeek();
  const dates = weekDates();
  const precio = $("priceInput").value.trim().replace(/\s*€$/, "") || PRECIO_DEFECTO;
  // Un día que estaba guardado y se ha dejado vacío se borra del menú
  const borrar = dates.filter((d, i) => !platos[i] && savedDates.has(d));
  if (platos.every((p) => !p) && !borrar.length) {
    $("saveMsg").textContent = "No hay ningún plato que guardar.";
    return;
  }
  $("saveBtn").disabled = true;
  $("saveMsg").textContent = "Guardando…";
  try {
    // Todos los días de la semana en una sola escritura
    const batch = writeBatch(db);
    let n = 0;
    platos.forEach((plato, i) => {
      if (!plato) return;
      batch.set(doc(db, MENUS, dates[i]), {
        fecha: dates[i],
        plato,
        precio,
        updatedBy: currentEmail,
        updatedAt: serverTimestamp()
      });
      n++;
    });
    borrar.forEach((d) => batch.delete(doc(db, MENUS, d)));
    await batch.commit();
    dirty = false;
    savedDates = new Set(dates.filter((_, i) => platos[i]));
    const partes = [];
    if (n) partes.push(`Guardados ${n} ${n === 1 ? "día" : "días"} de la semana del ${shortDate(dates[0])}.`);
    if (borrar.length) {
      const nombres = borrar.map((d) => DAY_NAMES[dates.indexOf(d)].toLowerCase());
      partes.push(`Sin plato, se quita del menú: ${nombres.join(", ")}.`);
    }
    $("saveMsg").textContent = partes.join(" ");
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

// Hoja semanal: se localizan las columnas LUNES..VIERNES y se lee cada celda por separado
$("ocrBtn").addEventListener("click", async () => {
  if (!selectedFile) return;

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

    // 1ª pasada: toda la hoja, para encontrar la semana, las cabeceras de los días y el postre
    const { data } = await worker.recognize(canvas);
    $("rawText").textContent = data.text;
    $("rawBox").hidden = false;

    const cols = findColumns(data.words);
    if (!cols) {
      $("ocrMsg").textContent = "No encontré los días de la semana en la foto. Prueba con una foto más recta o escribe los platos a mano.";
      return;
    }
    const bottomY = (findPostre(data.lines) || findPrice(data.lines))?.bbox.y0
      ?? cols.headerBottom + Math.abs(cols.spacing);

    // 2ª pasada: cada celda por separado, leída como un bloque de texto
    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK });
    const platos = [];
    for (let i = 0; i < DAY_NAMES.length; i++) {
      step = `Leyendo el ${DAY_NAMES[i].toLowerCase()}`;
      const rect = findCell(cols, i, bottomY, canvas.width);
      const cell = rect ? await worker.recognize(cropCell(canvas, rect)) : null;
      platos.push(cell ? cleanCell(cell.data.lines) : "");
      console.log(`[OCR] ${DAY_NAMES[i]}:`, platos[i] || "(sin leer)");
    }

    if (platos.every((p) => !p)) {
      $("ocrMsg").textContent = "No pude leer ningún plato. Prueba con otra foto o escríbelos a mano.";
      return;
    }

    // Si la hoja dice la semana ("DEL 12 AL 16 DE OCTUBRE"), se cambia a esa semana
    const detected = findWeek(data.text, fromISODate(monday).getFullYear());
    const weekChanged = detected && detected !== monday;
    if (weekChanged) await setWeek(detected);

    if (readWeek().some(Boolean) &&
        !confirm("Ya hay platos en esta semana. ¿Reemplazarlos por los de la foto?")) {
      $("ocrMsg").textContent = "Reconocimiento descartado.";
      return;
    }
    fillWeek(platos);
    dirty = true;

    const missing = DAY_NAMES.filter((_, i) => !platos[i]);
    $("ocrMsg").textContent =
      (weekChanged ? `La hoja es de la semana del ${shortDate(detected)}. ` : "") +
      (missing.length
        ? `No pude leer: ${missing.join(", ")}. Escríbelo a mano y pulsa Guardar semana.`
        : "Semana reconocida. Revísala y pulsa Guardar semana.");
  } catch (e) {
    console.error("[OCR] Error", e);
    $("ocrMsg").textContent = "Error al reconocer la imagen.";
  } finally {
    if (worker) await worker.terminate();
    $("ocrBtn").disabled = false;
    $("ocrProgress").hidden = true;
  }
});
