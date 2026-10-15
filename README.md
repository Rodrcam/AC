# App Cafetería

Web estática para GitHub Pages. Todo corre en el navegador: Firebase por CDN y OCR con Tesseract.js (español).

## Archivos

- `index.html`, `styles.css`, `main.js`: página pública con el menú del día (flechas para cambiar de día, `?fecha=AAAA-MM-DD` para enlazar uno).
- `login.html` + `login.js`: login como el de `join.html` (Google o Microsoft), pero por redirección en vez de ventana emergente y sin escribir en `tempusers`. Si el correo está en `canteen`, lleva a la gestión.
- `gestion.html` + `gestion.js`: foto del menú con OCR y edición manual. Sin sesión autorizada vuelve a `login.html`.
- `ocr-parser.js`: reparte el texto del OCR en primeros, segundos y postres según las cabeceras ("Primeros", "1er plato", "Segundos", "2º plato", "Postres"...). Lo que no tiene cabecera va a Primeros y se mueve con el selector.
- `firebase-config.js`: la misma config pública de `arise-a3be8` que usa `join.html`.

La foto no se sube a ningún sitio: se procesa en el navegador y solo se guarda el texto del menú.

## Lo que tienes que crear en Firestore

**Correos autorizados**: colección `canteen`, un documento por correo, con el correo en minúsculas como ID del documento. El contenido da igual (por ejemplo `{ nombre: "..." }`).

```
canteen/
  persona@ejemplo.com   { nombre: "Persona" }
```

**Menús** (los crea la app): colección `canteen_menus`, un documento por día con ID `AAAA-MM-DD`.

```
canteen_menus/2026-10-15 {
  fecha: "2026-10-15",
  primeros: ["Lentejas", "Ensalada mixta"],
  segundos: ["Pollo asado", "Merluza"],
  postres: ["Fruta", "Flan"],
  notas: "9,50 € con pan y bebida",
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
