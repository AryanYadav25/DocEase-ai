import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FileText, GraduationCap, HelpCircle, LayoutDashboard, LogOut, Menu, Moon, Settings, Sparkles, Star, Sun, Trash2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dropdown, DropdownItem, DropdownSeparator } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthContext';
import { UploadDialog } from '@/features/documents/UploadDialog';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import { Logo, LogoMark } from './Logo';

const NAV = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/documents', label: 'My documents', icon: FileText },
  { to: '/app/workspace', label: 'AI workspace', icon: Sparkles },
  { to: '/app/study', label: 'Study materials', icon: GraduationCap },
  { to: '/app/favorites', label: 'Favorites', icon: Star },
  { to: '/app/trash', label: 'Trash', icon: Trash2 },
  { to: '/app/settings', label: 'Settings', icon: Settings },
  { to: '/app/help', label: 'Help and feedback', icon: HelpCircle },
];

const COLLAPSE_KEY = 'docuease:sidebar-collapsed';

export function AppLayout() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [drawer, setDrawer] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const isWorkspace = location.pathname.startsWith('/app/workspace/');

  useEffect(() => setDrawer(false), [location.pathname]);
  // The app shell is a fixed-height workspace: only panels scroll, never the page itself.
  useEffect(() => {
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => { document.documentElement.style.overflow = prev; };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const onLogout = async () => {
    await logout();
    toast.info('Signed out');
    navigate('/login');
  };

  const sidebar = (mobile: boolean) => (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-16 items-center border-b border-line px-3', collapsed && !mobile ? 'justify-center' : 'justify-between')}>
        {collapsed && !mobile ? <LogoMark /> : <Logo to="/app" />}
        {mobile && (
          <button onClick={() => setDrawer(false)} aria-label="Close menu" className="rounded p-1.5 text-ink-muted hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      <div className="p-3">
        <Button onClick={() => setUploadOpen(true)} className={cn('w-full', collapsed && !mobile && 'px-0')} leftIcon={<Upload className="h-4 w-4" />} aria-label="Upload documents">
          {(!collapsed || mobile) && 'Upload'}
        </Button>
      </div>
      <nav className="flex-1 space-y-0.5 px-2" aria-label="Application">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            title={collapsed && !mobile ? n.label : undefined}
            className={({ isActive }) =>
              cn('flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors', isActive ? 'bg-accent-soft text-accent-ink' : 'text-ink-soft hover:bg-line/50 hover:text-ink', collapsed && !mobile && 'justify-center px-0')
            }
          >
            <n.icon className="h-[18px] w-[18px] shrink-0" />
            {(!collapsed || mobile) && n.label}
          </NavLink>
        ))}
      </nav>
      {!mobile && (
        <button onClick={() => setCollapsed((c) => !c)} className="m-2 flex items-center justify-center gap-2 rounded-md border border-line px-2 py-1.5 text-xs text-ink-muted hover:text-ink" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          {!collapsed && 'Collapse'}
        </button>
      )}
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      {/* Desktop sidebar */}
      <aside className={cn('hidden shrink-0 border-r border-line bg-surface transition-[width] duration-200 lg:block', collapsed ? 'w-16' : 'w-60')}>{sidebar(false)}</aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setDrawer(false)} />
          <aside className="animate-fade-in absolute inset-y-0 left-0 w-72 bg-surface shadow-pop">{sidebar(true)}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-3 sm:px-4">
          <div className="flex items-center gap-2">
            <button className="rounded-md p-2 text-ink lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-sm font-medium text-ink-soft lg:hidden">DocuEase AI</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Dropdown
              trigger={
                <button className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-line/50" aria-label="Account menu">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-ink">{user?.displayName?.[0]?.toUpperCase() ?? '?'}</span>
                  <span className="hidden max-w-32 truncate sm:inline">{user?.displayName}</span>
                </button>
              }
            >
              <div className="px-2.5 py-1.5 text-xs text-ink-muted">{user?.email}</div>
              <DropdownSeparator />
              <DropdownItem icon={<Settings className="h-4 w-4" />} onClick={() => navigate('/app/settings')}>
                Settings
              </DropdownItem>
              <DropdownItem icon={<LogOut className="h-4 w-4" />} onClick={onLogout}>
                Sign out
              </DropdownItem>
            </Dropdown>
          </div>
        </header>
        <main className={cn('min-h-0 flex-1', isWorkspace ? 'overflow-hidden' : 'overflow-y-auto')}>
          <div className={cn(isWorkspace ? 'h-full' : 'mx-auto max-w-6xl px-4 py-6 sm:px-6')}>
            <Outlet />
          </div>
        </main>
      </div>

      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  );
}
