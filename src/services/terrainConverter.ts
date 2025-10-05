import { SceneData, SceneObject } from '../types/building';
import { GeoJsonData, GeoJsonFeature } from '../components/Workspace';

/**
 * Convierte GeoJSON de terreno a objetos 3D para el visor
 * Los SVG de TopoExport contienen polígonos y polilíneas con coordenadas
 */

const TERRAIN_HEIGHT = 0.5; // Altura del terreno renderizado (50cm)
const TERRAIN_COLOR = '#8B4513'; // Color marrón para el terreno
const CONTOUR_COLOR = '#654321'; // Color más oscuro para líneas de contorno
const SCALE_FACTOR = 1.0; // Sin escala: 1 unidad SVG = 1 metro en 3D (escala real)

/**
 * Calcula el centro del terreno para centrar todo en el origen
 */
function calculateTerrainCenter(features: GeoJsonFeature[]): [number, number] {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  features.forEach(feature => {
    let coords: number[][];
    if (feature.geometry.type === 'Polygon') {
      coords = feature.geometry.coordinates[0] as number[][];
    } else {
      coords = feature.geometry.coordinates as number[][];
    }

    coords.forEach(([x, y]) => {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });
  });

  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

/**
 * Convierte coordenadas SVG a coordenadas 3D
 * SVG usa Y hacia abajo, 3D usa Y hacia arriba
 */
function svgTo3D(svgCoords: [number, number], elevation: number = 0, center: [number, number] = [0, 0]): [number, number, number] {
  return [
    (svgCoords[0] - center[0]) * SCALE_FACTOR,
    elevation,
    -(svgCoords[1] - center[1]) * SCALE_FACTOR // Invertir Y para coordenadas 3D
  ];
}

/**
 * Calcula el centroide de un polígono
 */
function calculateCentroid(coordinates: number[][]): [number, number] {
  const sum = coordinates.reduce(
    (acc, point) => [acc[0] + point[0], acc[1] + point[1]],
    [0, 0]
  );
  return [sum[0] / coordinates.length, sum[1] / coordinates.length];
}

/**
 * Calcula las dimensiones de un bounding box
 */
function calculateBounds(coordinates: number[][]): { width: number; length: number; center: [number, number] } {
  if (coordinates.length === 0) {
    return { width: 1, length: 1, center: [0, 0] };
  }

  const xs = coordinates.map(p => p[0]).filter(x => !isNaN(x));
  const ys = coordinates.map(p => p[1]).filter(y => !isNaN(y));

  if (xs.length === 0 || ys.length === 0) {
    return { width: 1, length: 1, center: [0, 0] };
  }

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const width = (maxX - minX) * SCALE_FACTOR;
  const length = (maxY - minY) * SCALE_FACTOR;

  return {
    width: width > 0 ? width : 0.1, // Mínimo 10cm
    length: length > 0 ? length : 0.1,
    center: [(minX + maxX) / 2, (minY + maxY) / 2]
  };
}

/**
 * Convierte una feature de polígono a un objeto 3D
 */
function convertPolygonFeature(feature: GeoJsonFeature, index: number, center: [number, number]): SceneObject | null {
  const coordinates = feature.geometry.coordinates[0] as number[][]; // Primer anillo del polígono

  if (!coordinates || coordinates.length < 3) {
    console.warn(`Polígono ${index} inválido: no tiene suficientes coordenadas`);
    return null;
  }

  const bounds = calculateBounds(coordinates);
  const center3D = svgTo3D(bounds.center, TERRAIN_HEIGHT / 2, center);

  // Validar que no haya NaN
  if (isNaN(center3D[0]) || isNaN(center3D[2]) || isNaN(bounds.width) || isNaN(bounds.length)) {
    console.warn(`Polígono ${index} generó valores NaN, omitiendo`);
    return null;
  }

  // Extraer elevación de las propiedades si está disponible
  const elevation = feature.properties?.elevation || 0;

  // Añadir pequeña variación en Y para evitar z-fighting (basado en el índice)
  const yOffset = (index * 0.001) % 0.1; // Varía entre 0 y 10cm

  return {
    id: `terrain-polygon-${index}`,
    type: 'terrain',
    shape: 'box',
    position: [center3D[0], elevation + TERRAIN_HEIGHT / 2 + yOffset, center3D[2]],
    size: [bounds.width, TERRAIN_HEIGHT, bounds.length],
    color: TERRAIN_COLOR,
    label: feature.properties?.name || feature.properties?.id || `Terreno ${index + 1}`,
  };
}

/**
 * Convierte una feature de línea a una caja alargada (más eficiente que múltiples esferas)
 * Solo crea un objeto por cada segmento largo
 */
function convertLineFeature(feature: GeoJsonFeature, index: number, center: [number, number]): SceneObject[] {
  const coordinates = feature.geometry.coordinates as number[][];
  const objects: SceneObject[] = [];
  const lineHeight = 0.3; // Altura de la línea
  const lineThickness = 0.2; // Grosor de la línea

  // Simplificar: solo tomar cada N puntos para reducir objetos
  const simplificationFactor = Math.max(1, Math.floor(coordinates.length / 20)); // Máximo 20 segmentos por línea

  for (let i = 0; i < coordinates.length - 1; i += simplificationFactor) {
    const start = svgTo3D([coordinates[i][0], coordinates[i][1]], lineHeight, center);
    const nextIndex = Math.min(i + simplificationFactor, coordinates.length - 1);
    const end = svgTo3D([coordinates[nextIndex][0], coordinates[nextIndex][1]], lineHeight, center);

    const dx = end[0] - start[0];
    const dz = end[2] - start[2];
    const length = Math.sqrt(dx * dx + dz * dz);

    if (length < 0.1) continue; // Ignorar segmentos muy pequeños

    const midX = (start[0] + end[0]) / 2;
    const midZ = (start[2] + end[2]) / 2;

    objects.push({
      id: `terrain-line-${index}-seg-${i}`,
      type: 'contour',
      shape: 'box',
      position: [midX, lineHeight, midZ],
      size: [length, lineThickness, lineThickness],
      color: CONTOUR_COLOR,
    });
  }

  return objects;
}

/**
 * Función principal: convierte GeoJSON completo a SceneData
 */
export function convertTerrainToScene(geoJson: GeoJsonData): SceneData {
  const objects: SceneObject[] = [];

  // Calcular centro del terreno para centrar en el origen
  const center = calculateTerrainCenter(geoJson.features);
  console.log(`📍 Centro del terreno: [${center[0].toFixed(2)}, ${center[1].toFixed(2)}]`);

  // Solo procesar polígonos por ahora (ignorar líneas para evitar problemas de rendimiento)
  geoJson.features.forEach((feature, index) => {
    if (feature.geometry.type === 'Polygon') {
      try {
        const obj = convertPolygonFeature(feature, index, center);
        if (obj) {
          objects.push(obj);
        }
      } catch (err) {
        console.warn(`⚠️ Error procesando polígono ${index}:`, err);
      }
    }
    // Ignorar LineString por ahora - causan problemas de rendimiento
  });

  console.log(`🗺️ Terreno convertido: ${objects.length} polígonos generados (centrado en origen)`);

  // Debug: mostrar info de algunos objetos
  if (objects.length > 0) {
    const first = objects[0];
    const mid = objects[Math.floor(objects.length / 2)];
    const last = objects[objects.length - 1];

    console.log(`📦 Primer objeto: pos=[${first.position.map(v => v.toFixed(2)).join(', ')}], size=[${first.size.map(v => v.toFixed(2)).join(', ')}]`);
    console.log(`📦 Objeto medio: pos=[${mid.position.map(v => v.toFixed(2)).join(', ')}], size=[${mid.size.map(v => v.toFixed(2)).join(', ')}]`);
    console.log(`📦 Último objeto: pos=[${last.position.map(v => v.toFixed(2)).join(', ')}], size=[${last.size.map(v => v.toFixed(2)).join(', ')}]`);
  }

  return { objects };
}
