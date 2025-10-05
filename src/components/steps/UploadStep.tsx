import { useState, useRef } from 'react';
import { Upload, File } from 'lucide-react';

interface UploadStepProps {
  onFileUpload: (file: File) => void;
  isLoading?: boolean;
}

export default function UploadStep({ onFileUpload, isLoading = false }: UploadStepProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isLoading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (isLoading) return;

    const file = e.dataTransfer.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLoading) return;

    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleContinue = () => {
    if (selectedFile && !isLoading) {
      onFileUpload(selectedFile);
    }
  };

  const handleClick = () => {
    if (!isLoading) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-light text-slate-800 mb-2">Cargar archivo</h2>
      <p className="text-slate-600 mb-8">Sube tu archivo de diseño arquitectónico para comenzar</p>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-all ${
          isDragging && !isLoading
            ? 'border-slate-400 bg-slate-50'
            : 'border-slate-300'
        } ${
          isLoading
            ? 'cursor-not-allowed bg-slate-50'
            : 'cursor-pointer hover:border-slate-400 hover:bg-slate-50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          className="hidden"
          accept=".dwg,.dxf,.pdf,.png,.jpg,.jpeg"
          disabled={isLoading}
        />

        <Upload className="mx-auto mb-4 text-slate-400" size={48} />

        {selectedFile ? (
          <div className="flex items-center justify-center gap-2 text-slate-700">
            <File size={20} />
            <span className="font-medium">{selectedFile.name}</span>
          </div>
        ) : (
          <>
            <p className="text-slate-700 mb-2">
              Arrastra tu archivo aquí o haz clic para seleccionar
            </p>
            <p className="text-sm text-slate-500">
              Formatos soportados: DWG, DXF, PDF, PNG, JPG
            </p>
          </>
        )}
      </div>

      {selectedFile && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleContinue}
            disabled={isLoading}
            className="bg-slate-800 text-white font-medium py-3 px-8 rounded-lg transition-colors disabled:bg-slate-400 disabled:cursor-not-allowed hover:bg-slate-900"
          >
            {isLoading ? 'Cargando...' : 'Continuar'}
          </button>
        </div>
      )}
    </div>
  );
}
