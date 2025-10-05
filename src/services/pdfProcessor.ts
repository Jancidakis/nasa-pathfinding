import { BuildingData } from '../types/building';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as pdfjsLib from 'pdfjs-dist';

// Configurar worker de PDF.js desde node_modules
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface ValidationResult {
  totalFloors: number;
  totalHeight: number;
  floorHeight: number;
  floorNames: string[];
}

/**
 * Convierte un File a base64
 */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      // Remover el prefijo "data:application/pdf;base64,"
      const base64Data = base64.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Convierte un PDF a imágenes PNG (una por página)
 * Gemini analiza mejor imágenes que PDFs directos
 */
async function pdfToImages(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const images: string[] = [];

  console.log(`📄 Convirtiendo ${pdf.numPages} páginas a imágenes...`);

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 }); // Escala 2x para mejor calidad

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: context,
      viewport: viewport,
    }).promise;

    // Convertir canvas a base64 (PNG)
    const imageData = canvas.toDataURL('image/png');
    const base64Image = imageData.split(',')[1];
    images.push(base64Image);

    console.log(`✅ Página ${pageNum}/${pdf.numPages} convertida`);
  }

  return images;
}

/**
 * Limpia el JSON de markdown y texto extra
 */
function cleanJSON(text: string): string {
  return text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .replace(/^[^{]*/, '')
    .replace(/[^}]*$/, '')
    .trim();
}

/**
 * Procesa un archivo PDF usando Gemini para extraer información del edificio
 * TODO en el frontend, sin servidor
 */
export async function processPDFWithGemini(file: File): Promise<BuildingData> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('VITE_GEMINI_API_KEY no está configurado en .env');
  }

  try {
    console.log('📄 Procesando PDF:', file.name);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

    // Convertir PDF a imágenes para mejor análisis
    const images = await pdfToImages(file);
    console.log(`🖼️ PDF convertido a ${images.length} imágenes`);

    // PASO 1: Validar estructura del edificio
    console.log('🔍 Paso 1: Validando altura y número de plantas...');

    const validationPrompt = `
Eres un experto en planos arquitectónicos mexicanos. Analiza este PDF de planos arquitectónicos.

IMPORTANTE: Busca información de niveles en:
- Nomenclatura NPT (Nivel Piso Terminado): NPT+0.00, NPT+2.80, NPT+5.55, etc.
- Nombres de plantas en títulos: "PLANTA ARQUITECTÓNICA NIVEL 1", "NIVEL 2", "NIVEL AZOTEA", etc.
- Cortes transversales que muestran alturas totales
- Cuadros de nomenclatura o notas generales

TAREA: Extrae la información básica del edificio:

PASOS:
1. Identifica TODOS los niveles mencionados en el plano (busca "NIVEL", "PLANTA", "NPT")
2. Para cada nivel, anota su elevación en metros (ej: NPT+2.80 = 2.80m)
3. Calcula la altura entre niveles
4. Determina la altura total del edificio

Devuelve SOLO este JSON (sin markdown, sin explicaciones):
{
  "totalFloors": 3,
  "totalHeight": 6.30,
  "floorHeight": 2.80,
  "floorNames": ["Nivel 1", "Nivel 2", "Nivel Azotea"]
}

REGLAS ESTRICTAS:
- NO inventes datos
- Si no encuentras un dato, usa null
- Las alturas deben estar en metros (sin unidades en el JSON)
- Cuenta SOLO plantas habitables (no incluir cimentación o plafones)
`;

    // Preparar imágenes para enviar a Gemini
    const imageParts = images.map(imageBase64 => ({
      inlineData: {
        data: imageBase64,
        mimeType: 'image/png',
      },
    }));

    const validationResult = await model.generateContent([
      validationPrompt,
      ...imageParts,
    ]);

    const validationText = cleanJSON(validationResult.response.text());
    const validation: ValidationResult = JSON.parse(validationText);

    console.log('✅ Validación exitosa:', validation);

    if (!validation.totalFloors || validation.totalFloors < 1) {
      throw new Error('No se pudo determinar el número de plantas del edificio');
    }

    // PASO 2: Extraer información detallada
    console.log('📋 Paso 2: Extrayendo información detallada...');

    const detailPrompt = `
Eres un experto en planos arquitectónicos mexicanos.

CONTEXTO VERIFICADO:
- Edificio con ${validation.totalFloors} niveles
- Altura total: ${validation.totalHeight}m
- Niveles: ${validation.floorNames.join(', ')}

TAREA: Extrae TODA la información del edificio en formato JSON.

INSTRUCCIONES POR SECCIÓN:

1. PROJECT INFO (busca en encabezados/cuadros de títulos):
   - "PROYECTO:" o "CONTENIDO:"
   - "PROPIETARIO:"
   - Fecha (FECHA:)
   - Ubicación (UBICACIÓN:)
   - Autor/Diseñador

2. BUILDING LEVELS (para cada nivel):

   a) Identifica el nombre del nivel (ej: "Nivel 1", "Nivel 2", "nivel 3" "Nivel Azotea")

   b) Extrae elevación del NPT:
      - Busca "NPT+X.XX" en las plantas
      - NPT+0.00 = elevación 0
      - NPT+2.80 = elevación 2.80

   c) Para CADA NIVEL, identifica TODAS las áreas/espacios CON SUS POSICIONES:
      - Nombres comunes: RECÁMARA, BAÑO, COCINA, SALA, COMEDOR, LAVANDERÍA,
        TERRAZA, VACÍO, ESCALERA, EXTERIOR, etc.
      - Las áreas suelen tener etiquetas en el plano
      - Busca superficies en m² cerca de cada área
      - **CRÍTICO**: Detecta la posición aproximada (X, Z) de cada área en el plano
      - Observa cómo están distribuidas las habitaciones (¿están lado a lado? ¿en forma de L? ¿cuadrado?)
      - Ancho típico del plano en el PDF: ~10-20 metros
      - Si hay dimensiones en el plano (3.200m, 9.600m, etc.), úsalas para calcular posiciones

   d) DETECTAR PUERTAS (CRÍTICO PARA PATHFINDING):
      - Busca símbolos de puertas en el plano (líneas curvas, rectángulos con apertura)
      - Ancho típico de puertas: 0.70m, 0.80m, 0.90m, 1.00m
      - Identifica a qué áreas conecta cada puerta
      - Si no se puede determinar el ancho, usa 0.80m como default

   e) NO incluyas elementos estructurales como áreas (vigas, columnas, muros)

3. FORMATO DE SALIDA:

{
  "projectInfo": {
    "projectName": "nombre exacto del proyecto",
    "author": "autor si está disponible",
    "director": "director si está disponible",
    "date": "fecha si está disponible",
    "location": "ubicación si está disponible"
  },
  "buildingLevels": [
    {
      "levelName": "Nivel 1",
      "elevation": 0,
      "levelHeight": ${validation.floorHeight},
      "areas": [
        {
          "name": "RECÁMARA PRINCIPAL",
          "surface": 12.50,
          "width": 3.5,
          "length": 3.57,
          "position": [5.0, 0.0],
          "doors": [
            {
              "width": 0.80,
              "position": null,
              "connectsTo": "SALA"
            }
          ]
        },
        {
          "name": "BAÑO",
          "surface": 4.0,
          "width": 2.0,
          "length": 2.0,
          "position": [8.5, 0.0],
          "doors": [
            {
              "width": 0.70,
              "position": null,
              "connectsTo": "RECÁMARA PRINCIPAL"
            }
          ]
        }
      ]
    }
  ]
}

REGLAS CRÍTICAS:
✓ Devuelve SOLO JSON válido (sin \`\`\`json, sin texto adicional)
✓ Incluye TODAS las ${validation.totalFloors} plantas
✓ Para cada planta, lista TODAS las áreas visibles
✓ Superficies en número (sin "m²")
✓ Si no hay superficie, usa null
✓ Si no encuentras información, usa null (NO inventes)
✓ Nombres de áreas en mayúsculas como aparecen en el plano
✓ NO incluyas elementos decorativos o estructurales como áreas
`;

    const detailResult = await model.generateContent([
      detailPrompt,
      ...imageParts,
    ]);

    const detailText = cleanJSON(detailResult.response.text());
    const buildingData: BuildingData = JSON.parse(detailText);

    console.log('✅ Edificio procesado:', {
      proyecto: buildingData.projectInfo.projectName,
      niveles: buildingData.buildingLevels.length,
      totalAreas: buildingData.buildingLevels.reduce((sum, level) => sum + level.areas.length, 0)
    });

    return buildingData;
  } catch (error) {
    console.error('❌ Error procesando PDF:', error);
    throw error;
  }
}

/**
 * Valida que el BuildingData tenga la estructura correcta
 */
export function validateBuildingData(data: BuildingData): boolean {
  if (!data.projectInfo || !data.projectInfo.projectName) {
    return false;
  }

  if (!data.buildingLevels || data.buildingLevels.length === 0) {
    return false;
  }

  // Verificar que cada nivel tenga áreas
  for (const level of data.buildingLevels) {
    if (!level.levelName || !level.areas || level.areas.length === 0) {
      return false;
    }
  }

  return true;
}
