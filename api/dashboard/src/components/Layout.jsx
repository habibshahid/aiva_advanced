import React, { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Bot, 
  DollarSign, 
  Phone, 
  LogOut,
  Menu,
  X,
  Activity,
  Mic,
  BookOpen,
  MessageSquare,
  Store,
  Users,
  HelpCircle,
  Settings,
  ChevronRight,
  BarChart3,
  TrendingUp,
  Target,
  Star,
  Bell,
  Shield,
  ChevronLeft
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Layout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  // Ref to track the navigation scroll position
  const navScrollRef = useRef(null);
  const scrollPositionRef = useRef(0);

  // Auto-expand sections based on current path
  useEffect(() => {
    if (location.pathname.startsWith('/analytics')) {
      setAnalyticsOpen(true);
    }
    if (location.pathname.startsWith('/settings')) {
      setSettingsOpen(true);
    }
  }, [location.pathname]);

  // Load collapsed state from localStorage
  useEffect(() => {
    const collapsed = localStorage.getItem('sidebarCollapsed');
    if (collapsed) {
      setSidebarCollapsed(collapsed === 'true');
    }
  }, []);

  // Save and restore scroll position
  useEffect(() => {
    if (navScrollRef.current) {
      // Restore scroll position after state changes
      navScrollRef.current.scrollTop = scrollPositionRef.current;
    }
  }, [analyticsOpen, settingsOpen]);

  // Save collapsed state to localStorage
  const toggleSidebarCollapse = () => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', newState.toString());
  };

  // Handle collapsible section toggle without scrolling
  const handleSectionToggle = (setIsOpen, currentState) => {
    // Save current scroll position
    if (navScrollRef.current) {
      scrollPositionRef.current = navScrollRef.current.scrollTop;
    }
    // Toggle the section
    setIsOpen(!currentState);
  };

  // Navigation sections with grouping
  const navigationSections = [
    {
      title: 'Main',
      items: [
        { 
          name: 'Dashboard', 
          href: '/', 
          icon: LayoutDashboard,
          roles: ['super_admin', 'admin', 'agent_manager', 'client']
        },
        { 
          name: 'Live Monitor', 
          href: '/monitor', 
          icon: Activity,
          roles: ['super_admin', 'admin', 'agent_manager'],
          badge: 'live'
        }
      ]
    },
    {
      title: 'AI Agents',
      items: [
        { 
          name: 'Agents', 
          href: '/agents', 
          icon: Bot,
          roles: ['super_admin', 'admin', 'agent_manager', 'client']
        },
        { 
          name: 'Knowledge Base', 
          href: '/knowledge', 
          icon: BookOpen,
          roles: ['super_admin', 'admin', 'agent_manager', 'client']
        },
        { 
          name: 'Shopify Stores', 
          href: '/shopify', 
          icon: Store,
          roles: ['super_admin', 'admin', 'agent_manager']
        },
        { 
          name: 'Calls', 
          href: '/calls', 
          icon: Phone,
          roles: ['super_admin', 'admin', 'agent_manager', 'client']
        }
      ]
    },
    {
      title: 'Analytics & Reports',
      collapsible: true,
      isOpen: analyticsOpen,
      setIsOpen: setAnalyticsOpen,
      icon: BarChart3,
      items: [
        { 
          name: 'Overview', 
          href: '/analytics/dashboard', 
          icon: LayoutDashboard,
          roles: ['super_admin', 'admin', 'agent_manager'],
          submenu: true
        },
        { 
          name: 'Calls Report', 
          href: '/analytics/calls', 
          icon: Phone,
          roles: ['super_admin', 'admin', 'agent_manager'],
          submenu: true
        },
        { 
          name: 'Chat Report', 
          href: '/analytics/chats', 
          icon: MessageSquare,
          roles: ['super_admin', 'admin', 'agent_manager'],
          submenu: true
        },
        { 
          name: 'Advanced Analytics', 
          href: '/analytics/advanced', 
          icon: TrendingUp,
          roles: ['super_admin', 'admin', 'agent_manager'],
          submenu: true
        },
        { 
          name: 'Cost & Performance', 
          href: '/analytics/costs', 
          icon: Target,
          roles: ['super_admin', 'admin'],
          submenu: true
        },
        { 
          name: 'Customer Satisfaction', 
          href: '/analytics/satisfaction', 
          icon: Star,
          roles: ['super_admin', 'admin', 'agent_manager'],
          submenu: true
        }
      ]
    },
    {
      title: 'Testing & Development',
      items: [
        { 
          name: 'Test Voice Call', 
          href: '/test', 
          icon: Mic,
          roles: ['super_admin', 'admin', 'agent_manager']
        },
        { 
          name: 'Test Chat', 
          href: '/agent-test', 
          icon: MessageSquare,
          roles: ['super_admin', 'admin', 'agent_manager']
        }
      ]
    },
    {
      title: 'Administration',
      items: [
        { 
          name: 'Users', 
          href: '/users', 
          icon: Users,
          roles: ['super_admin', 'admin']
        }
      ],
      collapsibleItems: [
        {
          title: 'Settings',
          collapsible: true,
          isOpen: settingsOpen,
          setIsOpen: setSettingsOpen,
          icon: Settings,
          items: [
            { 
              name: 'System Settings', 
              href: '/settings/system', 
              icon: Settings,
              roles: ['super_admin'],
              submenu: true
            },
            { 
              name: 'Notifications', 
              href: '/settings/notifications', 
              icon: Bell,
              roles: ['super_admin', 'admin'],
              submenu: true
            }
          ]
        }
      ],
      bottomItems: [
        { 
          name: 'Help Center', 
          href: '/help', 
          icon: HelpCircle,
          roles: ['super_admin', 'admin', 'agent_manager', 'client']
        }
      ]
    }
  ];

  const isActive = (href) => {
    if (href === '/') return location.pathname === '/';
    return location.pathname.startsWith(href);
  };

  const hasPermission = (roles) => {
    if (!roles) return true;
    if (!user?.role) return false;
    return roles.includes(user.role);
  };

  const renderNavItem = (item, isMobile = false) => {
    if (!hasPermission(item.roles)) return null;
    
    const Icon = item.icon;
    const active = isActive(item.href);
    
    return (
      <Link
        key={item.name}
        to={item.href}
        className={`flex items-center px-4 py-2.5 text-sm font-medium rounded-md transition-all group ${
          item.submenu ? 'pl-12' : ''
        } ${
          active
            ? 'bg-primary-100 text-primary-700 border-r-3 border-primary-600'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`}
        onClick={(e) => {
          // Save scroll position before navigation
          if (navScrollRef.current) {
            scrollPositionRef.current = navScrollRef.current.scrollTop;
          }
          if (isMobile) {
            setSidebarOpen(false);
          }
        }}
        title={sidebarCollapsed ? item.name : ''}
      >
        <Icon className={`${sidebarCollapsed ? 'w-5 h-5' : 'w-5 h-5'} ${item.submenu && !sidebarCollapsed ? 'mr-2' : sidebarCollapsed ? '' : 'mr-3'} flex-shrink-0`} />
        {!sidebarCollapsed && (
          <>
            <span className="flex-1">{item.name}</span>
            {item.badge === 'live' && (
              <span className="ml-2 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
            )}
          </>
        )}
      </Link>
    );
  };

  const renderCollapsibleSection = (section) => {
    if (!hasPermission(section.items[0]?.roles)) return null;
    
    const Icon = section.icon;
    
    // In collapsed mode, show icon with tooltip
    if (sidebarCollapsed) {
      return (
        <div key={section.title} className="mb-1 relative group">
          <div className="flex items-center justify-center px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 rounded-md cursor-pointer">
            <Icon className="w-5 h-5 flex-shrink-0" />
          </div>
          {/* Tooltip on hover */}
          <div className="absolute left-full ml-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
            {section.title || 'Settings'}
          </div>
        </div>
      );
    }
    
    return (
      <div key={section.title} className="mb-1">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSectionToggle(section.setIsOpen, section.isOpen);
          }}
          className="flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 rounded-md transition-all"
        >
          <div className="flex items-center">
            <Icon className="w-5 h-5 mr-3 flex-shrink-0" />
            <span>{section.title || 'Settings'}</span>
          </div>
          <ChevronRight 
            className={`w-4 h-4 transition-transform ${section.isOpen ? 'rotate-90' : ''}`}
          />
        </button>
        {section.isOpen && (
          <div className="mt-1 space-y-1 bg-gray-50 rounded-md py-1">
            {section.items.map(item => renderNavItem(item))}
          </div>
        )}
      </div>
    );
  };

  const SidebarContent = ({ isMobile = false }) => (
    <>
      {/* User Info */}
      {!sidebarCollapsed && (
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center mb-3">
            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
              <span className="text-primary-600 font-medium text-lg">
                {user?.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="ml-3 flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.name}
              </p>
              <p className="text-xs text-gray-500 truncate capitalize">
                {user?.role?.replace('_', ' ')}
              </p>
            </div>
          </div>
          
          {/* Quick Credit View */}
          {hasPermission(['super_admin', 'admin']) && (
            <Link
              to="/credits"
              className="flex items-center justify-between px-3 py-2 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
              onClick={() => isMobile && setSidebarOpen(false)}
            >
              <div className="flex items-center">
                <DollarSign className="w-4 h-4 text-amber-700 mr-2" />
                <span className="text-xs text-amber-700">Credits</span>
              </div>
              <span className="text-sm font-bold text-amber-900">View</span>
            </Link>
          )}
        </div>
      )}
      
      {/* Collapsed user avatar */}
      {sidebarCollapsed && (
        <div className="p-4 border-b border-gray-200 flex justify-center">
          <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center group relative">
            <span className="text-primary-600 font-medium text-lg">
              {user?.name?.charAt(0).toUpperCase()}
            </span>
            {/* Tooltip */}
            <div className="absolute left-full ml-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
              {user?.name}
            </div>
          </div>
        </div>
      )}
      
      {/* Navigation Sections - THIS WILL NOT AUTO-SCROLL */}
      <nav 
        ref={navScrollRef}
        className="flex-1 px-2 py-4 space-y-6 overflow-y-auto"
        style={{ scrollBehavior: 'auto' }}
      >
        {navigationSections.map((section, idx) => {
          const hasAnyPermission = section.items?.some(item => hasPermission(item.roles)) ||
                                   section.collapsibleItems?.some(ci => ci.items.some(item => hasPermission(item.roles)));
          
          if (!hasAnyPermission) return null;
          
          return (
            <div key={idx}>
              {/* Section Title */}
              {section.title && !sidebarCollapsed && (
                <div className="px-4 mb-2">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {section.title}
                  </h3>
                </div>
              )}
              
              {/* Regular Items */}
              <div className={`space-y-1 ${sidebarCollapsed ? 'flex flex-col items-center' : ''}`}>
                {section.collapsible ? (
                  renderCollapsibleSection(section)
                ) : (
                  <>
                    {section.items?.map(item => renderNavItem(item, isMobile))}
                    {section.collapsibleItems?.map(collapsible => 
                      renderCollapsibleSection(collapsible)
                    )}
                    {section.bottomItems?.map(item => renderNavItem(item, isMobile))}
                  </>
                )}
              </div>
              
              {/* Divider */}
              {idx < navigationSections.length - 1 && !sidebarCollapsed && (
                <div className="mt-4 border-t border-gray-200" />
              )}
            </div>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t">
        <button
          onClick={logout}
          className={`flex items-center w-full px-4 py-2.5 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-50 hover:text-gray-900 transition-all group relative ${sidebarCollapsed ? 'justify-center' : ''}`}
          title={sidebarCollapsed ? 'Logout' : ''}
        >
          <LogOut className={`w-5 h-5 ${sidebarCollapsed ? '' : 'mr-3'}`} />
          {!sidebarCollapsed && 'Logout'}
          {sidebarCollapsed && (
            <div className="absolute left-full ml-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
              Logout
            </div>
          )}
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 z-40 lg:hidden ${sidebarOpen ? '' : 'hidden'}`}>
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
        
        <div className="fixed inset-y-0 left-0 flex flex-col w-64 bg-white">
          <div className="flex items-center justify-between h-16 px-4 border-b">
            <span className="text-xl font-bold text-primary-600">AiVA Manager</span>
            <button onClick={() => setSidebarOpen(false)}>
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <SidebarContent isMobile={true} />
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className={`hidden lg:fixed lg:inset-y-0 lg:flex lg:flex-col transition-all duration-300 ${sidebarCollapsed ? 'lg:w-20' : 'lg:w-64'}`}>
        <div className="flex flex-col flex-1 min-h-0 bg-white border-r">
          <div className="flex items-center justify-between h-16 px-4 border-b">
            {!sidebarCollapsed && <span className="text-xl font-bold text-primary-600">AiVA Manager</span>}
            {sidebarCollapsed && <span className="text-xl font-bold text-primary-600">AI</span>}
            <button
              onClick={toggleSidebarCollapse}
              className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="w-5 h-5 text-gray-600" />
              ) : (
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              )}
            </button>
          </div>
          
          <SidebarContent />
        </div>
      </div>

      {/* Main content */}
      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div className="sticky top-0 z-10 flex h-16 bg-white border-b lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="px-4 text-gray-500 focus:outline-none"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center flex-1 px-4">
            <span className="text-xl font-bold text-primary-600">AiVA Manager</span>
          </div>
        </div>

        <main className="py-6">
          <div className="px-4 mx-auto max-w-7xl sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;