// YouTube canal -> subtítulos (Supadata) -> resúmenes con IA (OpenRouter)
// Uso: node index.mjs   (configura las variables en .env, ver .env.example)

import 'dotenv/config';
import { Supadata } from '@supadata/js';
import { mkdir, writeFile } from 'node:fs/promises';

const {
  SUPADATA_API_KEY,
  OPENROUTER_API_KEY,
  CANAL = '@supadata',          // usuario del canal, URL o ID
  LIMITE = '5',                 // cuántos vídeos procesar
  IDIOMA = 'es',                // idioma preferido de los subtítulos
  MODELO = 'anthropic/claude-haiku-5.5',
  PAUSA_MS = '1500'             // pausa entre vídeos para no saturar las APIs
} = process.env;

if (!SUPADATA_API_KEY || !OPENROUTER_API_KEY) {
  console.error('Faltan SUPADATA_API_KEY y/o OPENROUTER_API_KEY en el archivo .env');
  process.exit(1);
}

const supadata = new Supadata({ apiKey: SUPADATA_API_KEY });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const INSTRUCCIONES = `Eres un analista. Resumes vídeos de YouTube para construir una biblioteca de conocimiento.
Reglas:
- Escribe en español, con tus propias palabras (no copies frases largas del vídeo).
- Guarda los números concretos (precios, porcentajes, plazos, métricas).
- Prioriza las DECISIONES con su contexto: qué se decidió, en qué situación y qué resultado tuvo.
- Si el vídeo tiene poco contenido útil, dilo en una línea.
- Máximo unas 800 palabras.

Estructura (markdown):
## De qué va
## Tesis principal
## Principios y reglas
## Decisiones y casos reales (contexto → decisión → resultado)
## Tácticas concretas
## Lo que critica o desaconseja`;

// Pide los subtítulos ya existentes del vídeo (mode: 'native' = 1 crédito, sin generar con IA).
// Si Supadata responde con un trabajo en segundo plano, espera a que termine.
async function subtitulos(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  let res = await supadata.transcript({ url, lang: IDIOMA, text: true, mode: 'native' });
  if ('jobId' in res) {
    for (let i = 0; i < 60; i++) {
      await dormir(5000);
      const job = await supadata.transcript.getJobStatus(res.jobId);
      if (job.status === 'completed' && job.result) { res = job.result; break; }
      if (job.status === 'failed') throw new Error(job.error?.message || 'trabajo fallido');
    }
  }
  if (typeof res.content !== 'string') return { texto: '', idioma: '' };
  return { texto: res.content.replace(/\s+/g, ' ').trim(), idioma: res.lang };
}

async function resumir(videoId, texto, idioma) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENROUTER_API_KEY}` },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 3000,
      temperature: 0.3,
      messages: [
        { role: 'system', content: INSTRUCCIONES },
        { role: 'user', content: `Vídeo: https://youtu.be/${videoId}\nIdioma de los subtítulos: ${idioma}\n\nTranscripción automática (puede tener errores):\n${texto}` }
      ]
    })
  });
  const j = await r.json();
  const contenido = j?.choices?.[0]?.message?.content;
  if (!contenido) throw new Error('La IA no ha respondido: ' + (j?.error?.message || r.status));
  return contenido;
}

const { videoIds } = await supadata.youtube.channel.videos({ id: CANAL, type: 'video', limit: Number(LIMITE) });
console.log(`Canal ${CANAL}: ${videoIds.length} vídeos a procesar`);
await mkdir('resumenes', { recursive: true });

for (const id of videoIds) {
  try {
    const { texto, idioma } = await subtitulos(id);
    if (texto.length < 200) { console.log(`- ${id}: sin subtítulos, se salta`); continue; }
    const resumen = await resumir(id, texto, idioma);
    await writeFile(`resumenes/${id}.md`, `# https://youtu.be/${id}\n\n${resumen}\n`);
    console.log(`✓ ${id} resumido`);
  } catch (e) {
    console.log(`✗ ${id}: ${e.message}`);
  }
  await dormir(Number(PAUSA_MS));
}
console.log('Hecho. Los resúmenes están en la carpeta resumenes/');
