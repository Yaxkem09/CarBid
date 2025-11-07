# CarBid

Marketplace de subastas de autos con pila completa JavaScript (React + Express + MySQL) y actualizaciones en tiempo real via WebSockets.

## Descripcion general

CarBid permite a compradores y vendedores gestionar subastas de vehiculos en linea. El backend expone APIs seguras con Express, Sequelize y JWT almacenado en cookies HttpOnly; el frontend en React 19 ofrece una experiencia rica con filtros avanzados, formularios con validaciones y sockets para pujas en vivo. El proyecto se divide en dos carpetas (`backend` y `frontend`) dentro del mismo repositorio.

## Caracteristicas principales

- **Autenticacion basada en cookies**: registro, login, verificacion de sesion (`/api/auth/*`) y cierre de sesion con JWT firmado y enviado como cookie segura.
- **Gestion de subastas**: creacion con hasta 4 imagenes, filtros por marca/modelo/color/anio/rango de precios, recomendaciones y detalle con contador regresivo.
- **Pujas en tiempo real**: Socket.IO autentica por cookie y retransmite `bid:created`, `auction:updated` y `auction:ended` a los clientes suscritos.
- **Tareas automatizadas**: cron job (node-cron) que cada minuto cierra subastas vencidas, calcula ganadores y notifica por sockets.
- **Soporte de archivos**: almacenamiento local (carpeta `backend/uploads`) o Amazon S3 usando `@aws-sdk/client-s3`, con sanitizacion de nombres y limites (10 MB por imagen).
- **Historial personal**: vista de publicaciones propias, pujas activas y subastas ganadas/perdidas (`/historial`).

## Arquitectura

```
CarBid/
|- backend/                 # API REST, sockets y jobs
|  |- src/
|  |  |- routes/            # auth, listings, bids
|  |  |- realtime/          # socket.io server + eventos
|  |  |- jobs/              # cron para cerrar subastas
|  |  `- db/                # ORM Sequelize + schema SQL
|- frontend/                # SPA en React 19 (CRA)
|  |- src/
|  |  |- pages/             # bienvenida, inicio, detalle, publicar, historial
|  |  |- components/        # layout, header, ruta protegida
|  |  |- services/          # axios y socket client
|  |  `- hooks/             # opciones de vehiculos dinamicas
`- uploads/ (runtime)       # almacenamiento local cuando S3 no esta configurado
```

## Tecnologias

- **Frontend**: React 19 (CRA), React Router 7, Axios, Socket.IO Client, Testing Library.
- **Backend**: Node 20+, Express 5, Sequelize (MySQL), JWT, Multer, Socket.IO Server, node-cron, AWS SDK v3.
- **Base de datos**: MySQL 8 (o compatible). Esquema base en `backend/src/db/schema.sql` + migraciones en `src/db/migrations`.

## Prerrequisitos

- Node.js 20 LTS (recomendado) y npm 10+.
- MySQL en ejecucion y credenciales con permisos de lectura/escritura.
- (Opcional) Cuenta de AWS con bucket S3 si se desea almacenamiento externo.

## Variables de entorno

Configura un archivo `.env` en cada carpeta usando los ejemplos existentes. Nunca compartas los valores reales.

### Backend (`backend/.env`)

| Variable | Descripcion |
| --- | --- |
| `PORT` | Puerto HTTP del API (por defecto 8080). |
| `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Credenciales MySQL usadas por Sequelize. |
| `JWT_SECRET` | Clave para firmar tokens JWT de sesion. |
| `NODE_ENV` | Define modo `production` o `development` (afecta cookies). |
| `FRONTEND_ORIGIN` | Origin permitido para Socket.IO. |
| `COOKIE_DOMAIN` | Dominio opcional para setear la cookie `token`. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Credenciales IAM cuando se usa S3. |
| `AWS_REGION` o `AWS_DEFAULT_REGION` | Region del bucket. |
| `S3_BUCKET` | Nombre del bucket donde se guardan imagenes. Si se omite, se usa almacenamiento local. |
| `S3_PUBLIC_URL` | URL publica base (CloudFront, etc). Opcional. |

### Frontend (`frontend/.env`)

| Variable | Descripcion |
| --- | --- |
| `REACT_APP_API_URL` | URL base del backend (ej. `http://localhost:8080/api`). Se usa tanto para Axios como para Socket.IO. |

## Configuracion rapida

1. **Backend**
   1. Copia `backend/.env.example` (si existe) o crea `backend/.env` con las variables anteriores.
   2. Crea la base de datos y ejecuta el script `backend/src/db/schema.sql`. Opcionalmente aplica las migraciones de `backend/src/db/migrations`.
   3. Instala dependencias: `cd backend && npm install`.

2. **Frontend**
   1. Crea `frontend/.env` con `REACT_APP_API_URL`.
   2. Instala dependencias: `cd frontend && npm install`.

## Ejecucion en desarrollo

En dos terminales distintas:

```bash
# Backend
cd backend
npm run dev

# Frontend
cd frontend
npm start
```

- El frontend (CRA) corre en `http://localhost:3000`.
- El backend usa el puerto indicado en `PORT` (8080 por defecto) y expone `/api/*`. React se comunica via Axios con `withCredentials: true` para enviar la cookie `token`.

## Scripts utiles

| Directorio | Script | Descripcion |
| --- | --- | --- |
| `backend` | `npm run dev` | Inicia Express con Nodemon y Socket.IO. |
| `backend` | `npm start` | Modo produccion sin recarga. |
| `frontend` | `npm start` | Dev server (Webpack) con proxy local. |
| `frontend` | `npm run build` | Genera `build/` listo para subir a un CDN o S3. |
| `frontend` | `npm test` | Ejecuta pruebas de CRA (Testing Library + Jest). |

## API esencial

### Auth (`/api/auth`)
- `GET /check-email` valida si un correo ya existe.
- `POST /register` crea usuario (campos: nombre, apellidos, genero, telefono, email, password).
- `POST /login` autentica y emite cookie `token`.
- `GET /me` retorna el usuario autenticado (usado por la ruta protegida en React).
- `POST /logout` limpia la cookie.

### Subastas (`/api/listings`)
- `GET /options` devuelve listas unicas de marcas y modelos publicados.
- `GET /` admite filtros (`mine`, `status`, `brand`, `model`, `color`, `year`, `minPrice`, `maxPrice`) y trae imagenes + puja mas alta.
- `GET /:id` retorna la subasta con fotos, pujas historicas, bandera `isLeading` y viewer actual.
- `POST /` crea una subasta nueva con validaciones de negocio, subida de hasta 4 imagenes y almacenamiento local/S3.
- `POST /:id/bids` crea una oferta verificando monto minimo, propietario y fecha de cierre; emite eventos en tiempo real.

### Pujas (`/api/bids`)
- `GET /mine` lista las pujas del usuario, marcando si son ganadoras o no.

### Utilidades
- `/uploads/*` sirve imagenes cuando se usa almacenamiento local.
- `GET /health` y `GET /db-check` permiten monitoreo simple.

## Tiempo real y jobs

- `backend/src/realtime/socket.js` crea un servidor Socket.IO que autentica leyendo la cookie `token`, maneja salas por subasta (`auction:{id}`) y una sala global (`listings:active`).
- `backend/src/realtime/events.js` normaliza payloads y emite `bid:created`, `auction:updated` y `auction:ended`.
- `backend/src/jobs/auctionStatusJob.js` corre cada minuto; marca subastas expiradas como `ended`, resuelve ganadores y dispara eventos de cierre.

## Interfaz web (frontend)

- **Bienvenida (`/`)**: landing con login/registro, validacion de email existente, reglas de contrasena y formateo de telefono.
- **Inicio (`/inicio`)**: feed con filtros, recomendaciones, paginacion por front, formato de moneda (GTQ) y actualizaciones via socket.
- **Detalle (`/detalle-subasta/:id`)**: galeria de imagenes, contador regresivo, estado de la puja personal, modal de fotos y formulario para ofertar.
- **Publicar (`/publicar-carro`)**: formulario con previsualizacion en vivo, validaciones de rango (kilometraje, precio, incremento minimo), subida/preview de imagenes y control del limite de 4 fotos.
- **Historial (`/historial`)**: tablero de publicaciones propias, pujas participadas y resultados (ganada, no ganada, en curso).

Todas las rutas internas usan `ProtectedRoute`, que consulta `/api/auth/me` antes de renderizar y redirige a `/` si no hay sesion.

## Base de datos

- Ejecuta `backend/src/db/schema.sql` para crear tablas (`users`, `auctions`, `bids`, `auction_images`).
- Las migraciones en `backend/src/db/migrations` muestran cambios incrementales (ej. renombrar columnas, agregar `min_increment`).
- Puedes administrar la base con cualquier cliente MySQL; asegurate de que la codificacion sea `utf8mb4` para soportar caracteres especiales en descripciones.

## Pruebas y calidad

- **Frontend**: usa CRA, por lo que `npm test` levanta Jest en modo watch. Cubre hooks, componentes y paginas que lo requieran.
- **Backend**: actualmente no hay tests automatizados; se recomienda usar herramientas como Jest o supertest para agregar cobertura a rutas criticas y jobs.
- **Validaciones manuales**: prueba flujos completos (registrar, publicar, pujar desde dos navegadores, cierre automatico) antes de desplegar.

## Despliegue

1. Genera el frontend: `cd frontend && npm run build`. Hospeda `frontend/build` en un bucket S3 o servicio estatico y apunta DNS (ej. `carbid.click`).
2. Despliega el backend (Elastic Beanstalk, EC2, Render, etc.). Exporta las variables de entorno y asegurate de que `FRONTEND_ORIGIN` y CORS acepten el dominio publico.
3. Configura HTTPS end-to-end para que las cookies `Secure` funcionen en navegadores modernos.

## Recursos utiles

- `backend/uploads/` se crea automaticamente cuando no hay S3.
- `frontend/src/constants/vehicleOptions.js` centraliza los valores de marca/modelo/colores para filtros y formularios.
- `frontend/src/services/socket.js` demuestra como derivar la URL del socket a partir de `REACT_APP_API_URL`.

Si necesitas documentar endpoints adicionales o flujos especificos, toma este README como base y agrega secciones segun el crecimiento del proyecto.
