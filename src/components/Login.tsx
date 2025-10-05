import { LogIn } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { signInWithGoogle } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-light text-slate-800 mb-2">Diseño Arquitectónico</h1>
          <p className="text-slate-500 text-sm">Plataforma minimalista para gestión de proyectos</p>
        </div>

        <button
          onClick={signInWithGoogle}
          className="w-full bg-slate-800 hover:bg-slate-900 text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-3"
        >
          <LogIn size={20} />
          Iniciar sesión con Google
        </button>
      </div>
    </div>
  );
}
