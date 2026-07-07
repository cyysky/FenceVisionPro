import { ReactNode, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/**
 * Persistent top nav + side rail.
 *
 * Used by every authenticated page via <Layout><Page /></Layout>
 * in App.tsx. The public routes (login, /approve/:id,
 * /public/installation/*) intentionally render without this
 * shell so they keep their own minimal headers.
 *
 * Active link is highlighted with `text-brand-700` + bold.
 * The "Create" group surfaces the three most common actions
 * (New Quote / New Project / New Invoice) as a dropdown.
 */
export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [openCreate, setOpenCreate] = useState(false);
  const [openAccount, setOpenAccount] = useState(false);
  const [openMobile, setOpenMobile] = useState(false);

  const isAdmin = user?.role === 'ADMIN';
  const isOwnerOrStaff = user?.role === 'DEALER_OWNER' || user?.role === 'DEALER_STAFF' || isAdmin;

  return (
    <div className="min-h-full">
      <header className="bg-white border-b sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 flex flex-wrap items-center gap-2">
          <Link to="/" className="flex items-center gap-2 mr-2">
            <div className="w-7 h-7 rounded bg-brand-600 grid place-items-center text-white font-bold text-xs">Y</div>
            <span className="font-bold">Yardex</span>
            <span className="text-[10px] text-slate-400 italic hidden md:inline">Design To Inspire, Engineered to Endure.</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex flex-wrap items-center gap-1 sm:gap-3 text-sm">
            <NavLink to="/" end className={({ isActive }) => `px-2 py-1 rounded ${isActive ? 'text-brand-700 font-semibold' : 'text-slate-600 hover:text-brand-700 hover:bg-brand-50'}`}>
              Quotes
            </NavLink>
            <NavLink to="/projects" className={({ isActive }) => `px-2 py-1 rounded ${isActive ? 'text-brand-700 font-semibold' : 'text-slate-600 hover:text-brand-700 hover:bg-brand-50'}`}>
              Projects
            </NavLink>
            <NavLink to="/installations" className={({ isActive }) => `px-2 py-1 rounded ${isActive ? 'text-brand-700 font-semibold' : 'text-slate-600 hover:text-brand-700 hover:bg-brand-50'}`}>
              Installations
            </NavLink>
            <NavLink to="/products" className={({ isActive }) => `px-2 py-1 rounded ${isActive ? 'text-brand-700 font-semibold' : 'text-slate-600 hover:text-brand-700 hover:bg-brand-50'}`}>
              Products
            </NavLink>
            <NavLink to="/designs" className={({ isActive }) => `px-2 py-1 rounded ${isActive ? 'text-brand-700 font-semibold' : 'text-slate-600 hover:text-brand-700 hover:bg-brand-50'}`}>
              Designs
            </NavLink>
            {isOwnerOrStaff && (
              <>
                <NavLink to="/invoices" className={({ isActive }) => `px-2 py-1 rounded ${isActive ? 'text-brand-700 font-semibold' : 'text-slate-600 hover:text-brand-700 hover:bg-brand-50'}`}>
                  Invoices
                </NavLink>
                <NavLink to="/installers" className={({ isActive }) => `px-2 py-1 rounded ${isActive ? 'text-brand-700 font-semibold' : 'text-slate-600 hover:text-brand-700 hover:bg-brand-50'}`}>
                  Installers
                </NavLink>
                <NavLink to="/leads" className={({ isActive }) => `px-2 py-1 rounded ${isActive ? 'text-brand-700 font-semibold' : 'text-slate-600 hover:text-brand-700 hover:bg-brand-50'}`}>
                  Leads
                </NavLink>
              </>
            )}
            {isAdmin && (
              <NavLink to="/wholesalers" className={({ isActive }) => `px-2 py-1 rounded ${isActive ? 'text-brand-700 font-semibold' : 'text-slate-600 hover:text-brand-700 hover:bg-brand-50'}`}>
                Dealers
              </NavLink>
            )}
          </nav>

          {/* Create dropdown */}
          <div className="relative ml-auto md:ml-0">
            <button
              onClick={() => setOpenCreate(v => !v)}
              onBlur={() => setTimeout(() => setOpenCreate(false), 150)}
              className="px-3 py-1.5 bg-brand-600 text-white rounded text-sm font-medium hover:bg-brand-700 inline-flex items-center gap-1"
              aria-haspopup="menu"
              aria-expanded={openCreate}
            >
              + Create <span className="text-xs">▾</span>
            </button>
            {openCreate && (
              <div role="menu" className="absolute right-0 mt-1 bg-white border rounded shadow-md py-1 w-48 z-30">
                <Link to="/quotes/new" role="menuitem" className="block px-3 py-1.5 text-sm hover:bg-brand-50" onClick={() => setOpenCreate(false)}>
                  New quote
                </Link>
                <Link to="/projects/new" role="menuitem" className="block px-3 py-1.5 text-sm hover:bg-brand-50" onClick={() => setOpenCreate(false)}>
                  New project
                </Link>
                <Link to="/invoices" role="menuitem" className="block px-3 py-1.5 text-sm hover:bg-brand-50" onClick={() => setOpenCreate(false)}>
                  New invoice (from a quote)
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setOpenMobile(v => !v)}
            className="md:hidden ml-1 p-1.5 border rounded text-slate-600"
            aria-label="Toggle menu"
          >
            ☰
          </button>

          {/* Account menu (desktop) */}
          <div className="relative ml-1 hidden md:block">
            <button
              onClick={() => setOpenAccount(v => !v)}
              onBlur={() => setTimeout(() => setOpenAccount(false), 150)}
              className="px-2 py-1.5 text-sm border rounded hover:bg-brand-50 inline-flex items-center gap-1"
              aria-haspopup="menu"
              aria-expanded={openAccount}
            >
              <span className="text-slate-700 max-w-[12ch] truncate">{user?.fullName || user?.email}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-100 text-brand-800">{user?.role?.replace('DEALER_', '').replace('ADMIN', 'Admin')}</span>
            </button>
            {openAccount && (
              <div role="menu" className="absolute right-0 mt-1 bg-white border rounded shadow-md py-1 w-48 z-30">
                <div className="px-3 py-1.5 text-xs text-slate-500">
                  {user?.email}
                </div>
                <button
                  role="menuitem"
                  onMouseDown={() => { logout(); nav('/login', { replace: true }); }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-brand-50"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile drawer */}
        {openMobile && (
          <div className="md:hidden border-t bg-white px-3 py-2 space-y-1">
            {[
              { to: '/', label: 'Quotes' },
              { to: '/projects', label: 'Projects' },
              { to: '/installations', label: 'Installations' },
              { to: '/invoices', label: 'Invoices' },
              { to: '/installers', label: 'Installers' },
              { to: '/leads', label: 'Leads' },
              { to: '/products', label: 'Products' },
              { to: '/designs', label: 'Designs' },
              ...(isAdmin ? [{ to: '/wholesalers', label: 'Dealers' }] : []),
            ].map(l => (
              <NavLink key={l.to} to={l.to} end={l.to === '/'} onClick={() => setOpenMobile(false)}
                className={({ isActive }) => `block px-2 py-1.5 rounded text-sm ${isActive ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-slate-700 hover:bg-brand-50'}`}>
                {l.label}
              </NavLink>
            ))}
            <div className="border-t pt-2 mt-2 text-xs text-slate-500 flex justify-between items-center">
              <span>{user?.email}</span>
              <button onClick={() => { logout(); nav('/login', { replace: true }); }} className="px-2 py-1 border rounded">
                Sign out
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto p-4 sm:p-6">{children}</main>
    </div>
  );
}
