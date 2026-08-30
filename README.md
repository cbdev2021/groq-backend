# Backend Groq API - Producción

Backend profesional en Node.js + Express para consumir Groq (GPT-OSS 120B con fallback multi-modelo) vía API REST oficial.

## 🚀 Instalación

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar variables de entorno
```bash
# Copiar el archivo de ejemplo
copy .env.example .env

# Editar .env y agregar tu API key real
# GROQ_API_KEY=gsk_...
```

### 3. Obtener API Key
1. Ir a: https://console.groq.com/keys
2. Crear nueva API key
3. Copiar y pegar en `.env`

### 4. Iniciar servidor
```bash
npm start
```

El servidor estará disponible en: `http://localhost:10000`

---

## 📡 API Endpoints

### POST /chat
Envía un mensaje a Groq y recibe respuesta.

**Request:**
```json
{
  "sessionId": "user123",
  "message": "Explica qué es un agente de IA"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "text": "Un agente de IA es un sistema...",
    "sessionId": "user123",
    "model": "openai/gpt-oss-120b"
  },
  "usage": {
    "promptTokens": 10,
    "completionTokens": 45,
    "totalTokens": 55
  }
}
```

**Errores:**
- `400`: Input inválido
- `401`: API key incorrecta
- `500`: Error del servidor
- `504`: Timeout

### GET /health
Health check del servidor.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## 🧪 Pruebas

### cURL (Windows CMD)
```bash
curl -X POST http://localhost:10000/chat ^
  -H "Content-Type: application/json" ^
  -d "{\"sessionId\":\"test123\",\"message\":\"Hola, explica qué es Node.js en 2 líneas\"}"
```

### cURL (PowerShell)
```powershell
curl -Method POST -Uri "http://localhost:10000/chat" `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"sessionId":"test123","message":"Hola, explica qué es Node.js en 2 líneas"}'
```

### cURL (Linux/Mac)
```bash
curl -X POST http://localhost:10000/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test123","message":"Hola, explica qué es Node.js en 2 líneas"}'
```

---

## 📮 Postman

### Configuración
1. **Method**: POST
2. **URL**: `http://localhost:10000/chat`
3. **Headers**:
   - `Content-Type`: `application/json`
4. **Body** (raw JSON):
```json
{
  "sessionId": "user123",
  "message": "¿Cuál es la capital de Francia?"
}
```

---

## 🔒 Seguridad

✅ **Implementado:**
- API key en variable de entorno (no hardcodeada)
- Validación estricta de input
- Timeout de 30 segundos
- Logging sin exponer secrets
- Manejo de errores HTTP estándar

---

## 🛠️ Estructura del Proyecto

```
groq/
├── index.js          # Servidor Express + lógica
├── mongo.js          # Conexión MongoDB
├── package.json      # Dependencias
├── .env              # Variables de entorno (NO subir a Git)
├── .env.example      # Plantilla de configuración
└── README.md         # Documentación
```

---

## 📊 Modelos

- **Fallback automático** (en orden): `openai/gpt-oss-120b` → `openai/gpt-oss-20b` → `qwen/qwen3.6-27b` → `qwen/qwen3.8-27b` → `groq/compound-mini` → `groq/compound`
- **Provider**: Groq
- **Contexto**: Mantiene historial de conversación (últimos 20 mensajes)
- **Memoria**: se inyecta un `system prompt` para que todos los modelos usen el historial del hilo como memoria (nombres, preferencias, datos). El historial vive en MongoDB, por lo que se conserva incluso cuando el fallback cambia de modelo a mitad de conversación
- **Auto-switch por límite**: cuando un modelo llega a su límite gratis (HTTP 429) o falla, se prueba automáticamente el siguiente de la lista
- El modelo activo de cada sesión se guarda (`activeModel`) para no golpear el modelo saturado en cada petición
- Cada respuesta incluye el campo `data.model` indicando qué modelo respondió

Configurable con la variable de entorno `GROQ_MODELS` (lista separada por comas sin espacios). Si no se define, se usa la lista por defecto de arriba.

---

## ⚠️ Troubleshooting

### Error: "GROQ_API_KEY no está configurada"
- Verificar que existe el archivo `.env`
- Verificar que la variable está definida: `GROQ_API_KEY=tu_key`

### Error 401: "API key inválida"
- Verificar que la key es correcta
- Verificar que la API está activa en Groq Console

### Error 504: "Timeout"
- El modelo está tardando más de 30s
- Verificar conexión a internet
- Intentar con un mensaje más corto

---

## 🚢 Despliegue

### Variables de entorno requeridas:
- `PORT`: Puerto del servidor (default: 10000)
- `GROQ_API_KEY`: API key de Groq
- `MONGO_URI`: URI de MongoDB

### Plataformas compatibles:
- Railway
- Render
- Heroku
- AWS EC2
- VPS (Ubuntu/Debian)

---

## 📝 Licencia

MIT
# groq-backend
