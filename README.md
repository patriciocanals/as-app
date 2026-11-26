# Airline Simulator · WebApp

Web app para jugar **en paralelo** a *Airline Simulator*:

- **Calculadora de rutas** — con T1, T2, R1 (R2 fijo = 5 min) y las demandas Y/W/B/F calcula el RT, cuántas rotaciones caben (por día, o por semana si el RT supera 24 h) y cuántos asientos de cada clase necesitas con 1–6 aviones.
- **Sistema de reservas** estilo aerolínea: buscador ida / ida y vuelta, resultados por día, selección de cabina y asiento (mapa de asientos), reserva con código PNR.
- **Ticket imprimible** (tarjeta de embarque con IATA grande, ciudad, nº de vuelo, horarios, clase y asiento) → *Imprimir / guardar PDF*.
- **Banners dinámicos** con los destinos reales de tu aerolínea, banderas y fotos automáticas (sin claves de API).
- **Administración**: datos de la aerolínea, rutas y programación semanal; importar/exportar JSON.
- **Varias aerolíneas** (hasta 6, como en el juego): cada una con su nombre, código de vuelo, color, rutas y reservas. Se cambia desde el menú de cabecera y se pueden abrir **a la vez en pestañas distintas** (la aerolínea activa va en la URL: `?a=<id>`).
- **Catálogo de aviones** del juego (Airbus, Bombardier/Mitsubishi, Embraer, ATR, De Havilland, COMAC, Sukhoi). No hay ninguna configuración por defecto: la **configuración de asientos** (cuántos de F/B/W/Y y su distribución por fila) se introduce *después* de la calculadora, cuando ya la tienes montada en el juego. Una ruta sin configuración queda *pendiente* y no se vende.

Sin backend ni build: HTML + CSS + JavaScript (módulos ES). Los datos viven en `localStorage`.

## Probar en local

```bash
npm start          # sirve la carpeta (necesita Node); o: python3 -m http.server 8080
npm test           # tests del motor de cálculo (Node ≥ 18, sin dependencias)
```

> Hay que abrirlo desde un servidor (no con doble clic en `index.html`) porque usa módulos ES.

## Subir a GitHub

```bash
cd airline-simulator
git init -b main
git add .
git commit -m "Airline Simulator WebApp"
git remote add origin https://github.com/TU_USUARIO/airline-simulator.git
git push -u origin main
```

## Desplegar en Netlify

1. <https://app.netlify.com> → **Add new site → Import an existing project → GitHub** y elige el repositorio.
2. Ajustes de build: se leen de `netlify.toml` (publish directory `.`, sin comando de build). Pulsa **Deploy**.
3. Cada `git push` a `main` redespliega solo.

## Datos y publicación

Cada visitante guarda sus datos en **su navegador**. La primera vez que se abre la web (sin datos) se pide crear la primera aerolínea. Para que tu web publicada arranque con *tus* aerolíneas y rutas:

1. En la web: **Administración → Datos → Exportar esta aerolínea** (o **Exportar todas**).
2. Guarda el archivo como `data/seed.json` en el repositorio y haz push.
3. Quien abra la web por primera vez (sin datos guardados) cargará ese archivo.

## Flujo de uso recomendado

1. Evalúas una ruta nueva en **Calculadora** mientras juegas.
2. Cuando la decides, pulsa **Crear ruta** → eliges el modelo de avión y se abre el formulario con la programación generada.
3. En el juego montas la configuración del avión; vuelves a **Administración → Rutas → Configurar asientos** y la introduces.
4. Ajusta números de vuelo, horas y días con los reales del juego.
5. Pruebas la reserva: origen, destino, fecha → vuelos disponibles → asiento → ticket.

## Cómo se calcula

```
RT = T1 + T2 + R1 + R2
RT ≤ 24 h : rotaciones/día = floor(24h / RT)
            asientos/vuelo = ceil( (demanda/7) / rotaciones/día / N )
RT > 24 h : rotaciones/semana = floor(168h / RT)
            asientos/vuelo = ceil( demanda / rotaciones/semana / N )
```

Los dos ejemplos del documento original están como tests en `tests/calc.test.js`.

## Imágenes

- Banderas: [flagcdn.com](https://flagcdn.com).
- Destinos y aviones: imagen principal del artículo de Wikipedia (API REST, sin clave). Si no existe, se genera una imagen con IA vía Pollinations (sin clave); si falla, un degradado de la marca.
- Para un modelo de avión concreto puedes fijar el artículo de Wikipedia en **Flota**.

## Estructura

```
index.html  netlify.toml  package.json
css/styles.css
js/calc.js       motor de cálculo (puro, testeado)
js/schedule.js   horarios, búsqueda de vuelos, mapa de asientos
js/aircraft.js   catálogo de modelos de avión
js/store.js      persistencia multi-aerolínea (localStorage + data/seed.json)
js/images.js     banderas e imágenes automáticas
js/views/        home, results, book, ticket, manage, calculator, admin, welcome
tests/           node --test
```
