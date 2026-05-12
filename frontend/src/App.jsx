import { lazy, Suspense, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ChakraProvider, Spinner, Center, useDisclosure, useToast } from '@chakra-ui/react';
import { AnimatePresence, motion } from 'framer-motion';
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

// 懒加载所有页面（减少首屏 JS 体积）
const ClientHome = lazy(() => import('./pages/client/Home'));
const ClientProfile = lazy(() => import('./pages/client/ClientProfile'));
const ClientChat = lazy(() => import('./pages/client/Chat'));
const AICoach = lazy(() => import('./pages/client/AICoach'));
const MyPond = lazy(() => import('./pages/client/MyPond'));
const GirlDetail = lazy(() => import('./pages/client/GirlDetail'));
const ClientDates = lazy(() => import('./pages/client/ClientDates'));
const ClientLearning = lazy(() => import('./pages/client/Learning'));
const ChapterDetail = lazy(() => import('./pages/client/ChapterDetail'));

// 懒加载非常用页面
const Onboarding = lazy(() => import('./pages/client/Onboarding'));
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
const ContentImport = lazy(() => import('./pages/admin/ContentImport'));

function PageLoader() {
  return (
    <Center h="100vh">
      <Spinner size="xl" color="gold.500" />
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
  const location = useLocation();
  const toast = useToast();

  // ─── 监听 App Link 唤起事件 ───
  useEffect(() => {
    function handleDeepLink(e) {
      window.__DEEP_LINK_URL__ = e.detail;
    }

    window.addEventListener('deep-link', handleDeepLink);

    return () => {
      window.removeEventListener('deep-link', handleDeepLink);
    };
  }, []);

  useEffect(() => {
    if (!window.__DEEP_LINK_URL__) return;

    // 解析 URL 参数
    try {
      const url = new URL(window.__DEEP_LINK_URL__);
      const from = url.searchParams.get('from');
      const v = url.searchParams.get('v');

      if (from === 'upgrade' && v) {
        // App 被升级流程唤起，显示升级成功 toast
        setTimeout(() => {
          toast({
            title: '已是最新版本',
            description: `追AI ${v} 已准备就绪，开始聊天吧`,
            status: 'success',
            duration: 4000,
            isClosable: true,
            position: 'top',
          });
        }, 800);
      }
    } catch (e) {
      // URL 解析失败，忽略
    }

    // 清除标记
    window.__DEEP_LINK_URL__ = null;
  }, [toast]);

  // 认证加载完成后隐藏启动屏，避免 splash→黑屏→内容的闪烁
  useEffect(() => {
    // 隐藏 splash 的通用函数
    const hideSplash = () => {
      const splash = document.getElementById('app-splash');
      if (splash) {
        splash.classList.add('hidden');
        setTimeout(() => splash.remove(), 600);
      }
    };

    // 至少显示 2 秒
    const minDisplay = setTimeout(() => {
      if (!loading) {
        hideSplash();
      }
    }, 2000);

    // 最多显示 10 秒（防止后端卡住一直转圈）
    const maxDisplay = setTimeout(() => {
      hideSplash();
    }, 10000);

    // 加载完成 → 触发隐藏
    if (!loading) {
      clearTimeout(maxDisplay);
      hideSplash();
      return () => { clearTimeout(minDisplay); clearTimeout(maxDisplay); };
    }

    return () => { clearTimeout(minDisplay); clearTimeout(maxDisplay); };
  }, [loading]);

  // loading 时显示 PageLoader，不 return null（否则会卡在白屏）
  if (loading) return <PageLoader />;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        // 注意：不加 key！KeepAliveOutlet 依赖 location 变化来管理缓存
        // 加 key 会导致 ClientLayout 每次路由都重建，破坏 keep-alive 状态
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22, ease: 'easeInOut' }}
      >
        <Suspense fallback={<PageLoader />}>
        <Routes location={location}>
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
          <Route path="/client" element={<Navigate to="/" replace />} />
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
            <Route path="content-import" element={<ContentImport />} />
          </Route>
        </Routes>
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
}

// 生产环境（Capacitor App 除外）用 /app/，其他用 /
// 注意：window.Capacitor 在 bundle 中始终存在，改用构建时环境变量判断
// eslint-disable-next-line no-undef
const BASENAME = typeof __CAPACITOR_BUILD__ !== 'undefined' && __CAPACITOR_BUILD__ ? '/' : (import.meta.env.PROD ? '/app/' : '/');

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
        <BrowserRouter basename={BASENAME}>
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
