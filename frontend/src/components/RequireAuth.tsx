import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ReactNode } from 'react';

export function RequireAuth({ children, role }: { children: ReactNode; role?: string }) {
  const { user, token } = useAuth();
  const loc = useLocation();
  if (!token) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (role && user?.role !== role) return <Navigate to="/quotes" replace />;
  return <>{children}</>;
}
