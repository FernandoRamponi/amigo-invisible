# Cómo conectar el sorteo con tu Gmail

El sorteo lo hace un script gratuito de Google que corre en tu cuenta. Ese script guarda quién le regala a quién (así no se repite nadie entre celulares) y te manda un mail cada vez que alguien sortea. El mail solo dice **quién** sorteó, no a quién le tocó.

## 1. Crear el script

1. Entrá a <https://script.google.com> con tu cuenta de Gmail y tocá **Nuevo proyecto**.
2. Borrá lo que aparece y pegá todo el contenido de `apps-script/Code.gs`.
3. Arriba de todo, en `PARTICIPANTES`, poné los nombres reales.
4. Guardá (ícono de disquete) y ponele un nombre al proyecto, por ejemplo "Amigo invisible".

## 2. Dar permiso para mandar mails

1. En la barra de arriba, elegí la función **probarMail** y tocá **Ejecutar**.
2. Google te va a pedir permisos: elegí tu cuenta → "Configuración avanzada" → "Ir a Amigo invisible" → **Permitir**.
3. Te tiene que llegar un mail de prueba.

## 3. Publicarlo

1. Tocá **Implementar → Nueva implementación**.
2. En el engranaje elegí **Aplicación web**.
3. Configurá:
   - **Ejecutar como:** Yo
   - **Quién tiene acceso:** Cualquier persona
4. Tocá **Implementar** y copiá la **URL de la aplicación web** (termina en `/exec`).

## 4. Conectar la web

Abrí `script.js` y pegá la URL en la primera línea de configuración:

```js
const SCRIPT_URL = "https://script.google.com/macros/s/.../exec";
```

Con eso desaparece el cartel de "Modo prueba" y la web usa los nombres reales.

## Modo admin (desde la web)

Abajo de todo en la web hay un botón **🔒 Admin**.

- **La primera vez** (o si te olvidaste la contraseña): tocá «¿Primera vez o te olvidaste la contraseña?», escribí tu Gmail (el único que sirve es el que está en `MAIL_ADMIN` dentro del Apps Script; si está vacío, el de la cuenta dueña del script) y te llega un código de 6 números que **vence en 2 minutos**. Con ese código elegís tu usuario y tu contraseña nuevos. Si cambiás la contraseña, se cierran las sesiones de admin que estuvieran abiertas.
- **Adentro del panel** ves quiénes ya sortearon y, si tocás «Ver a quién le toca a cada uno», quién le regala a quién.
- **Resetear**: si alguien tocó sin querer un nombre que no era el suyo y sorteó, tocá «Resetear» en ese nombre. Esa persona puede volver a sortear y, si queda gente sin sortear, se vuelve a mezclar a quién le toca para que el que tocó sin querer no sepa el resultado. El celular que sorteó por error se destraba solo cuando recarga la página.

La contraseña no se guarda en la web ni en este código: queda cifrada en las propiedades del script. Después de 8 intentos fallidos el login se bloquea 15 minutos (podés igual cambiar la contraseña con el código por mail).

## Herramientas para vos (desde el editor del script)

- **verProgreso**: muestra quiénes ya sortearon y quiénes faltan, sin decir a quién les tocó.
- **reiniciarSorteo**: borra todo y arranca de cero. Usalo si cambiás la lista de nombres. (No borra tu usuario de admin.)

> Si modificás `Code.gs` después de publicarlo, andá a **Implementar → Gestionar implementaciones → editar (lápiz) → Versión: nueva** para que los cambios se apliquen sin cambiar la URL.
