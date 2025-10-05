import { useState } from 'react';
import { LogOut, Upload, Eye, TestTube } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import UploadStep from './steps/UploadStep';
import { Viewer } from './Viewer';
import { SceneData, BuildingData } from '../types/building';
import { convertBuildingToScene } from '../services/buildingConverter';

type Step = 'upload' | 'visualization';

export default function Workspace() {
  const { user, logout } = useAuth();
  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [sceneData, setSceneData] = useState<SceneData | null>(null);
  const [buildingData, setBuildingData] = useState<BuildingData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps = [
    { id: 'upload' as Step, label: 'Cargar', icon: Upload },
    { id: 'visualization' as Step, label: 'Visualizar', icon: Eye },
  ];

  const handleFileUpload = async (file: File) => {
    setIsLoading(true);
    setError(null);

    try {
      // Importar el procesador de PDF dinámicamente
      const { processPDFWithGemini, validateBuildingData } = await import('../services/pdfProcessor');

      // Procesar el PDF con Gemini (valida altura y plantas primero)
      const data = await processPDFWithGemini(file);

      // Validar la estructura de datos
      if (!validateBuildingData(data)) {
        throw new Error('Los datos extraídos del PDF no tienen el formato correcto');
      }

      // Guardar los datos del edificio
      setBuildingData(data);

      // Convertir a escena 3D
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

  // Function to test with sample data without uploading
  const handleTestWithSample = async () => {
    try {
      // Importar datos de ejemplo solo para testing
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

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-light text-slate-800">Diseño Arquitectónico</h1>

          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">{user?.email}</span>
            <button
              onClick={logout}
              className="text-slate-600 hover:text-slate-800 transition-colors"
            >
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
                  <UploadStep onFileUpload={handleFileUpload} />

                  {/* Test button for sample data */}
                  <div className="mt-8 text-center border-t border-slate-200 pt-8">
                    <p className="text-slate-600 mb-4 text-sm">O prueba con datos de ejemplo</p>
                    <button
                      onClick={handleTestWithSample}
                      className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium py-2 px-6 rounded-lg transition-colors"
                    >
                      <TestTube size={18} />
                      Visualizar ejemplo
                    </button>
                  </div>
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
              <div className="flex gap-4 mb-4">
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
                  📥 Descargar JSON (Gemini)
                </button>
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
