'use client';

import { ReactNode, useState, useRef, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import {
  Box,
  LayoutDashboard,
  Package,
  Users,
  Receipt,
  FileSpreadsheet,
  Wallet,
  Banknote,
  BarChart3,
  Settings,
  Plus,
  LogOut,
  Archive,
  ShieldCheck,
  Search,
  ChevronDown,
  Building2,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'shipments'
  | 'drafts'
  | 'customers'
  | 'billing'
  | 'quotation'
  | 'expenses'
  | 'reports'
  | 'cash_book'
  | 'settings'
  | 'staff'
  | 'new_lr';

interface AppShellProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  children: ReactNode;
  navCounts?: Partial<Record<NavTab, number>>;
}

export default function AppShell({ activeTab, onTabChange, children, navCounts }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: session } = useSession();
  const userName = session?.user?.name || 'Logistics Admin';
  const userEmail = session?.user?.email || 'admin@rudracargo.com';
  const userRole = (session?.user as any)?.role || 'staff';
  const isAdmin = userRole === 'admin';

  // Account dropdown state
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click or Escape key
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setAccountMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const userInitials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  const getBreadcrumb = (tab: NavTab) => {
    switch (tab) {
      case 'dashboard':
        return { section: 'Main Menu', label: 'Dashboard', icon: LayoutDashboard };
      case 'shipments':
        return { section: 'Main Menu', label: 'Shipments', icon: Package };
      case 'drafts':
        return { section: 'Main Menu', label: 'Drafts', icon: Archive };
      case 'customers':
        return { section: 'Main Menu', label: 'Customers', icon: Users };
      case 'billing':
        return { section: 'Finance & Reports', label: 'Billing', icon: Receipt };
      case 'quotation':
        return { section: 'Finance & Reports', label: 'Quotation', icon: FileSpreadsheet };
      case 'expenses':
        return { section: 'Finance & Reports', label: 'Expenses', icon: Wallet };
      case 'reports':
        return { section: 'Finance & Reports', label: 'Reports', icon: BarChart3 };
      case 'cash_book':
        return { section: 'Finance & Reports', label: 'Cash Book', icon: Banknote };
      case 'staff':
        return { section: 'System', label: 'Staff Management', icon: ShieldCheck };
      case 'settings':
        return { section: 'System', label: 'Company Settings', icon: Settings };
      case 'new_lr':
        return { section: 'Main Menu', label: 'Create New LR', icon: Plus };
      default:
        return { section: 'Main Menu', label: 'Dashboard', icon: LayoutDashboard };
    }
  };

  const breadcrumb = getBreadcrumb(activeTab);
  const BreadcrumbIcon = breadcrumb.icon;

  const mainNavItems = [
    { id: 'dashboard' as NavTab, label: 'Dashboard', icon: LayoutDashboard, adminOnly: false },
    { id: 'shipments' as NavTab, label: 'Shipments', icon: Package, adminOnly: false },
    { id: 'drafts' as NavTab, label: 'Drafts', icon: Archive, adminOnly: false },
    { id: 'customers' as NavTab, label: 'Customers', icon: Users, adminOnly: false },
  ];

  const financeNavItems = [
    { id: 'billing' as NavTab, label: 'Billing', icon: Receipt, adminOnly: false },
    { id: 'quotation' as NavTab, label: 'Quotation', icon: FileSpreadsheet, adminOnly: false },
    { id: 'expenses' as NavTab, label: 'Expenses', icon: Wallet, adminOnly: false },
    { id: 'reports' as NavTab, label: 'Reports', icon: BarChart3, adminOnly: true },
    { id: 'cash_book' as NavTab, label: 'Cash Book', icon: Banknote, adminOnly: true },
  ];

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/login' });
  };

  const navigateTab = (tab: NavTab) => {
    onTabChange(tab);
    setAccountMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#F6F8FB] flex text-slate-900 font-sans">
      {/* Left Sidebar Shell (260px width, White BG, #EEF2F5 border) */}
      <aside
        className={`${
          collapsed ? 'w-[76px]' : 'w-[260px]'
        } bg-white border-r border-[#EEF2F5] flex-col p-5 shrink-0 hidden md:flex sticky top-0 self-start h-screen shadow-saas transition-all duration-200 z-20`}
      >
        {/* Scrollable nav section */}
        <div className="space-y-6 flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1">
          {/* Brand Header & Organization */}
          <div className="px-2 space-y-3">
            <div className={`flex items-center ${collapsed ? 'justify-between' : 'justify-between'}`}>
              <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
                <div className="w-9 h-9 bg-white border border-slate-200/80 rounded-xl flex items-center justify-center shadow-saas overflow-hidden p-0.5 shrink-0">
                  <img src="/rudra-logo.png" alt="Rudra Cargo Logo" className="w-full h-full object-contain" />
                </div>
                {!collapsed && (
                  <div>
                    <span className="font-bold text-base tracking-tight text-slate-900 block leading-none">Rudra Cargo</span>
                    <span className="text-[11px] text-slate-500 font-medium mt-0.5 block">Transport & Logistics</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="w-7 h-7 shrink-0 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50 flex items-center justify-center transition-saas cursor-pointer"
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-5">
            {/* MAIN SECTION */}
            <div className="space-y-1">
              {!collapsed && (
                <div className="px-3 text-[10px] font-bold tracking-wider text-slate-400 uppercase font-mono mb-1.5">
                  OVERVIEW
                </div>
              )}
              {mainNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const count = navCounts?.[item.id];
                return (
                  <button
                    key={item.id}
                    onClick={() => onTabChange(item.id)}
                    title={collapsed ? item.label : undefined}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-saas cursor-pointer ${
                      collapsed ? 'justify-center' : ''
                    } ${
                      isActive
                        ? 'bg-[#0A2030]/10 text-[#0A2030] font-semibold shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#0A2030]' : 'text-slate-400'}`} />
                    {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
                    {!collapsed && !!count && (
                      <span
                        className={`text-[10px] font-mono tabular-nums ${
                          isActive ? 'text-[#0A2030]/70' : 'text-slate-400'
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* FINANCE SECTION */}
            <div className="space-y-1">
              {!collapsed && (
                <div className="px-3 text-[10px] font-bold tracking-wider text-slate-400 uppercase font-mono mb-1.5">
                  FINANCE & REPORTS
                </div>
              )}
              {financeNavItems
                .filter((item) => !item.adminOnly || isAdmin)
                .map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onTabChange(item.id)}
                      title={collapsed ? item.label : undefined}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-saas cursor-pointer ${
                        collapsed ? 'justify-center' : ''
                      } ${
                        isActive
                          ? 'bg-[#0A2030]/10 text-[#0A2030] font-semibold shadow-2xs'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#0A2030]' : 'text-slate-400'}`} />
                      {!collapsed && <span>{item.label}</span>}
                    </button>
                  );
                })}
            </div>

            {/* SETTINGS ITEM */}
            {isAdmin && (
              <div className="pt-3 border-t border-slate-100 space-y-1">
                {!collapsed && (
                  <div className="px-3 text-[10px] font-bold tracking-wider text-slate-400 uppercase font-mono mb-1.5">
                    SYSTEM
                  </div>
                )}
                <button
                  onClick={() => onTabChange('staff')}
                  title={collapsed ? 'Staff Management' : undefined}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-saas cursor-pointer ${
                    collapsed ? 'justify-center' : ''
                  } ${
                    activeTab === 'staff'
                      ? 'bg-[#0A2030]/10 text-[#0A2030] font-semibold shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <ShieldCheck className={`w-4 h-4 shrink-0 ${activeTab === 'staff' ? 'text-[#0A2030]' : 'text-slate-400'}`} />
                  {!collapsed && <span>Staff Management</span>}
                </button>
                <button
                  onClick={() => onTabChange('settings')}
                  title={collapsed ? 'Company Settings' : undefined}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-saas cursor-pointer ${
                    collapsed ? 'justify-center' : ''
                  } ${
                    activeTab === 'settings'
                      ? 'bg-[#0A2030]/10 text-[#0A2030] font-semibold shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Settings className={`w-4 h-4 shrink-0 ${activeTab === 'settings' ? 'text-[#0A2030]' : 'text-slate-400'}`} />
                  {!collapsed && <span>Company Settings</span>}
                </button>
              </div>
            )}
          </nav>
        </div>

        {/* Bottom Sidebar Action Buttons */}
        <div className="pt-4 mt-4 border-t border-slate-100 shrink-0">
          <button
            onClick={handleSignOut}
            title={collapsed ? 'Sign out' : undefined}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-saas cursor-pointer ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <LogOut className="w-4 h-4 shrink-0 text-slate-400" />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        {/* Desktop Header Navigation Bar (Hidden on Mobile) */}
        <header className="hidden md:flex h-[72px] bg-white border-b border-[#EEF1F4] px-6 items-center justify-between gap-4 shrink-0 sticky top-0 z-30 shadow-2xs">
          {/* Left: Breadcrumb Root location indicator */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-normal">{breadcrumb.section}</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-900 font-semibold flex items-center gap-1.5">
              <BreadcrumbIcon className="w-4 h-4 text-slate-700" />
              <span>{breadcrumb.label}</span>
            </span>
          </div>

          {/* Right Top Bar Controls */}
          <div className="flex items-center gap-3">
            {/* Quick Search */}
            <div className="relative w-40 sm:w-56">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Search dockets..."
                onFocus={() => {
                  if (activeTab !== 'shipments') onTabChange('shipments');
                }}
                className="w-full h-9 pl-9 pr-3 bg-[#F8FAFC] border border-slate-200/80 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0A2030] focus:ring-4 focus:ring-[#0A2030]/10 transition-saas"
              />
            </div>

            <div className="h-6 w-px bg-slate-200/80 mx-1 hidden sm:block"></div>

            {/* New LR Quick-Action Button */}
            <button
              onClick={() => onTabChange('new_lr')}
              className="hidden sm:flex items-center gap-1.5 h-9 px-4 bg-[#0A2030] hover:bg-[#071520] text-white font-semibold text-xs rounded-xl shadow-saas transition-saas shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>New LR</span>
            </button>

            <div className="h-6 w-px bg-slate-200/80 mx-1 hidden sm:block"></div>

            {/* User Profile Pill & Interactive Account Dropdown */}
            <div className="relative" ref={accountRef}>
              <button
                onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                className={`flex items-center gap-2.5 p-1 pr-3 rounded-xl border transition-saas cursor-pointer select-none text-left ${
                  accountMenuOpen
                    ? 'border-[#0A2030] bg-[#0A2030]/5 ring-2 ring-[#0A2030]/10'
                    : 'border-slate-200/80 bg-white hover:bg-slate-50/80'
                }`}
                aria-label="User Account Menu"
              >
                <div className="w-8 h-8 rounded-lg bg-[#0A2030]/10 text-[#0A2030] font-bold text-xs flex items-center justify-center font-mono border border-slate-200 shrink-0">
                  {userInitials}
                </div>
                <div className="hidden lg:block text-left">
                  <div className="text-xs font-semibold text-slate-900 leading-tight">{userName}</div>
                  <div className="text-[11px] text-slate-400 font-medium leading-none">{userEmail}</div>
                </div>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
                    accountMenuOpen ? 'rotate-180 text-[#0A2030]' : ''
                  }`}
                />
              </button>

              {/* Account Dropdown Menu Box */}
              {accountMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200/90 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#EEF4FF] text-[#2563EB] font-bold text-sm flex items-center justify-center font-mono border border-blue-100 shadow-2xs">
                        {userInitials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-900 truncate">{userName}</div>
                        <div className="text-[11px] text-slate-500 truncate">{userEmail}</div>
                        <div className="mt-1">
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold font-mono uppercase bg-[#EEF4FF] text-[#2563EB] border border-blue-100">
                            {isAdmin ? 'ADMIN ACCESS' : 'STAFF OPERATOR'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-2 space-y-0.5">
                    <button
                      onClick={() => navigateTab('shipments')}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-xl transition-colors cursor-pointer"
                    >
                      <Package className="w-4 h-4 text-slate-400" />
                      <span>All Shipments</span>
                    </button>
                    <button
                      onClick={() => navigateTab('billing')}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-xl transition-colors cursor-pointer"
                    >
                      <Receipt className="w-4 h-4 text-slate-400" />
                      <span>Billing & Invoices</span>
                    </button>
                    <button
                      onClick={() => navigateTab('expenses')}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-xl transition-colors cursor-pointer"
                    >
                      <Wallet className="w-4 h-4 text-slate-400" />
                      <span>Expense Ledgers</span>
                    </button>

                    {isAdmin && (
                      <>
                        <div className="my-1 border-t border-slate-100" />
                        <button
                          onClick={() => navigateTab('reports')}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-xl transition-colors cursor-pointer"
                        >
                          <BarChart3 className="w-4 h-4 text-slate-400" />
                          <span>Reports & Analytics</span>
                        </button>
                        <button
                          onClick={() => navigateTab('staff')}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-xl transition-colors cursor-pointer"
                        >
                          <ShieldCheck className="w-4 h-4 text-slate-400" />
                          <span>Staff Management</span>
                        </button>
                        <button
                          onClick={() => navigateTab('settings')}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-xl transition-colors cursor-pointer"
                        >
                          <Settings className="w-4 h-4 text-slate-400" />
                          <span>Company Settings</span>
                        </button>
                      </>
                    )}
                  </div>

                  <div className="p-2 border-t border-slate-100 bg-slate-50/50">
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 text-rose-500" />
                      <span>Sign out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Mobile Clean Header Navigation Bar (Visible only on mobile) */}
        <header className="flex md:hidden h-14 bg-white border-b border-slate-200 px-4 items-center justify-between sticky top-0 z-40 shadow-2xs gap-3">
          {/* Hamburger Drawer Toggle & Brand Logo */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-50 cursor-pointer"
              aria-label="Open mobile menu"
            >
              <Menu className="w-4.5 h-4.5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-white border border-slate-200 rounded-lg flex items-center justify-center overflow-hidden p-0.5 shrink-0 shadow-2xs">
                <img src="/rudra-logo.png" alt="Logo" className="w-full h-full object-contain" />
              </div>
              <span className="font-extrabold text-sm text-slate-900 tracking-tight">Rudra Cargo</span>
            </div>
          </div>

          {/* Right Mobile Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onTabChange('new_lr')}
              className="h-8 px-3 bg-[#0A2030] hover:bg-[#071520] text-white font-bold text-xs rounded-xl flex items-center gap-1 shadow-2xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New LR</span>
            </button>

            {/* Mobile User Profile Avatar Menu */}
            <div className="relative">
              <button
                onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                className="w-8 h-8 rounded-xl bg-[#0A2030]/10 text-[#0A2030] font-mono font-bold text-xs flex items-center justify-center border border-slate-200 cursor-pointer"
                aria-label="Mobile User Account Menu"
              >
                {userInitials}
              </button>

              {accountMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden">
                  <div className="p-3 border-b border-slate-100 bg-slate-50">
                    <div className="text-xs font-bold text-slate-900 truncate">{userName}</div>
                    <div className="text-[11px] text-slate-500 truncate">{userEmail}</div>
                  </div>
                  <div className="p-2 space-y-1">
                    <button
                      onClick={() => navigateTab('shipments')}
                      className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-xl"
                    >
                      Shipments
                    </button>
                    <button
                      onClick={() => navigateTab('billing')}
                      className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-xl"
                    >
                      Billing
                    </button>
                    <button
                      onClick={handleSignOut}
                      className="w-full text-left px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Mobile Sliding Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex md:hidden">
            <div className="w-72 bg-white h-full p-5 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-left duration-200 shadow-2xl">
              <div className="space-y-6">
                {/* Header in Mobile Drawer */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 bg-white border border-slate-200 rounded-xl flex items-center justify-center overflow-hidden p-0.5 shadow-2xs">
                      <img src="/rudra-logo.png" alt="Logo" className="w-full h-full object-contain" />
                    </div>
                    <div>
                      <span className="font-extrabold text-sm text-slate-900 block leading-none">Rudra Cargo</span>
                      <span className="text-[10px] text-slate-400 font-medium">Navigation</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-8 h-8 rounded-xl border border-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Mobile Drawer Links */}
                <div className="space-y-5">
                  {/* OVERVIEW */}
                  <div className="space-y-1">
                    <div className="px-3 text-[10px] font-bold tracking-wider text-slate-400 uppercase font-mono mb-1.5">
                      OVERVIEW
                    </div>
                    {mainNavItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      const count = navCounts?.[item.id];
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            onTabChange(item.id);
                            setMobileMenuOpen(false);
                          }}
                          className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium cursor-pointer ${
                            isActive
                              ? 'bg-[#0A2030]/10 text-[#0A2030] font-bold shadow-2xs'
                              : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#0A2030]' : 'text-slate-400'}`} />
                          <span className="flex-1 text-left">{item.label}</span>
                          {!!count && (
                            <span className="text-[10px] font-mono text-slate-400">{count}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* FINANCE */}
                  <div className="space-y-1">
                    <div className="px-3 text-[10px] font-bold tracking-wider text-slate-400 uppercase font-mono mb-1.5">
                      FINANCE & REPORTS
                    </div>
                    {financeNavItems
                      .filter((item) => !item.adminOnly || isAdmin)
                      .map((item) => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => {
                              onTabChange(item.id);
                              setMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium cursor-pointer ${
                              isActive
                                ? 'bg-[#0A2030]/10 text-[#0A2030] font-bold shadow-2xs'
                                : 'text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#0A2030]' : 'text-slate-400'}`} />
                            <span className="flex-1 text-left">{item.label}</span>
                          </button>
                        );
                      })}
                  </div>

                  {/* SYSTEM */}
                  {isAdmin && (
                    <div className="pt-3 border-t border-slate-100 space-y-1">
                      <div className="px-3 text-[10px] font-bold tracking-wider text-slate-400 uppercase font-mono mb-1.5">
                        SYSTEM
                      </div>
                      <button
                        onClick={() => {
                          onTabChange('staff');
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium cursor-pointer ${
                          activeTab === 'staff' ? 'bg-[#0A2030]/10 text-[#0A2030] font-bold' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <ShieldCheck className="w-4 h-4 text-slate-400" />
                        <span>Staff Management</span>
                      </button>
                      <button
                        onClick={() => {
                          onTabChange('settings');
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium cursor-pointer ${
                          activeTab === 'settings' ? 'bg-[#0A2030]/10 text-[#0A2030] font-bold' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Settings className="w-4 h-4 text-slate-400" />
                        <span>Company Settings</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Sign out button at bottom of drawer */}
              <div className="pt-4 border-t border-slate-100">
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4 text-rose-500" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
            {/* Click backdrop to close drawer */}
            <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
          </div>
        )}

        {/* Dynamic Section Content */}
        <main className="flex-1 p-6 md:p-8 space-y-6 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
