// Types for architectural building plans

export interface ProjectInfo {
  projectName: string;
  author?: string;
  director?: string;
  date?: string;
  location?: string;
}

export interface Door {
  width: number; // Ancho en metros
  position?: [number, number]; // Posición en el plano
  connectsTo?: string; // Nombre del área a la que conecta
  isExit?: boolean; // true si conecta con el exterior (salida de emergencia)
}

export interface Stair {
  name: string; // Nombre de la escalera
  position: [number, number]; // Posición en el plano [x, z]
  width?: number; // Ancho de la escalera
  connectsToLevel?: string; // Nivel al que conecta
}

export interface Area {
  name: string;
  surface: number | null; // null for areas without specific surface
  // Optional dimensions if available from PDF
  width?: number;
  length?: number;
  position?: [number, number]; // [x, z] position on the floor
  doors?: Door[]; // Puertas de esta área
}

export interface BuildingLevel {
  levelName: string;
  levelHeight?: number; // Height of this level in meters (default 3m)
  elevation?: number; // Elevation from ground level
  areas: Area[];
  stairs?: Stair[]; // Escaleras en este nivel
}

export interface ElectricalComponent {
  type: string;
  location: string;
  cable?: string;
}

export interface PlumbingDerivation {
  apartmentType: string;
  flow: number;
  pipeSize: string;
}

export interface Installations {
  electrical?: {
    name: string;
    components: ElectricalComponent[];
  };
  plumbing?: {
    name: string;
    apartmentDerivations: PlumbingDerivation[];
  };
  solar?: {
    name: string;
  };
  fireProtection?: {
    name: string;
  };
}

export interface BuildingData {
  projectInfo: ProjectInfo;
  buildingLevels: BuildingLevel[];
  installations?: Installations;
}

// 3D Scene representation (for Three.js rendering)
export interface SceneObject {
  id: string;
  type?: string; // Optional type identifier (e.g., 'door', 'wall', 'window')
  shape: 'box' | 'sphere' | 'cylinder';
  position: [number, number, number];
  size: [number, number, number?, number?]; // For cylinders: [radiusTop, radiusBottom, height, segments]
  color: string;
  label?: string; // Optional label for areas
}

export interface SceneData {
  objects: SceneObject[];
}

// Agent (Person) types for pathfinding simulation
export interface AgentProfile {
  id: string;
  name: string;
  speed: number; // m/s (velocidad de movimiento)
  color: string; // Color para visualización
  description?: string;
}

export interface Agent {
  id: string;
  profileId: string;
  position: [number, number, number]; // Posición actual [x, y, z]
  targetPosition?: [number, number, number]; // Objetivo
  path?: [number, number, number][]; // Trayectoria calculada
  pathHistory: [number, number, number][]; // Historial de posiciones visitadas
  levelIndex: number; // En qué nivel está
  isEvacuating: boolean;
  evacuated: boolean;
  evacuationTime?: number; // Tiempo en segundos hasta evacuar
}

// Predefined agent profiles
export const DEFAULT_AGENT_PROFILES: AgentProfile[] = [
  {
    id: 'adult-normal',
    name: 'Adulto Normal',
    speed: 1.4, // velocidad promedio de caminata
    color: '#3B82F6', // azul
    description: 'Persona adulta sin discapacidades'
  },
  {
    id: 'elderly',
    name: 'Adulto Mayor',
    speed: 0.8,
    color: '#F59E0B', // naranja
    description: 'Persona de la tercera edad con movilidad reducida'
  },
  {
    id: 'child',
    name: 'Niño',
    speed: 1.0,
    color: '#22C55E', // verde
    description: 'Niño o adolescente'
  },
  {
    id: 'disabled',
    name: 'Persona con Discapacidad',
    speed: 0.5,
    color: '#EF4444', // rojo
    description: 'Persona en silla de ruedas o con movilidad muy reducida'
  },
  {
    id: 'athletic',
    name: 'Atlético',
    speed: 2.0,
    color: '#8B5CF6', // púrpura
    description: 'Persona joven y atlética'
  }
];
