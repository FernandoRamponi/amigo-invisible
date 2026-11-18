// =====================================================
// MINI SANTA 3D bailando (Three.js)
// Un Santa petiso y cabezón, con piel esponjosa, anteojos y gorro que se dobla,
// que hace bailes tipo meme sobre una pista con luces de colores.
// Tocalo para que salte y cambie de baile.
// Si el navegador no soporta 3D, queda el Santa plano (SVG) de respaldo.
// =====================================================
(function () {
  const contenedor = document.querySelector(".santa-baile");
  if (!contenedor || typeof THREE === "undefined") return;

  // ¿Hay WebGL?
  try {
    const prueba = document.createElement("canvas");
    if (!(prueba.getContext("webgl") || prueba.getContext("experimental-webgl"))) return;
  } catch (e) { return; }

  const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const PI = Math.PI;
  const PI2 = PI * 2;

  // ---------- Render ----------
  const canvas = document.createElement("canvas");
  canvas.className = "santa-3d";
  canvas.setAttribute("aria-hidden", "true");
  contenedor.appendChild(canvas);
  contenedor.classList.add("con-3d");

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camara.position.set(0, 1.7, 6.2);
  camara.lookAt(0, 0.95, 0);

  // ---------- Luces ----------
  escena.add(new THREE.HemisphereLight(0xfff1dc, 0x24324a, 0.85));

  const principal = new THREE.DirectionalLight(0xfff4e6, 1.6);
  principal.position.set(2.2, 4.5, 3.5);
  principal.castShadow = true;
  principal.shadow.mapSize.set(1024, 1024);
  Object.assign(principal.shadow.camera, { left: -2, right: 2, top: 2.5, bottom: -1, near: 1, far: 12 });
  principal.shadow.radius = 4;
  principal.shadow.bias = -0.0015;
  escena.add(principal);

  const contraluz = new THREE.DirectionalLight(0x9fd0ff, 1.1);   // borde de luz por detrás
  contraluz.position.set(-3, 2.5, -3);
  escena.add(contraluz);

  const relleno = new THREE.DirectionalLight(0xffd6e8, 0.35);
  relleno.position.set(-3, 1, 3);
  escena.add(relleno);

  // Luces de boliche que giran alrededor
  const lucesDisco = [0xff3d7f, 0x3dd6ff, 0xffd23d, 0x7dff6a].map(c => {
    const l = new THREE.PointLight(c, 0.7, 4.5, 2);
    escena.add(l);
    return l;
  });

  // ---------- Materiales ----------
  const color = hex => new THREE.Color(hex).convertSRGBToLinear();
  const material = (hex, rugosidad = 0.7, extra = {}) =>
    new THREE.MeshStandardMaterial(Object.assign({ color: color(hex), roughness: rugosidad, metalness: 0 }, extra));

  const M = {
    saco: material(0xc8102e, 0.78),
    pantalon: material(0xa50d27, 0.8),
    piel: material(0xf9bb94, 0.6),
    nariz: material(0xf29a86, 0.45),
    pelo: material(0xfffaf2, 1),
    pelaje: material(0xfff6ea, 1),
    bota: material(0x17171c, 0.32),
    suela: material(0x3a2a22, 0.8),
    cinturon: material(0x1a1a1f, 0.35),
    oro: material(0xf2b632, 0.28, { metalness: 0.85, emissive: color(0x3a2400) }),
    guante: material(0x1f6b3a, 0.75),
    ojo: material(0x15110f, 0.12),
    boca: material(0x7a1622, 0.6),
    brillo: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    rubor: new THREE.MeshStandardMaterial({ color: color(0xff7d8f), roughness: 1, transparent: true, opacity: 0.45, depthWrite: false }),
  };

  const geoEsfera = {};
  function esfera(r, mat, sx = 1, sy = 1, sz = 1) {
    const clave = r.toFixed(3);
    if (!geoEsfera[clave]) geoEsfera[clave] = new THREE.SphereGeometry(r, 32, 24);
    const m = new THREE.Mesh(geoEsfera[clave], mat);
    m.scale.set(sx, sy, sz);
    return m;
  }
  function cilindro(rArriba, rAbajo, alto, mat) {
    return new THREE.Mesh(new THREE.CylinderGeometry(rArriba, rAbajo, alto, 32), mat);
  }
  function en(obj, x, y, z) { obj.position.set(x, y, z); return obj; }

  // Anillo de "piel" esponjosa hecho con bolitas (para bordes del saco, gorro, puños, botas)
  function anillo(radio, cantidad, rBolita, mat = M.pelaje, aplastado = 1) {
    const g = new THREE.Group();
    for (let i = 0; i < cantidad; i++) {
      const a = (i / cantidad) * PI2;
      const variacion = 1 + (i % 3 === 0 ? 0.12 : i % 3 === 1 ? -0.06 : 0);
      g.add(en(esfera(rBolita * variacion, mat, 1, aplastado, 1), Math.cos(a) * radio, 0, Math.sin(a) * radio));
    }
    const relleno = new THREE.Mesh(new THREE.TorusGeometry(radio, rBolita * 0.8, 12, 48), mat);
    relleno.rotation.x = PI / 2;
    relleno.scale.z = aplastado;
    g.add(relleno);
    return g;
  }

  // ---------- Pista ----------
  const pista = new THREE.Mesh(
    new THREE.CircleGeometry(1.45, 64),
    new THREE.MeshBasicMaterial({ color: 0xff3d7f, transparent: true, opacity: 0.16, depthWrite: false })
  );
  pista.rotation.x = -PI / 2;
  escena.add(pista);

  const aro = new THREE.Mesh(
    new THREE.RingGeometry(1.4, 1.47, 96),
    new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.6, depthWrite: false })
  );
  aro.rotation.x = -PI / 2;
  aro.position.y = 0.002;
  escena.add(aro);

  const piso = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), new THREE.ShadowMaterial({ opacity: 0.38 }));
  piso.rotation.x = -PI / 2;
  piso.position.y = 0.003;
  piso.receiveShadow = true;
  escena.add(piso);

  // ---------- Mini Santa ----------
  const santa = new THREE.Group();   // se mueve por la pista y gira
  const rebote = new THREE.Group();  // salta al ritmo
  santa.add(rebote);
  escena.add(santa);

  // Piernas con botas
  function pierna(lado) {
    const g = en(new THREE.Group(), 0.16 * lado, 0.36, 0);
    g.add(en(cilindro(0.1, 0.105, 0.2, M.pantalon), 0, -0.1, 0));
    g.add(en(anillo(0.105, 12, 0.045), 0, -0.2, 0));
    g.add(en(cilindro(0.1, 0.11, 0.07, M.bota), 0, -0.24, 0));
    g.add(en(esfera(0.13, M.bota, 1, 0.62, 1.45), 0, -0.29, 0.06));
    g.add(en(esfera(0.13, M.suela, 1.02, 0.2, 1.48), 0, -0.335, 0.06));
    rebote.add(g);
    return g;
  }
  const piernaIzq = pierna(-1);
  const piernaDer = pierna(1);

  // Cadera: todo lo de arriba cuelga de acá
  const cadera = en(new THREE.Group(), 0, 0.36, 0);
  rebote.add(cadera);

  // Panza / saco
  const RX = 0.44, RY = 0.4, RZ = 0.42, CY = 0.3;
  cadera.add(en(esfera(1, M.saco, RX, RY, RZ), 0, CY, 0));
  cadera.add(en(anillo(0.375, 26, 0.07), 0, 0.05, 0));                     // borde de abajo
  const cinto = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.045, 16, 64), M.cinturon);
  cinto.rotation.x = PI / 2;
  cinto.scale.set(1.01, 0.97, 1);
  cadera.add(en(cinto, 0, 0.22, 0));
  // Hebilla dorada
  const hebilla = new THREE.Group();
  hebilla.add(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.13, 0.035), M.oro));
  hebilla.add(en(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.065, 0.04), M.cinturon), 0, 0, 0.004));
  hebilla.add(en(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.05), M.oro), 0.02, 0, 0.004));
  cadera.add(en(hebilla, 0, 0.22, 0.455));
  // Tira de piel en el frente del saco
  [0.1, 0.15, 0.31, 0.37, 0.43, 0.49, 0.55, 0.6].forEach(y => {
    const z = RZ * Math.sqrt(Math.max(0, 1 - ((y - CY) / RY) ** 2));
    cadera.add(en(esfera(0.055, M.pelaje), 0, y, z - 0.015));
  });
  cadera.add(en(anillo(0.2, 16, 0.065), 0, 0.66, 0));                      // cuello
  cadera.add(en(esfera(0.085, M.pelaje), 0, 0.12, -0.39));                  // colita

  // Brazos con codo, puño de piel y guante con pulgar
  function brazo(lado) {
    const hombro = en(new THREE.Group(), 0.37 * lado, 0.5, 0);
    hombro.add(esfera(0.095, M.saco));
    hombro.add(en(cilindro(0.085, 0.08, 0.18, M.saco), 0, -0.09, 0));
    const codo = en(new THREE.Group(), 0, -0.18, 0);
    codo.add(esfera(0.08, M.saco));
    codo.add(en(cilindro(0.08, 0.075, 0.13, M.saco), 0, -0.065, 0));
    codo.add(en(anillo(0.075, 10, 0.04), 0, -0.14, 0));
    const mano = en(new THREE.Group(), 0, -0.22, 0);
    mano.add(esfera(0.09, M.guante, 0.95, 1.05, 0.8));
    mano.add(en(esfera(0.04, M.guante, 1, 1.3, 1), -0.07 * lado, 0.02, 0.04));
    codo.add(mano);
    hombro.add(codo);
    cadera.add(hombro);
    return { hombro, codo };
  }
  const brazoIzq = brazo(-1);
  const brazoDer = brazo(1);

  // Cabeza grande (estilo chibi)
  const cabeza = en(new THREE.Group(), 0, 0.72, 0);
  cadera.add(cabeza);
  cabeza.add(en(esfera(0.4, M.piel), 0, 0.32, 0));
  cabeza.add(en(esfera(0.07, M.piel, 0.5, 1, 0.8), -0.39, 0.32, 0));       // orejas
  cabeza.add(en(esfera(0.07, M.piel, 0.5, 1, 0.8), 0.39, 0.32, 0));

  // Barba esponjosa
  cabeza.add(en(esfera(0.33, M.pelo, 1.05, 0.9, 0.8), 0, 0.08, 0.1));
  for (let i = 0; i <= 12; i++) {
    const a = (-0.5 + i / 12) * PI * 1.15;
    const r = 0.075 + Math.abs(Math.cos(a)) * 0.03;
    cabeza.add(en(esfera(r, M.pelo), Math.sin(a) * 0.35, 0.1 - Math.cos(a) * 0.28, 0.1 + Math.cos(a) * 0.17));
  }
  // Pelo a los costados de la cabeza
  [-1, 1].forEach(l => {
    cabeza.add(en(esfera(0.1, M.pelo), 0.36 * l, 0.22, -0.02));
    cabeza.add(en(esfera(0.09, M.pelo), 0.35 * l, 0.12, 0.06));
  });

  // Boca, bigote, nariz, cachetes
  cabeza.add(en(esfera(0.05, M.boca, 1.3, 0.75, 0.5), 0, 0.165, 0.365));
  [-1, 1].forEach(l => {
    const bigote = en(esfera(0.1, M.pelo, 1.45, 0.68, 0.85), 0.1 * l, 0.245, 0.37);
    bigote.rotation.z = -0.32 * l;
    cabeza.add(bigote);
    cabeza.add(en(esfera(0.045, M.pelo), 0.215 * l, 0.29, 0.32));
  });
  cabeza.add(en(esfera(0.07, M.nariz), 0, 0.315, 0.41));
  cabeza.add(en(esfera(0.075, M.rubor, 1, 0.65, 0.35), -0.215, 0.3, 0.33));
  cabeza.add(en(esfera(0.075, M.rubor, 1, 0.65, 0.35), 0.215, 0.3, 0.33));

  // Ojos brillantes y cejas esponjosas
  const ojos = [-1, 1].map(l => {
    const g = en(new THREE.Group(), 0.13 * l, 0.425, 0.355);
    g.add(esfera(0.062, M.ojo, 0.8, 1.1, 0.55));
    g.add(en(esfera(0.02, M.brillo), 0.02, 0.03, 0.03));
    g.add(en(esfera(0.009, M.brillo), -0.015, -0.02, 0.032));
    cabeza.add(g);
    [-0.05, 0, 0.05].forEach((dx, i) => {
      cabeza.add(en(esfera(0.03 - i * 0.003, M.pelo), 0.13 * l + dx * l, 0.535 + (i === 1 ? 0.012 : 0), 0.33));
    });
    return g;
  });

  // Anteojos dorados
  const anteojos = new THREE.Group();
  [-1, 1].forEach(l => {
    anteojos.add(en(new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.009, 10, 40), M.oro), 0.13 * l, 0, 0));
  });
  const puente = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 8, 20, PI), M.oro);
  anteojos.add(en(puente, 0, 0.01, 0));
  cabeza.add(en(anteojos, 0, 0.42, 0.405));

  // Gorro con banda esponjosa, punta en segmentos que se dobla y pompón
  const gorro = en(new THREE.Group(), 0, 0.6, 0);
  gorro.rotation.z = -0.1;
  cabeza.add(gorro);
  gorro.add(anillo(0.36, 26, 0.085));
  gorro.add(en(cilindro(0.3, 0.37, 0.22, M.saco), 0, 0.11, 0));
  const segmentos = [];
  let padre = en(new THREE.Group(), 0, 0.22, 0);
  gorro.add(padre);
  const radios = [0.3, 0.245, 0.19, 0.135, 0.085, 0.045];
  for (let i = 0; i < radios.length - 1; i++) {
    const seg = new THREE.Group();
    seg.add(en(cilindro(radios[i + 1], radios[i], 0.15, M.saco), 0, 0.075, 0));
    padre.add(seg);
    segmentos.push(seg);
    const siguiente = en(new THREE.Group(), 0, 0.15, 0);
    siguiente.add(esfera(radios[i + 1], M.saco));   // tapa la unión para que el doblez quede liso
    seg.add(siguiente);
    padre = siguiente;
  }
  padre.add(en(esfera(0.085, M.pelaje), 0, 0.03, 0));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * PI2;
    padre.add(en(esfera(0.045, M.pelaje), Math.cos(a) * 0.06, 0.03 + Math.sin(a * 2) * 0.03, Math.sin(a) * 0.06));
  }

  // Sombras del Santa
  santa.traverse(o => { if (o.isMesh) { o.castShadow = true; } });

  // ---------- Tamaño ----------
  function ajustar() {
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || 300;
    renderer.setSize(w, h, false);
    camara.aspect = w / h;
    camara.updateProjectionMatrix();
  }
  ajustar();
  window.addEventListener("resize", ajustar);

  // ---------- Bailes tipo meme ----------
  // Cada baile devuelve una "pose" (ángulos de las articulaciones) para el momento b (en beats).
  // El Santa pasa suave de una pose a la otra, así que los cambios de baile quedan fluidos.
  const reloj = new THREE.Clock();
  const BPM = 116;
  const BEATS_POR_BAILE = 8;

  const NEUTRO = {
    camina: 1, rotY: 0, x: 0, y: 0,
    cX: 0, cY: 0, cZ: 0,                     // cadera
    hX: 0, hY: 0, hZ: 0,                     // cabeza
    aIX: 0, aIY: 0, aIZ: -0.25, cdI: -0.35,  // brazo y codo izquierdo
    aDX: 0, aDY: 0, aDZ: 0.25, cdD: -0.35,   // brazo y codo derecho
    pIX: 0, pIZ: -0.08,                      // pierna izquierda
    pDX: 0, pDZ: 0.08,                       // pierna derecha
  };
  const pose = cambios => Object.assign({}, NEUTRO, cambios);
  const rebotar = (f, alto) => Math.abs(Math.sin(f / 2)) * alto;

  const BAILES = [
    {
      nombre: "🍑 Perreo navideño",
      pose(b, f) {
        return pose({
          camina: 0.3,
          rotY: PI + Math.sin(b * 0.5) * 0.35,
          y: rebotar(f, 0.05),
          cX: 0.42 + Math.sin(f * 2) * 0.2,
          cZ: Math.sin(f) * 0.15,
          hX: -0.35, hY: Math.sin(b * 0.5) * 0.5,
          aIX: -0.5, aIZ: -0.6, aDX: -0.5, aDZ: 0.6, cdI: -0.5, cdD: -0.5,
          pIZ: -0.28, pDZ: 0.28,
        });
      },
    },
    {
      nombre: "🦷 El floss",
      pose(b, f) {
        const s = Math.sin(f), c = Math.cos(f);
        return pose({
          camina: 0, x: -s * 0.14, y: rebotar(f * 2, 0.03),
          cZ: -s * 0.18,
          hZ: s * 0.12,
          aIZ: s * 0.75, aDZ: s * 0.75,
          aIX: c * 0.55, aDX: -c * 0.55,
          cdI: 0, cdD: 0,
          pIZ: -0.12, pDZ: 0.12,
        });
      },
    },
    {
      nombre: "😎 Dab",
      pose(b) {
        const lado = Math.floor(b / 2) % 2 === 0 ? 1 : -1;
        const golpe = (b % 2) < 0.15 ? 0.08 : 0;
        return pose({
          camina: 0, y: golpe,
          cZ: 0.1 * lado,
          hX: 0.5, hY: -0.35 * lado, hZ: 0.35 * lado,
          // un brazo doblado tapa la cara, el otro estirado en diagonal
          aIX: lado > 0 ? -1.1 : 0, aIZ: lado > 0 ? 1.2 : -2.25, cdI: lado > 0 ? -1.5 : 0,
          aDX: lado > 0 ? 0 : -1.1, aDZ: lado > 0 ? 2.25 : -1.2, cdD: lado > 0 ? 0 : -1.5,
          pIZ: -0.18, pDZ: 0.18,
        });
      },
    },
    {
      nombre: "🐴 Caballito",
      pose(b, f) {
        const lazo = (b % 8) >= 4;
        const g = Math.sin(f * 2);
        return pose({
          camina: 1, y: Math.abs(g) * 0.12,
          cX: 0.1, cZ: Math.sin(f) * 0.08,
          hX: Math.abs(g) * 0.15,
          aIX: -1.2, aIZ: 0.45 + g * 0.08, cdI: -0.7,
          aDX: lazo ? Math.cos(f * 2) * 0.35 : -1.2,
          aDZ: lazo ? 2.55 + Math.sin(f * 2) * 0.3 : -0.45 - g * 0.08,
          cdD: lazo ? -0.4 : -0.7,
          pIX: g * 0.55, pDX: -g * 0.55,
        });
      },
    },
    {
      nombre: "💦 Aspersor",
      pose(b) {
        const tic = Math.floor(b * 2) % 8;
        const giro = tic < 6 ? -0.8 + tic * 0.32 : (tic === 6 ? 0.2 : -0.8);
        return pose({
          camina: 0, rotY: giro,
          y: (b * 2) % 1 < 0.2 ? 0.05 : 0,
          hX: -0.1,
          aIX: 0.5, aIZ: -2.4, cdI: -1.7,     // mano atrás de la cabeza
          aDX: -1.5, aDZ: 0.1, cdD: 0,         // brazo estirado adelante
          pIX: -0.25, pDX: 0.15,
        });
      },
    },
    {
      nombre: "🌀 Trompo",
      pose(b, f) {
        return pose({
          camina: 0.5, rotY: b * PI * 1.5,
          y: 0.05 + Math.sin(f) * 0.03,
          cZ: 0.12,
          hX: -0.15, hZ: -0.15,
          aIZ: -1.55, aDZ: 1.55, cdI: -0.15, cdD: -0.15,
          pDX: -0.55, pDZ: 0.45,
        });
      },
    },
    {
      nombre: "🤖 Robot",
      rapido: true,
      pose(b) {
        const paso = Math.floor(b * 2) % 4;
        return pose([
          { camina: 0, aIX: -1.57, aDX: -1.57, cdI: 0, cdD: 0, hY: 0.6 },
          { camina: 0, aIZ: -1.57, cdI: -1.57, cY: 0.35, hY: -0.6, pIX: -0.3 },
          { camina: 0, aIZ: -1.57, aDZ: 1.57, cdI: -1.57, cdD: -1.57, hX: 0.3 },
          { camina: 0, aDX: -1.57, cdD: 0, cY: -0.35, hY: 0.3, pDX: -0.3 },
        ][paso]);
      },
    },
    {
      nombre: "🪩 Fiebre disco",
      pose(b, f) {
        const arriba = Math.floor(b) % 2 === 0;
        return pose({
          camina: 0.5, x: Math.sin(f) * 0.08, y: rebotar(f, 0.05),
          cZ: Math.sin(f) * 0.2,
          hY: arriba ? -0.3 : 0.25, hX: arriba ? -0.25 : 0.2,
          aIX: 0.3, aIZ: -0.8, cdI: -1.6,                                  // mano en la cintura
          aDX: arriba ? 0 : -0.35, aDZ: arriba ? 2.6 : 0.55, cdD: 0,       // señala arriba y abajo
          pDZ: arriba ? 0.3 : 0.1,
        });
      },
    },
  ];

  // Orden aleatorio, sin repetir hasta pasar por todos
  let orden = [];
  function siguienteBaile() {
    if (!orden.length) orden = BAILES.map((_, i) => i).sort(() => Math.random() - 0.5);
    return orden.shift();
  }

  const cartel = document.createElement("div");
  cartel.className = "santa-cartel";
  contenedor.appendChild(cartel);

  let baileActual = siguienteBaile();
  let inicioBaile = 0;     // en beats
  function mostrarCartel() {
    cartel.textContent = BAILES[baileActual].nombre;
    cartel.classList.remove("nuevo");
    void cartel.offsetWidth;
    cartel.classList.add("nuevo");
  }
  mostrarCartel();

  const actual = Object.assign({}, NEUTRO);
  let cambiarAhora = false;
  let saltoHasta = 0;

  // Tocalo: salta y cambia de baile
  contenedor.addEventListener("click", () => {
    cambiarAhora = true;
    saltoHasta = reloj.getElapsedTime() + 0.6;
  });

  function cambiarBaile(b) {
    baileActual = siguienteBaile();
    inicioBaile = b;
    // que no "desenrosque" todas las vueltas del trompo
    actual.rotY = ((actual.rotY % PI2) + PI2) % PI2;
    if (actual.rotY > PI) actual.rotY -= PI2;
    mostrarCartel();
  }

  function bailar(t, dt) {
    const b = (t * BPM) / 60;      // tiempo en beats
    const f = b * PI2;             // una vuelta completa por beat

    if (cambiarAhora || b - inicioBaile >= BEATS_POR_BAILE) {
      cambiarAhora = false;
      cambiarBaile(b);
    }

    const baile = BAILES[baileActual];
    const objetivo = baile.pose(b - inicioBaile, f);

    // Pasar suave hacia la pose (el robot es más brusco a propósito)
    const k = dt === 0 ? 1 : 1 - Math.exp(-dt * (baile.rapido ? 30 : 14));
    for (const clave in objetivo) actual[clave] += (objetivo[clave] - actual[clave]) * k;
    const p = actual;

    // Recorrido en círculo por la pista
    const ang = t * 0.9;
    santa.position.set(Math.sin(ang) * 0.42 * p.camina + p.x, 0, Math.cos(ang) * 0.22 * p.camina);
    santa.rotation.y = p.rotY + Math.sin(ang) * 0.3 * p.camina;

    // Salto (con aplastado y estirado) y salto grande con giro al tocarlo
    const saltoGrande = t < saltoHasta ? Math.sin(((saltoHasta - t) / 0.6) * PI) * 0.5 : 0;
    const altura = p.y + saltoGrande;
    rebote.position.y = altura;
    const aplaste = Math.max(0, 0.06 - altura) * 1.2;
    rebote.scale.set(1 + aplaste, 1 - aplaste * 1.3, 1 + aplaste);
    rebote.rotation.y = saltoGrande > 0 ? (1 - (saltoHasta - t) / 0.6) * PI2 : 0;

    cadera.rotation.set(p.cX, p.cY, p.cZ);
    cabeza.rotation.set(p.hX, p.hY, p.hZ);
    brazoIzq.hombro.rotation.set(p.aIX, p.aIY, p.aIZ);
    brazoDer.hombro.rotation.set(p.aDX, p.aDY, p.aDZ);
    brazoIzq.codo.rotation.x = p.cdI;
    brazoDer.codo.rotation.x = p.cdD;
    piernaIzq.rotation.set(p.pIX, 0, p.pIZ);
    piernaDer.rotation.set(p.pDX, 0, p.pDZ);

    // El gorro se dobla y se bambolea (cada segmento un poco más)
    const vaiven = Math.sin(f - 1);
    segmentos.forEach((s, i) => {
      s.rotation.z = -0.2 - vaiven * 0.1 - p.cZ * 0.3 - (i * 0.03);
      s.rotation.x = Math.cos(f - 1) * 0.06 + p.cX * 0.15;
    });

    // Parpadeo
    const parpadeo = (t % 3.4) < 0.12 ? 0.12 : 1;
    ojos.forEach(o => { o.scale.y = parpadeo; });

    // Pista y luces
    pista.material.color.setHSL((t * 0.08) % 1, 0.9, 0.55);
    aro.rotation.z = t * 0.5;
    lucesDisco.forEach((l, i) => {
      const a = t * 1.3 + (i * PI2) / lucesDisco.length;
      l.position.set(Math.cos(a) * 1.9, 1.3 + Math.sin(t * 2 + i) * 0.4, Math.sin(a) * 1.9);
    });
  }

  // ---------- Animación (solo cuando se ve) ----------
  let visible = true;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(entradas => { visible = entradas[0].isIntersecting; }).observe(contenedor);
  }

  let anterior = 0;
  function cuadro() {
    requestAnimationFrame(cuadro);
    if (!visible || document.hidden) return;
    const t = reloj.getElapsedTime();
    const dt = Math.min(t - anterior, 0.05);
    anterior = t;
    bailar(t, dt);
    renderer.render(escena, camara);
  }

  if (quieto) {
    bailar(0.3, 0);
    renderer.render(escena, camara);
  } else {
    cuadro();
  }
})();
