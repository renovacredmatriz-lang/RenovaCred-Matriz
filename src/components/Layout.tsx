import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useEmpresa } from '../contexts/EmpresaContext';
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
  ListOrdered,
  RefreshCw,
  KeyRound,
  FileText,
  MessageCircle
} from 'lucide-react';
import { clsx } from 'clsx';

export default function Layout() {
  const { appUser, logout, changePassword } = useAuth();
  const { selectedEmpresa, clearSelectedEmpresa } = useEmpresa();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = React.useState(false);
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [passwordError, setPasswordError] = React.useState('');
  const [isChangingPassword, setIsChangingPassword] = React.useState(false);

  const handleLogout = async () => {
    clearSelectedEmpresa();
    await logout();
    navigate('/login');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    if (newPassword.length < 6) {
      setPasswordError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('As senhas não coincidem.');
      return;
    }
    setIsChangingPassword(true);
    try {
      await changePassword(newPassword);
      setIsPasswordModalOpen(false);
      setNewPassword('');
      setConfirmPassword('');
      alert('Senha alterada com sucesso!');
    } catch (error) {
      setPasswordError('Erro ao alterar senha. Tente novamente.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['MASTER', 'COBRADOR'] },
    { path: '/empresas', label: 'Empresas', icon: Building2, roles: ['MASTER'] },
    { path: '/cobradores', label: 'Cobradores', icon: Users, roles: ['MASTER'] },
    { path: '/clientes', label: 'Clientes', icon: UserSquare2, roles: ['MASTER', 'COBRADOR'] },
    { path: '/negociacoes', label: 'Negociações', icon: BadgeDollarSign, roles: ['COBRADOR', 'CREDOR'] },
    { path: '/parcelas', label: 'Parcelas', icon: ListOrdered, roles: ['COBRADOR', 'CREDOR'] },
    { path: '/cobranca-rapida', label: 'Cobrança Rápida', icon: MessageCircle, roles: ['COBRADOR'] },
    { path: '/agendamentos', label: 'Agendamentos', icon: CalendarClock, roles: ['MASTER', 'COBRADOR'] },
    { path: '/relatorios', label: 'Relatórios', icon: FileBarChart, roles: ['MASTER', 'COBRADOR'] },
    { path: '/fatura', label: 'Fatura', icon: FileText, roles: ['MASTER'] },
    { path: '/recibo', label: 'Recibo', icon: FileText, roles: ['MASTER'] },
    { path: '/configuracoes', label: 'Configurações', icon: Settings, roles: ['MASTER', 'COBRADOR', 'CREDOR'] },
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

          {/* User Info */}
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

          {/* Selected Empresa Info */}
          {selectedEmpresa && appUser?.role !== 'MASTER' && (
            <div className="p-4 bg-blue-50 border-b border-blue-100">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Empresa Selecionada</span>
                {appUser?.role !== 'CREDOR' && (
                  <button 
                    onClick={() => navigate('/selecionar-empresa')}
                    className="text-blue-600 hover:text-blue-800"
                    title="Trocar Empresa"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="flex items-center text-blue-900">
                <Building2 className="w-4 h-4 mr-2 flex-shrink-0" />
                <span className="text-sm font-semibold truncate">
                  {selectedEmpresa.nomeFantasia || selectedEmpresa.nome || 'Empresa sem nome'}
                </span>
              </div>
            </div>
          )}

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

          <div className="p-4 border-t border-gray-200 space-y-2">
            <button
              onClick={() => setIsPasswordModalOpen(true)}
              className="flex items-center w-full px-3 py-2.5 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <KeyRound className="w-5 h-5 mr-3" />
              Trocar Senha
            </button>
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
            {selectedEmpresa && appUser?.role !== 'MASTER' && (
              <div className="hidden sm:flex items-center px-3 py-1 bg-gray-100 rounded-full text-xs font-medium text-gray-600">
                <Building2 className="w-3 h-3 mr-1.5" />
                {selectedEmpresa.nomeFantasia || selectedEmpresa.nome || 'Empresa sem nome'}
              </div>
            )}
          </div>
        </header>
        
        <div className="flex-1 overflow-auto p-4 lg:p-8">
          <Outlet />
        </div>
      </main>

      {/* Password Modal */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Trocar Senha</h3>
              <button onClick={() => setIsPasswordModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <form onSubmit={handleChangePassword} className="space-y-4">
                {passwordError && (
                  <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">
                    {passwordError}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nova Senha</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Mínimo 6 caracteres"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar Nova Senha</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Confirme a senha"
                    required
                  />
                </div>
                <div className="pt-4 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsPasswordModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isChangingPassword}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isChangingPassword ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
