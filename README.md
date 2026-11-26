# Airline Simulator · WebApp

Web app para jugar **en paralelo** a *Airline Simulator*.

- **Cuenta en la nube**: inicias sesión y tus aerolíneas, rutas y reservas están en cualquier dispositivo (datos en Netlify Blobs, sin servicios externos).
- **Calculadora de rutas**: con T1, T2, R1 (R2 fijo = 5 min) y las demandas Y/W/B/F calcula el RT, las rotaciones (por día, o por semana si el RT supera 24 h) y los asientos de cada clase para 1–6 aviones.
- **Varias aerolíneas** (hasta 6): nombre, código de vuelo, color, rutas y reservas propios. Se abren a la vez en pestañas distintas (`?a=<id>`).
- **Catálogo de aviones** del juego. La configuración de asientos se aporta *después* de la calculadora; una ruta sin ella queda *pendiente* y no se vende.
- **Reservas** estilo aerolínea (ida / ida y vuelta, mapa de asientos, código PNR) y **ticket imprimible**.
- **Administración**: lista de rutas compacta con búsqueda, filtros, orden y paginación; programación semanal con horas de 5 en 5 min.
- **Imágenes automáticas** sin claves de API: fotos de paisaje de los destinos (Wikimedia Commons), aviones y banderas.

## Probar en local

```bash
npm test        # tests del motor, la API y las imágenes (Node ≥ 18, sin dependencias)
npm run dev     # http://localhost:8080 — web + la misma API que Netlify, datos en .data/store.json
```

Si abres la web con un servidor estático sin `/api` (p. ej. `python3 -m http.server`), funciona en **modo local**: sin cuenta, datos solo en ese navegador.

## Subir a GitHub

```bash
git init -b main && git add . && git commit -m "Airline Simulator WebApp"
git remote add origin https://github.com/TU_USUARIO/airline-simulator.git
git push -u origin main
```

## Desplegar en Netlify

1. <https://app.netlify.com> → **Add new site → Import an existing project → GitHub** → elige el repositorio. Los ajustes se leen de `netlify.toml`; pulsa **Deploy**. Netlify instala `@netlify/blobs` y publica la función `/api/*` automáticamente.
2. **Importante:** en *Site configuration → Environment variables* crea `INVITE_CODE` con un código que solo tú sepas. Sin él **cualquiera** que abra tu web podría crearse una cuenta. Con él, para registrarse hace falta ese código. Tras añadirlo, **redespliega** (Deploys → Trigger deploy).
3. Abre tu web → **Soy nuevo** → crea tu usuario (y el código de invitación). Desde ese momento entras con tu usuario y contraseña en cualquier dispositivo.

Si ya usabas la versión local: al iniciar sesión por primera vez, la web detecta los datos guardados en ese navegador y te ofrece subirlos a tu cuenta.

## Cómo funciona la sincronización

- Cada cambio se guarda en la nube a los ~0,7 s (arriba verás «☁ Guardado»). Si pierdes conexión, reintenta solo.
- Cada aerolínea tiene un número de revisión. Si cambias la misma aerolínea desde dos dispositivos a la vez, el segundo en guardar ve un aviso y debe recargar (no se pisan datos en silencio).
- Las contraseñas se guardan con `scrypt` (nunca en claro), la sesión dura 90 días y hay bloqueo de 1 minuto tras 5 intentos fallidos.

## Cómo se calcula

```
RT = T1 + T2 + R1 + R2
RT ≤ 24 h : rotaciones/día = floor(24h / RT)
            asientos/vuelo = ceil( (demanda/7) / rotaciones/día / N )
RT > 24 h : rotaciones/semana = floor(168h / RT)
            asientos/vuelo = ceil( demanda / rotaciones/semana / N )
```

Los dos ejemplos del documento original están como tests (`tests/calc.test.js`).

## Imágenes

Para cada destino se busca en Wikimedia Commons una foto **apaisada** de la ciudad (se descartan banderas, escudos, mapas y logos) y se comprueba que carga antes de usarla. Si no hay, se usa la imagen principal de Wikipedia y, como último recurso, una imagen generada con IA (Pollinations). Puedes fijar otra en **Administración → Ruta → Imagen del destino** (un texto de búsqueda como «Sagrada Familia» o una URL).

## Estructura

```
index.html  netlify.toml  package.json  dev-server.mjs
netlify/functions/api.mjs   función de Netlify (Blobs)
netlify/lib/core.mjs        API de cuentas y datos (pura, testeada)
css/styles.css
js/calc.js        motor de cálculo      js/schedule.js  horarios, búsqueda, asientos
js/aircraft.js    catálogo de aviones   js/images.js    imágenes automáticas
js/store.js       aerolíneas (nube/local)   js/sync.js  sincronización con la API
js/views/         home, results, book, ticket, manage, calculator, admin, welcome, auth
tests/            node --test
```
