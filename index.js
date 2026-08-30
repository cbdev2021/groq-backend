require('dotenv').config();
const express = require('express');
const https = require('https');
const { connectDB, ChatSession } = require('./mongo');

const app = express();
const PORT = process.env.PORT || 10000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const TIMEOUT_MS = 20000;

// Lista de modelos gratis con fallback automático
const DEFAULT_MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.6-27b',
  'qwen/qwen3.8-27b',
  'groq/compound-mini',
  'groq/compound'
];

const GROQ_MODELS = process.env.GROQ_MODELS
  ? process.env.GROQ_MODELS.split(',').map(s => s.trim()).filter(Boolean)
  : DEFAULT_MODELS;

// Instrucción de memoria: todos los modelos deben usar el historial del hilo como memoria
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || (
  'Aquí tienes toda la conversación actual de este chat y es visible para ti. ' +
  'Usa ese historial como tu memoria de la sesión. Si el usuario te ha dicho antes algo ' +
  '(su nombre, una preferencia o un dato personal), recuérdalo y úsalo cuando te pregunte después. ' +
  'Nunca digas que no recuerdas ni que cada conversación comienza de cero. ' +
  'Responde en español de forma natural, clara y breve.'
);

// Middleware
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Validación de configuración (sin matar el proceso en serverless)
if (!GROQ_API_KEY) {
  console.error('ERROR: GROQ_API_KEY no está configurada en .env');
}

if (!GROQ_MODELS.length) {
  console.error('ERROR: GROQ_MODELS no contiene modelos válidos');
}

// Conectar a MongoDB al arranque, pero sin crashear la función si falla
connectDB().catch(err => {
  console.warn('WARN: MongoDB no conectado al arrancar:', err.message);
});

function isRetryableError(status, message) {
  // Key inválida o sin permisos: fallaría igual en todos los modelos → no reintentar
  if (status === 401 || status === 403) return false;
  // Rate limit (por modelo): conviene intentar el siguiente
  if (status === 429) return true;
  const lower = String(message).toLowerCase();
  const modelIssue = lower.includes('model') && (
    lower.includes('not found') ||
    lower.includes('does not exist') ||
    lower.includes('unknown model') ||
    lower.includes('invalid model') ||
    lower.includes('no access') ||
    lower.includes('access to it') ||
    lower.includes('retired') ||
    lower.includes('decommissioned') ||
    lower.includes('no longer')
  );
  if (status === 400) return modelIssue;
  if (status === 404) return true;
  return status >= 500;
}

// Función para llamar a Groq API con historial
function callGroqAPI(messages, modelId) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: modelId,
      messages: messages.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : (msg.role === 'system' ? 'system' : 'user'),
        content: msg.content
      }))
    });

    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: TIMEOUT_MS
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        let body = {};
        try {
          body = JSON.parse(data);
        } catch (err) {
          body = {};
        }

        if (res.statusCode === 200) {
          resolve(body);
          return;
        }

        const errorMsg = (body.error && body.error.message) || `Groq API error: ${res.statusCode}`;
        const error = new Error(errorMsg);
        error.status = res.statusCode;
        error.body = data;
        error.retryable = isRetryableError(res.statusCode, errorMsg);
        reject(error);
      });
    });

    req.on('error', (err) => {
      const error = new Error(`Error de conexión con Groq API: ${err.message}`);
      error.status = 500;
      error.retryable = true;
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      const error = new Error('Timeout en request a Groq API');
      error.status = 504;
      error.retryable = true;
      reject(error);
    });

    req.write(payload);
    req.end();
  });
}

// Intenta la lista de modelos en orden hasta conseguir respuesta
async function callWithFallback(messages, startModel) {
  let startIdx = GROQ_MODELS.indexOf(startModel);
  if (startIdx === -1) startIdx = 0;

  const attempts = [];

  for (let i = 0; i < GROQ_MODELS.length; i++) {
    const model = GROQ_MODELS[(startIdx + i) % GROQ_MODELS.length];

    try {
      const parsed = await callGroqAPI(messages, model);
      const responseText = (parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content) || '';

      if (!responseText.trim()) {
        throw new Error('Respuesta vacía del modelo');
      }

      if (i > 0) console.log(`[MODEL] ✅ switch exitoso a: ${model}`);
      return { data: parsed, model };
    } catch (err) {
      attempts.push({ model, status: err.status || 500, message: err.message });
      console.log(`[MODEL] ❌ ${model} falló (${err.status || 500}): ${err.message}`);

      // Errores no reintentables (key inválida, input inválido) → no probar más modelos
      if (err.retryable === false) break;
      if (i < GROQ_MODELS.length - 1) {
        console.log(`[MODEL] ↻ probando siguiente: ${GROQ_MODELS[(startIdx + i + 1) % GROQ_MODELS.length]}`);
      }
    }
  }

  const last = attempts[attempts.length - 1] || { status: 500, message: 'Error interno del servidor' };
  const error = new Error(`Todos los modelos fallaron. Último error: ${last.message}`);
  error.status = last.status;
  error.details = attempts;
  throw error;
}

// Endpoint principal
app.post('/chat', async (req, res) => {
  try {
    // Validación de input
    const { sessionId, message } = req.body;

    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'El campo "sessionId" es requerido y debe ser un string no vacío',
        usage: null
      });
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'El campo "message" es requerido y debe ser un string no vacío',
        usage: null
      });
    }

    console.log(`[REQUEST] Session: ${sessionId}, Message length: ${message.length} chars`);

    // Guardas de configuración (responder 503 sin crashear la función)
    if (!GROQ_API_KEY) {
      return res.status(503).json({
        success: false,
        data: null,
        error: 'API key de Groq no configurada en el servidor',
        usage: null
      });
    }

    if (!GROQ_MODELS.length) {
      return res.status(503).json({
        success: false,
        data: null,
        error: 'GROQ_MODELS no contiene modelos válidos',
        usage: null
      });
    }

    // Asegurar conexión a MongoDB bajo demanda (503 sin crashear si falla)
    try {
      await connectDB();
    } catch (dbError) {
      console.error('[DB] No disponible:', dbError.message);
      return res.status(503).json({
        success: false,
        data: null,
        error: 'Base de datos no disponible. Intenta de nuevo en unos segundos.',
        usage: null
      });
    }

    // Buscar o crear sesión
    let session = await ChatSession.findById(sessionId);
    
    if (!session) {
      session = new ChatSession({
        _id: sessionId,
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date()
      });
      console.log(`[SESSION] Nueva sesión creada: ${sessionId}`);
    }

    // Agregar mensaje del usuario
    session.messages.push({
      role: 'user',
      content: message
    });

    // Mantener solo últimos 20 mensajes
    if (session.messages.length > 20) {
      session.messages = session.messages.slice(-20);
    }

    // Llamar a Groq API con fallback automático entre modelos
    const startModel = session.activeModel || GROQ_MODELS[0];
    const contextMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...session.messages
    ];
    const { data: groqResponse, model: usedModel } = await callWithFallback(contextMessages, startModel);

    // Extraer respuesta
    const responseText = groqResponse.choices?.[0]?.message?.content || '';
    const usage = groqResponse.usage || null;

    // Guardar respuesta del assistant
    session.messages.push({
      role: 'assistant',
      content: responseText
    });

    // Mantener solo últimos 20 mensajes después de agregar respuesta
    if (session.messages.length > 20) {
      session.messages = session.messages.slice(-20);
    }

    // Guardar modelo ganador para la próxima petición de esta sesión
    session.activeModel = usedModel;
    session.updatedAt = new Date();
    await session.save();

    console.log(`[RESPONSE] Success - model: ${usedModel}, ${responseText.length} chars, Total messages: ${session.messages.length}`);

    res.json({
      success: true,
      data: {
        text: responseText,
        sessionId: sessionId,
        model: usedModel
      },
      error: null,
      usage: usage ? {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens
      } : null
    });

  } catch (error) {
    const status = error.status || 500;
    const message = error.message || 'Error interno del servidor';
    
    console.error(`[ERROR] ${status}: ${message}`);
    
    res.status(status).json({
      success: false,
      data: null,
      error: message,
      usage: null
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    data: null,
    error: 'Endpoint no encontrado',
    usage: null
  });
});

// Error handler global
app.use((err, req, res, next) => {
  console.error('[UNHANDLED ERROR]', err);
  res.status(500).json({
    success: false,
    data: null,
    error: 'Error interno del servidor',
    usage: null
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
  console.log(`✅ API key configurada: ${GROQ_API_KEY.substring(0, 10)}...`);
  console.log(`📡 Endpoint: POST /chat`);
  console.log(`🤖 Modelos (fallback automático): ${GROQ_MODELS.join(' → ')}`);
});
