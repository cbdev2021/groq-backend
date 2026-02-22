# Backend Groq API - Producción

Backend profesional en Node.js + Express para consumir Groq (Llama 3.3 70B) vía API REST oficial.

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

El servidor estará disponible en: `http://localhost:3001`

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
  "response": "Un agente de IA es un sistema...",
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
curl -X POST http://localhost:3001/chat ^
  -H "Content-Type: application/json" ^
  -d "{\"sessionId\":\"test123\",\"message\":\"Hola, explica qué es Node.js en 2 líneas\"}"
```

### cURL (PowerShell)
```powershell
curl -Method POST -Uri "http://localhost:3001/chat" `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"sessionId":"test123","message":"Hola, explica qué es Node.js en 2 líneas"}'
```

### cURL (Linux/Mac)
```bash
curl -X POST http://localhost:3001/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test123","message":"Hola, explica qué es Node.js en 2 líneas"}'
```

---

## 📮 Postman

### Configuración
1. **Method**: POST
2. **URL**: `http://localhost:3001/chat`
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

## 📊 Modelo

- **Modelo**: `llama-3.3-70b-versatile`
- **Proveedor**: Groq
- **Contexto**: Mantiene historial de conversación (últimos 20 mensajes)

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
- `PORT`: Puerto del servidor (default: 3001)
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
