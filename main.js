// Página pública: muestra el plato del día guardado en Firestore.
// El postre y el pan son siempre los mismos; el precio se guarda con cada día.
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { db, MENUS, POSTRE, PRECIO_DEFECTO, toISODate, addDays, formatLongDate } from "./firebase-config.js";

const $ = (id) => document.getElementById(id);

// Permite enlazar un día concreto: index.html?fecha=2026-10-15
const params = new URLSearchParams(location.search);
let current = /^\d{4}-\d{2}-\d{2}$/.test(params.get("fecha") || "")
  ? params.get("fecha")
  : toISODate(new Date());

function shiftDay(delta) {
  current = addDays(current, delta);
  history.replaceState(null, "", `?fecha=${current}`);
  loadMenu();
}

// Los menús guardados antes del cambio a un solo plato tenían una lista "primeros"
const platoOf = (data) => (data.plato || (data.primeros || []).join(", ")).trim();

async function loadMenu() {
  $("dateLabel").textContent = formatLongDate(current);
  $("status").hidden = false;
  $("status").textContent = "Cargando menú…";
  $("menu").hidden = true;

  try {
    const snap = await getDoc(doc(db, MENUS, current));
    const plato = snap.exists() ? platoOf(snap.data()) : "";
    if (!plato) {
      $("status").textContent = "Todavía no hay menú publicado para este día.";
      return;
    }

    const festivo = /^festivo$/i.test(plato);
    $("plato").textContent = plato;
    $("postre").textContent = POSTRE;
    $("postreCard").hidden = festivo;
    $("price").hidden = festivo;
    $("price").textContent = `Plato del día, pan y postre: ${snap.data().precio || PRECIO_DEFECTO} €`;

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
