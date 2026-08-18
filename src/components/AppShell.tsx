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
  | 'settings'
  | 'staff'
  | 'new_lr';

interface AppShellProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  children: ReactNode;
}

export default function AppShell({ activeTab, onTabChange, children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
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
            <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
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
              {!collapsed && (
                <button
                  onClick={() => setCollapsed(true)}
                  className="w-7 h-7 shrink-0 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50 flex items-center justify-center transition-saas cursor-pointer"
                  title="Collapse sidebar"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              )}
            </div>

            {collapsed ? (
              <button
                onClick={() => setCollapsed(false)}
                className="w-full flex items-center justify-center py-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-saas cursor-pointer"
                title="Expand sidebar"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            ) : (
              <div className="pt-1 flex items-center justify-between bg-slate-50 border border-slate-100 p-2 rounded-xl">
                <div className="flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-700">Rudra NX Desk</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold font-mono bg-[#EEF4FF] text-[#2563EB]">
                  {isAdmin ? 'ADMIN' : 'STAFF'}
                </span>
              </div>
            )}
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
                return (
                  <button
                    key={item.id}
                    onClick={() => onTabChange(item.id)}
                    title={collapsed ? item.label : undefined}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-saas cursor-pointer ${
                      collapsed ? 'justify-center' : ''
                    } ${
                      isActive
                        ? 'bg-[#EEF4FF] text-[#2563EB] font-semibold shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#2563EB]' : 'text-slate-400'}`} />
                    {!collapsed && <span>{item.label}</span>}
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
                          ? 'bg-[#EEF4FF] text-[#2563EB] font-semibold shadow-2xs'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#2563EB]' : 'text-slate-400'}`} />
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
                      ? 'bg-[#EEF4FF] text-[#2563EB] font-semibold shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <ShieldCheck className={`w-4 h-4 shrink-0 ${activeTab === 'staff' ? 'text-[#2563EB]' : 'text-slate-400'}`} />
                  {!collapsed && <span>Staff Management</span>}
                </button>
                <button
                  onClick={() => onTabChange('settings')}
                  title={collapsed ? 'Company Settings' : undefined}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-saas cursor-pointer ${
                    collapsed ? 'justify-center' : ''
                  } ${
                    activeTab === 'settings'
                      ? 'bg-[#EEF4FF] text-[#2563EB] font-semibold shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Settings className={`w-4 h-4 shrink-0 ${activeTab === 'settings' ? 'text-[#2563EB]' : 'text-slate-400'}`} />
                  {!collapsed && <span>Company Settings</span>}
                </button>
              </div>
            )}
          </nav>
        </div>

        {/* Bottom Sidebar Action Buttons */}
        <div className="space-y-3 pt-4 mt-4 border-t border-slate-100 shrink-0">
          <button
            onClick={() => onTabChange('new_lr')}
            title={collapsed ? 'Create New LR' : undefined}
            className="w-full h-11 bg-[#2563EB] hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-saas transition-saas flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
          >
            <Plus className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Create New LR</span>}
          </button>

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
        {/* Top Header Navigation Bar (72px height) */}
        <header className="h-[72px] bg-white border-b border-[#EEF1F4] px-6 flex items-center justify-between shrink-0 sticky top-0 z-30 shadow-2xs">
          {/* Left: Quick Search */}
          <div className="flex items-center gap-4 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Search dockets, clients, tracking #..."
                onFocus={() => {
                  if (activeTab !== 'shipments') onTabChange('shipments');
                }}
                className="w-full h-10 pl-10 pr-4 bg-[#F8FAFC] border border-slate-200/80 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10 transition-saas"
              />
            </div>
          </div>

          {/* Right Top Bar Controls */}
          <div className="flex items-center gap-3">
            {/* Quick Action Button */}
            <button
              onClick={() => onTabChange('new_lr')}
              className="h-10 px-4 bg-[#2563EB] hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-saas transition-saas flex items-center gap-1.5 cursor-pointer hidden sm:flex"
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
                    ? 'border-[#2563EB] bg-blue-50/40 ring-2 ring-[#2563EB]/10'
                    : 'border-slate-200/80 bg-white hover:bg-slate-50/80'
                }`}
                aria-label="User Account Menu"
              >
                <div className="w-8 h-8 rounded-lg bg-[#EEF4FF] text-[#2563EB] font-bold text-xs flex items-center justify-center font-mono border border-blue-100 shrink-0">
                  {userInitials}
                </div>
                <div className="hidden lg:block text-left">
                  <div className="text-xs font-semibold text-slate-900 leading-tight">{userName}</div>
                  <div className="text-[11px] text-slate-400 font-medium leading-none">{userEmail}</div>
                </div>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
                    accountMenuOpen ? 'rotate-180 text-[#2563EB]' : ''
                  }`}
                />
              </button>

              {/* Account Dropdown Menu Box */}
              {accountMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200/90 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                  {/* Account Header */}
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

                  {/* Navigation Shortcuts */}
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

                  {/* Sign Out */}
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

        {/* Mobile Header Bar */}
        <header className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#2563EB] text-white rounded-xl flex items-center justify-center shadow-saas">
              <Box className="w-4 h-4" />
            </div>
            <span className="font-bold text-sm text-slate-900">Rudra Cargo</span>
          </div>
          <button
            onClick={() => onTabChange('new_lr')}
            className="h-9 px-3 bg-[#2563EB] text-white font-medium text-xs rounded-xl flex items-center gap-1 shadow-saas"
          >
            <Plus className="w-4 h-4" />
            <span>New LR</span>
          </button>
        </header>

        {/* Dynamic Section Content */}
        <main className="flex-1 p-6 md:p-8 space-y-6 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
