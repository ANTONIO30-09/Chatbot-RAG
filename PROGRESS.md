# Progreso: Chatbot de carreras UNIFRANZ

Última actualización: 2026-11-25, 17:45 (hora de La Paz). El evento es el 2026-11-26.

## Objetivo
Chatbot que responde en el evento sobre las carreras **Ingeniería de Sistemas e Innovación Digital** y **Derecho**: mallas, tiempo de estudio, uso de tecnología, qué es una microcredencial y para qué sirve, menciones, cuándo se eligen y sus beneficios.

## Stack
- Backend: Node.js + Express 5
- Frontend: HTML, CSS y JavaScript vanilla
- RAG: `knowledge/chunks.json` + MiniSearch, indexado en memoria al arrancar
- LLM: Groq API, `openai/gpt-oss-120b` (principal) y `openai/gpt-oss-20b` (respaldo)
- Voz: grabación en el navegador + Groq Whisper `whisper-large-v3-turbo`
- Avatar: imagen con animación FLIP hasta el icono del primer mensaje
- Despliegue: Render (`render.yaml`)

## Hecho
- [x] Estructura de carpetas creada por terminal
- [x] Base de conocimiento: `knowledge/chunks.json` con 47 chunks (9 generales, 20 de Sistemas, 18 de Derecho), validada (IDs únicos, sin campos vacíos)
- [x] Fuentes separadas en `knowledge/fuentes/parte-*.json`
- [x] `.gitignore`, `.env.example` y `package.json` base

## Pendiente (en orden)
1. [ ] Etapa 1: `server.js` con Express 5 y `/health`; `npm install`
2. [ ] Etapa 2: `src/rag.js` (MiniSearch) y prueba de búsqueda con curl, sin IA
3. [ ] Etapa 3: `src/llm.js` y `/api/chat` con Groq (120b, respaldo 20b y, si Groq falla, respuesta con el mejor fragmento sin IA)
4. [ ] Etapa 4: frontend de chat (**con esto ya sirve para el evento**)
5. [ ] Etapa 5: voz con Whisper
6. [ ] Etapa 6: avatar con animación FLIP
7. [ ] Etapa 7: `render.yaml` y despliegue

## Decisiones de diseño
- Servidor sin estado: el navegador manda los últimos mensajes en cada pregunta.
- La llave de Groq vive solo en el servidor (`.env`), nunca en el frontend ni en el repo.
- El prompt obliga a responder solo con lo recuperado y a derivar el resto a info@unifranz.edu.bo o al +591 71502211.

## Dudas por confirmar con UNIFRANZ
- **Semestre exacto en que se elige la mención.** Los PDF no lo dicen. En la malla, las materias de mención están en los semestres 8 y 9 (Sistemas) y 6 y 7 (Derecho). El chunk `gen-06` está marcado como PENDIENTE.
- Significado de las letras de los códigos de la malla: (P), (C), (E), (EC), (M), (MC). No lo explica ninguna fuente.
- La Electiva IV (Lean Startup) de Sistemas tiene código LSM-311 (sugiere semestre 3) pero el PDF la ubica en el semestre 5.

## Fuentes
- Folletos PDF "MALLA SIS 2026" y "MALLA DER 2026" (lectura digital)
- unifranz.edu.bo/carreras/ingenieria-de-sistemas-e-innovacion-digital/
- unifranz.edu.bo/carreras/derecho/

## Cómo retomar
```bash
cd /home/petus/Escritorio/BOTDECARRERAS
cp .env.example .env   # y poner la llave real de Groq
npm install
npm start
```
