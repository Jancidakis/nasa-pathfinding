import { useState, useEffect, useRef } from 'react';
import { LogOut, Upload, Eye, TestTube, Save, FolderOpen, Trash2, FileJson } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import UploadStep from './steps/UploadStep';
import { Viewer } from './Viewer';
import { SceneData, BuildingData } from '../types/building';
import { convertBuildingToScene } from '../services/buildingConverter';
import { db } from '../config/firebase';
import { ref, set, push, onValue, remove } from 'firebase/database';

type Step = 'upload' | 'visualization';

interface UserFile {
  id: string;
  fileName: string;
  createdAt: string;
  buildingData: BuildingData;
}

export default function Workspace() {
  const { user, logout } = useAuth();
  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [sceneData, setSceneData] = useState<SceneData | null>(null);
  const [buildingData, setBuildingData] = useState<BuildingData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ref for hidden file input
  const jsonInputRef = useRef<HTMLInputElement>(null);

  // State for Firebase interaction
  const [fileName, setFileName] = useState('');
  const [userFiles, setUserFiles] = useState<UserFile[]>([]);
  const [showFileBrowser, setShowFileBrowser] = useState(false);

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
      setError("No hay datos para guardar o no has iniciado sesión.");
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
    try {
      setBuildingData(file.buildingData);
      const scene = convertBuildingToScene(file.buildingData);
      setSceneData(scene);
      setCurrentStep('visualization');
      setShowFileBrowser(false);
      setError(null);
    } catch (err) {
      console.error("Error cargando archivo:", err);
      setError("No se pudo cargar la escena desde este archivo.");
    }
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

  // --- Original & New Logic ---

  const steps = [
    { id: 'upload' as Step, label: 'Cargar', icon: Upload },
    { id: 'visualization' as Step, label: 'Visualizar', icon: Eye },
  ];

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
      setBuildingData(data);
      const scene = convertBuildingToScene(data);
      setSceneData(scene);
      setCurrentStep('visualization');
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

      setBuildingData(data);
      const scene = convertBuildingToScene(data);
      setSceneData(scene);
      setCurrentStep('visualization');
    } catch (err) {
      console.error('Error cargando archivo JSON:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar el archivo JSON.');
    } finally {
      setIsLoading(false);
    }

    // Reset file input
    event.target.value = '';
  };

  const handleTestWithSample = async () => {
    setShowFileBrowser(false);
    try {
      const { createSampleBuildingData } = await import('../services/buildingConverter');
      const sampleData = createSampleBuildingData();
      const scene = convertBuildingToScene(sampleData);
      setSceneData(scene);
      setCurrentStep('visualization');
    } catch (err) {
      console.error('Error cargando datos de ejemplo:', err);
      setError('Error al cargar datos de ejemplo');
    }
  };

  const handleBackToUpload = () => {
    setSceneData(null);
    setBuildingData(null);
    setCurrentStep('upload');
    setError(null);
    setShowFileBrowser(false);
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

  const FileBrowser = () => (
    <div className="border-t border-slate-200 mt-8 pt-8">
      <h3 className="text-lg font-medium text-slate-700 mb-4">Archivos Guardados</h3>
      {userFiles.length > 0 ? (
        <ul className="space-y-2 max-h-60 overflow-y-auto">
          {userFiles.map(file => (
            <li key={file.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div>
                <p className="font-medium text-slate-800">{file.fileName}</p>
                <p className="text-xs text-slate-500">
                  {new Date(file.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleLoadFromFirebase(file)}
                  className="p-2 text-slate-600 hover:text-blue-600 transition-colors"
                  title="Cargar archivo"
                >
                  <FolderOpen size={18} />
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

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-light text-slate-800">Diseño Arquitectónico</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">{user?.email}</span>
            <button onClick={logout} className="text-slate-600 hover:text-slate-800 transition-colors">
              <LogOut size={20} />
            </button>
          </div>
        </div>
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
                  onClick={() => !sceneData && !isLoading && setCurrentStep(step.id)}
                  disabled={!!sceneData || isLoading}
                  className={`flex items-center gap-3 transition-all ${
                    isActive
                      ? 'text-slate-800'
                      : isCompleted
                      ? 'text-slate-600 hover:text-slate-800'
                      : 'text-slate-400'
                  }`}
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
                  {!showFileBrowser && (
                    <>
                      <UploadStep onFileUpload={handleFileUpload} />
                      <div className="mt-8 text-center border-t border-slate-200 pt-8">
                        <p className="text-slate-600 mb-4 text-sm">O continúa desde un archivo...</p>
                        <div className="flex justify-center gap-4">
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

          {currentStep === 'visualization' && sceneData && (
            <div>
              <div className="flex flex-wrap gap-4 mb-4 items-center">
                <button
                  onClick={handleBackToUpload}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  Cargar otro archivo
                </button>
                <button
                  onClick={handleDownloadJSON}
                  className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  📥 Descargar JSON
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
                    disabled={isLoading}
                    className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:bg-green-300"
                  >
                    <Save size={18} />
                    {isLoading ? 'Guardando...' : 'Guardar en Nube'}
                  </button>
                </div>
              </div>
              <div className="h-[70vh] w-full bg-slate-100 rounded-lg overflow-hidden">
                <Viewer data={sceneData} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
