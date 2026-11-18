// =====================================================
// AMIGO INVISIBLE - Backend en Google Apps Script
// Hace el sorteo, lo guarda y te avisa por mail cada vez que alguien sortea.
// =====================================================

// 1) Poné acá los nombres de los participantes (tal cual querés que aparezcan).
const PARTICIPANTES = [
  "Ana",
  "Bruno",
  "Carla",
  "Diego",
  "Euge",
];

const props = PropertiesService.getScriptProperties();

// La web llama a esta función.
function doGet(e) {
  const accion = (e && e.parameter && e.parameter.accion) || "";
  let res;
  try {
    if (accion === "participantes") {
      res = { ok: true, participantes: PARTICIPANTES };
    } else if (accion === "sortear") {
      res = sortear_(String(e.parameter.nombre || ""));
    } else {
      res = { ok: false, error: "Acción desconocida" };
    }
  } catch (err) {
    res = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(res))
    .setMimeType(ContentService.MimeType.JSON);
}

function sortear_(nombre) {
  if (PARTICIPANTES.indexOf(nombre) === -1) {
    return { ok: false, error: "Ese nombre no está en la lista" };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000); // evita que dos personas sorteen exactamente a la vez
  try {
    let asignaciones = JSON.parse(props.getProperty("asignaciones") || "null");

    if (!asignaciones) {
      asignaciones = generarAsignaciones_();
      props.setProperty("asignaciones", JSON.stringify(asignaciones));
      props.setProperty("sorteados", "[]");
    } else if (!asignaciones[nombre]) {
      return { ok: false, error: "La lista cambió. El organizador tiene que reiniciar el sorteo" };
    }

    const sorteados = JSON.parse(props.getProperty("sorteados") || "[]");
    if (sorteados.indexOf(nombre) !== -1) {
      // No se vuelve a mostrar el resultado, así nadie puede espiar el de otro.
      return { ok: true, yaSorteo: true };
    }

    sorteados.push(nombre);
    props.setProperty("sorteados", JSON.stringify(sorteados));

    avisarPorMail_(nombre, sorteados.length);

    return { ok: true, yaSorteo: false, teToca: asignaciones[nombre] };
  } finally {
    lock.releaseLock();
  }
}

// Mezcla los nombres y arma una ronda: cada uno le regala al siguiente.
// Así nunca a nadie le toca su propio nombre y nadie se repite.
function generarAsignaciones_() {
  if (PARTICIPANTES.length < 2) throw new Error("Hacen falta al menos 2 participantes");
  const s = PARTICIPANTES.slice();
  for (let i = s.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = s[i]; s[i] = s[j]; s[j] = t;
  }
  const asignaciones = {};
  for (let i = 0; i < s.length; i++) {
    asignaciones[s[i]] = s[(i + 1) % s.length];
  }
  return asignaciones;
}

// Manda el mail a la cuenta dueña del script (o sea, a vos). No dice a quién le tocó.
function avisarPorMail_(nombre, cantidad) {
  try {
    const destino = Session.getEffectiveUser().getEmail();
    const total = PARTICIPANTES.length;
    let cuerpo = nombre + " ya hizo su sorteo.\n\nVan " + cantidad + " de " + total + ".";
    if (cantidad === total) cuerpo += "\n\n🎉 ¡Ya sortearon todos!";
    MailApp.sendEmail(destino, "🎁 Amigo invisible: " + nombre + " ya sorteó", cuerpo);
  } catch (err) {
    console.error("No se pudo mandar el mail: " + err);
  }
}

// ---------- Funciones para el organizador (se corren a mano desde el editor) ----------

// Correla una vez al principio para dar permiso de mandar mails.
function probarMail() {
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
    "🎁 Amigo invisible: prueba", "Si te llegó este mail, los avisos funcionan.");
}

// Muestra en el registro quiénes ya sortearon (sin decir a quién les tocó).
function verProgreso() {
  const sorteados = JSON.parse(props.getProperty("sorteados") || "[]");
  const faltan = PARTICIPANTES.filter(function (n) { return sorteados.indexOf(n) === -1; });
  console.log("Ya sortearon (" + sorteados.length + "): " + sorteados.join(", "));
  console.log("Faltan (" + faltan.length + "): " + faltan.join(", "));
}

// Borra todo y arranca un sorteo nuevo (usalo si cambiás la lista de nombres).
function reiniciarSorteo() {
  props.deleteProperty("asignaciones");
  props.deleteProperty("sorteados");
  console.log("Sorteo reiniciado.");
}
