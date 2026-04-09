import { Outlet, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, LayoutDashboard, FileSpreadsheet, FileOutput } from 'lucide-react';
import styles from './Layout.module.css';

export default function Layout() {
  const { user, signOut } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/" replace />;
  }

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>
            <LayoutDashboard size={24} />
          </div>
          <h2>Painel Escolar</h2>
        </div>

        <nav className={styles.nav}>
          <Link 
            to="/dashboard" 
            className={`${styles.navItem} ${location.pathname === '/dashboard' ? styles.active : ''}`}
          >
            <FileSpreadsheet size={20} />
            Meus Modelos
          </Link>
          <Link 
            to="/boletins" 
            className={`${styles.navItem} ${location.pathname === '/boletins' ? styles.active : ''}`}
          >
            <FileOutput size={20} />
            Gerar Boletins
          </Link>
        </nav>

        <div className={styles.footer}>
          <div className={styles.userInfo}>
            <p className={styles.userEmail}>{user.email}</p>
          </div>
          <button onClick={handleSignOut} className={styles.logoutBtn}>
            <LogOut size={18} />
            Sair
          </button>
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.topbar}>
          <h1 className={styles.pageTitle}>
            {location.pathname === '/dashboard' ? 'Meus Modelos' : 'Gerar Boletins'}
          </h1>
        </div>
        <div className={styles.content}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
