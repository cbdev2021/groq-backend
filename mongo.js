const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

let isConnected = false;
let connectPromise = null;

// Evitar que eventos no manejados de la conexión crasheen la app/función serverless
mongoose.connection.on('error', (err) => {
  console.error('[MONGO] Error en la conexión:', err.message);
});
mongoose.connection.on('disconnected', () => {
  isConnected = false;
  console.warn('[MONGO] Desconectado de MongoDB');
});

async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    isConnected = true;
    return;
  }

  if (!MONGO_URI) {
    throw new Error('MONGO_URI no está configurada en .env');
  }

  // Compartir el intento de conexión entre invocaciones concurrentes
  if (!connectPromise) {
    connectPromise = mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    }).then(() => {
      isConnected = true;
      console.log('✅ MongoDB conectado correctamente');
    }).catch((error) => {
      connectPromise = null;
      isConnected = false;
      console.error('❌ Error conectando a MongoDB:', error.message);
      throw error;
    });
  }

  return connectPromise;
}

// Schema de sesión de chat
const chatSessionSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  messages: [{
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true }
  }],
  activeModel: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const ChatSession = mongoose.model('ChatSession', chatSessionSchema, 'chat_sessions');

module.exports = { connectDB, ChatSession };
