# Carrera Mundial TikTok LIVE

MVP de un juego automático para TikTok LIVE.

## Qué hace

- Se conecta al LIVE usando el nombre de usuario del creador.
- Detecta comentarios y regalos en tiempo real.
- El espectador elige país escribiendo COLOMBIA, MÉXICO, ARGENTINA o BRASIL.
- Cuando ese espectador envía un regalo, su país avanza automáticamente.
- Los regalos de mayor valor generan más puntos.
- Un narrador por voz del navegador agradece el regalo y anuncia al ganador.
- Reinicia la carrera automáticamente.
- Incluye modo simulación para probar sin emitir en TikTok.

> La integración usa `tiktok-live-connector`, un proyecto no oficial. TikTok no ofrece una API pública oficial para leer todos los eventos de LIVE, por lo que esta parte puede requerir mantenimiento si TikTok cambia su servicio.

## Instalación

Requiere Node.js 20+.

```bash
cd tiktok-live-game
npm install
```

En Windows PowerShell:

```powershell
$env:TIKTOK_USERNAME="tu_usuario"
$env:PORT="3000"
npm start
```

Abre:

```
http://localhost:3000
```

Añade esa URL como fuente de navegador en OBS o captura la ventana en TikTok LIVE Studio.

## Prueba sin estar en LIVE

```powershell
$env:SIMULATE="true"
npm start
```

Luego abre en el navegador:

```
http://localhost:3000/api/test/gift?team=colombia&points=15&user=Carlos
```

Puedes cambiar `team`, `points` y `user`.

## Variables

- `TIKTOK_USERNAME`: usuario de TikTok sin @.
- `PORT`: puerto local. Por defecto 3000.
- `SIMULATE`: true/false.
- `RACE_TARGET`: puntos para ganar. Por defecto 100.
- `RACE_SECONDS`: duración máxima de la ronda. Por defecto 90 segundos.

## Monetización

El sistema reacciona a regalos reales enviados por espectadores. No automatiza compra de monedas ni envío de regalos desde la cuenta del creador. La monetización depende de elegibilidad, audiencia y reglas vigentes de TikTok LIVE.

## Próximas fases

1. Panel de configuración sin tocar código.
2. Más países y selección dinámica.
3. Efectos distintos por tipo de regalo.
4. Rankings de donadores y rachas.
5. Narrador IA con frases variables.
6. Escenas automáticas para OBS/TikTok LIVE Studio.
7. Persistencia de estadísticas y panel de ingresos estimados.
