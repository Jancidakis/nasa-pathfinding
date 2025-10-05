import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import Workspace from './components/Workspace';

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-pulse text-slate-600">Cargando...</div>
      </div>
    );
  }

  return user ? <Workspace /> : <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
