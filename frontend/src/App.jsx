import { lazy, Suspense, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ChakraProvider, Spinner, Center, useDisclosure, useToast } from '@chakra-ui/react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import ErrorBoundary from './components/ErrorBoundary';
import theme from './theme';
import Login from './pages/Login';
import ClientLayout from './pages/client/ClientLayout';
import AdminLayout from './pages/admin/AdminLayout';
import VersionUpdateModal from './components/VersionUpdateModal';
import { checkVersion, isCapacitorApp } from './utils/version';
import { api } from './utils/api';
import { normalizeError, getErrorMessage } from './utils/errorHandler';
import { captureError } from './utils/frontendErrorCapture';

const ClientHome = lazy(() => import('./pages/client/Home'));
const ClientProfile = lazy(() => import('./pages/client/ClientProfile'));
const ClientChat = lazy(() => import('./pages/client/Chat'));
const AICoach = lazy(() => import('./pages/client/AICoach'));
const MyPond = lazy(() => import('./pages/client/MyPond'));
const GirlDetail = lazy(() => import('./pages/client/GirlDetail'));
const ClientDates = lazy(() => import('./pages/client/ClientDates'));
const Onboarding = lazy(() => import('./pages/client/Onboarding'));
const ClientLearning = lazy(() => import('./pages/client/Learning'));
const ChapterDetail = lazy(() => import('./pages/client/ChapterDetail'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminClients = lazy(() => import('./pages/admin/Clients'));
const AdminGirls = lazy(() => import('./pages/admin/Girls'));
const AdminChat = lazy(() => import('./pages/admin/Chat'));
const AdminWorkbench = lazy(() => import('./pages/admin/Workbench'));
const AdminProgress = lazy(() => import('./pages/admin/Progress'));
const AdminDates = lazy(() => import('./pages/admin/Dates'));
const MembershipManagement = lazy(() => import('./pages/admin/MembershipManagement'));
const AdminLogs = lazy(() => import('./pages/admin/Logs'));
const ActivityBoard = lazy(() => import('./pages/admin/ActivityBoard'));
const ChapterManagement = lazy(() => import('./pages/admin/ChapterManagement'));
const ChapterEditor = lazy(() => import('./pages/admin/ChapterEditor'));

function PageLoader() {
  return (
    <Center h="100vh">
      <Spinner size="xl" color="blue.500" />
    </Center>
  );
}

function ProtectedRoute({ children, requireOperator = false }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" />;
  if (requireOperator && user?.role === 'client') return <Navigate to="/" />;
  if (!requireOperator && user?.role === 'admin') return <Navigate to="/admin" />;
  return children;
}

// 入职引导路由：仅对 serviceStage === '待入职' 的客户显示
function OnboardingRoute() {
  const { user, loading } = useAuth();
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (loading || !user || user.role !== 'client') {
      setChecked(true);
      return;
    }
    import('./utils/api').then(({ clients }) => {
      clients.me().then(res => {
        if (res.client?.serviceStage === '待入职') {
          setNeedsOnboarding(true);
        }
        setChecked(true);
      }).catch(() => {
        setChecked(true);
      });
    });
  }, [user, loading]);

  if (loading || !checked) return <PageLoader />;
  if (!user) return <Navigate to="/login" />;
  if (user.role !== 'client') return <Navigate to="/admin" />;
  if (!needsOnboarding) return <Navigate to="/" />;
  return <Onboarding />;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  // 认证加载完成后隐藏启动屏，避免 splash→黑屏→内容的闪烁
  useEffect(() => {
    if (!loading) {
      const splash = document.getElementById('app-splash');
      if (splash) {
        splash.classList.add('hidden');
        setTimeout(() => splash.remove(), 400);
      }
    }
  }, [loading]);

  if (loading) return null;

  return (
    <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.role === 'client' ? '/' : '/admin'} /> : <Login />} />
      <Route path="/onboarding" element={<OnboardingRoute />} />
      <Route path="/" element={<ProtectedRoute><ClientLayout /></ProtectedRoute>}>
        <Route index element={<ClientHome />} />
        <Route path="profile" element={<ClientProfile />} />
        <Route path="chat" element={<ClientChat />} />
        <Route path="ai-coach" element={<AICoach />} />
        <Route path="my-pond" element={<MyPond />} />
        <Route path="my-pond/:girlId" element={<GirlDetail />} />
        <Route path="dates" element={<ClientDates />} />
        <Route path="learning" element={<ClientLearning />} />
        <Route path="learning/:chapterId" element={<ChapterDetail />} />
      </Route>
      <Route path="/admin" element={<ProtectedRoute requireOperator><AdminLayout /></ProtectedRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="clients" element={<AdminClients />} />
        <Route path="girls" element={<AdminGirls />} />
        <Route path="chat" element={<AdminChat />} />
        <Route path="workbench" element={<AdminWorkbench />} />
        <Route path="progress" element={<AdminProgress />} />
        <Route path="dates" element={<AdminDates />} />
        <Route path="membership" element={<MembershipManagement />} />
        <Route path="logs" element={<AdminLogs />} />
        <Route path="activity" element={<ActivityBoard />} />
        <Route path="chapters/new" element={<ChapterEditor />} />
        <Route path="chapters/:chapterId/edit" element={<ChapterEditor />} />
        <Route path="chapters" element={<ChapterManagement />} />
      </Route>
    </Routes>
    </Suspense>
  );
}

export default function App() {
  const toast = useToast();

  // 设置全局 API 错误处理器
  useEffect(() => {
    api.setErrorHandler((error) => {
      const normalized = normalizeError(error);
      const message = getErrorMessage(normalized);

      // 401/403 不弹 toast：401 已跳转登录，403 是路由守卫瞬时竞态
      if (normalized.type === 'AUTH' || normalized.type === 'PERMISSION') return;

      toast({
        title: '出错了',
        description: message,
        status: 'error',
        duration: 4000,
        isClosable: true,
        position: 'top',
      });
    });
  }, [toast]);

  return (
    <ChakraProvider theme={theme}>
      <ErrorBoundary>
        <BrowserRouter basename={import.meta.env.PROD && !isCapacitorApp() ? '/app/' : '/'}>
          <AuthProvider>
            <SocketProvider>
              <VersionChecker />
              <AppRoutes />
            </SocketProvider>
          </AuthProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </ChakraProvider>
  );
}

function VersionChecker() {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [updateInfo, setUpdateInfo] = useState(null);

  useEffect(() => {
    checkVersion()
      .then(info => {
        if (info?.hasUpdate) {
          setUpdateInfo(info);
          onOpen();
        }
      })
      .catch(err => {
        captureError(err, { context: 'version_check_startup' });
      });
  }, []);

  if (!updateInfo) return null;

  return (
    <VersionUpdateModal
      isOpen={isOpen}
      onClose={onClose}
      upgradeType={updateInfo.upgradeType}
      latestVersion={updateInfo.latestVersion}
      updateDescription={updateInfo.updateDescription}
      downloadUrl={updateInfo.downloadUrl}
    />
  );
}
