# 🛡️ Auditoría de Seguridad - Sistema de Contratos

**Fecha:** 24 de abril de 2026  
**Estado:** ✅ **BUENA SEGURIDAD** con algunas mejoras recomendadas

---

## ✅ Protecciones YA Implementadas

### 1. **SQL Injection - PROTEGIDO** ✅
- **Tecnología:** Prisma ORM
- **Protección:** Queries parametrizadas automáticas
- **Código:**
  ```typescript
  // ✅ Todas las queries usan Prisma - NO hay SQL raw
  await this.prisma.user.findUnique({ where: { email } });
  ```
- **Riesgo:** BAJO - Prisma previene SQL injection por diseño

---

### 2. **XSS (Cross-Site Scripting) - MAYORMENTE PROTEGIDO** ✅
- **Frontend:** React escapa HTML automáticamente
- **Único caso especial:**
  ```typescript
  // ⚠️ En history/page.tsx línea 402
  <div dangerouslySetInnerHTML={{ __html: viewerHtml }} />
  ```
  - **Contexto:** Muestra contrato PDF convertido a HTML (generado en backend)
  - **Mitigación:** El HTML viene del backend (controlado), no de input de usuario
  - **Recomendación:** Agregar DOMPurify si hay cambios futuros

---

### 3. **CSRF (Cross-Site Request Forgery) - PROTEGIDO** ✅
- **Método:** JWT en Authorization header (no cookies)
- **Config CORS:** Lista blanca de orígenes permitidos
- **Código:**
  ```typescript
  // backend/src/main.ts
  app.enableCors({
    origin: (origin, callback) => {
      // Valida contra ALLOWED_ORIGIN o PUBLIC_APP_BASE_URL
    },
    credentials: false, // No usa cookies
  });
  ```

---

### 4. **Inyección de Headers - PROTEGIDO** ✅
- **Librería:** Helmet
- **Headers de seguridad aplicados:**
  - X-Content-Type-Options: nosniff
  - X-Frame-Options: DENY
  - X-XSS-Protection: 1; mode=block
  - Strict-Transport-Security (HSTS)
  - Content-Security-Policy

```typescript
// backend/src/main.ts línea 71
app.use(helmet());
```

---

### 5. **Rate Limiting (Anti Fuerza Bruta) - PARCIALMENTE IMPLEMENTADO** ⚠️

#### ✅ Rate Limiting Global:
```typescript
// backend/src/app.module.ts
ThrottlerModule.forRoot([{
  ttl: 60000,      // 60 segundos
  limit: 120,      // 120 requests
}]),
```

#### ✅ Rate Limiting en Endpoints Específicos:
```typescript
// contracts.controller.ts
@Throttle({ default: { ttl: 60000, limit: 20 } })  // Signing
@Throttle({ default: { ttl: 60000, limit: 30 } })  // Document upload
@Throttle({ default: { ttl: 60000, limit: 10 } })  // Number reservation
```

#### ⚠️ LOGIN sin Rate Limiting Específico:
- **Problema:** `/auth/login` usa el límite global (120 req/min)
- **Riesgo:** Un atacante puede hacer ~120 intentos de login por minuto
- **Recomendación:** Agregar rate limiting estricto al login

---

### 6. **Validación de Entrada - PROTEGIDO** ✅
- **Librería:** class-validator
- **ValidationPipe:** Configurado globalmente
```typescript
// backend/src/main.ts línea 93-97
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,           // Remueve propiedades no definidas
    transform: true,            // Transforma tipos automáticamente
    forbidNonWhitelisted: true, // Lanza error si hay props extra
  }),
);
```

#### Ejemplo de DTO protegido:
```typescript
export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;  // Honeypot para bots
}
```

---

### 7. **Autenticación JWT - PROTEGIDO** ✅
- **Algoritmo:** HS256 (HMAC SHA-256)
- **Sesión única:** `activeJti` previene múltiples sesiones
- **Invalidación:** Cambio de rol o suspensión → `activeJti = null`
- **Validación doble:** JWT + base de datos

```typescript
// jwt.strategy.ts - Validación en cada request
if (!payload.jti || !user.activeJti || payload.jti !== user.activeJti) {
  throw new UnauthorizedException("Sesión inválida");
}
```

---

### 8. **Passwords - PROTEGIDO** ✅
- **Hashing:** bcrypt con 10 rounds (salt automático)
- **No se almacenan en texto plano**
- **Validación:** MinLength(6) mínimo

```typescript
const passwordHash = await hash(password, 10);
```

---

### 9. **Protección de Archivos - PROTEGIDO** ✅
- **Almacenamiento:** AWS S3/DigitalOcean Spaces
- **URLs firmadas:** Expiran en 24 horas
- **Sin acceso público directo**

```typescript
const url = await getSignedUrl(this.s3, command, { expiresIn: 86400 });
```

---

### 10. **Auto-suspensión Prevenida - PROTEGIDO** ✅
```typescript
// auth.service.ts adminUpdateUser()
if (userId === currentUserId && !dto.isActive) {
  throw new BadRequestException("No puedes suspenderte a ti mismo.");
}
```

---

## ⚠️ Mejoras Recomendadas

### 1. **Rate Limiting Estricto en Login** 🔴 ALTA PRIORIDAD
```typescript
// auth.controller.ts
@Throttle({ default: { ttl: 60000, limit: 5 } })  // Solo 5 intentos por minuto
@Post("login")
login(@Body() dto: LoginDto) {
  return this.authService.login(dto);
}
```

### 2. **Rate Limiting en Password Reset** 🟡 MEDIA PRIORIDAD
```typescript
@Throttle({ default: { ttl: 300000, limit: 3 } })  // 3 intentos cada 5 minutos
@Post("request-password-reset")
requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
  return this.authService.requestPasswordReset(dto);
}
```

### 3. **Logging de Intentos Fallidos** 🟡 MEDIA PRIORIDAD
- Registrar intentos de login fallidos
- Monitorear patrones sospechosos
- Alertas para múltiples fallos

### 4. **Sanitización Explícita de HTML** 🟢 BAJA PRIORIDAD
```bash
npm install dompurify @types/dompurify
```
```typescript
import DOMPurify from 'dompurify';
const cleanHtml = DOMPurify.sanitize(viewerHtml);
<div dangerouslySetInnerHTML={{ __html: cleanHtml }} />
```

### 5. **Content Security Policy (CSP) Mejorado** 🟢 BAJA PRIORIDAD
```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));
```

### 6. **Bloqueo de IP tras Fallos** 🟡 MEDIA PRIORIDAD
- Implementar bloqueo temporal de IP tras 10 intentos fallidos
- Usar Redis o base de datos para tracking
- Desbloqueo automático después de 1 hora

### 7. **2FA (Autenticación de Dos Factores)** 🟢 FUTURO
- Implementar TOTP (Google Authenticator)
- Solo para rol ADMIN
- Opcional pero recomendado

---

## 📊 Resumen de Riesgo

| Vulnerabilidad | Estado | Riesgo Actual | Acción |
|----------------|--------|---------------|---------|
| SQL Injection | ✅ Protegido | BAJO | Ninguna |
| XSS | ✅ Mayormente Protegido | BAJO | Considerar DOMPurify |
| CSRF | ✅ Protegido | BAJO | Ninguna |
| Inyección Headers | ✅ Protegido | BAJO | Ninguna |
| Rate Limiting Global | ✅ Implementado | BAJO | Ninguna |
| **Fuerza Bruta Login** | ⚠️ **Parcial** | **MEDIO** | **Agregar rate limit estricto** |
| Validación Entrada | ✅ Protegido | BAJO | Ninguna |
| JWT | ✅ Protegido | BAJO | Ninguna |
| Passwords | ✅ Protegido | BAJO | Ninguna |
| Archivos | ✅ Protegido | BAJO | Ninguna |
| Auto-suspensión | ✅ Protegido | BAJO | Ninguna |

---

## 🎯 Conclusión

**El sistema tiene BUENA seguridad base**, especialmente considerando:
- ✅ Uso de Prisma (anti-SQL injection)
- ✅ React (anti-XSS por defecto)
- ✅ JWT + validación de sesión
- ✅ Helmet para headers
- ✅ CORS configurado
- ✅ Validación de entrada robusta
- ✅ Rate limiting global

**Única mejora CRÍTICA recomendada:**
🔴 **Agregar rate limiting estricto al endpoint de login** (5 intentos/minuto por IP)

Las demás mejoras son opcionales pero recomendadas para hardening adicional.
