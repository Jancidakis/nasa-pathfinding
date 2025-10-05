# Procesamiento de PDFs con Gemini AI

## Descripción

Este sistema procesa archivos PDF de planos arquitectónicos y los convierte automáticamente en visualizaciones 3D utilizando **Gemini 2.5 Flash**.

## Características Principales

### 1. **Validación Previa**
Antes de extraer todos los datos, el sistema:
- ✅ Verifica el **número total de plantas** del edificio
- ✅ Detecta la **altura total** del edificio
- ✅ Calcula la **altura individual** de cada planta
- ✅ Identifica los **nombres de todas las plantas**

### 2. **Extracción Inteligente**
Una vez validado, el sistema extrae:
- Información del proyecto (nombre, autor, fecha, ubicación)
- Todas las plantas/niveles del edificio
- Áreas de cada planta con superficies en m²
- Instalaciones (eléctricas, fontanería, etc.)

### 3. **Sin Datos Hardcodeados**
- El sistema NO usa datos de ejemplo para PDFs reales
- Toda la información proviene directamente del PDF analizado
- Validación estricta de la estructura de datos

## Flujo de Procesamiento

```
PDF Upload → Validación (Plantas + Altura) → Extracción Detallada → Visualización 3D
```

### Paso 1: Usuario sube PDF
```typescript
// src/components/Workspace.tsx
<UploadStep onFileUpload={handleFileUpload} />
```

### Paso 2: Validación con Gemini
```typescript
// api/process.ts - Paso 1
{
  "totalFloors": 4,
  "totalHeight": 12,
  "floorHeight": 3,
  "floorNames": ["Planta Baja", "Planta Primera", ...]
}
```

### Paso 3: Extracción Detallada
```typescript
// api/process.ts - Paso 2
{
  "projectInfo": { ... },
  "buildingLevels": [
    {
      "levelName": "Planta Baja",
      "elevation": 0,
      "areas": [...]
    }
  ]
}
```

### Paso 4: Renderizado 3D
```typescript
// src/services/buildingConverter.ts
convertBuildingToScene(buildingData) → SceneData
```

## Configuración

### Variables de Entorno

Crea un archivo `.env` con:

```bash
# API Key de Gemini (obligatorio)
GEMINI_API_KEY=tu_api_key_aqui

# Para el frontend (opcional)
VITE_GEMINI_API_KEY=tu_api_key_aqui
```

### Obtener API Key

1. Visita: https://makersuite.google.com/app/apikey
2. Crea un nuevo proyecto (si no tienes uno)
3. Genera una API Key
4. Copia y pega en `.env`

## Uso

### 1. Iniciar el proyecto

```bash
npm install
npm run dev
```

### 2. Subir un PDF

1. Abre la aplicación en el navegador
2. Haz clic en el área de carga o arrastra un PDF
3. Espera el procesamiento (puede tardar 10-30 segundos)
4. Visualiza el edificio en 3D

### 3. Datos de Ejemplo (Testing)

Si no tienes un PDF, puedes usar el botón "Visualizar ejemplo" que carga datos predefinidos.

## Archivos Clave

```
project/
├── api/
│   └── process.ts           # API de Vercel con Gemini
├── src/
│   ├── services/
│   │   ├── pdfProcessor.ts  # Cliente para llamar a la API
│   │   └── buildingConverter.ts  # Convierte JSON → 3D
│   ├── components/
│   │   └── Workspace.tsx    # UI principal
│   └── types/
│       └── building.ts      # Tipos TypeScript
└── .env                     # Variables de entorno
```

## Modelo de IA

**Gemini 2.5 Flash** (`gemini-2.5-flash`)

### ¿Por qué este modelo?

- ✅ **Rápido**: Respuestas en 5-15 segundos
- ✅ **Preciso**: Excelente comprensión de documentos técnicos
- ✅ **Multimodal**: Procesa PDFs con imágenes y texto
- ✅ **Económico**: Costo reducido por request

## Manejo de Errores

### Error: "No se pudo determinar el número de plantas"
- **Causa**: El PDF no contiene información clara de plantas
- **Solución**: Verifica que el PDF contenga planos arquitectónicos válidos

### Error: "Los datos extraídos no tienen el formato correcto"
- **Causa**: La estructura del JSON generado no coincide con `BuildingData`
- **Solución**: Revisa el PDF o ajusta los prompts en `api/process.ts`

### Error: "GEMINI_API_KEY is not configured"
- **Causa**: Falta la API key en las variables de entorno
- **Solución**: Agrega `GEMINI_API_KEY` en `.env`

## Mejoras Futuras

- [ ] Soporte para múltiples PDFs simultáneos
- [ ] Extracción de dimensiones exactas de áreas
- [ ] Detección automática de posiciones en planos
- [ ] Cache de PDFs procesados anteriormente
- [ ] Exportación de datos a diferentes formatos (JSON, IFC, etc.)

## Limitaciones

- Los PDFs deben contener planos arquitectónicos legibles
- Las superficies deben estar explícitas en el documento
- El sistema asume plantas de altura uniforme (3m por defecto)
- No procesa PDFs escaneados de baja calidad

## Soporte

Para problemas o preguntas, revisa:
1. Los logs del navegador (Console)
2. Los logs del servidor (`npm run server`)
3. La respuesta de Gemini en la consola del backend
