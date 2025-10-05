import { BuildingData, Agent } from '../types/building';

/**
 * Nodo para el algoritmo A*
 */
interface PathNode {
  x: number;
  z: number;
  level: number;
  g: number; // Costo desde el inicio
  h: number; // Heurística al objetivo
  f: number; // g + h
  parent?: PathNode;
}

/**
 * Calcula distancia euclidiana entre dos puntos 3D
 */
function distance3D(
  p1: [number, number, number],
  p2: [number, number, number]
): number {
  const dx = p1[0] - p2[0];
  const dy = p1[1] - p2[1];
  const dz = p1[2] - p2[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Encuentra la salida más cercana para un agente
 */
export function findNearestExit(
  agent: Agent,
  buildingData: BuildingData
): [number, number, number] | null {
  const level = buildingData.buildingLevels[agent.levelIndex];
  if (!level) return null;

  let nearestExit: [number, number, number] | null = null;
  let minDistance = Infinity;

  // Buscar puertas de salida en todas las áreas del nivel actual
  level.areas.forEach(area => {
    if (!area.doors || !area.position) return;

    area.doors.forEach(door => {
      if (door.isExit) {
        // Posición de la salida (en el borde del área)
        const exitPos: [number, number, number] = [
          area.position![0],
          (level.elevation || 0) + 0.5,
          area.position![1]
        ];

        const dist = distance3D(agent.position, exitPos);
        if (dist < minDistance) {
          minDistance = dist;
          nearestExit = exitPos;
        }
      }
    });
  });

  return nearestExit;
}

/**
 * Estructura de grafo de navegación
 */
export interface NavNode {
  areaIndex: number;
  position: [number, number, number];
  isDoor?: boolean;
  isExit?: boolean;
}

export interface NavGraph {
  nodes: NavNode[];
  edges: Map<number, number[]>; // nodeIndex -> connected nodeIndexes
}

/**
 * Construye un grafo de navegación basado en áreas y puertas
 */
export function buildNavigationGraph(
  buildingData: BuildingData,
  levelIndex: number
): NavGraph {
  const level = buildingData.buildingLevels[levelIndex];
  if (!level) return { nodes: [], edges: new Map() };

  const nodes: NavNode[] = [];
  const edges = new Map<number, number[]>();

  // Crear nodos para cada área (centro del área)
  level.areas.forEach((area, areaIndex) => {
    if (!area.position) return;

    const areaCenter: [number, number, number] = [
      area.position[0],
      (level.elevation || 0) + 0.5,
      area.position[1]
    ];

    nodes.push({
      areaIndex,
      position: areaCenter,
    });
  });

  // Crear nodos para cada puerta y conectarlas con sus áreas
  level.areas.forEach((area, areaIndex) => {
    if (!area.doors || !area.position) return;

    area.doors.forEach((door, doorIndex) => {
      // Posición de la puerta
      let doorPosition: [number, number, number];
      if (door.position) {
        doorPosition = [door.position[0], (level.elevation || 0) + 0.5, door.position[1]];
      } else {
        // Usar posición del borde del área
        const dimensions = {
          width: area.width || 2,
          length: area.length || 2
        };
        const edgeOffset = (doorIndex + 1) / ((area.doors?.length || 1) + 1);
        doorPosition = [
          area.position[0] + (dimensions.width / 2) * (edgeOffset * 2 - 1),
          (level.elevation || 0) + 0.5,
          area.position[1] + dimensions.length / 2
        ];
      }

      const doorNodeIndex = nodes.length;
      nodes.push({
        areaIndex,
        position: doorPosition,
        isDoor: true,
        isExit: door.isExit
      });

      // Conectar puerta con centro del área actual
      const areaNodeIndex = areaIndex;
      if (!edges.has(areaNodeIndex)) edges.set(areaNodeIndex, []);
      if (!edges.has(doorNodeIndex)) edges.set(doorNodeIndex, []);

      edges.get(areaNodeIndex)!.push(doorNodeIndex);
      edges.get(doorNodeIndex)!.push(areaNodeIndex);

      // Si la puerta conecta con otra área, buscar esa área y conectar
      if (door.connectsTo && !door.isExit) {
        const targetAreaIndex = level.areas.findIndex(a =>
          a.name.toLowerCase().includes(door.connectsTo!.toLowerCase())
        );
        if (targetAreaIndex !== -1 && targetAreaIndex !== areaIndex) {
          if (!edges.has(doorNodeIndex)) edges.set(doorNodeIndex, []);
          edges.get(doorNodeIndex)!.push(targetAreaIndex);

          if (!edges.has(targetAreaIndex)) edges.set(targetAreaIndex, []);
          edges.get(targetAreaIndex)!.push(doorNodeIndex);
        }
      }
    });
  });

  return { nodes, edges };
}

/**
 * Encuentra el nodo más cercano a una posición
 */
function findNearestNode(
  position: [number, number, number],
  nodes: NavNode[]
): number {
  let minDist = Infinity;
  let nearestIndex = 0;

  nodes.forEach((node, index) => {
    const dist = distance3D(position, node.position);
    if (dist < minDist) {
      minDist = dist;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

/**
 * A* pathfinding en el grafo de navegación
 */
function aStar(
  startNodeIndex: number,
  goalNodeIndex: number,
  graph: NavGraph
): number[] {
  const openSet = new Set([startNodeIndex]);
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>();
  const fScore = new Map<number, number>();

  gScore.set(startNodeIndex, 0);
  fScore.set(startNodeIndex, distance3D(
    graph.nodes[startNodeIndex].position,
    graph.nodes[goalNodeIndex].position
  ));

  while (openSet.size > 0) {
    // Encontrar nodo con menor fScore
    let current = -1;
    let minF = Infinity;
    openSet.forEach(nodeIndex => {
      const f = fScore.get(nodeIndex) || Infinity;
      if (f < minF) {
        minF = f;
        current = nodeIndex;
      }
    });

    if (current === goalNodeIndex) {
      // Reconstruir path
      const path: number[] = [current];
      while (cameFrom.has(current)) {
        current = cameFrom.get(current)!;
        path.unshift(current);
      }
      return path;
    }

    openSet.delete(current);

    // Explorar vecinos
    const neighbors = graph.edges.get(current) || [];
    neighbors.forEach(neighbor => {
      const tentativeGScore = (gScore.get(current) || Infinity) +
        distance3D(graph.nodes[current].position, graph.nodes[neighbor].position);

      if (tentativeGScore < (gScore.get(neighbor) || Infinity)) {
        cameFrom.set(neighbor, current);
        gScore.set(neighbor, tentativeGScore);
        fScore.set(neighbor, tentativeGScore + distance3D(
          graph.nodes[neighbor].position,
          graph.nodes[goalNodeIndex].position
        ));

        openSet.add(neighbor);
      }
    });
  }

  // No se encontró path
  return [];
}

/**
 * Pathfinding realista usando navegación por puertas
 */
export function calculatePath(
  start: [number, number, number],
  end: [number, number, number],
  buildingData: BuildingData,
  navGraph?: NavGraph
): [number, number, number][] {
  // Determinar nivel
  const levelIndex = buildingData.buildingLevels.findIndex(level => {
    const elevation = level.elevation || 0;
    return Math.abs(start[1] - elevation - 0.5) < 1.5; // Tolerancia de 1.5m
  });

  if (levelIndex === -1) {
    // Fallback: línea recta
    return straightLinePath(start, end, 10);
  }

  // Construir grafo de navegación si no se proporciona
  const graph = navGraph || buildNavigationGraph(buildingData, levelIndex);

  if (graph.nodes.length === 0) {
    return straightLinePath(start, end, 10);
  }

  // Encontrar nodos más cercanos
  const startNodeIndex = findNearestNode(start, graph.nodes);
  const endNodeIndex = findNearestNode(end, graph.nodes);

  // Ejecutar A*
  const nodePath = aStar(startNodeIndex, endNodeIndex, graph);

  if (nodePath.length === 0) {
    return straightLinePath(start, end, 10);
  }

  // Convertir path de nodos a waypoints 3D
  const path: [number, number, number][] = [start];

  nodePath.forEach(nodeIndex => {
    path.push(graph.nodes[nodeIndex].position);
  });

  path.push(end);

  return path;
}

/**
 * Fallback: línea recta con waypoints
 */
function straightLinePath(
  start: [number, number, number],
  end: [number, number, number],
  steps: number
): [number, number, number][] {
  const path: [number, number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = start[0] + (end[0] - start[0]) * t;
    const y = start[1] + (end[1] - start[1]) * t;
    const z = start[2] + (end[2] - start[2]) * t;
    path.push([x, y, z]);
  }
  return path;
}

/**
 * Genera una posición aleatoria dentro de un área válida del edificio
 */
export function generateRandomPosition(
  buildingData: BuildingData,
  levelIndex: number
): [number, number, number] | null {
  const level = buildingData.buildingLevels[levelIndex];
  if (!level || level.areas.length === 0) return null;

  // Elegir área aleatoria
  const randomArea = level.areas[Math.floor(Math.random() * level.areas.length)];

  if (!randomArea.position) return null;

  const width = randomArea.width || 2;
  const length = randomArea.length || 2;

  // Posición aleatoria dentro del área (con margen)
  const margin = 0.5;
  const x = randomArea.position[0] + (Math.random() - 0.5) * (width - margin * 2);
  const z = randomArea.position[1] + (Math.random() - 0.5) * (length - margin * 2);
  const y = (level.elevation || 0) + 0.5; // 50cm sobre el suelo

  return [x, y, z];
}

/**
 * Mueve un agente un paso a lo largo de su path
 */
export function moveAgent(
  agent: Agent,
  deltaTime: number, // segundos
  profiles: any[]
): Agent {
  if (!agent.path || agent.path.length === 0 || agent.evacuated) {
    return agent;
  }

  const profile = profiles.find(p => p.id === agent.profileId);
  if (!profile) return agent;

  const speed = profile.speed; // m/s
  const distanceToMove = speed * deltaTime;

  const target = agent.path[0];
  const currentDist = distance3D(agent.position, target);

  if (currentDist <= distanceToMove) {
    // Alcanzó el waypoint, pasar al siguiente
    const newPosition = target;
    const newPath = agent.path.slice(1);

    // Agregar posición al historial
    const newHistory = [...agent.pathHistory, newPosition];

    // Verificar si llegó a la salida
    const evacuated = newPath.length === 0;

    return {
      ...agent,
      position: newPosition,
      path: newPath,
      pathHistory: newHistory,
      evacuated,
      evacuationTime: evacuated ? (agent.evacuationTime || 0) : undefined
    };
  } else {
    // Moverse hacia el waypoint
    const ratio = distanceToMove / currentDist;
    const newX = agent.position[0] + (target[0] - agent.position[0]) * ratio;
    const newY = agent.position[1] + (target[1] - agent.position[1]) * ratio;
    const newZ = agent.position[2] + (target[2] - agent.position[2]) * ratio;

    return {
      ...agent,
      position: [newX, newY, newZ],
    };
  }
}
