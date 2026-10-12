# Tutorial: convierte un canal de YouTube en una biblioteca de resúmenes con IA

¿Sigues a un experto que tiene cientos de horas de vídeo y nunca vas a poder verlas todas? En este tutorial montamos, paso a paso, un pequeño sistema que coge **todos los vídeos de un canal de YouTube**, saca sus subtítulos con [Supadata](https://supadata.ai/r/PW6R32X4) y los **resume con IA**, dejando un archivo por vídeo listo para leer, buscar o dárselo a otra IA como contexto.

Lo uso para estudiar a los mentores de negocio que sigo: en vez de ver 300 horas, leo lo importante de cada vídeo en un par de minutos y, sobre todo, guardo **las decisiones que tomaron, con su contexto y su resultado**, que es lo que de verdad se puede aplicar.

Todo el código está en este repositorio. Aquí explico cómo funciona y por qué está hecho así.

## Lo que necesitas

- **Node.js 18 o superior.**
- Una **clave de Supadata**. Créate la cuenta aquí: https://supadata.ai/r/PW6R32X4 (el plan gratis trae 100 créditos al mes; cada vídeo con subtítulos cuesta 1). La clave está en tu panel de Supadata, en «API key».
- Una **clave de OpenRouter**, para usar el modelo de IA que quieras con la misma API. Con Claude Haiku 5.5 cada resumen cuesta entre 0,002 y 0,005 $.

## Por qué no sacar los subtítulos directamente de YouTube

Fue lo primero que probé: YouTube tiene una API interna con la que se pueden pedir los subtítulos de un vídeo. Desde mi ordenador funcionaba, y desde mi servidor también... hasta que listé unos cuantos canales seguidos. A partir de ahí, YouTube empezó a responder «inicia sesión para confirmar que no eres un bot» a todas las peticiones del servidor, que está en la nube.

Por eso este proyecto usa **Supadata**: se encarga de esa parte por ti, funciona desde cualquier servidor y, si un vídeo no tiene subtítulos, incluso puede generarlos con IA (aunque aquí no lo usamos para no gastar créditos).

## Paso 1: instalar

```bash
git clone https://github.com/alberto123123123/youtube-canal-a-resumenes-ia
cd youtube-canal-a-resumenes-ia/script
npm install
cp .env.example .env
```

Abre `.env` y rellena tus claves y el canal:

```bash
SUPADATA_API_KEY=tu_clave_de_supadata
OPENROUTER_API_KEY=tu_clave_de_openrouter
CANAL=@nombredelcanal
LIMITE=5
IDIOMA=es
```

Empieza con `LIMITE=5` para ver la calidad antes de lanzar cientos de vídeos.

## Paso 2: listar los vídeos del canal

El SDK oficial de Supadata (`@supadata/js`) tiene una función que devuelve los IDs de los vídeos de un canal. Le pedimos solo vídeos normales (`type: 'video'`), sin shorts ni directos, porque los shorts casi nunca tienen contenido que merezca la pena resumir:

```js
import { Supadata } from '@supadata/js';

const supadata = new Supadata({ apiKey: process.env.SUPADATA_API_KEY });

const { videoIds } = await supadata.youtube.channel.videos({
  id: '@nombredelcanal',
  type: 'video',
  limit: 5
});
```

## Paso 3: pedir los subtítulos (sin gastar de más)

Aquí hay dos detalles que me ahorraron tiempo y dinero:

1. **`mode: 'native'`**: solo usa los subtítulos que ya existen. Cuesta 1 crédito por vídeo. Con `auto`, si el vídeo no tiene subtítulos, Supadata los genera con IA, pero cobra por minuto.
2. **`lang`**: si no indicas idioma, a veces recibes una **traducción automática** en otro idioma (a mí me llegaron algunos en árabe). La IA los resume igual, pero se cuelan errores en nombres y cifras. Pide siempre el idioma original del canal.

```js
async function subtitulos(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  let res = await supadata.transcript({ url, lang: 'es', text: true, mode: 'native' });

  // En vídeos muy largos, Supadata responde con un trabajo en segundo plano
  if ('jobId' in res) {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const job = await supadata.transcript.getJobStatus(res.jobId);
      if (job.status === 'completed' && job.result) { res = job.result; break; }
      if (job.status === 'failed') throw new Error('trabajo fallido');
    }
  }
  return typeof res.content === 'string' ? res.content : '';
}
```

Con `text: true` recibes el texto entero de una vez, en vez de trozos con marcas de tiempo, que es justo lo que necesita la IA.

## Paso 4: resumir con IA

El truco está en las instrucciones. Un «resúmeme esto» da resúmenes genéricos. Lo que funciona es pedir una **estructura fija** y decirle qué es lo importante:

```text
- Escribe en español, con tus propias palabras.
- Guarda los números concretos (precios, porcentajes, plazos, métricas).
- Prioriza las DECISIONES con su contexto: qué se decidió, en qué situación y qué resultado tuvo.
- Si el vídeo tiene poco contenido útil, dilo en una línea.

## De qué va
## Tesis principal
## Principios y reglas
## Decisiones y casos reales (contexto → decisión → resultado)
## Tácticas concretas
## Lo que critica o desaconseja
```

Con una estructura fija, todos los resúmenes se pueden comparar entre sí, y luego es fácil juntar los de un mismo autor en un documento de «doctrina»: qué defiende, con qué números y en qué no está de acuerdo con otros.

La llamada a OpenRouter es un `fetch` normal. Este es el trozo de `script/index.mjs` que manda el texto a la IA y devuelve el resumen:

```js
async function resumir(videoId, texto, idioma) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`
    },
    body: JSON.stringify({
      model: process.env.MODELO || 'anthropic/claude-haiku-5.5',
      max_tokens: 3000,
      temperature: 0.3,
      messages: [
        { role: 'system', content: INSTRUCCIONES },   // las reglas y la estructura de arriba
        { role: 'user', content: `Vídeo: https://youtu.be/${videoId}\nIdioma: ${idioma}\n\nTranscripción:\n${texto}` }
      ]
    })
  });
  const j = await r.json();
  const contenido = j?.choices?.[0]?.message?.content;
  if (!contenido) throw new Error('La IA no ha respondido: ' + (j?.error?.message || r.status));
  return contenido;
}
```

`temperature: 0.3` hace que los resúmenes sean más fieles y menos «creativos». Puedes cambiar de modelo solo con la variable `MODELO`.

Al final, cada resumen se guarda en un archivo:

```js
await writeFile(`resumenes/${id}.md`, `# https://youtu.be/${id}\n\n${resumen}\n`);
```

## Paso 5: ejecutar

```bash
npm start
```

Verás una línea por vídeo (`✓` resumido, `✗` error, o «sin subtítulos») y los resúmenes en `script/resumenes/`, un `.md` por vídeo.

```text
Canal @nombredelcanal: 5 vídeos a procesar
✓ n8u5wn-fsVk resumido
✓ 0cXVK49cJP8 resumido
- abc123xyz00: sin subtítulos, se salta
...
Hecho. Los resúmenes están en la carpeta resumenes/
```

## Ejemplo de resultado

Así queda un resumen real (recortado), generado con este sistema a partir de un vídeo de 11 minutos sobre los consultores que hay detrás de los grandes infoproductores (https://youtu.be/n8u5wn-fsVk):

```markdown
# https://youtu.be/n8u5wn-fsVk

## Tesis principal
Copiar lo que enseñan los grandes infoproductores no sirve: lo que les dio
resultado fueron decisiones concretas tomadas en un contexto y con unas métricas
específicas. Las palancas que más pesan suelen ser de conversión, timing y
embudo, no de cantidad de contenido.

## Principios y reglas
- Estudiar las decisiones y sus métricas, no el discurso público del creador.
- Un consultor externo ve lo que el dueño no ve desde dentro del día a día.
- Antes de producir más contenido, mirar las métricas de cada área del embudo
  por separado.

## Decisiones y casos reales
- Lanzamiento a 29 días de la fecha. Decisiones: quitar la superproducción y
  pasar a diapositivas sencillas; subir el precio de unos 1.000 a 1.500 $ y
  anunciarlo en el propio evento; vender el día 2 en vez del día 4 porque se
  perdía retención. Resultado según el vídeo: ~10 millones, repetido tres
  veces ese año.
- Estancados en 500.000 al mes: al medir cada área vieron que solo contactaban
  al 22 % de quienes entraban al embudo. El problema era de conversión, no de
  contenido.

## Tácticas concretas
1. Revisar las métricas por fase del embudo antes de decidir qué cambiar.
2. Probar cambios baratos y de alto impacto: fecha de venta, precio, formato.
```

Fíjate en que guarda los números y separa **contexto → decisión → resultado**: eso es lo que luego permite comparar a distintos autores.

## Lo mismo sin código: n8n

Si usas n8n, importa `n8n/workflow-canal-a-resumenes.json`. Hace exactamente lo mismo con nodos HTTP: lista los vídeos, va de uno en uno con una pausa entre ellos, pide los subtítulos, comprueba que hay texto, resume y te deja el resultado para que lo guardes donde quieras (Google Sheets, Notion, una tabla de n8n...).

En mi caso lo tengo así para más de 1.000 vídeos de 10 canales: una tabla con el estado de cada vídeo (`pendiente`, `hecho`, `sin_subtitulos`), procesado **por tandas** para no pasarme de los créditos del mes, y una ejecución semanal que solo añade los vídeos nuevos.

## Costes reales

Con 10 vídeos de prueba (de 11 a 60 minutos):

- **Supadata:** 10 créditos.
- **IA (Claude Haiku 5.5):** 0,024 $ en total, unos 0,0024 $ por vídeo.

Para un canal de 200 vídeos, menos de 1 $ de IA.

## Siguientes ideas

- Juntar todos los resúmenes de un autor en un solo documento de «doctrina».
- Poner a «debatir» a varios autores sobre una pregunta concreta, con lo que de verdad han dicho.
- Programarlo una vez por semana para que la biblioteca se actualice sola.

Si lo usas o lo mejoras, ¡abre un issue o una pull request!

---

> **Aviso:** los enlaces a Supadata de este repositorio son mi enlace de referido. Si te registras con él, recibo créditos gratuitos de Supadata; a ti no te cuesta nada más.
