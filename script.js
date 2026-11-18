// =====================================================
// CONFIGURACIÓN
// Pegá acá la URL de tu Apps Script (termina en /exec).
// Si queda vacía, la web funciona en "modo prueba" con nombres de ejemplo.
// =====================================================
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxeGtcRlm8WPQCbqw1mYEK8cLOCMe36-Qww95kYKDSoN6x2r-A4gX0jwwzaoEoz9OnoKg/exec";

const MODO_DEMO = !SCRIPT_URL;
const CLAVE_RESULTADO = "amigo-invisible-resultado";

// ---------- Elementos ----------
const selector = document.getElementById("selector");
const selectorBoton = document.getElementById("selector-boton");
const selectorTexto = document.getElementById("selector-texto");
const selectorInicial = document.getElementById("selector-inicial");
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
function colorDe(nombre) {
  const i = participantes.indexOf(nombre);
  return COLORES_NOMBRES[(i < 0 ? 0 : i) % COLORES_NOMBRES.length];
}

// ---------- Comunicación con el Apps Script ----------
async function api(params) {
  if (MODO_DEMO) return apiDemo(params);
  const url = SCRIPT_URL + "?" + new URLSearchParams(params);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("El servidor respondió " + resp.status);
  return resp.json();
}

// Simulación local para probar sin Apps Script
const demo = { nombres: ["Ana", "Bruno", "Carla", "Diego", "Euge"], asignaciones: null, sorteados: [] };
async function apiDemo(params) {
  await new Promise(r => setTimeout(r, 800));
  if (params.accion === "participantes") return { ok: true, participantes: demo.nombres };
  if (params.accion === "sortear") {
    if (!demo.asignaciones) {
      const s = [...demo.nombres].sort(() => Math.random() - 0.5);
      demo.asignaciones = {};
      s.forEach((n, i) => { demo.asignaciones[n] = s[(i + 1) % s.length]; });
    }
    if (demo.sorteados.includes(params.nombre)) return { ok: true, yaSorteo: true };
    demo.sorteados.push(params.nombre);
    console.log(`[demo] Mail al organizador: "${params.nombre} ya hizo su sorteo (${demo.sorteados.length} de ${demo.nombres.length})"`);
    return { ok: true, yaSorteo: false, teToca: demo.asignaciones[params.nombre] };
  }
  return { ok: false, error: "Acción desconocida" };
}

// ---------- Guardado local del resultado ----------
function leerResultado() {
  try { return JSON.parse(localStorage.getItem(CLAVE_RESULTADO)); } catch (e) { return null; }
}
function guardarResultado(nombre, teToca) {
  try { localStorage.setItem(CLAVE_RESULTADO, JSON.stringify({ nombre, teToca })); } catch (e) { /* ignorar */ }
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
    op.innerHTML = '<span class="inicial"></span><span></span>';
    op.firstChild.textContent = n.charAt(0).toUpperCase();
    op.lastChild.textContent = n;
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
  selectorInicial.textContent = nombre.charAt(0).toUpperCase();
  selectorInicial.classList.remove("oculto");
  selectorBoton.style.setProperty("--c", color);
  selectorBoton.classList.add("elegido");
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
    guardarResultado(quien, res.teToca);
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
  const previo = leerResultado();

  try {
    const res = await api({ accion: "participantes" });
    if (!res.ok) throw new Error(res.error);
    participantes = res.participantes;
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
