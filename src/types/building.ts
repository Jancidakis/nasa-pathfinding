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
