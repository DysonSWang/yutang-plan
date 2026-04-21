import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import theme from './theme';
import Login from './pages/Login';
import ClientLayout from './pages/client/ClientLayout';
import AdminLayout from './pages/admin/AdminLayout';
import ClientHome from './pages/client/Home';
import ClientProfile from './pages/client/ClientProfile';
import ClientChat from './pages/client/Chat';
import AICoach from './pages/client/AICoach';
import MyPond from './pages/client/MyPond';
import ClientDates from './pages/client/ClientDates';
import AdminDashboard from './pages/admin/Dashboard';
import AdminClients from './pages/admin/Clients';
import AdminGirls from './pages/admin/Girls';
import AdminChat from './pages/admin/Chat';
import AdminWorkbench from './pages/admin/Workbench';
import AdminProgress from './pages/admin/Progress';
import AdminDates from './pages/admin/Dates';

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
