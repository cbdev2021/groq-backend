require('dotenv').config();
const express = require('express');
const https = require('https');
const { connectDB, ChatSession } = require('./mongo');

const app = express();
const PORT = process.env.PORT || 10000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const TIMEOUT_MS = 30000;

// Middleware
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Validación de API key al inicio
if (!GROQ_API_KEY) {
  console.error('ERROR: GROQ_API_KEY no está configurada en .env');
  process.exit(1);
}

// Conectar a MongoDB
connectDB().catch(err => {
  console.error('ERROR: No se pudo conectar a MongoDB');
  process.exit(1);
});

// Función para llamar a Groq API con historial
function callGroqAPI(messages) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: messages.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
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
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (err) {
            reject({ status: 500, message: 'Error parseando respuesta de Groq' });
          }
        } else if (res.statusCode === 400) {
          reject({ status: 400, message: 'Request inválido a Groq API' });
        } else if (res.statusCode === 401 || res.statusCode === 403) {
          reject({ status: 401, message: 'API key inválida o sin permisos' });
        } else {
          reject({ status: 500, message: `Groq API error: ${res.statusCode}` });
        }
      });
    });

    req.on('error', (err) => {
      console.error('Error en request:', err.message);
      reject({ status: 500, message: 'Error de conexión con Groq API' });
    });

    req.on('timeout', () => {
      req.destroy();
      reject({ status: 504, message: 'Timeout en request a Groq API' });
    });

    req.write(payload);
    req.end();
  });
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

    // Llamar a Groq API con historial completo
    const groqResponse = await callGroqAPI(session.messages);

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

    // Actualizar updatedAt y guardar
    session.updatedAt = new Date();
    await session.save();

    console.log(`[RESPONSE] Success - ${responseText.length} chars, Total messages: ${session.messages.length}`);

    res.json({
      success: true,
      data: {
        text: responseText,
        sessionId: sessionId
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
});
