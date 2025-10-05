import { BuildingData, SceneData, SceneObject, BuildingLevel, Area } from '../types/building';

/**
 * Converts architectural building data from JSON to 3D scene objects
 * Creates floor representations without walls for pathfinding visualization
 */

// Default configuration
const DEFAULT_LEVEL_HEIGHT = 3; // meters
const FLOOR_THICKNESS = 0.1; // meters
const AREA_HEIGHT = 0.05; // height of area markers (very thin, just for visualization)

// Color palette for different area types
const AREA_COLORS: Record<string, string> = {
  parking: '#6B7280', // gray
  vivienda: '#3B82F6', // blue
  vestibulo: '#10B981', // green
  portal: '#8B5CF6', // purple
  sala: '#EF4444', // red
  trastero: '#F59E0B', // amber
  rellano: '#EC4899', // pink
  atico: '#14B8A6', // teal
  habitacion: '#6366F1', // indigo
  terrassa: '#22C55E', // light green
  default: '#94A3B8', // slate
};

/**
 * Determines the color for an area based on its name
 */
function getAreaColor(areaName: string): string {
  const lowerName = areaName.toLowerCase();

  for (const [key, color] of Object.entries(AREA_COLORS)) {
    if (lowerName.includes(key)) {
      return color;
    }
  }

  return AREA_COLORS.default;
}

/**
 * Estimates area dimensions from surface if not provided
 * Assumes roughly square areas if no specific dimensions given
 */
function estimateAreaDimensions(surface: number | null): { width: number; length: number } {
  if (!surface) {
    // Default small area if no surface provided
    return { width: 2, length: 2 };
  }

  // Estimate as square area, then apply slight variation
  const side = Math.sqrt(surface);
  const ratio = 1.2 + Math.random() * 0.6; // Random ratio between 1.2 and 1.8

  return {
    width: side * ratio,
    length: surface / (side * ratio),
  };
}

/**
 * Genera posiciones para áreas en una planta
 * Layout 2D inteligente: crea una distribución rectangular compacta
 */
function generateAreaPositions(areas: Area[], levelIndex: number): Area[] {
  // Si las áreas tienen posiciones definidas, usarlas
  const hasPositions = areas.some(area => area.position);

  if (hasPositions) {
    return areas.map(area => {
      if (area.position) return area;

      // Si falta posición, colocar en (0,0) temporalmente
      return { ...area, position: [0, 0] as [number, number] };
    });
  }

  // Layout 2D: distribuir áreas en un patrón rectangular
  // Calcular cuántas áreas por fila (aproximadamente cuadrado)
  const areasPerRow = Math.ceil(Math.sqrt(areas.length));

  let currentX = 0;
  let currentZ = 0;
  let maxHeightInRow = 0;
  let areasInCurrentRow = 0;

  return areas.map((area) => {
    const dimensions = area.width && area.length
      ? { width: area.width, length: area.length }
      : estimateAreaDimensions(area.surface);

    // Si alcanzamos el límite de áreas por fila, pasar a la siguiente fila
    if (areasInCurrentRow >= areasPerRow) {
      currentX = 0;
      currentZ += maxHeightInRow;
      maxHeightInRow = 0;
      areasInCurrentRow = 0;
    }

    // Posición del área (centrada en su espacio)
    const position: [number, number] = [
      currentX + dimensions.width / 2,
      currentZ + dimensions.length / 2
    ];

    // Actualizar posición X para la siguiente área
    currentX += dimensions.width;
    maxHeightInRow = Math.max(maxHeightInRow, dimensions.length);
    areasInCurrentRow++;

    return {
      ...area,
      position
    };
  });
}

/**
 * Converts a single building level to 3D objects
 */
function convertLevel(level: BuildingLevel, levelIndex: number): SceneObject[] {
  const objects: SceneObject[] = [];
  const levelHeight = level.elevation ?? (levelIndex * DEFAULT_LEVEL_HEIGHT);

  // Position areas on the floor
  const positionedAreas = generateAreaPositions(level.areas, levelIndex);

  // Create 3D objects for each area
  positionedAreas.forEach((area, areaIndex) => {
    const dimensions = area.width && area.length
      ? { width: area.width, length: area.length }
      : estimateAreaDimensions(area.surface);

    const position = area.position || [0, 0];
    const color = getAreaColor(area.name);

    // Create a thin box to represent the area (no walls, just floor space)
    objects.push({
      id: `level-${levelIndex}-area-${areaIndex}-${area.name}`,
      shape: 'box',
      position: [position[0], levelHeight + AREA_HEIGHT / 2, position[1]],
      size: [dimensions.width, AREA_HEIGHT, dimensions.length],
      color,
      label: `${area.name} (${area.surface ? area.surface.toFixed(2) + 'm²' : 'N/A'})`,
    });

    // Optional: Add small markers at corners for better visibility
    const markerSize = 0.15;
    const corners: [number, number][] = [
      [-dimensions.width / 2, -dimensions.length / 2],
      [dimensions.width / 2, -dimensions.length / 2],
      [-dimensions.width / 2, dimensions.length / 2],
      [dimensions.width / 2, dimensions.length / 2],
    ];

    corners.forEach((corner, cornerIndex) => {
      objects.push({
        id: `level-${levelIndex}-area-${areaIndex}-corner-${cornerIndex}`,
        shape: 'cylinder',
        position: [
          position[0] + corner[0],
          levelHeight,
          position[1] + corner[1],
        ],
        size: [markerSize, markerSize, AREA_HEIGHT * 2],
        color,
      });
    });

    // Create door objects (green for normal, red for exits)
    if (area.doors && area.doors.length > 0) {
      area.doors.forEach((door, doorIndex) => {
        // Default door dimensions
        const doorWidth = door.width || 0.8; // ancho de la puerta
        const doorHeight = 2.1; // altura estándar de puerta
        const doorThickness = 0.1; // grosor del marco

        // Color: rojo para salidas, verde para puertas normales
        const doorColor = door.isExit ? '#EF4444' : '#22c55e'; // Red for exits, Green for normal
        const doorType = door.isExit ? 'exit' : 'door';

        // Si la puerta tiene posición específica, usarla; si no, colocarla en el borde del área
        let doorPosition: [number, number, number];

        if (door.position) {
          doorPosition = [
            door.position[0],
            levelHeight + doorHeight / 2,
            door.position[1]
          ];
        } else {
          // Colocar puertas en el borde del área (distribuidas uniformemente)
          const edgeOffset = (doorIndex + 1) / (area.doors.length + 1);
          doorPosition = [
            position[0] + (dimensions.width / 2) * (edgeOffset * 2 - 1),
            levelHeight + doorHeight / 2,
            position[1] + dimensions.length / 2
          ];
        }

        objects.push({
          id: `level-${levelIndex}-area-${areaIndex}-door-${doorIndex}`,
          type: doorType,
          shape: 'box',
          position: doorPosition,
          size: [doorWidth, doorHeight, doorThickness],
          color: doorColor,
          label: door.isExit
            ? `🚪 SALIDA ${door.connectsTo ? '→ ' + door.connectsTo : ''}`
            : door.connectsTo ? `Puerta → ${door.connectsTo}` : 'Puerta',
        });
      });
    }
  });

  // Create stair objects (blue cylinders with height connecting levels)
  if (level.stairs && level.stairs.length > 0) {
    level.stairs.forEach((stair, stairIndex) => {
      const stairWidth = stair.width || 1.2; // ancho típico de escalera
      const stairHeight = level.levelHeight || DEFAULT_LEVEL_HEIGHT; // altura hasta el siguiente nivel

      objects.push({
        id: `level-${levelIndex}-stair-${stairIndex}`,
        type: 'stair',
        shape: 'cylinder',
        position: [
          stair.position[0],
          levelHeight + stairHeight / 2,
          stair.position[1]
        ],
        size: [stairWidth / 2, stairHeight, stairWidth / 2, 32], // radio, altura, radio, segmentos
        color: '#3B82F6', // Blue
        label: `🪜 ${stair.name}${stair.connectsToLevel ? ' → ' + stair.connectsToLevel : ''}`,
      });

      // Marcador en la base de la escalera
      objects.push({
        id: `level-${levelIndex}-stair-${stairIndex}-base`,
        type: 'stair-marker',
        shape: 'cylinder',
        position: [
          stair.position[0],
          levelHeight + 0.05,
          stair.position[1]
        ],
        size: [stairWidth * 0.7, 0.1, stairWidth * 0.7, 32],
        color: '#60A5FA', // Lighter blue
        label: `Base ${stair.name}`,
      });
    });
  }

  return objects;
}

/**
 * Main conversion function: BuildingData -> SceneData
 */
export function convertBuildingToScene(buildingData: BuildingData): SceneData {
  const objects: SceneObject[] = [];

  // Add a base ground plane for reference
  objects.push({
    id: 'ground-plane',
    shape: 'box',
    position: [0, -FLOOR_THICKNESS / 2, 0],
    size: [100, FLOOR_THICKNESS, 100],
    color: '#1E293B', // dark slate
    label: 'Ground',
  });

  // Convert each building level
  buildingData.buildingLevels.forEach((level, index) => {
    const levelObjects = convertLevel(level, index);
    objects.push(...levelObjects);

    // Indicador amarillo en el eje Z para cada planta
    const levelHeight = level.elevation ?? (index * DEFAULT_LEVEL_HEIGHT);
    const indicatorSize = 0.5; // 50cm de cuadrado

    objects.push({
      id: `level-${index}-indicator`,
      shape: 'box',
      position: [0, levelHeight, 0], // En el origen (0,0,Z)
      size: [indicatorSize, indicatorSize, indicatorSize],
      color: '#FBBF24', // Amarillo
      label: `${level.levelName} (${levelHeight.toFixed(2)}m)`,
    });
  });

  return { objects };
}

/**
 * Creates sample building data for testing
 */
export function createSampleBuildingData(): BuildingData {
  return {
    projectInfo: {
      projectName: "PROYECTO DE LAS INSTALACIONES DE UN EDIFICIO DESTINADO A VIVIENDAS",
      author: "JOSEP MARÍ JUAN",
      director: "JOSEP Mª DOMENECH MAS",
      date: "ENERO de 2010",
      location: "C/ Begur 57 i Piverd 4, Palafrugell",
    },
    buildingLevels: [
      {
        levelName: "Planta Baja-Parking",
        areas: [
          { name: "Parking 1", surface: 37.11 },
          { name: "Parking 2", surface: 89.87 },
          { name: "Trasteros", surface: 21.20 },
          { name: "Vestíbulo", surface: 32.10 },
          { name: "Portal", surface: 8.97 },
          { name: "Sala de Máquinas", surface: 6.73 },
        ],
      },
      {
        levelName: "Planta Primera",
        elevation: 3,
        areas: [
          { name: "Vivienda 1", surface: 48.29 },
          { name: "Vivienda 2", surface: 36.41 },
          { name: "Vivienda 3", surface: 34.73 },
          { name: "Vivienda 4", surface: 42.96 },
          { name: "Rellano 1ªP", surface: 9.12 },
        ],
      },
      {
        levelName: "Planta Segunda",
        elevation: 6,
        areas: [
          { name: "Vivienda 5", surface: 48.70 },
          { name: "Vivienda 6", surface: 36.51 },
          { name: "Vivienda 7", surface: 34.73 },
          { name: "Vivienda 8", surface: 43.75 },
          { name: "Rellano 2ªP", surface: 9.12 },
        ],
      },
      {
        levelName: "Planta Subcubierta",
        elevation: 9,
        areas: [
          { name: "Habitación 1 (V.5)", surface: 10.0 },
          { name: "Habitación 2 (V.5)", surface: 11.60 },
          { name: "Terrassa V.5", surface: 11.36 },
          { name: "Habitación 1 (V.8)", surface: 9.13 },
          { name: "Habitación 2 (V.8)", surface: 11.13 },
          { name: "Terrassa V.8", surface: 14.55 },
        ],
      },
    ],
  };
}
