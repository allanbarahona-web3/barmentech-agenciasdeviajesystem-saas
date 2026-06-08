# 🚀 QUICK START - Desarrollo Local

## Setup en 3 Minutos

### Opción 1: Todo Automático (Recomendado)

```bash
# Desde la raíz del proyecto
chmod +x start-dev.sh
./start-dev.sh
```

Esto levanta:
- ✅ **Frontend** en `http://localhost:5179`
- ✅ **Backend** en `http://localhost:3001`

---

### Opción 2: Manual (en 2 terminales)

**Terminal 1 - Backend:**
```bash
cd backend
PUPPETEER_DISABLE_SANDBOX=true npm run start:dev
```

**Terminal 2 - Frontend:**
```bash
# Instala http-server una sola vez
npm install -g http-server

# Luego:
cd frontend
npx http-server -p 5179 -c-1
```

---

## ✅ Cuando Todo Está Levantado

- Abre en tu navegador: **http://localhost:5179**
- Backend API disponible: **http://localhost:3001**
- El frontend automáticamente se conecta a la API local

---

## 🧪 Testing

1. Ingresa con credenciales en la interfaz
2. Genera un contrato
3. Crea un link de firma
4. Verifica que todo funcione

---

## 📊 Troubleshooting

### "Backend no levanta"
```bash
# Revisa los logs
tail -50 /tmp/backend.log
```

### "Puerto 5179 en uso"
```bash
# Mata el proceso
lsof -i :5179
kill -9 <PID>
```

### "Chromium no funciona"
Asegúrate de que está en `.env`:
```
PUPPETEER_DISABLE_SANDBOX=true
```

---

## 📚 Más Info

Ver [TESTING.md](./TESTING.md) para testing de endpoints específicos.
