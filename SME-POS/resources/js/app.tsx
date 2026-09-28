/**
 * Wivae Dashboard — React entry point.
 *
 * Replaces the Inertia.js bootstrap with React Router v6.
 * All pages are lazy-loaded; the bundle stays the same size.
 *
 * Route topology mirrors server/src/index.ts:
 *   /login               → Auth/Login
 *   /register            → Auth/Register (central domain)
 *   /dashboard           → Dashboard/Index
 *   /products            → Products/Index
 *   /products/create     → Products/Create
 *   /products/import     → Products/Import
 *   /categories          → Categories/Index
 *   /staff               → Staff/Index
 *   /branches            → Branches/Index
 *   /devices             → Devices/Index
 *   /tasks               → Tasks/Index
 *   /kitchen             → Kitchen/Index
 *   /orders              → Orders/Index
 *   /transactions        → Transactions/Index
 *   /analytics           → Analytics/Index
 *   /ai-insights         → AiInsights/Index
 *   /payroll             → Payroll/Index
 *   /settings/general    → Settings/General
 *   /settings/account    → Settings/Account
 *   /settings/branding   → Settings/Branding
 *   /settings/payments   → Payments/Index
 *   /settings/fiscalisation → Settings/Fiscalisation
 */
import '../css/app.css';
import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth.js';

// ── Lazy page imports ─────────────────────────────────────────────────────────
const LoginPage         = lazy(() => import('./pages/Auth/Login.js'));
const RegisterPage      = lazy(() => import('./pages/Auth/Register.js'));
const WelcomePage       = lazy(() => import('./pages/Auth/Welcome.js'));
const DashboardPage     = lazy(() => import('./pages/Dashboard/Index.js'));
const ProductsPage      = lazy(() => import('./pages/Products/Index.js'));
const ProductCreatePage = lazy(() => import('./pages/Products/Create.js'));
const ProductImportPage = lazy(() => import('./pages/Products/Import.js'));
const ProductBarcodesPage = lazy(() => import('./pages/Products/Barcodes.js'));
const CategoriesPage    = lazy(() => import('./pages/Categories/Index.js'));
const StaffPage         = lazy(() => import('./pages/Staff/Index.js'));
const CustomersPage     = lazy(() => import('./pages/Customers/Index.js'));
const BranchesPage      = lazy(() => import('./pages/Branches/Index.js'));
const DevicesPage       = lazy(() => import('./pages/Devices/Index.js'));
const TasksPage         = lazy(() => import('./pages/Tasks/Index.js'));
const KitchenPage       = lazy(() => import('./pages/Kitchen/Index.js'));
const OrdersPage        = lazy(() => import('./pages/Orders/Index.js'));
const TransactionsPage  = lazy(() => import('./pages/Transactions/Index.js'));
const AnalyticsPage     = lazy(() => import('./pages/Analytics/Index.js'));
const AiInsightsPage    = lazy(() => import('./pages/AiInsights/Index.js'));
const PayrollPage       = lazy(() => import('./pages/Payroll/Index.js'));
const SettingsGeneralPage      = lazy(() => import('./pages/Settings/General.js'));
const SettingsAccountPage      = lazy(() => import('./pages/Settings/Account.js'));
const SettingsBrandingPage     = lazy(() => import('./pages/Settings/Branding.js'));
const SettingsFiscalPage       = lazy(() => import('./pages/Settings/Fiscalisation.js'));
const PaymentsPage      = lazy(() => import('./pages/Payments/Index.js'));

// ── Loading fallback ─────────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
    </div>
  );
}

// ── Auth guard ────────────────────────────────────────────────────────────────
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!user) {
    // Keep where they were headed (e.g. a bookmarked /devices) so login can
    // send them back there instead of always to /dashboard.
    const to = location.pathname + location.search;
    return <Navigate to={`/login?redirectTo=${encodeURIComponent(to)}`} replace />;
  }
  return <>{children}</>;
}

function RequireGuest({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public */}
          {/* No explicit "/" route: the catch-all below (path="*") sends it to
              /dashboard, and RequireAuth there bounces to /login if not
              authenticated -- exactly right now that the marketing page is
              served separately by the marketing/ Astro app. */}
          <Route path="/login" element={<RequireGuest><LoginPage /></RequireGuest>} />
          <Route path="/register" element={<RequireGuest><RegisterPage /></RequireGuest>} />
          {/* Neither guest- nor auth-guarded: it's the step that turns a guest into a signed-in owner. */}
          <Route path="/welcome" element={<WelcomePage />} />

          {/* Protected dashboard */}
          <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />

          <Route path="/products" element={<RequireAuth><ProductsPage /></RequireAuth>} />
          <Route path="/products/create" element={<RequireAuth><ProductCreatePage /></RequireAuth>} />
          <Route path="/products/import" element={<RequireAuth><ProductImportPage /></RequireAuth>} />
          <Route path="/products/barcodes" element={<RequireAuth><ProductBarcodesPage /></RequireAuth>} />

          <Route path="/categories" element={<RequireAuth><CategoriesPage /></RequireAuth>} />
          <Route path="/staff" element={<RequireAuth><StaffPage /></RequireAuth>} />
          <Route path="/customers" element={<RequireAuth><CustomersPage /></RequireAuth>} />
          <Route path="/branches" element={<RequireAuth><BranchesPage /></RequireAuth>} />
          <Route path="/devices" element={<RequireAuth><DevicesPage /></RequireAuth>} />
          <Route path="/tasks" element={<RequireAuth><TasksPage /></RequireAuth>} />
          <Route path="/kitchen" element={<RequireAuth><KitchenPage /></RequireAuth>} />
          <Route path="/orders" element={<RequireAuth><OrdersPage /></RequireAuth>} />
          <Route path="/transactions" element={<RequireAuth><TransactionsPage /></RequireAuth>} />
          <Route path="/analytics" element={<RequireAuth><AnalyticsPage /></RequireAuth>} />
          <Route path="/ai-insights" element={<RequireAuth><AiInsightsPage /></RequireAuth>} />
          <Route path="/payroll" element={<RequireAuth><PayrollPage /></RequireAuth>} />

          <Route path="/settings/general" element={<RequireAuth><SettingsGeneralPage /></RequireAuth>} />
          <Route path="/settings/account" element={<RequireAuth><SettingsAccountPage /></RequireAuth>} />
          <Route path="/settings/branding" element={<RequireAuth><SettingsBrandingPage /></RequireAuth>} />
          <Route path="/settings/fiscalisation" element={<RequireAuth><SettingsFiscalPage /></RequireAuth>} />
          <Route path="/settings/payments" element={<RequireAuth><PaymentsPage /></RequireAuth>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

// ── Mount ─────────────────────────────────────────────────────────────────────
import { ErrorBoundary } from './Components/ErrorBoundary.js'; // folder is "Components" — lowercase only resolved on case-insensitive Windows

const root = document.getElementById('root') ?? document.getElementById('app');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}
