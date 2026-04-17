/**
 * 统一图标库 - 替换emoji为SVG图标
 * 使用Chakra UI的createIcon创建
 */
import { createIcon } from '@chakra-ui/react';

// Dashboard/Analytics 图标
export const DashboardIcon = createIcon({
  displayName: 'DashboardIcon',
  viewBox: '0 0 24 24',
  path: [
    <path key="1" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" fill="currentColor" opacity=".3"/>,
    <path key="2" d="M14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5z" fill="currentColor" opacity=".3"/>,
    <path key="3" d="M4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4z" fill="currentColor"/>,
    <path key="4" d="M14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" fill="currentColor"/>
  ]
});

// Refresh/Sync 图标
export const RefreshIcon = createIcon({
  displayName: 'RefreshIcon',
  viewBox: '0 0 24 24',
  path: [
    <path key="1" d="M4 4v5h5M20 20v-5h-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  ]
});

// Sparkles/AI 图标
export const SparklesIcon = createIcon({
  displayName: 'SparklesIcon',
  viewBox: '0 0 24 24',
  path: [
    <path key="1" d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  ]
});

// Clipboard/List 图标
export const ClipboardIcon = createIcon({
  displayName: 'ClipboardIcon',
  viewBox: '0 0 24 24',
  path: [
    <path key="1" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  ]
});

// Warning/Alert 图标
export const WarningIcon = createIcon({
  displayName: 'WarningIcon',
  viewBox: '0 0 24 24',
  path: [
    <path key="1" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  ]
});

// Calendar 图标
export const CalendarIcon = createIcon({
  displayName: 'CalendarIcon',
  viewBox: '0 0 24 24',
  path: [
    <path key="1" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  ]
});

// Heart 图标
export const HeartIcon = createIcon({
  displayName: 'HeartIcon',
  viewBox: '0 0 24 24',
  path: [
    <path key="1" d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  ]
});

// Fire/Hot 图标
export const FireIcon = createIcon({
  displayName: 'FireIcon',
  viewBox: '0 0 24 24',
  path: [
    <path key="1" d="M12 22c-4.97 0-9-4.03-9-9 0-4.5 3.5-8.5 5.5-10.5 1-1 2.5-1 3.5 0 1.5 1.5 3 3 3.5 5.5.5 2.5 0 4.5-1 6-1.5 2.5-2 3.5-2 8 0 4.97 4.03 9 9 9z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  ]
});

// Snow/Cold 图标
export const SnowIcon = createIcon({
  displayName: 'SnowIcon',
  viewBox: '0 0 24 24',
  path: [
    <path key="1" d="M12 2v20M17 7l-5 5-5-5M7 17l5-5 5 5M2 12h20M17 12l-5 5M7 12l5 5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  ]
});

// Info 图标
export const InfoIcon = createIcon({
  displayName: 'InfoIcon',
  viewBox: '0 0 24 24',
  path: [
    <circle key="1" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>,
    <path key="2" d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  ]
});

// Users/Group 图标
export const UsersIcon = createIcon({
  displayName: 'UsersIcon',
  viewBox: '0 0 24 24',
  path: [
    <path key="1" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>,
    <circle key="2" cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" fill="none"/>,
    <path key="3" d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  ]
});

// Female/Woman 图标
export const FemaleIcon = createIcon({
  displayName: 'FemaleIcon',
  viewBox: '0 0 24 24',
  path: [
    <circle key="1" cx="12" cy="9" r="5" stroke="currentColor" strokeWidth="2" fill="none"/>,
    <path key="2" d="M12 14v7M9 18h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  ]
});

// Chat 图标
export const ChatIcon = createIcon({
  displayName: 'ChatIcon',
  viewBox: '0 0 24 24',
  path: [
    <path key="1" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  ]
});

// Brain/Mind 图标
export const BrainIcon = createIcon({
  displayName: 'BrainIcon',
  viewBox: '0 0 24 24',
  path: [
    <path key="1" d="M12 4.5a2.5 2.5 0 00-4.96-.46 2.5 2.5 0 00-1.98 3 2.5 2.5 0 00.47 4.97l.64.65a2.5 2.5 0 003.58 0l.64-.65a2.5 2.5 0 00.47-4.97 2.5 2.5 0 00-1.98-3 2.5 2.5 0 00-4.96.44M12 4.5a2.5 2.5 0 014.96-.46 2.5 2.5 0 011.98 3 2.5 2.5 0 00-.47 4.97l.64.65a2.5 2.5 0 003.58 0l.64-.65a2.5 2.5 0 00-.47-4.97 2.5 2.5 0 011.98-3 2.5 2.5 0 014.96.44M12 4.5a2.5 2.5 0 000 5 2.5 2.5 0 000-5zM19 22l-3-3-3 3" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  ]
});

// Chart/Progress 图标
export const ChartIcon = createIcon({
  displayName: 'ChartIcon',
  viewBox: '0 0 24 24',
  path: [
    <path key="1" d="M18 20V10M12 20V4M6 20v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  ]
});

// Fish/Logo 图标
export const FishIcon = createIcon({
  displayName: 'FishIcon',
  viewBox: '0 0 24 24',
  path: [
    <path key="1" d="M6.5 12c0-4.5 2.5-8 5.5-8s5.5 3.5 5.5 8-2.5 8-5.5 8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>,
    <path key="2" d="M20 12l-3-3v6l3-3zM2 12l3-3v6l-3-3z" fill="currentColor"/>
  ]
});

// Search 图标
export const SearchIcon = createIcon({
  displayName: 'SearchIcon',
  viewBox: '0 0 24 24',
  path: [
    <circle key="1" cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" fill="none"/>,
    <path key="2" d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  ]
});

// Lock 图标
export const LockIcon = createIcon({
  displayName: 'LockIcon',
  viewBox: '0 0 24 24',
  path: [
    <rect key="1" x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="currentColor" strokeWidth="2" fill="none"/>,
    <path key="2" d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
  ]
});

// Bell/Notification 图标
// User/Profile 图标
export const UserIcon = createIcon({
  displayName: 'UserIcon',
  viewBox: '0 0 24 24',
  path: [
    <path key="1" d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>,
    <circle key="2" cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2" fill="none"/>
  ]
});

export const BellIcon = createIcon({
  displayName: 'BellIcon',
  viewBox: '0 0 24 24',
  path: [
    <path key="1" d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  ]
});

// Home 图标
export const HomeIcon = createIcon({
  displayName: 'HomeIcon',
  viewBox: '0 0 24 24',
  path: [
    <path key="1" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>,
    <polyline key="2" points="9 22 9 12 15 12 15 22" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  ]
});
