# App Cafetería

Web estática para GitHub Pages. Todo corre en el navegador: Firebase por CDN y OCR con Tesseract.js (español).

## Archivos

- `index.html`, `styles.css`, `main.js`: página pública con el plato del día, el postre (siempre el mismo) y el precio del menú con pan. Solo de lunes a viernes: se elige el día en la semana y las flechas cambian de semana (`?fecha=AAAA-MM-DD` enlaza un día; un sábado o domingo lleva al lunes siguiente). Un día marcado como festivo muestra el aviso "Este día es festivo y la universidad no está abierta."
- `login.html` + `login.js`: login como el de `join.html` (Google o Microsoft, con ventana emergente), pero sin escribir en `tempusers`. Si el correo está en `canteen`, lleva a la gestión. El menú público no enlaza aquí: se entra escribiendo la dirección (`.../gestion.html` o `.../login.html`), y estas páginas piden a los buscadores que no las indexen. Lo que de verdad protege la gestión son las reglas de Firestore y la colección `canteen`.
- `gestion.html` + `gestion.js`: se edita la semana entera (lunes a viernes) a mano o con la foto de la hoja semanal, y se guarda de una vez. Cada día tiene una casilla "Festivo". Un día que estaba guardado y se deja vacío se quita del menú al guardar. El precio viene puesto (5,10 €) y se puede cambiar. Sin sesión autorizada vuelve a `login.html`.
- `ocr-parser.js`: lee la hoja semanal "PLATO DEL DÍA". Saca la semana de la cabecera ("DEL 12 AL 16 DE OCTUBRE"), localiza las columnas LUNES a VIERNES y lee cada celda por separado.
- `firebase-config.js`: la misma config pública de `arise-a3be8` que usa `join.html`, el postre fijo y el precio por defecto.
- `img/`: logo de ARISE (de ariseclub.github.io) y favicon. Los colores y tipografías (Poppins y Questrial) son los de la web del club.

La foto no se sube a ningún sitio: se procesa en el navegador y solo se guarda el texto del menú.

## Lo que tienes que crear en Firestore

**Correos autorizados**: colección `canteen`, un documento por correo, con el correo en minúsculas como ID del documento. El contenido da igual (por ejemplo `{ nombre: "..." }`).

```
canteen/
  persona@ejemplo.com   { nombre: "Persona" }
```

**Menús** (los crea la app): colección `canteen_menus`, un documento por día con ID `AAAA-MM-DD`. El postre no se guarda porque es siempre el mismo.

```
canteen_menus/2026-10-14 {
  fecha: "2026-10-14",
  plato: "Albóndigas en salsa con patatas",   // o "Festivo"
  precio: "5,10",                             // plato del día, pan y postre
  updatedBy: "persona@ejemplo.com",
  updatedAt: <timestamp>
}
```

## Reglas sugeridas

Añádelas dentro de tu `match /databases/{database}/documents { ... }` existente, sin quitar las de `tempusers`:

```
function isCanteenAdmin() {
  return request.auth != null
    && request.auth.token.email != null
    && exists(/databases/$(database)/documents/canteen/$(request.auth.token.email.lower()));
}

match /canteen/{email} {
  // Cada usuario solo puede comprobar si su propio correo está autorizado
  allow read: if request.auth != null && request.auth.token.email.lower() == email;
  allow write: if false; // se gestiona desde la consola de Firebase
}

match /canteen_menus/{fecha} {
  allow read: if true;
  allow write: if isCanteenAdmin();
}
```

## Publicar

1. Sube la carpeta a un repo con GitHub Pages activado.
2. En Firebase > Authentication > Settings > Authorized domains, añade el dominio de GitHub Pages si no es `ariseclub.github.io` (por ejemplo `tuusuario.github.io`).
