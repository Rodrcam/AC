// Convierte el texto del OCR en { primeros, segundos, postres }.
// Busca cabeceras ("Primeros", "1er plato", "Segundos", "Postres"...) y
// asigna las líneas siguientes a esa sección. Lo que no encaja se descarta
// o queda en "sinClasificar" para que la persona lo coloque a mano.

const strip = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const HEADERS = [
  { key: "primeros", re: /^(primer[oa]s?|1\s*(er|º|°|o|\.)\s*(plato)?s?|entrantes?)\b\s*(platos?)?\s*[:\-–.]?\s*/ },
  { key: "segundos", re: /^(segund[oa]s?|2\s*(º|°|o|\.)\s*(plato)?s?|principal(es)?)\b\s*(platos?)?\s*[:\-–.]?\s*/ },
  { key: "postres", re: /^(postres?)\b\s*[:\-–.]?\s*/ }
];

// Líneas que no son platos
const NOISE = [
  /^menu( del dia)?\b/,
  /^(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/,
  /^\d{1,2}\s*(\/|-|de)\s*\w+/,                 // fechas
  /^(incluye|pan|bebida|agua|iva|precio|cafe)\b/,
  /^o$|^y$|^\W*$/
];

const PRICE = /\s*[-–:]?\s*\d+([.,]\d{1,2})?\s*(€|eur(os)?)\s*$/i;

function cleanDish(line) {
  return line
    .replace(/^[\s•·*\-–—>»|\d.)]+/, "")   // viñetas y numeración
    .replace(PRICE, "")
    .replace(/[|_~]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function parseMenu(text) {
  const out = { primeros: [], segundos: [], postres: [], sinClasificar: [] };
  let section = null;

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const raw of lines) {
    const norm = strip(raw).replace(/^[\s•·*\-–—>»|]+/, "");

    const header = HEADERS.find((h) => h.re.test(norm));
    if (header) {
      section = header.key;
      // "Primeros: Lentejas" -> el resto de la línea es un plato
      const rest = cleanDish(raw.slice(raw.length - norm.replace(header.re, "").length));
      if (rest.length > 2) out[section].push(capitalize(rest));
      continue;
    }

    if (NOISE.some((re) => re.test(norm))) continue;
    if (PRICE.test(raw) && cleanDish(raw).length < 3) continue; // solo precio

    const dish = cleanDish(raw);
    if (dish.length < 3 || !/[a-záéíóúñ]{2}/i.test(dish)) continue;

    const target = section ? out[section] : out.sinClasificar;

    // Línea que empieza en minúscula = continuación del plato anterior
    if (target.length && /^[a-záéíóúñ]/.test(dish)) {
      target[target.length - 1] += " " + dish;
    } else {
      target.push(capitalize(dish));
    }
  }

  return out;
}
