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

// 2) El único mail que puede crear o cambiar la contraseña de admin (ahí llega el código).
//    Si queda vacío, se usa el mail de la cuenta dueña de este script.
const MAIL_ADMIN = "";

// 3) A quién NO le puede tocar cada uno (aparte de sí mismo).
//    Ejemplo: { "Ana": ["Bruno"], "Bruno": ["Ana"] } → Ana y Bruno nunca se regalan entre sí.
const PROHIBIDOS = {};

// El usuario y la contraseña de admin NO van acá: se crean (o se cambian) desde la web,
// con un código que llega a MAIL_ADMIN. Se guardan cifrados en las propiedades del script.

// Versión de este código (para comprobar desde afuera cuál está publicada).
const VERSION = "2026-11-19-sorteo-al-momento";

const props = PropertiesService.getScriptProperties();
const cache = CacheService.getScriptCache();

const MAX_FALLOS = 8;                // intentos de login fallidos permitidos...
const ESPERA_FALLOS = 15 * 60;       // ...antes de bloquear el login 15 minutos
const DURACION_SESION = 6 * 60 * 60; // el admin queda adentro hasta 6 horas
const VIDA_CODIGO = 2 * 60;          // el código del mail vence a los 2 minutos
const ESPERA_REENVIO = 30;           // segundos mínimos entre un código y otro
const MAX_INTENTOS_CODIGO = 5;       // después de 5 errores el código deja de servir

// La web llama a esta función para lo público (ver nombres y sortear).
function doGet(e) {
  const p = (e && e.parameter) || {};
  return responder_(function () {
    if (p.accion === "participantes") {
      const res = { ok: true, participantes: PARTICIPANTES };
      // Si el celular tiene guardado un resultado, le avisamos si el admin lo reseteó.
      if (p.nombre) res.vigente = resultadoVigente_(String(p.nombre), String(p.id || ""));
      return res;
    }
    if (p.accion === "sortear") return sortear_(String(p.nombre || ""));
    if (p.accion === "version") return { ok: true, version: VERSION };
    return { ok: false, error: "Acción desconocida" };
  });
}

// Lo del admin va por POST, así la contraseña no queda en ninguna dirección web.
function doPost(e) {
  return responder_(function () {
    let d = {};
    try { d = JSON.parse((e && e.postData && e.postData.contents) || "{}"); } catch (err) { /* vacío */ }

    if (d.accion === "adminEntrar") return adminEntrar_(String(d.usuario || ""), String(d.clave || ""));
    if (d.accion === "adminPedirCodigo") return adminPedirCodigo_(String(d.mail || ""));
    if (d.accion === "adminCambiarClave") {
      return adminCambiarClave_(String(d.codigo || ""), String(d.usuario || ""), String(d.clave || ""));
    }

    if (!sesionValida_(d.token)) {
      return { ok: false, sesionVencida: true, error: "Tu sesión de admin se venció. Entrá de nuevo." };
    }
    if (d.accion === "adminEstado") return adminEstado_();
    if (d.accion === "adminResetear") return adminResetear_(String(d.nombre || ""));
    if (d.accion === "adminSalir") {
      cache.remove("sesion_" + d.token);
      return { ok: true };
    }
    return { ok: false, error: "Acción desconocida" };
  });
}

function responder_(fn) {
  let res;
  try {
    res = fn();
  } catch (err) {
    res = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(res))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- Datos guardados ----------
function leer_(clave, porDefecto) {
  const v = props.getProperty(clave);
  return v ? JSON.parse(v) : porDefecto;
}
function guardar_(clave, valor) {
  props.setProperty(clave, JSON.stringify(valor));
}

// ---------- Sorteo ----------
function sortear_(nombre) {
  if (PARTICIPANTES.indexOf(nombre) === -1) {
    return { ok: false, error: "Ese nombre no está en la lista" };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000); // evita que dos personas sorteen exactamente a la vez
  try {
    let asignaciones = leer_("asignaciones", null);

    if (!asignaciones) {
      asignaciones = generarAsignaciones_();
      guardar_("asignaciones", asignaciones);
      guardar_("sorteados", []);
    } else if (!asignaciones[nombre]) {
      return { ok: false, error: "La lista cambió. El organizador tiene que reiniciar el sorteo" };
    }

    const sorteados = leer_("sorteados", []);
    if (sorteados.indexOf(nombre) !== -1) {
      // No se vuelve a mostrar el resultado, así nadie puede espiar el de otro.
      return { ok: true, yaSorteo: true };
    }

    // El resultado se decide recién ahora: se vuelve a mezclar entre todos los que
    // todavía no sortearon (respetando PROHIBIDOS), así nadie sabe nada de antemano.
    const libres = libres_(asignaciones, sorteados);
    const m = repartir_(libres, libres.map(function (n) { return asignaciones[n]; }));
    if (m) libres.forEach(function (n, i) { asignaciones[n] = m[i]; });
    else ajustarReglas_(asignaciones, sorteados);
    guardar_("asignaciones", asignaciones);

    sorteados.push(nombre);
    guardar_("sorteados", sorteados);

    // Cada sorteo tiene un código: si el admin lo resetea, el celular que lo hizo se entera.
    const id = Utilities.getUuid();
    const ids = leer_("idsSorteo", {});
    ids[nombre] = id;
    guardar_("idsSorteo", ids);

    avisarPorMail_(nombre, sorteados.length);

    return { ok: true, yaSorteo: false, teToca: asignaciones[nombre], id: id };
  } finally {
    lock.releaseLock();
  }
}

// ¿El resultado que tiene guardado un celular sigue valiendo?
function resultadoVigente_(nombre, id) {
  if (leer_("sorteados", []).indexOf(nombre) === -1) return false;
  const actual = leer_("idsSorteo", {})[nombre];
  // Los que sortearon antes de que existieran los códigos no tienen uno: valen.
  if (!actual) return true;
  return actual === id;
}

// ¿A "de" le puede tocar "a"? Nunca uno mismo, ni nadie de su lista de PROHIBIDOS.
function permitido_(de, a) {
  return de !== a && (PROHIBIDOS[de] || []).indexOf(a) === -1;
}

// Mezcla los nombres y arma una ronda: cada uno le regala al siguiente.
// Así nunca a nadie le toca su propio nombre y nadie se repite. Respeta PROHIBIDOS.
function generarAsignaciones_() {
  if (PARTICIPANTES.length < 2) throw new Error("Hacen falta al menos 2 participantes");
  for (let intento = 0; intento < 5000; intento++) {
    const s = mezclar_(PARTICIPANTES);
    const asignaciones = {};
    let sirve = true;
    for (let i = 0; i < s.length && sirve; i++) {
      asignaciones[s[i]] = s[(i + 1) % s.length];
      sirve = permitido_(s[i], asignaciones[s[i]]);
    }
    if (sirve) return asignaciones;
  }
  // Si con una sola ronda no se puede, cualquier reparto que respete las reglas.
  const m = repartir_(PARTICIPANTES, PARTICIPANTES);
  if (!m) throw new Error("Con esas reglas de PROHIBIDOS no se puede armar el sorteo");
  const asignaciones = {};
  PARTICIPANTES.forEach(function (n, i) { asignaciones[n] = m[i]; });
  return asignaciones;
}

// Reparte "destinos" entre "libres" al azar respetando las reglas
// (y "condicion", si se pasa). Devuelve el reparto o null si no se encontró.
function repartir_(libres, destinos, condicion) {
  for (let intento = 0; intento < 3000; intento++) {
    const m = mezclar_(destinos);
    const sirve = libres.every(function (n, i) { return permitido_(n, m[i]); }) &&
      (!condicion || condicion(m));
    if (sirve) return m;
  }
  return null;
}

// Los que todavía no sortearon (a ellos se les puede cambiar a quién le toca sin que nadie note).
function libres_(asignaciones, sorteados) {
  return PARTICIPANTES.filter(function (n) {
    return asignaciones[n] && sorteados.indexOf(n) === -1;
  });
}

// Si a alguien que todavía no sorteó le tocó alguien prohibido (por ejemplo porque las
// reglas se agregaron después de armar el sorteo), vuelve a mezclar entre los que no
// sortearon para corregirlo. Devuelve true si cambió algo.
function ajustarReglas_(asignaciones, sorteados) {
  const libres = libres_(asignaciones, sorteados);
  const malos = libres.some(function (n) { return !permitido_(n, asignaciones[n]); });
  if (!malos) return false;
  const m = repartir_(libres, libres.map(function (n) { return asignaciones[n]; }));
  if (!m) return false;
  libres.forEach(function (n, i) { asignaciones[n] = m[i]; });
  return true;
}

// Los que ya sortearon y les tocó alguien prohibido: solo se arregla reseteándolos.
function conflictos_(asignaciones, sorteados) {
  return PARTICIPANTES.filter(function (n) {
    return asignaciones[n] && !permitido_(n, asignaciones[n]);
  }).map(function (n) {
    return { de: n, a: asignaciones[n], sorteo: sorteados.indexOf(n) !== -1 };
  });
}

// Devuelve una copia mezclada al azar.
function mezclar_(lista) {
  const s = lista.slice();
  for (let i = s.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = s[i]; s[i] = s[j]; s[j] = t;
  }
  return s;
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

// ---------- Admin: usuario, contraseña y código por mail ----------
function mailDelOrganizador_() {
  return String(MAIL_ADMIN || Session.getEffectiveUser().getEmail() || "").trim().toLowerCase();
}

// { usuario, sal, hash, version } o null si todavía no se creó.
function datosAdmin_() {
  return leer_("admin", null);
}

// La contraseña nunca se guarda tal cual: se guarda su "huella" (SHA-256 con sal).
function huella_(clave, sal) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sal + "|" + clave,
    Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

function abrirSesion_(datos) {
  const token = Utilities.getUuid() + Utilities.getUuid();
  // La sesión guarda la versión de la contraseña: si la cambiás, las sesiones viejas dejan de valer.
  cache.put("sesion_" + token, String(datos.version), DURACION_SESION);
  return token;
}

function sesionValida_(token) {
  if (typeof token !== "string" || token.length < 30) return false;
  const datos = datosAdmin_();
  return !!datos && cache.get("sesion_" + token) === String(datos.version);
}

function adminEntrar_(usuario, clave) {
  const datos = datosAdmin_();
  if (!datos) {
    return { ok: false, sinAdmin: true,
      error: "Todavía no creaste tu usuario de admin. Tocá «¿Primera vez o te olvidaste la contraseña?»." };
  }
  const fallos = Number(cache.get("adminFallos") || 0);
  if (fallos >= MAX_FALLOS) {
    return { ok: false,
      error: "Demasiados intentos. Esperá 15 minutos o cambiá la contraseña con el código por mail." };
  }
  const usuarioOk = usuario.trim().toLowerCase() === datos.usuario.toLowerCase();
  if (!usuarioOk || huella_(clave, datos.sal) !== datos.hash) {
    cache.put("adminFallos", String(fallos + 1), ESPERA_FALLOS);
    return { ok: false, error: "Usuario o contraseña incorrectos" };
  }
  cache.remove("adminFallos");
  return { ok: true, token: abrirSesion_(datos) };
}

// Paso 1 para crear o cambiar la contraseña: manda un código de 6 números a tu Gmail.
function adminPedirCodigo_(mail) {
  const organizador = mailDelOrganizador_();
  if (!organizador) throw new Error("No pude saber cuál es el mail del organizador");
  if (mail.trim().toLowerCase() !== organizador) {
    return { ok: false, error: "Ese no es el mail del organizador." };
  }
  if (cache.get("codigoReciente")) {
    return { ok: false, error: "Ya te mandé un código recién. Esperá unos segundos y pedí otro." };
  }
  // getUuid usa un generador seguro; de ahí sacamos 6 números.
  const azar = parseInt(Utilities.getUuid().replace(/-/g, "").slice(0, 12), 16);
  const codigo = String(azar % 1000000).padStart(6, "0");
  const vence = Date.now() + VIDA_CODIGO * 1000;
  cache.put("codigoAdmin", JSON.stringify({ codigo: codigo, vence: vence, intentos: 0 }), VIDA_CODIGO);
  cache.put("codigoReciente", "1", ESPERA_REENVIO);
  MailApp.sendEmail(organizador, "🔑 Amigo invisible: tu código de admin " + codigo,
    "Tu código para crear o cambiar el usuario y la contraseña de admin es:\n\n" +
    codigo + "\n\nVence en 2 minutos.\n\n" +
    "Si no lo pediste vos, ignorá este mail: sin el código nadie puede cambiar nada.");
  return { ok: true, vence: VIDA_CODIGO };
}

// Paso 2: con el código del mail guarda el usuario y la contraseña nuevos y deja entrar.
function adminCambiarClave_(codigo, usuario, clave) {
  usuario = usuario.trim();
  if (!usuario) return { ok: false, error: "Escribí un usuario." };
  if (clave.length < 6) return { ok: false, error: "La contraseña tiene que tener al menos 6 caracteres." };

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const guardado = JSON.parse(cache.get("codigoAdmin") || "null");
    if (!guardado || Date.now() > guardado.vence) {
      cache.remove("codigoAdmin");
      return { ok: false, vencido: true, error: "El código venció. Pedí uno nuevo." };
    }
    if (codigo.trim() !== guardado.codigo) {
      guardado.intentos++;
      if (guardado.intentos >= MAX_INTENTOS_CODIGO) {
        cache.remove("codigoAdmin");
        return { ok: false, vencido: true, error: "Le erraste muchas veces al código. Pedí uno nuevo." };
      }
      const quedan = Math.max(1, Math.ceil((guardado.vence - Date.now()) / 1000));
      cache.put("codigoAdmin", JSON.stringify(guardado), quedan);
      return { ok: false, error: "Ese código no es. Fijate bien el que te llegó al mail." };
    }
    cache.remove("codigoAdmin");

    const anterior = datosAdmin_();
    const sal = Utilities.getUuid();
    const datos = {
      usuario: usuario,
      sal: sal,
      hash: huella_(clave, sal),
      version: ((anterior && anterior.version) || 0) + 1,
    };
    guardar_("admin", datos);
    cache.remove("adminFallos");
    return { ok: true, token: abrirSesion_(datos) };
  } finally {
    lock.releaseLock();
  }
}

// Todo lo que ve el admin: quiénes sortearon y a quién le toca cada uno.
function adminEstado_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    let asignaciones = leer_("asignaciones", null);
    if (!asignaciones) {
      // Nadie sorteó todavía: armamos el sorteo ahora para que lo puedas ver.
      asignaciones = generarAsignaciones_();
      guardar_("asignaciones", asignaciones);
      guardar_("sorteados", []);
    }
    const sorteados = leer_("sorteados", []);
    if (ajustarReglas_(asignaciones, sorteados)) guardar_("asignaciones", asignaciones);
    // Solo se muestran los resultados de los que ya sortearon (los demás todavía no están decididos).
    const vistos = {};
    sorteados.forEach(function (n) { if (asignaciones[n]) vistos[n] = asignaciones[n]; });
    return {
      ok: true,
      participantes: PARTICIPANTES,
      sorteados: sorteados,
      asignaciones: vistos,
      conflictos: conflictos_(asignaciones, sorteados),
    };
  } finally {
    lock.releaseLock();
  }
}

// Habilita a alguien para que vuelva a sortear (por ejemplo, si otro tocó su nombre sin querer).
// Si se puede, también le cambia a quién le toca, intercambiándolo con alguien que todavía
// no sorteó: así el que tocó sin querer no sabe el resultado verdadero.
function adminResetear_(nombre) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const asignaciones = leer_("asignaciones", null);
    if (!asignaciones || !asignaciones[nombre]) {
      return { ok: false, error: "No encontré a " + nombre + " en el sorteo" };
    }
    const sorteados = leer_("sorteados", []);
    const pos = sorteados.indexOf(nombre);
    if (pos === -1) return { ok: false, error: nombre + " todavía no sorteó" };

    sorteados.splice(pos, 1);
    const ids = leer_("idsSorteo", {});
    delete ids[nombre];

    // Volvemos a mezclar a quién le toca entre él y los que todavía no sortearon
    // (los que ya vieron su resultado no se tocan), respetando las reglas.
    const libres = libres_(asignaciones, sorteados);
    const destinos = libres.map(function (n) { return asignaciones[n]; });
    const yo = libres.indexOf(nombre);
    const antes = asignaciones[nombre];
    let m = repartir_(libres, destinos, function (x) { return x[yo] !== antes; });
    if (!m && !permitido_(nombre, antes)) m = repartir_(libres, destinos); // al menos que cumpla las reglas
    if (m) {
      libres.forEach(function (n, i) { asignaciones[n] = m[i]; });
      guardar_("asignaciones", asignaciones);
    }
    const cambio = asignaciones[nombre] !== antes;

    guardar_("sorteados", sorteados);
    guardar_("idsSorteo", ids);
    return { ok: true, cambio: cambio };
  } finally {
    lock.releaseLock();
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
  const sorteados = leer_("sorteados", []);
  const faltan = PARTICIPANTES.filter(function (n) { return sorteados.indexOf(n) === -1; });
  console.log("Ya sortearon (" + sorteados.length + "): " + sorteados.join(", "));
  console.log("Faltan (" + faltan.length + "): " + faltan.join(", "));
}

// Borra todo y arranca un sorteo nuevo (usalo si cambiás la lista de nombres).
function reiniciarSorteo() {
  props.deleteProperty("asignaciones");
  props.deleteProperty("sorteados");
  props.deleteProperty("idsSorteo");
  console.log("Sorteo reiniciado.");
}
