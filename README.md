# Airline Simulator · WebApp

Web app para jugar **en paralelo** a *Airline Simulator*:

- **Calculadora de rutas** — con T1, T2, R1 (R2 fijo = 5 min) y las demandas Y/W/B/F calcula el RT, cuántas rotaciones caben (por día, o por semana si el RT supera 24 h) y cuántos asientos de cada clase necesitas con 1–6 aviones.
- **Sistema de reservas** estilo aerolínea: buscador ida / ida y vuelta, resultados por día, selección de cabina y asiento (mapa de asientos), reserva con código PNR.
- **Ticket imprimible** (tarjeta de embarque con IATA grande, ciudad, nº de vuelo, horarios, clase y asiento) → *Imprimir / guardar PDF*.
- **Banners dinámicos** con los destinos reales de tu aerolínea, banderas y fotos automáticas (sin claves de API).
- **Administración**: aerolínea, flota (configuración de asientos por clase), rutas y programación semanal; importar/exportar JSON.

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

Cada visitante guarda sus datos en **su navegador**. Para que tu web publicada arranque con *tus* rutas y flota:

1. En la web: **Administración → Datos → Exportar JSON**.
2. Guarda el archivo como `data/seed.json` en el repositorio y haz push.
3. Quien abra la web por primera vez (sin datos guardados) cargará ese archivo. (Sin `seed.json` se cargan datos de ejemplo.)

## Flujo de uso recomendado

1. Evalúas una ruta nueva en **Calculadora** mientras juegas.
2. Cuando la decides, pulsa **Crear ruta** → se abre el formulario con la programación generada.
3. En el juego creas la programación real; vuelve y ajusta números de vuelo, horas y días.
4. Pruebas la reserva: origen, destino, fecha → vuelos disponibles → asiento → ticket.

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
js/store.js      persistencia (localStorage + data/seed.json)
js/images.js     banderas e imágenes automáticas
js/views/        home, results, book, ticket, manage, calculator, admin
tests/           node --test
```
