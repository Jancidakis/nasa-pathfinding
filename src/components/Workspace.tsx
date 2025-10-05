import { useState, useEffect, useRef } from 'react';
import { LogOut, Upload, Eye, TestTube, Save, FolderOpen, Trash2, FileJson, PlusSquare, X, Map } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import UploadStep from './steps/UploadStep';
import { Viewer } from './Viewer';
import { SceneData, BuildingData, SceneObject, Agent, AgentProfile, DEFAULT_AGENT_PROFILES } from '../types/building';
import { convertBuildingToScene } from '../services/buildingConverter';
import { db } from '../config/firebase';
import { ref, set, push, onValue, remove } from 'firebase/database';

// GeoJSON basic types for terrain
export interface GeoJsonFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon' | 'LineString';
    coordinates: any;
  };
  properties: Record<string, any>;
}

export interface GeoJsonData {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

type Step = 'upload' | 'visualization' | 'simulation';

interface UserFile {
  id: string;
  fileName: string;
  createdAt: string;
  buildingData: BuildingData;
}

export default function Workspace() {
  const { user, logout } = useAuth();
  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [sceneData, setSceneData] = useState<SceneData>({ objects: [] });
  const [buildingData, setBuildingData] = useState<BuildingData | null>(null); // Represents the LAST loaded building
  const [terrainData, setTerrainData] = useState<GeoJsonData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for hidden file inputs
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const svgInputRef = useRef<HTMLInputElement>(null);

  // State for placement mode
  const [placementModeData, setPlacementModeData] = useState<SceneData | null>(null);

  // State for multi-model logic
  const [isModalOpen, setIsModalOpen] = useState(false);

  // State for Firebase interaction
  const [fileName, setFileName] = useState('');
  const [userFiles, setUserFiles] = useState<UserFile[]>([]);
  const [showFileBrowser, setShowFileBrowser] = useState(false);

  // State for agents/pathfinding
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>('adult-normal');
  const [isSimulating, setIsSimulating] = useState(false);

  // --- Core Scene & Model Logic ---

  const clearScene = () => {
    setSceneData({ objects: [] });
    setBuildingData(null);
    setTerrainData(null);
    setError(null);
  };

  const addModelToScene = (data: BuildingData, position?: [number, number, number]) => {
    try {
      const scene = convertBuildingToScene(data);
      const offset = position || [0, 0, 0];

      const offsetSceneObjects = scene.objects.map(obj => ({
        ...obj,
        position: [obj.position[0] + offset[0], obj.position[1] + offset[1], obj.position[2] + offset[2]] as [number, number, number],
      }));

      setSceneData(prev => ({ objects: [...prev.objects, ...offsetSceneObjects] }));
      setBuildingData(data); // Keep track of the latest loaded model for saving/downloading
      setCurrentStep('visualization');
    } catch (err) {
      console.error("Error converting building to scene:", err);
      setError("No se pudo procesar el modelo para la visualización.");
    }
  };

  const handlePlaceModel = (position: [number, number, number]) => {
    if (!placementModeData) return;

    const offsetSceneObjects = placementModeData.objects.map(obj => ({
      ...obj,
      position: [obj.position[0] + position[0], obj.position[1] + position[1], obj.position[2] + position[2]] as [number, number, number],
    }));

    setSceneData(prev => ({ objects: [...prev.objects, ...offsetSceneObjects] }));
    setPlacementModeData(null); // Exit placement mode
  };


  // --- Firebase Logic ---

  useEffect(() => {
    if (!user) return;
    const filesRef = ref(db, `userFiles/${user.uid}`);
    const unsubscribe = onValue(filesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const filesList = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setUserFiles(filesList);
      } else {
        setUserFiles([]);
      }
    });
    return () => unsubscribe();
  }, [user]);

  const handleSaveToFirebase = async () => {
    if (!user || !buildingData) {
      setError("No hay datos del último modelo para guardar o no has iniciado sesión.");
      return;
    }
    if (!fileName.trim()) {
      setError("Por favor, dale un nombre al archivo.");
      return;
    }
    setIsLoading(true);
    try {
      const userFilesRef = ref(db, `userFiles/${user.uid}`);
      const newFileRef = push(userFilesRef);
      await set(newFileRef, {
        fileName: fileName.trim(),
        buildingData: buildingData,
        createdAt: new Date().toISOString(),
      });
      setFileName('');
    } catch (err) {
      console.error("Error guardando en Firebase:", err);
      setError(err instanceof Error ? err.message : "No se pudo guardar el archivo.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadFromFirebase = (file: UserFile) => {
    // Enter placement mode with the selected model's data
    const scene = convertBuildingToScene(file.buildingData);
    setPlacementModeData(scene);
    setBuildingData(file.buildingData); // Also set as last loaded model
    setIsModalOpen(false);
    setCurrentStep('visualization');
  };

  const handleDeleteFromFirebase = async (fileId: string) => {
    if (!user) return;
    if (!window.confirm("¿Estás seguro de que quieres borrar este archivo?")) return;
    try {
      const fileRef = ref(db, `userFiles/${user.uid}/${fileId}`);
      await remove(fileRef);
    } catch (err) {
      console.error("Error borrando archivo:", err);
      setError("No se pudo borrar el archivo.");
    }
  };

  // --- Agent/Pathfinding Handlers ---

  const handleAddAgent = async () => {
    if (!sceneData) {
      setError('Primero carga un edificio para poder añadir personas.');
      return;
    }

    // Find a random floor area from the scene objects
    const floorAreas = sceneData.objects.filter(
      obj => obj.shape === 'box' && obj.id.includes('-area-')
    );

    if (floorAreas.length === 0) {
      setError('No se encontraron áreas de piso válidas en la escena para añadir agentes.');
      return;
    }

    const randomAreaObject = floorAreas[Math.floor(Math.random() * floorAreas.length)];
    const { position, size } = randomAreaObject;

    // The size array is [width, height, depth] for a box
    const width = size[0];
    const depth = size[2]!;

    // Generate a random point within this area's box, with a small margin
    const margin = 0.5; // Keep agents away from the very edge
    const randomX = position[0] + (Math.random() - 0.5) * (width - margin);
    const randomZ = position[2] + (Math.random() - 0.5) * (depth - margin);
    const y = position[1]; // Y should be on the floor surface

    const agentPosition: [number, number, number] = [randomX, y, randomZ];

    // Extract level index from the object's ID (e.g., "level-1-area-...")
    const idParts = randomAreaObject.id.split('-');
    const levelIndex = idParts.length > 1 ? parseInt(idParts[1], 10) : 0;

    if (isNaN(levelIndex)) {
        setError('No se pudo determinar el nivel para el agente desde el ID del objeto.');
        return;
    }

    const newAgent: Agent = {
      id: `agent-${Date.now()}`,
      profileId: selectedProfile,
      position: agentPosition,
      pathHistory: [agentPosition],
      levelIndex: levelIndex,
      isEvacuating: false,
      evacuated: false,
    };

    setAgents(prev => [...prev, newAgent]);
    console.log(`👤 Agente añadido en nivel ${levelIndex} en el área ${randomAreaObject.label}`);
  };

  const handleStartEvacuation = async () => {
    if (!buildingData || agents.length === 0) {
      setError('Necesitas edificio y agentes para iniciar evacuación');
      return;
    }

    setIsSimulating(true);
    const { findNearestExit, calculatePath, buildNavigationGraph } = await import('../services/pathfinding');

    // Build navigation graphs once per level to avoid re-computation for each agent
    const navGraphs = new Map<number, any>(); // Using 'any' for NavGraph type from pathfinding
    buildingData.buildingLevels.forEach((_, levelIndex) => {
      const graph = buildNavigationGraph(buildingData, levelIndex);
      navGraphs.set(levelIndex, graph);
    });

    // Calculate paths for all agents using the pre-built graphs
    const updatedAgents = agents.map(agent => {
      if (agent.evacuated) return agent;

      const exit = findNearestExit(agent, buildingData);
      if (!exit) {
        console.warn(`No exit found for agent ${agent.id} on level ${agent.levelIndex}`);
        return agent;
      }

      // Get the correct graph for the agent's level
      const agentGraph = navGraphs.get(agent.levelIndex);
      if (!agentGraph) {
        console.error(`Could not find navigation graph for level ${agent.levelIndex}`);
        return agent;
      }

      const path = calculatePath(agent.position, exit, buildingData, agentGraph);

      return {
        ...agent,
        isEvacuating: true,
        targetPosition: exit,
        path,
      };
    });

    setAgents(updatedAgents);
    console.log(`🚨 Evacuación iniciada para ${updatedAgents.length} agentes`);
  };

  const handleClearAgents = () => {
    setAgents([]);
    setIsSimulating(false);
  };

  // Animation loop para mover agentes
  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(async () => {
      const { moveAgent } = await import('../services/pathfinding');

      setAgents(prevAgents => {
        const allEvacuated = prevAgents.every(a => a.evacuated);
        if (allEvacuated) {
          setIsSimulating(false);
          return prevAgents;
        }

        return prevAgents.map(agent =>
          moveAgent(agent, 0.05, DEFAULT_AGENT_PROFILES) // 50ms = 0.05 segundos
        );
      });
    }, 50); // 20 FPS

    return () => clearInterval(interval);
  }, [isSimulating]);

  // --- Step 1 Handlers ---

  // Función eliminada temporalmente - no funcionaba correctamente
  const handleTerrainUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setError('Función de terreno SVG deshabilitada temporalmente');
    event.target.value = '';
  };

  const handleFileUpload = async (file: File) => {
    setIsLoading(true);
    setError(null);
    setShowFileBrowser(false);
    try {
      const { processPDFWithGemini, validateBuildingData } = await import('../services/pdfProcessor');
      const data = await processPDFWithGemini(file);
      if (!validateBuildingData(data)) {
        throw new Error('Los datos extraídos del PDF no tienen el formato correcto');
      }
      clearScene();
      addModelToScene(data);
    } catch (err) {
      console.error('Error procesando archivo:', err);
      setError(err instanceof Error ? err.message : 'Error al procesar el archivo');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJsonUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    setError(null);
    setShowFileBrowser(false);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const { validateBuildingData } = await import('../services/pdfProcessor');
      if (!validateBuildingData(data)) {
        throw new Error('El archivo JSON no tiene el formato de BuildingData correcto.');
      }
      clearScene();
      addModelToScene(data);
    } catch (err) {
      console.error('Error cargando archivo JSON:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar el archivo JSON.');
    } finally {
      setIsLoading(false);
    }
    event.target.value = '';
  };

  const handleTestWithSample = async () => {
    setShowFileBrowser(false);
    try {
      const { createSampleBuildingData } = await import('../services/buildingConverter');
      const sampleData = createSampleBuildingData();
      clearScene();
      addModelToScene(sampleData);
    } catch (err) {
      console.error('Error cargando datos de ejemplo:', err);
      setError('Error al cargar datos de ejemplo');
    }
  };

  // --- Navigation & UI Handlers ---

  const handleGoToUploadStep = () => {
    clearScene();
    setCurrentStep('upload');
    setShowFileBrowser(false);
  };

  const handleStepClick = (stepId: Step) => {
    if (stepId === 'upload') {
      handleGoToUploadStep();
    } else if (buildingData) { // Only move to other steps if data exists
      setCurrentStep(stepId);
    }
  };

  const handleDownloadJSON = () => {
    if (!buildingData) return;
    const dataStr = JSON.stringify(buildingData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${buildingData.projectInfo.projectName || 'edificio'}-gemini.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // --- Components ---

  const steps = [
    { id: 'upload' as Step, label: 'Cargar', icon: Upload },
    { id: 'visualization' as Step, label: 'Visualizar', icon: Eye },
    { id: 'simulation' as Step, label: 'Simular', icon: TestTube },
  ];

  const FileBrowser = () => (
    <div className="bg-slate-100 p-4 rounded-lg">
      <h3 className="text-lg font-medium text-slate-700 mb-4">Archivos Guardados</h3>
      {userFiles.length > 0 ? (
        <ul className="space-y-2 max-h-60 overflow-y-auto">
          {userFiles.map(file => (
            <li key={file.id} className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm">
              <div>
                <p className="font-medium text-slate-800">{file.fileName}</p>
                <p className="text-xs text-slate-500">
                  {new Date(file.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleLoadFromFirebase(file)}
                  className="p-2 text-slate-600 hover:text-green-600 transition-colors"
                  title="Añadir a la Escena"
                >
                  <PlusSquare size={18} />
                </button>
                <button
                  onClick={() => handleDeleteFromFirebase(file.id)}
                  className="p-2 text-slate-600 hover:text-red-600 transition-colors"
                  title="Borrar archivo"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-slate-500 text-center py-4">No tienes archivos guardados.</p>
      )}
    </div>
  );

  const Modal = ({ children }: { children: React.ReactNode }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-lg w-full relative">
        <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-slate-500 hover:text-slate-800">
          <X size={24} />
        </button>
        {children}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        {/* ... Header ... */}
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <nav className="flex items-center justify-center gap-8 mb-12">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const isCompleted = steps.findIndex(s => s.id === currentStep) > index;

            return (
              <div key={step.id} className="flex items-center gap-8">
                <button
                  onClick={() => handleStepClick(step.id)}
                  disabled={isLoading || (step.id !== 'upload' && !buildingData)}
                  className={`flex items-center gap-3 transition-all ${
                    isActive
                      ? 'text-slate-800'
                      : isCompleted
                      ? 'text-slate-600 hover:text-slate-800'
                      : 'text-slate-400'
                  } ${(step.id !== 'upload' && !buildingData) ? 'cursor-not-allowed' : ''}`}
                >
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                      isActive
                        ? 'bg-slate-800 text-white'
                        : isCompleted
                        ? 'bg-slate-200 text-slate-600'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    <Icon size={20} />
                  </div>
                  <span className="font-medium">{step.label}</span>
                </button>

                {index < steps.length - 1 && (
                  <div
                    className={`w-24 h-0.5 transition-colors ${
                      isCompleted ? 'bg-slate-300' : 'bg-slate-200'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </nav>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 min-h-[500px]">
          {currentStep === 'upload' && (
            <>
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[400px]">
                  <div className="loader ease-linear rounded-full border-4 border-t-4 border-gray-200 h-12 w-12 mb-4"></div>
                  <p className="text-slate-600">Procesando archivo...</p>
                  <style>{`.loader { border-top-color: #333; animation: spinner 1.5s linear infinite; } @keyframes spinner { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                </div>
              ) : (
                <>
                  <input
                    type="file"
                    accept=".json"
                    ref={jsonInputRef}
                    onChange={handleJsonUpload}
                    style={{ display: 'none' }}
                  />
                  <input
                    type="file"
                    accept=".svg"
                    ref={svgInputRef}
                    onChange={handleTerrainUpload}
                    style={{ display: 'none' }}
                  />
                  {!showFileBrowser && (
                    <>
                      <UploadStep onFileUpload={handleFileUpload} />
                      <div className="mt-8 text-center border-t border-slate-200 pt-8">
                        <p className="text-slate-600 mb-4 text-sm">O continúa desde un archivo...</p>
                        <div className="flex justify-center gap-4 flex-wrap">
                          <button
                            onClick={() => setShowFileBrowser(true)}
                            className="inline-flex items-center gap-2 bg-green-100 hover:bg-green-200 text-green-800 font-medium py-2 px-6 rounded-lg transition-colors"
                          >
                            <FolderOpen size={18} />
                            ...desde la Nube
                          </button>
                          <button
                            onClick={() => jsonInputRef.current?.click()}
                            className="inline-flex items-center gap-2 bg-blue-100 hover:bg-blue-200 text-blue-800 font-medium py-2 px-6 rounded-lg transition-colors"
                          >
                            <FileJson size={18} />
                            ...desde un Archivo JSON
                          </button>
                          <button
                            onClick={() => svgInputRef.current?.click()}
                            className="inline-flex items-center gap-2 bg-amber-100 hover:bg-amber-200 text-amber-800 font-medium py-2 px-6 rounded-lg transition-colors"
                          >
                            <Map size={18} />
                            Cargar Terreno (SVG)
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {showFileBrowser && (
                    <>
                      <button onClick={() => setShowFileBrowser(false)} className="text-sm text-slate-600 hover:text-slate-800 mb-4">
                        &larr; Volver a cargar PDF
                      </button>
                      <FileBrowser />
                    </>
                  )}
                </>
              )}
              {error && (
                <div className="mt-4 text-center text-red-600 bg-red-50 p-4 rounded-lg">
                  {error}
                </div>
              )}
            </>
          )}

          {currentStep === 'visualization' && (
            <div>
              {/* Panel para añadir agentes en visualización */}
              <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h3 className="text-lg font-medium text-blue-900 mb-3">👤 Agregar Personas</h3>
                <div className="flex flex-wrap gap-3 items-center">
                  <select
                    value={selectedProfile}
                    onChange={(e) => setSelectedProfile(e.target.value)}
                    className="border border-blue-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {DEFAULT_AGENT_PROFILES.map(profile => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name} ({profile.speed}m/s)
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleAddAgent}
                    disabled={!buildingData}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:bg-blue-300"
                  >
                    ➕ Añadir Persona
                  </button>
                  <button
                    onClick={handleClearAgents}
                    disabled={agents.length === 0}
                    className="bg-gray-500 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:bg-gray-300"
                  >
                    🗑️ Limpiar Personas ({agents.length})
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 mb-4 items-center">
                <button
                  onClick={handleGoToUploadStep}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  Limpiar y Cargar Nuevo
                </button>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="bg-green-500 hover:bg-green-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  <PlusSquare size={18} className="inline-block mr-2" />
                  Añadir desde Nube
                </button>
                <button
                  onClick={handleDownloadJSON}
                  className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  📥 Descargar JSON (Último)
                </button>
                <div className="flex-grow"></div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                    placeholder="Nombre del archivo..."
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <button
                    onClick={handleSaveToFirebase}
                    disabled={isLoading || !buildingData}
                    className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:bg-green-300"
                  >
                    <Save size={18} />
                    {isLoading ? 'Guardando...' : 'Guardar Último Modelo'}
                  </button>
                </div>
              </div>
              <div className="h-[70vh] w-full bg-slate-100 rounded-lg overflow-hidden border">
                {sceneData.objects.length > 0 || placementModeData ? (
                  <Viewer
                    data={sceneData}
                    placementModeData={placementModeData}
                    onPlaceModel={handlePlaceModel}
                    agents={agents}
                    agentProfiles={DEFAULT_AGENT_PROFILES}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500">
                    <p>La escena está vacía. Carga un modelo para empezar.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentStep === 'simulation' && (
            <div>
              {/* Panel de control de simulación */}
              <div className="mb-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
                <h3 className="text-lg font-medium text-purple-900 mb-3">🚨 Control de Simulación</h3>
                <div className="flex flex-wrap gap-3 items-center mb-4">
                  <button
                    onClick={handleStartEvacuation}
                    disabled={agents.length === 0 || isSimulating || !buildingData}
                    className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:bg-red-300"
                  >
                    🚨 {isSimulating ? 'Evacuando...' : 'Iniciar Evacuación'}
                  </button>
                  <button
                    onClick={() => setIsSimulating(false)}
                    disabled={!isSimulating}
                    className="bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:bg-orange-300"
                  >
                    ⏸ Pausar
                  </button>
                  <button
                    onClick={handleClearAgents}
                    disabled={agents.length === 0}
                    className="bg-gray-500 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:bg-gray-300"
                  >
                    🔄 Resetear
                  </button>
                </div>
                {!buildingData && (
                  <p className="text-sm text-purple-600">⚠️ Primero carga un edificio y añade personas en "Visualizar"</p>
                )}
                {agents.length === 0 && buildingData && (
                  <p className="text-sm text-purple-600">⚠️ Añade personas en el paso "Visualizar" antes de simular</p>
                )}
              </div>

              {/* Estadísticas de la simulación */}
              {agents.length > 0 && (
                <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Total de agentes */}
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h4 className="text-sm font-medium text-blue-900 mb-2">👥 Total de Personas</h4>
                    <p className="text-3xl font-bold text-blue-700">{agents.length}</p>
                  </div>

                  {/* Evacuados */}
                  <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                    <h4 className="text-sm font-medium text-green-900 mb-2">✅ Evacuados</h4>
                    <p className="text-3xl font-bold text-green-700">
                      {agents.filter(a => a.evacuated).length}
                    </p>
                    <p className="text-sm text-green-600 mt-1">
                      {agents.length > 0 ? Math.round((agents.filter(a => a.evacuated).length / agents.length) * 100) : 0}% completado
                    </p>
                  </div>

                  {/* En evacuación */}
                  <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                    <h4 className="text-sm font-medium text-orange-900 mb-2">🏃 Evacuando</h4>
                    <p className="text-3xl font-bold text-orange-700">
                      {agents.filter(a => a.isEvacuating && !a.evacuated).length}
                    </p>
                  </div>
                </div>
              )}

              {/* Filtros por perfil */}
              {agents.length > 0 && (
                <div className="mb-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <h4 className="text-sm font-medium text-slate-900 mb-3">📊 Distribución por Perfil</h4>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {DEFAULT_AGENT_PROFILES.map(profile => {
                      const count = agents.filter(a => a.profileId === profile.id).length;
                      const evacuated = agents.filter(a => a.profileId === profile.id && a.evacuated).length;
                      return (
                        <div key={profile.id} className="p-3 bg-white rounded-lg border" style={{ borderColor: profile.color }}>
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: profile.color }}></div>
                            <span className="text-xs font-medium text-slate-700">{profile.name}</span>
                          </div>
                          <p className="text-lg font-bold text-slate-900">{count}</p>
                          <p className="text-xs text-slate-600">
                            {evacuated}/{count} evacuados
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {currentStep === 'simulation' && (
            <div>

              {/* Visor 3D */}
              <div className="relative" style={{ width: '100%', height: '70vh' }}>
                {sceneData.objects.length > 0 ? (
                  <Viewer
                    data={sceneData}
                    placementModeData={placementModeData}
                    onPlaceModel={handlePlaceModel}
                    agents={agents}
                    agentProfiles={DEFAULT_AGENT_PROFILES}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500">
                    <p>La escena está vacía. Carga un modelo para empezar.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <Modal>
          <FileBrowser />
        </Modal>
      )}
    </div>
  );
}
