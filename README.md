# YouTube canal → resúmenes con IA

Convierte los vídeos de un canal de YouTube en una **biblioteca de resúmenes**: saca los subtítulos con [Supadata](https://supadata.ai/r/PW6R32X4) y los resume con IA (cualquier modelo de [OpenRouter](https://openrouter.ai), por defecto Claude Haiku 5.5).

Útil para estudiar a fondo a un experto, a un mentor o a la competencia sin ver cientos de horas de vídeo: cada resumen guarda la tesis, las reglas con sus números y, sobre todo, **las decisiones que tomaron, con su contexto y su resultado**.

Viene en dos versiones, elige la que te encaje:

| | Para quién | Dónde |
|---|---|---|
| **Workflow de n8n** | Si ya usas n8n y no quieres tocar código | [`n8n/workflow-canal-a-resumenes.json`](n8n/workflow-canal-a-resumenes.json) |
| **Script de Node.js** | Si prefieres ejecutarlo en tu ordenador | [`script/`](script/) (usa el SDK oficial `@supadata/js`) |

## Cómo funciona

1. Pide a Supadata la lista de vídeos del canal (`/youtube/channel/videos`).
2. Para cada vídeo, pide los subtítulos **ya existentes** (`/transcript`, `mode=native`): 1 crédito por vídeo, sin transcribir con IA.
3. Manda el texto a la IA con unas instrucciones para resumirlo con una estructura fija.
4. Guarda el resumen (archivos `.md` en el script; en n8n, conéctalo a donde quieras: Google Sheets, Notion, una tabla de n8n…).

Va de uno en uno y con una pausa entre vídeos, para no saturar las APIs.

## Opción 1: n8n

1. En n8n: **Workflows → Import from file** y elige `n8n/workflow-canal-a-resumenes.json`.
2. Crea dos credenciales de tipo **Header Auth**:
   - **Supadata:** Name `x-api-key`, Value = tu clave de Supadata.
   - **OpenRouter:** Name `Authorization`, Value = `Bearer TU_CLAVE`.
3. Asigna la de Supadata a los nodos *Vídeos del canal* y *Subtítulos*, y la de OpenRouter a *Resumir*.
4. En el nodo **Configuración** pon el canal (`@usuario`, URL o ID), cuántos vídeos y el idioma.
5. *Execute workflow*.

## Opción 2: script

Necesitas Node.js 18 o superior.

```bash
cd script
npm install
cp .env.example .env   # y rellena tus claves y el canal
npm start
```

Los resúmenes aparecen en `script/resumenes/`, uno por vídeo.

## Coste aproximado

- **Supadata:** 1 crédito por vídeo con subtítulos (el plan gratis trae 100 al mes).
- **IA:** con Claude Haiku 5.5, unos 0,002-0,005 $ por vídeo según lo largo que sea.

Precios orientativos a octubre de 2026; revísalos en cada web antes de lanzar cientos de vídeos.

## Notas

- Si un vídeo no tiene subtítulos, se salta. Si quieres que Supadata los genere con IA, cambia `mode` a `auto` (cuesta más créditos).
- Si el canal tiene subtítulos en varios idiomas, indica el original en `idioma` / `IDIOMA` para no recibir una traducción automática.
- Nunca subas tu archivo `.env` ni tus claves a GitHub.

---

**English:** Turn a YouTube channel into a library of AI summaries. Fetches native captions with Supadata (`@supadata/js` SDK or n8n HTTP nodes) and summarizes each video with any OpenRouter model. Includes an importable n8n workflow and a Node.js script. MIT licensed.
