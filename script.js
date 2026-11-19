// =====================================================
// CONFIGURACIÓN
// Pegá acá la URL de tu Apps Script (termina en /exec).
// Si queda vacía, la web funciona en "modo prueba" con nombres de ejemplo.
// =====================================================
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxeGtcRlm8WPQCbqw1mYEK8cLOCMe36-Qww95kYKDSoN6x2r-A4gX0jwwzaoEoz9OnoKg/exec";

const MODO_DEMO = !SCRIPT_URL;
// En modo prueba se guarda aparte, así probar no pisa el resultado real del mismo celular.
const CLAVE_RESULTADO = MODO_DEMO ? "amigo-invisible-demo-resultado" : "amigo-invisible-resultado";

// ---------- Elementos ----------
const selector = document.getElementById("selector");
const selectorBoton = document.getElementById("selector-boton");
const selectorTexto = document.getElementById("selector-texto");
const selectorAvatar = document.getElementById("selector-avatar");
const selectorLista = document.getElementById("selector-lista");
const ruleta = document.getElementById("ruleta");
const nombreActual = document.getElementById("nombre-actual");
const btnSortear = document.getElementById("btn-sortear");
const mensaje = document.getElementById("mensaje");
const avisoDemo = document.getElementById("aviso-demo");

let participantes = [];
let quienElegido = "";

// Un color de luz distinto para cada nombre (se repiten si hay más de 12).
const COLORES_NOMBRES = [
  "#ff4d6d", "#ffc93c", "#3ddc84", "#4fd1ff", "#b388ff", "#ff8a3d",
  "#ff6fb5", "#7cf5e0", "#c6ff4d", "#6e8bff", "#ff5ce1", "#ffe066",
];
// Algunos tienen su estilo propio: Fernando azul, Juani rosa con un corazón pixelado,
// Daniela (gris) y Ezequiel con colores oscuros y sin brillo ("mate").
const ESTILOS_NOMBRES = {
  Fernando: { color: "#1e6bff" },
  Juani: { color: "#ff4fa3", corazon: true },
  Daniela: { color: "#4b4b50", mate: true },
  Ezequiel: { color: "#2f4054", mate: true },
};
function estiloDe(nombre) {
  return ESTILOS_NOMBRES[nombre] || {};
}
function colorDe(nombre) {
  if (estiloDe(nombre).color) return estiloDe(nombre).color;
  const i = participantes.indexOf(nombre);
  return COLORES_NOMBRES[(i < 0 ? 0 : i) % COLORES_NOMBRES.length];
}
// Pone el estilo propio (sin brillo y/o corazón) en una barra de nombre.
// `dondeCorazon` es el elemento al que se le agrega el corazón al lado del nombre.
function decorarNombre(barra, nombre, dondeCorazon) {
  const estilo = estiloDe(nombre);
  barra.classList.toggle("mate", !!estilo.mate);
  if (!estilo.corazon) return;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "corazon");
  svg.setAttribute("viewBox", "0 0 10 9");
  svg.setAttribute("aria-hidden", "true");
  const uso = document.createElementNS(ns, "use");
  uso.setAttribute("href", "#i-corazon");
  svg.append(uso);
  dondeCorazon.append(svg);
}

// Foto de perfil de cada participante: los de esta lista usan el duende hombre,
// el resto la duende mujer.
const DUENDE_HOMBRE = ["Fernando", "Nacho", "Ezequiel", "Charli"];
function fotoDe(nombre) {
  return DUENDE_HOMBRE.includes(nombre) ? "img/duende-hombre.jpg" : "img/duende-mujer.jpg";
}

// ---------- Comunicación con el Apps Script ----------
// Lo público va por GET; lo del admin va por POST (así la contraseña no viaja en la dirección).
async function api(params, porPost = false) {
  if (MODO_DEMO) return apiDemo(params);
  const resp = porPost
    ? await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(params),
      })
    : await fetch(SCRIPT_URL + "?" + new URLSearchParams(params));
  if (!resp.ok) throw new Error("El servidor respondió " + resp.status);
  return resp.json();
}

// Simulación para probar sin Apps Script (queda guardada en este navegador).
const CLAVE_DEMO = "amigo-invisible-demo-datos";
const demo = (() => {
  const base = { nombres: ["Ana", "Bruno", "Carla", "Diego", "Euge"], asignaciones: null, sorteados: [], ids: {} };
  if (!MODO_DEMO) return base;
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_DEMO)) || {};
    // Si cambiaron los nombres de prueba, arranca de cero.
    if (JSON.stringify(guardado.nombres) !== JSON.stringify(base.nombres)) return base;
    return Object.assign(base, guardado);
  } catch (e) { return base; }
})();
function guardarDemo() {
  try { localStorage.setItem(CLAVE_DEMO, JSON.stringify(demo)); } catch (e) { /* ignorar */ }
}
function demoAsignaciones() {
  if (!demo.asignaciones) {
    const s = [...demo.nombres].sort(() => Math.random() - 0.5);
    demo.asignaciones = {};
    s.forEach((n, i) => { demo.asignaciones[n] = s[(i + 1) % s.length]; });
    demo.sorteados = [];
  }
  return demo.asignaciones;
}
async function apiDemo(params) {
  await new Promise(r => setTimeout(r, 800));
  const n = params.nombre;
  if (params.accion === "participantes") {
    const res = { ok: true, participantes: demo.nombres };
    if (n) res.vigente = demo.sorteados.includes(n) && (!demo.ids[n] || demo.ids[n] === params.id);
    return res;
  }
  if (params.accion === "sortear") {
    const asig = demoAsignaciones();
    if (demo.sorteados.includes(n)) return { ok: true, yaSorteo: true };
    // Como el Apps Script: se decide recién ahora, mezclando entre los que no sortearon.
    const libres = demo.nombres.filter(o => !demo.sorteados.includes(o));
    const destinos = libres.map(o => asig[o]);
    for (let i = 0; i < 500; i++) {
      const m = [...destinos].sort(() => Math.random() - 0.5);
      if (libres.every((o, k) => m[k] !== o)) { libres.forEach((o, k) => { asig[o] = m[k]; }); break; }
    }
    demo.sorteados.push(n);
    demo.ids[n] = String(Math.random()).slice(2);
    guardarDemo();
    console.log(`[demo] Mail al organizador: "${n} ya hizo su sorteo (${demo.sorteados.length} de ${demo.nombres.length})"`);
    return { ok: true, yaSorteo: false, teToca: asig[n], id: demo.ids[n] };
  }
  if (String(params.accion).startsWith("admin")) return adminDemo(params); // está en admin.js
  return { ok: false, error: "Acción desconocida" };
}

// ---------- Guardado local del resultado ----------
function leerResultado() {
  try { return JSON.parse(localStorage.getItem(CLAVE_RESULTADO)); } catch (e) { return null; }
}
function guardarResultado(nombre, teToca, id) {
  try { localStorage.setItem(CLAVE_RESULTADO, JSON.stringify({ nombre, teToca, id })); } catch (e) { /* ignorar */ }
}
function borrarResultado() {
  try { localStorage.removeItem(CLAVE_RESULTADO); } catch (e) { /* ignorar */ }
}

// ---------- UI ----------
function mostrarMensaje(texto, esError = false) {
  mensaje.textContent = texto;
  mensaje.classList.toggle("error", esError);
}

function aleatorio(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function mostrarGanador(nombre) {
  nombreActual.textContent = nombre;
  ruleta.classList.remove("girando");
  void ruleta.offsetWidth; // reinicia la animación
  ruleta.classList.add("ganador");
}

// Hace girar los nombres hasta que se llame a parar(nombreFinal).
// Gira rápido mientras espera la respuesta y después frena de a poco.
function girar(nombresGiro) {
  let delay = 50;
  let final = null;
  let frenando = false;
  let cancelado = false;
  let anterior = null;
  let resolver;
  const inicio = Date.now();
  const terminado = new Promise(r => (resolver = r));

  ruleta.classList.remove("ganador");
  ruleta.classList.add("girando");

  function tick() {
    if (cancelado) return;
    if (frenando && delay >= 450) {
      mostrarGanador(final);
      resolver();
      return;
    }
    let n = aleatorio(nombresGiro);
    if (nombresGiro.length > 1) while (n === anterior) n = aleatorio(nombresGiro);
    anterior = n;
    nombreActual.textContent = n;

    if (frenando) delay *= 1.12;
    else if (final !== null && Date.now() - inicio > 1500) frenando = true;
    setTimeout(tick, delay);
  }
  tick();

  return {
    parar(nombreFinal) { final = nombreFinal; return terminado; },
    cancelar(texto) {
      cancelado = true;
      ruleta.classList.remove("girando");
      nombreActual.textContent = texto;
    },
  };
}

function bloquear() {
  cerrarLista();
  selectorBoton.disabled = true;
  btnSortear.disabled = true;
}

// ---------- Menú de nombres ----------
function armarLista() {
  selectorLista.innerHTML = "";
  participantes.forEach((n, i) => {
    const li = document.createElement("li");
    li.setAttribute("role", "presentation");
    const op = document.createElement("button");
    op.type = "button";
    op.className = "opcion";
    op.setAttribute("role", "option");
    op.setAttribute("aria-selected", "false");
    op.dataset.nombre = n;
    op.style.setProperty("--c", colorDe(n));
    op.style.setProperty("--i", i);
    const foto = document.createElement("img");
    foto.className = "avatar";
    foto.alt = "";
    foto.width = foto.height = 42;
    foto.src = fotoDe(n);
    const texto = document.createElement("span");
    texto.textContent = n;
    op.append(foto, texto);
    decorarNombre(op, n, op);
    op.addEventListener("click", () => elegir(n, true));
    li.appendChild(op);
    selectorLista.appendChild(li);
  });
}

function opciones() {
  return [...selectorLista.querySelectorAll(".opcion")];
}

function abrirLista() {
  if (selectorBoton.disabled) return;
  selectorLista.hidden = false;
  selector.classList.add("abierto");
  selectorBoton.setAttribute("aria-expanded", "true");
  // Reinicia la animación de entrada de cada nombre
  opciones().forEach(op => { op.style.animation = "none"; void op.offsetWidth; op.style.animation = ""; });
  const actual = opciones().find(op => op.dataset.nombre === quienElegido) || opciones()[0];
  if (actual) actual.focus({ preventScroll: true });
}

function cerrarLista(volverAlBoton = false) {
  if (selectorLista.hidden) return;
  selectorLista.hidden = true;
  selector.classList.remove("abierto");
  selectorBoton.setAttribute("aria-expanded", "false");
  if (volverAlBoton) selectorBoton.focus();
}

function elegir(nombre, desdeLista = false) {
  quienElegido = nombre;
  const color = colorDe(nombre);
  selectorTexto.textContent = nombre;
  selectorAvatar.src = fotoDe(nombre);
  selectorAvatar.classList.remove("oculto");
  selectorBoton.style.setProperty("--c", color);
  selectorBoton.classList.add("elegido");
  decorarNombre(selectorBoton, nombre, selectorTexto);
  opciones().forEach(op => op.setAttribute("aria-selected", String(op.dataset.nombre === nombre)));
  if (mensaje.classList.contains("error")) mostrarMensaje("");
  cerrarLista(desdeLista);
}

selectorBoton.addEventListener("click", () => {
  if (selectorLista.hidden) abrirLista();
  else cerrarLista();
});

selectorBoton.addEventListener("keydown", e => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    abrirLista();
  }
});

selectorLista.addEventListener("keydown", e => {
  const ops = opciones();
  const i = ops.indexOf(document.activeElement);
  if (e.key === "ArrowDown") { e.preventDefault(); ops[(i + 1) % ops.length].focus(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); ops[(i - 1 + ops.length) % ops.length].focus(); }
  else if (e.key === "Home") { e.preventDefault(); ops[0].focus(); }
  else if (e.key === "End") { e.preventDefault(); ops[ops.length - 1].focus(); }
  else if (e.key === "Escape" || e.key === "Tab") { cerrarLista(e.key === "Escape"); }
});

document.addEventListener("click", e => {
  if (!selector.contains(e.target)) cerrarLista();
});

// ---------- Sorteo ----------
async function sortear() {
  const quien = quienElegido;
  if (!quien) {
    mostrarMensaje("Primero elegí tu nombre 👆", true);
    return;
  }
  bloquear();
  mostrarMensaje("");

  const otros = participantes.filter(n => n !== quien);
  const giro = girar(otros.length ? otros : participantes);

  try {
    const res = await api({ accion: "sortear", nombre: quien });
    if (!res.ok) throw new Error(res.error || "Algo salió mal");

    if (res.yaSorteo) {
      giro.cancelar("🤔");
      mostrarMensaje(`${quien}, vos ya hiciste tu sorteo. Si no fuiste vos, avisale al organizador.`, true);
      return;
    }

    await giro.parar(res.teToca);
    guardarResultado(quien, res.teToca, res.id);
    mostrarMensaje(`¡${quien}, te toca regalarle a ${res.teToca}! 🤫 No le digas a nadie.`);
    lanzarConfeti();
  } catch (err) {
    giro.cancelar("😕");
    mostrarMensaje("No se pudo sortear: " + err.message + ". Probá de nuevo.", true);
    selectorBoton.disabled = false;
    btnSortear.disabled = false;
  }
}

// ---------- Efectos ----------
function lanzarConfeti() {
  const colores = ["#c8102e", "#1e7a46", "#f4c542", "#ffffff"];
  for (let i = 0; i < 80; i++) {
    const c = document.createElement("div");
    c.className = "confeti";
    c.style.left = Math.random() * 100 + "vw";
    c.style.background = aleatorio(colores);
    c.style.animationDelay = Math.random() * 0.6 + "s";
    c.style.animationDuration = 2 + Math.random() * 1.5 + "s";
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 4500);
  }
}

function crearNieve() {
  const fondo = document.getElementById("fondo");
  for (let i = 0; i < 40; i++) {
    const copo = document.createElement("span");
    copo.className = "copo";
    copo.textContent = "❄";
    copo.style.left = Math.random() * 100 + "vw";
    copo.style.fontSize = 8 + Math.random() * 14 + "px";
    copo.style.animationDuration = 6 + Math.random() * 10 + "s";
    copo.style.animationDelay = -Math.random() * 16 + "s";
    fondo.appendChild(copo);
  }
}

// ---------- Inicio ----------
async function iniciar() {
  crearNieve();
  avisoDemo.classList.toggle("oculto", !MODO_DEMO);

  // Si este dispositivo ya sorteó, mostrar el resultado directamente
  // (salvo que el admin lo haya reseteado: eso lo responde el Apps Script).
  let previo = leerResultado();
  const pedido = { accion: "participantes" };
  if (previo && previo.nombre) {
    pedido.nombre = previo.nombre;
    pedido.id = previo.id || "";
  }

  try {
    const res = await api(pedido);
    if (!res.ok) throw new Error(res.error);
    participantes = res.participantes;
    if (previo && res.vigente === false && participantes.includes(previo.nombre)) {
      borrarResultado();
      mostrarMensaje(`El organizador reseteó el sorteo de ${previo.nombre}. Elegí tu nombre y sorteá 🎲`);
      previo = null;
    }
  } catch (err) {
    selectorTexto.textContent = "No se pudo cargar";
    mostrarMensaje("No se pudo conectar con el sorteo. Recargá la página.", true);
    return;
  }

  selectorTexto.textContent = "Elegí tu nombre";
  armarLista();

  if (previo && participantes.includes(previo.nombre)) {
    elegir(previo.nombre);
    mostrarGanador(previo.teToca);
    mostrarMensaje(`${previo.nombre}, ya sorteaste: te toca ${previo.teToca} 🎁`);
    bloquear();
    return;
  }

  selectorBoton.disabled = false;
  btnSortear.disabled = false;
}

btnSortear.addEventListener("click", sortear);
iniciar();
