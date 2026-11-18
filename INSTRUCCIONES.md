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

## Herramientas para vos (desde el editor del script)

- **verProgreso**: muestra quiénes ya sortearon y quiénes faltan, sin decir a quién les tocó.
- **reiniciarSorteo**: borra todo y arranca de cero. Usalo si cambiás la lista de nombres.

> Si modificás `Code.gs` después de publicarlo, andá a **Implementar → Gestionar implementaciones → editar (lápiz) → Versión: nueva** para que los cambios se apliquen sin cambiar la URL.
