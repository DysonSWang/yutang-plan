import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ChakraProvider, Spinner, Center } from '@chakra-ui/react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import theme from './theme';
import Login from './pages/Login';
import ClientLayout from './pages/client/ClientLayout';
import AdminLayout from './pages/admin/AdminLayout';

const ClientHome = lazy(() => import('./pages/client/Home'));
const ClientProfile = lazy(() => import('./pages/client/ClientProfile'));
const ClientChat = lazy(() => import('./pages/client/Chat'));
const AICoach = lazy(() => import('./pages/client/AICoach'));
const MyPond = lazy(() => import('./pages/client/MyPond'));
const ClientDates = lazy(() => import('./pages/client/ClientDates'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminClients = lazy(() => import('./pages/admin/Clients'));
const AdminGirls = lazy(() => import('./pages/admin/Girls'));
const AdminChat = lazy(() => import('./pages/admin/Chat'));
const AdminWorkbench = lazy(() => import('./pages/admin/Workbench'));
const AdminProgress = lazy(() => import('./pages/admin/Progress'));
const AdminDates = lazy(() => import('./pages/admin/Dates'));

function PageLoader() {
  return (
    <Center h="100vh">
      <Spinner size="xl" color="blue.500" />
    </Center>
  );
}

function ProtectedRoute({ children, requireOperator = false }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;
  if (requireOperator && user?.role === 'client') return <Navigate to="/" />;
  if (!requireOperator && (user?.role === 'operator' || user?.role === 'admin')) return <Navigate to="/admin" />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) return null;

  return (
    <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.role === 'client' ? '/' : '/admin'} /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><ClientLayout /></ProtectedRoute>}>
        <Route index element={<ClientHome />} />
        <Route path="profile" element={<ClientProfile />} />
        <Route path="chat" element={<ClientChat />} />
        <Route path="ai-coach" element={<AICoach />} />
        <Route path="my-pond" element={<MyPond />} />
        <Route path="dates" element={<ClientDates />} />
      </Route>
      <Route path="/admin" element={<ProtectedRoute requireOperator><AdminLayout /></ProtectedRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="clients" element={<AdminClients />} />
        <Route path="girls" element={<AdminGirls />} />
        <Route path="chat" element={<AdminChat />} />
        <Route path="workbench" element={<AdminWorkbench />} />
        <Route path="progress" element={<AdminProgress />} />
        <Route path="dates" element={<AdminDates />} />
      </Route>
    </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <ChakraProvider theme={theme}>
      <BrowserRouter>
        <AuthProvider>
          <SocketProvider>
            <AppRoutes />
          </SocketProvider>
        </AuthProvider>
      </BrowserRouter>
    </ChakraProvider>
  );
}
