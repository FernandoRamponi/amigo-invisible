// =====================================================
// ADMIN
// Botón arriba a la derecha. Abre una ventana a pantalla completa (estilo consola) para:
//   - ver quién sorteó y a quién le regala cada uno,
//   - resetear a alguien para que vuelva a sortear (si otro tocó su nombre sin querer),
//   - crear o cambiar el usuario y la contraseña con un código que llega al Gmail
//     del organizador y vence en 2 minutos.
// Todo lo controla el Apps Script: acá no hay ninguna contraseña guardada.
// Usa api(), colorDe(), fotoDe(), aleatorio(), demo, demoAsignaciones() y guardarDemo() de script.js.
// =====================================================
(function () {
  const CLAVE_SESION = MODO_DEMO ? "amigo-invisible-demo-admin" : "amigo-invisible-admin";
  const VUELTA = 2 * Math.PI * 52; // largo del círculo de los anillos (r = 52)

  // Código de acceso de 4 números que se pide antes del login. No está escrito tal cual:
  // se guarda su huella SHA-256 ("amigo-invisible|" + código). Es solo un candado para
  // que los curiosos no anden probando; la seguridad de verdad es la contraseña.
  const HUELLA_PIN = "d0e83645157fb37faba4fb1387ec788598b314471630adf7ce58dd2acca18c77";
  const CLAVE_PIN_ESPERA = "amigo-invisible-pin-espera";
  const MAX_FALLOS_PIN = 5;

  const $ = id => document.getElementById(id);
  const btnAdmin = $("btn-admin");
  const admin = $("admin");
  const vistas = {
    pin: $("admin-pin"),
    login: $("admin-login"),
    mail: $("admin-mail"),
    codigo: $("admin-codigo"),
    panel: $("admin-panel"),
  };
  const titulo = $("admin-titulo");
  const marcaUso = $("admin-marca-uso");

  // Entrar
  const usuario = $("admin-usuario");
  const clave = $("admin-clave");
  const btnEntrar = $("admin-entrar");
  const msjLogin = $("admin-login-msj");
  // Pedir código
  const mail = $("admin-mail-input");
  const btnMandar = $("admin-mail-enviar");
  const msjMail = $("admin-mail-msj");
  // Código + contraseña nueva
  const reloj = $("admin-reloj");
  const relojArco = $("admin-reloj-arco");
  const relojTexto = $("admin-reloj-texto");
  const enviado = $("admin-enviado");
  const codigo = $("admin-codigo-input");
  const nuevoUsuario = $("admin-nuevo-usuario");
  const nuevaClave = $("admin-nueva-clave");
  const nuevaClave2 = $("admin-nueva-clave2");
  const btnGuardar = $("admin-guardar");
  const btnReenviar = $("admin-reenviar");
  const msjCodigo = $("admin-codigo-msj");
  // Panel
  const anilloArco = $("admin-anillo-arco");
  const txtCuantos = $("admin-cuantos");
  const txtTotal = $("admin-total");
  const resumen = $("admin-resumen");
  const faltan = $("admin-faltan");
  const btnVer = $("admin-ver");
  const lista = $("admin-lista");
  const msjPanel = $("admin-msj");

  let token = leerToken();
  let estado = null;
  let verResultados = false;
  let confirmando = "";
  let trabajando = false;
  let venceCodigo = 0;
  let duracionCodigo = 120000;
  let intervalo = null;

  if (MODO_DEMO) $("admin-ayuda-demo").hidden = false;

  // ---------- Sesión (solo dura mientras la pestaña está abierta) ----------
  function leerToken() {
    try { return sessionStorage.getItem(CLAVE_SESION) || ""; } catch (e) { return ""; }
  }
  function guardarToken(t) {
    token = t;
    try {
      if (t) sessionStorage.setItem(CLAVE_SESION, t);
      else sessionStorage.removeItem(CLAVE_SESION);
    } catch (e) { /* ignorar */ }
  }

  // ---------- Utilidades ----------
  function icono(nombre) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "ico");
    svg.setAttribute("aria-hidden", "true");
    const uso = document.createElementNS(ns, "use");
    uso.setAttribute("href", "#i-" + nombre);
    svg.append(uso);
    return svg;
  }

  function boton(nombreIcono, texto, clase, alTocar) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = clase + " luz";
    const t = document.createElement("span");
    t.textContent = texto;
    b.append(icono(nombreIcono), t);
    b.disabled = trabajando;
    b.addEventListener("click", alTocar);
    return b;
  }

  function escribir(el, texto, esError = false) {
    el.textContent = texto;
    el.classList.toggle("error", esError);
    if (el === msjPanel && texto) {
      el.style.animation = "none";
      void el.offsetWidth;
      el.style.animation = "";
    }
  }

  const TITULOS = {
    pin: ["Código de acceso", "lock"],
    login: ["Entrar como admin", "shield"],
    mail: ["Crear o cambiar contraseña", "key"],
    codigo: ["Crear o cambiar contraseña", "key"],
    panel: ["Panel de admin", "grid"],
  };

  function mostrar(vista, foco) {
    Object.entries(vistas).forEach(([nombre, el]) => { el.hidden = nombre !== vista; });
    titulo.textContent = TITULOS[vista][0];
    marcaUso.setAttribute("href", "#i-" + TITULOS[vista][1]);
    if (vista !== "codigo") pararReloj();
    if (foco) foco.focus();
  }

  // Llama al Apps Script por POST. Si la sesión se venció, vuelve a pedir la contraseña.
  async function pedir(datos) {
    const res = await api(datos, true);
    if (!res.ok && res.sesionVencida) {
      guardarToken("");
      estado = null;
      mostrar("login", usuario);
      escribir(msjLogin, res.error, true);
      return null;
    }
    return res;
  }

  // ---------- Abrir y cerrar ----------
  // Si ya hay una sesión de admin abierta va directo al panel; si no, primero pide el código.
  function abrir() {
    if (typeof admin.showModal === "function") admin.showModal();
    else admin.setAttribute("open", "");
    if (token) cargarPanel();
    else mostrarPin();
  }
  function cerrar() {
    confirmando = "";
    pararReloj();
    if (typeof admin.close === "function") admin.close();
    else admin.removeAttribute("open");
  }
  btnAdmin.addEventListener("click", abrir);
  $("admin-cerrar").addEventListener("click", cerrar);
  admin.addEventListener("close", pararReloj);

  // ---------- Código de acceso (4 números) ----------
  const puntos = [...$("admin-pin-puntos").children];
  const cajaPuntos = $("admin-pin-puntos");
  const teclas = [...vistas.pin.querySelectorAll(".admin-tecla")];
  const msjPin = $("admin-pin-msj");
  let pin = "";
  let fallosPin = 0;
  let revisando = false;
  let relojEspera = null;

  function pintarPuntos(estadoPuntos = "") {
    puntos.forEach((p, i) => p.classList.toggle("lleno", i < pin.length));
    cajaPuntos.className = "admin-pin-puntos" + (estadoPuntos ? " " + estadoPuntos : "");
  }

  function esperaPin() {
    try { return Math.max(0, Number(localStorage.getItem(CLAVE_PIN_ESPERA) || 0) - Date.now()); } catch (e) { return 0; }
  }

  function bloquearTeclado(bloquear) {
    teclas.forEach(t => { t.disabled = bloquear; });
  }

  function revisarEspera() {
    clearInterval(relojEspera);
    const tic = () => {
      const ms = esperaPin();
      if (!ms) {
        clearInterval(relojEspera);
        bloquearTeclado(false);
        if (msjPin.classList.contains("error")) escribir(msjPin, "");
        return;
      }
      bloquearTeclado(true);
      escribir(msjPin, `Demasiados intentos. Esperá ${Math.ceil(ms / 1000)} segundos.`, true);
    };
    tic();
    relojEspera = setInterval(tic, 500);
  }

  function mostrarPin() {
    pin = "";
    revisando = false;
    pintarPuntos();
    escribir(msjPin, "");
    mostrar("pin");
    revisarEspera();
    const primera = teclas.find(t => !t.disabled);
    if (primera) primera.focus({ preventScroll: true });
  }

  async function huella(texto) {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
    return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async function revisarPin() {
    revisando = true;
    let ok = false;
    try { ok = (await huella("amigo-invisible|" + pin)) === HUELLA_PIN; } catch (e) { ok = false; }
    if (ok) {
      fallosPin = 0;
      pintarPuntos("bien");
      setTimeout(() => {
        revisando = false;
        escribir(msjLogin, "");
        mostrar("login", usuario);
      }, 350);
      return;
    }
    fallosPin++;
    pintarPuntos("mal");
    escribir(msjPin, "Código incorrecto.", true);
    if (fallosPin >= MAX_FALLOS_PIN) {
      fallosPin = 0;
      try { localStorage.setItem(CLAVE_PIN_ESPERA, String(Date.now() + 60000)); } catch (e) { /* ignorar */ }
    }
    setTimeout(() => {
      pin = "";
      revisando = false;
      pintarPuntos();
      revisarEspera();
    }, 600);
  }

  function teclear(n) {
    if (revisando || esperaPin()) return;
    if (pin.length >= 4) return;
    if (msjPin.classList.contains("error")) escribir(msjPin, "");
    pin += n;
    pintarPuntos();
    if (pin.length === 4) revisarPin();
  }
  function borrar() {
    if (revisando || !pin) return;
    pin = pin.slice(0, -1);
    pintarPuntos();
  }

  teclas.forEach(t => t.addEventListener("click", () => {
    if (t.dataset.n !== undefined) teclear(t.dataset.n);
    else borrar();
  }));
  // También se puede escribir con el teclado de la compu.
  admin.addEventListener("keydown", e => {
    if (vistas.pin.hidden) return;
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); teclear(e.key); }
    else if (e.key === "Backspace") { e.preventDefault(); borrar(); }
  });

  // ---------- Entrar ----------
  vistas.login.addEventListener("submit", async e => {
    e.preventDefault();
    if (!MODO_DEMO && (!usuario.value.trim() || !clave.value)) {
      escribir(msjLogin, "Escribí tu usuario y tu contraseña.", true);
      return;
    }
    btnEntrar.disabled = true;
    escribir(msjLogin, "Entrando...");
    try {
      const res = await api({ accion: "adminEntrar", usuario: usuario.value, clave: clave.value }, true);
      if (!res.ok) throw new Error(res.error || "No se pudo entrar");
      clave.value = "";
      guardarToken(res.token);
      escribir(msjLogin, "");
      await cargarPanel();
    } catch (err) {
      escribir(msjLogin, err.message, true);
      clave.select();
    } finally {
      btnEntrar.disabled = false;
    }
  });

  $("admin-ir-recuperar").addEventListener("click", () => {
    escribir(msjMail, "");
    mostrar("mail", mail);
  });
  document.querySelectorAll(".admin-volver").forEach(b => b.addEventListener("click", () => {
    escribir(msjLogin, "");
    mostrar("login", usuario);
  }));

  // ---------- Código por mail ----------
  async function mandarCodigo(msj, btn) {
    if (!mail.value.includes("@")) {
      mostrar("mail", mail);
      escribir(msjMail, "Escribí tu Gmail completo (con @gmail.com).", true);
      return false;
    }
    btn.disabled = true;
    escribir(msj, "Mandando el código...");
    try {
      const res = await api({ accion: "adminPedirCodigo", mail: mail.value }, true);
      if (!res.ok) throw new Error(res.error || "No se pudo mandar el código");
      duracionCodigo = res.vence * 1000;
      venceCodigo = Date.now() + duracionCodigo;
      return res;
    } catch (err) {
      escribir(msj, err.message, true);
      return false;
    } finally {
      btn.disabled = false;
    }
  }

  vistas.mail.addEventListener("submit", async e => {
    e.preventDefault();
    const res = await mandarCodigo(msjMail, btnMandar);
    if (!res) return;
    codigo.value = "";
    mostrar("codigo", codigo);
    enviado.textContent = res.codigoDemo
      ? `Modo prueba: no se manda mail, el código es ${res.codigoDemo}`
      : "Te mandé un código de 6 números a tu Gmail. Si no lo ves, fijate en Spam.";
    escribir(msjCodigo, "");
    arrancarReloj();
  });

  btnReenviar.addEventListener("click", async () => {
    const res = await mandarCodigo(msjCodigo, btnReenviar);
    if (!res) return;
    codigo.value = "";
    codigo.focus();
    enviado.textContent = res.codigoDemo
      ? `Modo prueba: el código nuevo es ${res.codigoDemo}`
      : "Te mandé un código nuevo. Usá el último que te llegó.";
    escribir(msjCodigo, "");
    arrancarReloj();
  });

  // Cuenta regresiva con anillo: azul, amarillo los últimos 20 segundos, rojo al vencer.
  function arrancarReloj() {
    pararReloj();
    btnGuardar.disabled = false;
    reloj.classList.remove("vencido", "urgente");
    const tic = () => {
      const restanMs = Math.max(0, venceCodigo - Date.now());
      const quedan = Math.ceil(restanMs / 1000);
      relojArco.style.strokeDashoffset = String(VUELTA * (1 - restanMs / duracionCodigo));
      relojArco.style.opacity = restanMs ? "1" : "0";
      if (quedan === 0) {
        relojTexto.textContent = "0:00";
        reloj.classList.add("vencido");
        btnGuardar.disabled = true;
        escribir(msjCodigo, "El código venció. Pedí otro.", true);
        pararReloj();
        return;
      }
      reloj.classList.toggle("urgente", quedan <= 20);
      relojTexto.textContent = `${Math.floor(quedan / 60)}:${String(quedan % 60).padStart(2, "0")}`;
    };
    tic();
    intervalo = setInterval(tic, 100);
  }
  function pararReloj() {
    if (intervalo) clearInterval(intervalo);
    intervalo = null;
  }

  vistas.codigo.addEventListener("submit", async e => {
    e.preventDefault();
    const cod = codigo.value.replace(/\s/g, "");
    let error = "";
    if (!/^\d{6}$/.test(cod)) error = "El código tiene 6 números.";
    else if (!nuevoUsuario.value.trim()) error = "Elegí un usuario.";
    else if (nuevaClave.value.length < 6) error = "La contraseña tiene que tener al menos 6 caracteres.";
    else if (nuevaClave.value !== nuevaClave2.value) error = "Las dos contraseñas no son iguales.";
    if (error) {
      escribir(msjCodigo, error, true);
      return;
    }
    btnGuardar.disabled = true;
    escribir(msjCodigo, "Guardando...");
    try {
      const res = await api({
        accion: "adminCambiarClave",
        codigo: cod,
        usuario: nuevoUsuario.value,
        clave: nuevaClave.value,
      }, true);
      if (!res.ok) {
        if (res.vencido) {
          venceCodigo = 0;
          arrancarReloj();
        }
        throw new Error(res.error || "No se pudo guardar");
      }
      nuevaClave.value = nuevaClave2.value = codigo.value = "";
      usuario.value = nuevoUsuario.value.trim();
      guardarToken(res.token);
      await cargarPanel("Listo, guardé tu usuario y contraseña. La próxima vez entrá con esos.");
    } catch (err) {
      escribir(msjCodigo, err.message, true);
    } finally {
      if (venceCodigo > Date.now()) btnGuardar.disabled = false;
    }
  });

  // ---------- Panel ----------
  async function cargarPanel(texto = "") {
    const primeraVez = !estado;
    mostrar("panel");
    if (primeraVez) {
      resumen.textContent = "Cargando...";
      faltan.textContent = "";
      lista.innerHTML = "";
    }
    escribir(msjPanel, texto || (primeraVez ? "" : "Actualizando..."));
    try {
      const res = await pedir({ accion: "adminEstado", token });
      if (!res) return;
      if (!res.ok) throw new Error(res.error || "Algo salió mal");
      estado = res;
      escribir(msjPanel, texto);
      pintar(true);
    } catch (err) {
      escribir(msjPanel, "No se pudo cargar: " + err.message, true);
    }
  }

  function pintar(animar = false) {
    const { participantes: nombres, sorteados, asignaciones } = estado;
    const cuantos = nombres.filter(n => sorteados.includes(n)).length;
    const total = nombres.length;
    txtCuantos.textContent = cuantos;
    txtTotal.textContent = "de " + total;
    anilloArco.style.strokeDashoffset = String(VUELTA * (1 - (total ? cuantos / total : 0)));
    anilloArco.style.opacity = cuantos ? "1" : "0";
    resumen.textContent = cuantos === total ? "¡Ya sortearon todos!" : `Ya sortearon ${cuantos} de ${total}`;
    faltan.textContent = cuantos === total ? "No falta nadie 🎉" : `Faltan ${total - cuantos}`;

    const t = document.createElement("span");
    t.textContent = verResultados ? "Ocultar resultados" : "Ver a quién le toca";
    btnVer.replaceChildren(icono(verResultados ? "eye-off" : "eye"), t);
    btnVer.setAttribute("aria-pressed", String(verResultados));

    lista.classList.toggle("animar", animar);
    lista.innerHTML = "";
    nombres.forEach((n, i) => {
      const sorteo = sorteados.includes(n);
      const li = document.createElement("li");
      li.className = "admin-fila";
      li.style.setProperty("--c", colorDe(n));
      li.style.setProperty("--i", i);

      const foto = document.createElement("img");
      foto.className = "admin-foto";
      foto.alt = "";
      foto.width = foto.height = 48;
      foto.src = fotoDe(n);

      const info = document.createElement("div");
      info.className = "admin-info";
      const nombre = document.createElement("strong");
      nombre.textContent = n;
      const chip = document.createElement("span");
      chip.className = "chip " + (sorteo ? "chip-ok" : "chip-pend");
      chip.append(icono(sorteo ? "check" : "clock"), sorteo ? "Ya sorteó" : "Falta sortear");
      info.append(nombre, chip);
      if (verResultados) {
        const toca = document.createElement("span");
        toca.className = "admin-toca";
        const txt = document.createElement("span");
        txt.textContent = "Le regala a";
        const b = document.createElement("b");
        b.textContent = asignaciones[n] || "—";
        toca.append(icono("gift"), txt, b);
        info.append(toca);
      }
      li.append(foto, info);

      if (sorteo && confirmando !== n) {
        const r = boton("rotate", "Resetear", "admin-resetear", () => {
          confirmando = n;
          escribir(msjPanel, "");
          pintar();
          const si = lista.querySelector(".admin-si");
          if (si) si.focus();
        });
        r.setAttribute("aria-label", "Resetear a " + n);
        li.append(r);
      }

      if (sorteo && confirmando === n) {
        const caja = document.createElement("div");
        caja.className = "admin-confirmar";
        const p = document.createElement("p");
        p.className = "admin-confirmar-texto";
        const txt = document.createElement("span");
        txt.textContent = `¿Resetear a ${n}? Va a poder sortear de nuevo. Si queda alguien sin sortear, ` +
          `le cambio a quién le toca, así el que tocó sin querer no sabe el resultado.`;
        p.append(icono("alert"), txt);
        const botones = document.createElement("div");
        botones.className = "admin-confirmar-botones";
        botones.append(
          boton("rotate", "Sí, resetear", "admin-btn admin-btn-peligro admin-si", () => resetear(n)),
          boton("x", "Cancelar", "admin-btn admin-btn-secundario admin-no", () => { confirmando = ""; pintar(); }),
        );
        caja.append(p, botones);
        li.append(caja);
      }
      lista.append(li);
    });
  }

  async function resetear(nombre) {
    trabajando = true;
    pintar();
    escribir(msjPanel, "Reseteando a " + nombre + "...");
    try {
      const res = await pedir({ accion: "adminResetear", token, nombre });
      if (!res) return;
      if (!res.ok) throw new Error(res.error || "Algo salió mal");
      confirmando = "";
      trabajando = false;
      await cargarPanel(res.cambio
        ? `Listo: ${nombre} puede sortear de nuevo y le cambié a quién le toca. ` +
          `Si alguien tocó su nombre sin querer, que recargue la página y elija el suyo.`
        : `Listo: ${nombre} puede sortear de nuevo. Le va a tocar la misma persona ` +
          `(no se podía cambiar sin tocar a los que ya sortearon).`);
    } catch (err) {
      escribir(msjPanel, "No se pudo resetear: " + err.message, true);
    } finally {
      trabajando = false;
      if (estado && !vistas.panel.hidden) pintar();
    }
  }

  btnVer.addEventListener("click", () => {
    verResultados = !verResultados;
    pintar();
  });

  $("admin-actualizar").addEventListener("click", () => {
    confirmando = "";
    cargarPanel();
  });

  $("admin-salir").addEventListener("click", () => {
    if (token) api({ accion: "adminSalir", token }, true).catch(() => {});
    guardarToken("");
    estado = null;
    verResultados = false;
    confirmando = "";
    lista.innerHTML = "";
    mostrar("login", usuario);
    escribir(msjLogin, "Cerraste la sesión de admin.");
  });

  // ---------- Modo prueba: imita al Apps Script ----------
  // En la prueba sirve cualquier usuario, contraseña y mail, y el código se muestra en pantalla.
  let codigoDemo = null;
  window.adminDemo = function (p) {
    if (p.accion === "adminEntrar") return { ok: true, token: "demo" };
    if (p.accion === "adminSalir") return { ok: true };
    if (p.accion === "adminPedirCodigo") {
      codigoDemo = { codigo: String(Math.floor(100000 + Math.random() * 900000)), vence: Date.now() + 120000 };
      return { ok: true, vence: 120, codigoDemo: codigoDemo.codigo };
    }
    if (p.accion === "adminCambiarClave") {
      if (!codigoDemo || Date.now() > codigoDemo.vence) {
        return { ok: false, vencido: true, error: "El código venció. Pedí uno nuevo." };
      }
      if (p.codigo !== codigoDemo.codigo) return { ok: false, error: "Ese código no es. Fijate bien el que te llegó al mail." };
      codigoDemo = null;
      return { ok: true, token: "demo" };
    }
    if (p.accion === "adminEstado") {
      const asig = demoAsignaciones();
      guardarDemo();
      return { ok: true, participantes: demo.nombres, sorteados: demo.sorteados, asignaciones: asig };
    }
    if (p.accion === "adminResetear") {
      const n = p.nombre;
      const asig = demoAsignaciones();
      if (!demo.sorteados.includes(n)) return { ok: false, error: n + " todavía no sorteó" };
      demo.sorteados = demo.sorteados.filter(x => x !== n);
      delete demo.ids[n];
      // Igual que el Apps Script: mezcla entre él y los que todavía no sortearon.
      const libres = demo.nombres.filter(o => asig[o] && !demo.sorteados.includes(o));
      const destinos = libres.map(o => asig[o]);
      let cambio = false;
      for (let intento = 0; intento < 500 && !cambio; intento++) {
        const m = [...destinos].sort(() => Math.random() - 0.5);
        if (m[libres.indexOf(n)] !== asig[n] && libres.every((o, i) => m[i] !== o)) {
          libres.forEach((o, i) => { asig[o] = m[i]; });
          cambio = true;
        }
      }
      guardarDemo();
      return { ok: true, cambio };
    }
    return { ok: false, error: "Acción desconocida" };
  };
})();
