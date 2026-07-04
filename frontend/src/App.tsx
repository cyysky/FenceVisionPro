import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { RequireAuth } from './components/RequireAuth';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { ToastProvider } from './components/ui/Toast';
import { ConfirmDialog } from './components/ui/Confirm';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import NewQuotePage from './pages/NewQuotePage';
import QuoteDetailPage from './pages/QuoteDetailPage';
import PublicApprovalPage from './pages/PublicApprovalPage';
import ProductsPage from './pages/ProductsPage';
import DesignsPage from './pages/DesignsPage';
import WholesalersPage from './pages/WholesalersPage';
import ProjectsPage from './pages/ProjectsPage';
import NewProjectPage from './pages/NewProjectPage';
import ProjectDetailPage from './pages/ProjectDetailPage';

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/approve/:id" element={<PublicApprovalPage />} />
            <Route path="/" element={<RequireAuth><DashboardPage /></RequireAuth>} />
            <Route path="/quotes/new" element={<RequireAuth><NewQuotePage /></RequireAuth>} />
            <Route path="/quotes/:id" element={<RequireAuth><QuoteDetailPage /></RequireAuth>} />
            <Route path="/projects" element={<RequireAuth><ProjectsPage /></RequireAuth>} />
            <Route path="/projects/new" element={<RequireAuth><NewProjectPage /></RequireAuth>} />
            <Route path="/projects/:id" element={<RequireAuth><ProjectDetailPage /></RequireAuth>} />
            <Route path="/products" element={<RequireAuth><ProductsPage /></RequireAuth>} />
            <Route path="/designs" element={<RequireAuth><DesignsPage /></RequireAuth>} />
            <Route path="/wholesalers" element={<RequireAuth role="ADMIN"><WholesalersPage /></RequireAuth>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <ConfirmDialog />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
