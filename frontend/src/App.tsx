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
import DealersPage from './pages/DealersPage';
import ProjectsPage from './pages/ProjectsPage';
import NewProjectPage from './pages/NewProjectPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import InstallationsPage from './pages/InstallationsPage';
import InstallationDetailPage from './pages/InstallationDetailPage';
import InstallersPage from './pages/InstallersPage';
import InvoicesPage from './pages/InvoicesPage';
import InvoiceDetailPage from './pages/InvoiceDetailPage';
import PublicInstallerView from './pages/PublicInstallerView';
import PublicCustomerView from './pages/PublicCustomerView';
import PublicAiStepYard from './pages/PublicAiStepYard';
import PublicAiStepPhoto from './pages/PublicAiStepPhoto';
import PublicAiStepContact from './pages/PublicAiStepContact';
import PublicAiResultPage from './pages/PublicAiResultPage';
import LeadsListPage from './pages/LeadsListPage';
import LeadDetailPage from './pages/LeadDetailPage';
import { Layout } from './components/Layout';

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/approve/:id" element={<PublicApprovalPage />} />

            {/* Public AI Yard Visualizer - 3-step wizard + result page. */}
            <Route path="/ai-generate" element={<PublicAiStepYard />} />
            <Route path="/ai-generate/photo" element={<PublicAiStepPhoto />} />
            <Route path="/ai-generate/contact" element={<PublicAiStepContact />} />
            <Route path="/ai-generate/result/:id" element={<PublicAiResultPage />} />

            {/* Public installation views - NOT wrapped in RequireAuth. */}
            <Route path="/public/installation/:id/installer/:token" element={<PublicInstallerView />} />
            <Route path="/public/installation/:id/customer/:linkToken" element={<PublicCustomerView />} />

            <Route path="/" element={<RequireAuth><Layout><DashboardPage /></Layout></RequireAuth>} />
            <Route path="/quotes/new" element={<RequireAuth><Layout><NewQuotePage /></Layout></RequireAuth>} />
            <Route path="/quotes/:id" element={<RequireAuth><Layout><QuoteDetailPage /></Layout></RequireAuth>} />
            <Route path="/projects" element={<RequireAuth><Layout><ProjectsPage /></Layout></RequireAuth>} />
            <Route path="/projects/new" element={<RequireAuth><Layout><NewProjectPage /></Layout></RequireAuth>} />
            <Route path="/projects/:id" element={<RequireAuth><Layout><ProjectDetailPage /></Layout></RequireAuth>} />
            <Route path="/installations" element={<RequireAuth><Layout><InstallationsPage /></Layout></RequireAuth>} />
            <Route path="/installations/:id" element={<RequireAuth><Layout><InstallationDetailPage /></Layout></RequireAuth>} />
            <Route path="/installers" element={<RequireAuth><Layout><InstallersPage /></Layout></RequireAuth>} />
            <Route path="/invoices" element={<RequireAuth><Layout><InvoicesPage /></Layout></RequireAuth>} />
            <Route path="/invoices/:id" element={<RequireAuth><Layout><InvoiceDetailPage /></Layout></RequireAuth>} />
            <Route path="/leads" element={<RequireAuth><Layout><LeadsListPage /></Layout></RequireAuth>} />
            <Route path="/leads/:id" element={<RequireAuth><Layout><LeadDetailPage /></Layout></RequireAuth>} />
            <Route path="/products" element={<RequireAuth><Layout><ProductsPage /></Layout></RequireAuth>} />
            <Route path="/designs" element={<RequireAuth><Layout><DesignsPage /></Layout></RequireAuth>} />
            <Route path="/wholesalers" element={<RequireAuth role="ADMIN"><Layout><DealersPage /></Layout></RequireAuth>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <ConfirmDialog />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
