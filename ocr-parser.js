// Lectura de la hoja semanal "PLATO DEL DÍA": una tabla con columnas LUNES a VIERNES,
// un plato por celda, y debajo una línea "Postre: ..." y el precio.
//
// Se hace en dos pasadas de OCR:
//   1. Toda la foto, para localizar las cabeceras de los días y la línea del postre.
//   2. Solo la celda del día elegido (findCell devuelve ese rectángulo).

export const DAYS = ["lunes", "martes", "miercoles", "jueves", "viernes"];

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Fragmentos que bastan para reconocer cada día aunque el OCR falle alguna letra
const DAY_HINTS = [
  ["lunes", "unes"],
  ["martes", "artes"],
  ["miercoles", "ercoles", "rcoles"],
  ["jueves", "ueves"],
  ["viernes", "iernes", "ernes"]
];

function dayOf(word) {
  const w = norm(word).replace(/[^a-z]/g, "");
  if (w.length < 4) return -1;
  return DAY_HINTS.findIndex((hints) => hints.some((h) => w.includes(h)));
}

const centerX = (b) => (b.x0 + b.x1) / 2;

// Busca las cabeceras LUNES..VIERNES y devuelve el centro de cada columna.
// Si falta alguna, la estima con la separación media entre las encontradas.
export function findColumns(words) {
  const found = new Map();
  for (const w of words) {
    // Una cabecera mal leída (poca confianza) desplaza la columna: mejor estimarla
    if (w.confidence < 60) continue;
    const i = dayOf(w.text);
    if (i >= 0 && !found.has(i)) found.set(i, w.bbox);
  }
  if (found.size < 2) return null;

  // Ajuste lineal x = a + b·índice con las cabeceras encontradas
  const pts = [...found].map(([i, b]) => [i, centerX(b)]);
  const n = pts.length;
  const mi = pts.reduce((s, p) => s + p[0], 0) / n;
  const mx = pts.reduce((s, p) => s + p[1], 0) / n;
  const slope = pts.reduce((s, p) => s + (p[0] - mi) * (p[1] - mx), 0) /
                pts.reduce((s, p) => s + (p[0] - mi) ** 2, 0);
  const centers = DAYS.map((_, i) => found.has(i) ? centerX(found.get(i)) : mx + slope * (i - mi));

  const headerBottom = Math.max(...[...found.values()].map((b) => b.y1));
  const headerHeight = Math.max(...[...found.values()].map((b) => b.y1 - b.y0));
  return { centers, spacing: slope, headerBottom, headerHeight, found: [...found.keys()] };
}

// Línea "Postre: ..." (el OCR a veces mete basura delante)
export function findPostre(lines) {
  const line = lines.find((l) => /\bpostres?\s*:/.test(norm(l.text)));
  if (!line) return null;
  const text = line.text
    .replace(/^.*?\bpostres?\s*:\s*/i, "")
    .replace(/(\s+[^\p{L}\s]+)+\s*$/u, "") // símbolos sueltos al final
    .trim();
  return { text: capitalize(text), bbox: line.bbox };
}

// Línea del precio ("PLATO DEL DÍA, PAN Y POSTRE 5,10€ (I.V.A incluido)")
export function findPrice(lines) {
  const line = lines.find((l) => /\d\s*€|€\s*\d/.test(l.text));
  if (!line) return null;
  // Quita la basura del principio y del final (símbolos y letras sueltas)
  const text = line.text.trim()
    .replace(/^(\S{1,2}\s+)+(?=\p{L}{3})/u, "")
    .replace(/(\s+[^\s)]{1,2})+$/u, "");
  return { text, bbox: line.bbox };
}

// Rectángulo de la celda del día dayIndex (0 = lunes), entre la cabecera y el postre
export function findCell(cols, dayIndex, bottomY, imageWidth) {
  // La celda va de la mitad entre este día y el anterior a la mitad con el siguiente.
  // No se recorta más: con la foto inclinada el texto no siempre queda centrado bajo la cabecera.
  const c = cols.centers[dayIndex];
  const half = Math.abs(cols.spacing) / 2;
  const left = Math.max(0, Math.round(c - half));
  const right = Math.min(imageWidth, Math.round(c + half));
  const top = Math.round(cols.headerBottom + cols.headerHeight * 0.5);
  const bottom = Math.round(bottomY - cols.headerHeight * 0.3);
  if (right <= left || bottom <= top) return null;
  return { left, top, width: right - left, height: bottom - top };
}

// Junta el texto de la celda descartando lo que no es el plato: líneas sin ninguna palabra
// clara (restos de bordes, manchas), números sueltos y palabras leídas con poca confianza
export function cleanCell(lines) {
  const letters = (t) => t.replace(/^[^\p{L}(]+|[^\p{L})]+$/gu, "");
  const joined = lines
    .filter((l) => l.words.some((w) => w.confidence >= 60 && /\p{L}{3}/u.test(w.text)))
    .flatMap((l) => l.words)
    .filter((w) => w.confidence >= 60)
    .map((w) => letters(w.text))
    .filter((t) => /\p{L}/u.test(t))
    .join(" ")
    .trim();
  if (/^festivo$/i.test(joined)) return "Festivo";
  // Si viene todo en mayúsculas se pasa a formato de frase
  return capitalize(joined === joined.toUpperCase() ? joined.toLowerCase() : joined);
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Índice 0-4 (lunes-viernes) de una fecha YYYY-MM-DD, o -1 si es fin de semana
export function weekdayIndex(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const wd = new Date(y, m - 1, d).getDay(); // 0 = domingo
  return wd >= 1 && wd <= 5 ? wd - 1 : -1;
}
