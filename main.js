// Página pública: muestra el menú del día guardado en Firestore.
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { db, MENUS, SECTIONS, toISODate, fromISODate, formatLongDate } from "./firebase-config.js";

const $ = (id) => document.getElementById(id);

// Permite enlazar un día concreto: index.html?fecha=2026-10-15
const params = new URLSearchParams(location.search);
let current = /^\d{4}-\d{2}-\d{2}$/.test(params.get("fecha") || "")
  ? params.get("fecha")
  : toISODate(new Date());

function shiftDay(delta) {
  const d = fromISODate(current);
  d.setDate(d.getDate() + delta);
  current = toISODate(d);
  history.replaceState(null, "", `?fecha=${current}`);
  loadMenu();
}

function renderList(ul, items) {
  ul.innerHTML = "";
  if (!items || items.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "—";
    ul.appendChild(li);
    return;
  }
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item;
    ul.appendChild(li);
  }
}

async function loadMenu() {
  $("dateLabel").textContent = formatLongDate(current);
  $("status").hidden = false;
  $("status").textContent = "Cargando menú…";
  $("menu").hidden = true;

  try {
    const snap = await getDoc(doc(db, MENUS, current));
    if (!snap.exists()) {
      $("status").textContent = "Todavía no hay menú publicado para este día.";
      return;
    }
    const data = snap.data();
    for (const { key } of SECTIONS) renderList($(`list-${key}`), data[key]);

    const notes = (data.notas || "").trim();
    $("notes").hidden = !notes;
    $("notes").textContent = notes;

    $("status").hidden = true;
    $("menu").hidden = false;
  } catch (e) {
    console.error("[MENU] Error al cargar", e);
    $("status").textContent = "No se pudo cargar el menú. Inténtalo de nuevo más tarde.";
  }
}

$("prevDay").addEventListener("click", () => shiftDay(-1));
$("nextDay").addEventListener("click", () => shiftDay(1));
$("todayBtn").addEventListener("click", () => {
  current = toISODate(new Date());
  history.replaceState(null, "", location.pathname);
  loadMenu();
});

loadMenu();
