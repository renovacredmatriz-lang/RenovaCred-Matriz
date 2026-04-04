import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Building2, 
  Users, 
  UserSquare2, 
  BadgeDollarSign, 
  CalendarClock, 
  FileBarChart, 
  Settings,
  LogOut,
  Menu,
  X,
  ListOrdered
} from 'lucide-react';
import { clsx } from 'clsx';

export default function Layout() {
  const { appUser, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['MASTER', 'COBRADOR'] },
    { path: '/empresas', label: 'Empresas', icon: Building2, roles: ['MASTER'] },
    { path: '/cobradores', label: 'Cobradores', icon: Users, roles: ['MASTER'] },
    { path: '/clientes', label: 'Clientes', icon: UserSquare2, roles: ['MASTER', 'COBRADOR'] },
    { path: '/negociacoes', label: 'Negociações', icon: BadgeDollarSign, roles: ['MASTER', 'COBRADOR'] },
    { path: '/parcelas', label: 'Parcelas', icon: ListOrdered, roles: ['MASTER', 'COBRADOR'] },
    { path: '/agendamentos', label: 'Agendamentos', icon: CalendarClock, roles: ['MASTER', 'COBRADOR'] },
    { path: '/relatorios', label: 'Relatórios', icon: FileBarChart, roles: ['MASTER', 'COBRADOR'] },
    { path: '/configuracoes', label: 'Configurações', icon: Settings, roles: ['MASTER', 'COBRADOR'] },
  ];

  const filteredNav = navItems.filter(item => appUser && item.roles.includes(appUser.role));

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile sidebar overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={clsx(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:flex-shrink-0",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-full flex flex-col">
          <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200">
            <span className="text-2xl font-bold text-blue-600">RenovaCred</span>
            <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden">
              <X className="w-6 h-6 text-gray-500" />
            </button>
          </div>

          <div className="p-4 border-b border-gray-200 flex items-center space-x-3">
            {appUser?.foto_perfil ? (
              <img src={appUser.foto_perfil} alt="Profile" className="w-10 h-10 rounded-full" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                {appUser?.nome?.charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{appUser?.nome}</p>
              <p className="text-xs text-gray-500 truncate">{appUser?.role}</p>
            </div>
          </div>

          <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
            {filteredNav.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={clsx(
                    "flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors",
                    isActive 
                      ? "bg-blue-50 text-blue-700" 
                      : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                  )}
                >
                  <Icon className={clsx("w-5 h-5 mr-3", isActive ? "text-blue-700" : "text-gray-400")} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-gray-200">
            <button
              onClick={handleLogout}
              className="flex items-center w-full px-3 py-2.5 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-5 h-5 mr-3" />
              Sair
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white border-b border-gray-200 h-16 flex items-center px-4 lg:px-8 justify-between lg:justify-end">
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="lg:hidden p-2 -ml-2 text-gray-500 hover:bg-gray-100 rounded-lg"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center space-x-4">
            {/* Topbar items if needed */}
          </div>
        </header>
        
        <div className="flex-1 overflow-auto p-4 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
