import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { apiErrorMessage } from '../lib/api';

const DEMO_ACCOUNTS = [
  { email: 'owner@yardex.local', title: 'Yardex Owner', desc: 'Dealer-owner dashboard' },
  { email: 'admin@yardex.local', title: 'Yardex Admin', desc: 'Admin dashboard' },
];

export default function LoginPage() {
  const { demoLogin, user, token } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (token && user) {
      const to = (loc.state as any)?.from || '/quotes';
      nav(to, { replace: true });
    }
  }, [token, user, loc.state, nav]);

  const [err, setErr] = useState<string | null>(null);
  const [loadingEmail, setLoadingEmail] = useState<string | null>(null);

  async function signIn(email: string) {
    setErr(null);
    setLoadingEmail(email);
    try {
      await demoLogin(email);
      const to = (loc.state as any)?.from || '/quotes';
      nav(to, { replace: true });
    } catch (e: any) {
      setErr(apiErrorMessage(e, 'Login failed'));
    } finally {
      setLoadingEmail(null);
    }
  }

  return (
    <div className="min-h-full grid place-items-center bg-gradient-to-br from-brand-50 to-slate-100 p-4">
      <div className="w-full max-w-sm">
        <header className="flex items-center gap-3 mb-4 px-1">
          <Link to="/" title="Back to Yardex home" className="w-8 h-8 rounded bg-brand-600 grid place-items-center text-white font-bold hover:bg-brand-700 transition">Y</Link>
          <Link to="/" className="font-bold text-lg">Yardex</Link>
          <Link to="/" className="ml-auto text-sm text-slate-600 hover:text-brand-700 transition">← Back to Yardex home</Link>
        </header>
        <div className="bg-white p-8 rounded-xl shadow border">
          <p className="text-xs text-slate-500 mb-5 italic">Design To Inspire, Engineered to Endure.</p>
          <h2 className="text-lg font-semibold mb-1">Try the demo</h2>
          <p className="text-sm text-slate-600 mb-5">Pick an account to jump in — no password needed.</p>
          {err && (
            <div role="alert" className="mb-3 p-2 text-sm bg-red-50 text-red-700 border border-red-200 rounded flex items-start gap-2">
              <span aria-hidden>⚠</span><span>{err}</span>
            </div>
          )}
          <div className="space-y-3">
            {DEMO_ACCOUNTS.map(a => (
              <button
                key={a.email}
                type="button"
                disabled={!!loadingEmail}
                onClick={() => signIn(a.email)}
                className="w-full text-left px-4 py-3 border rounded-lg hover:border-brand-600 hover:bg-brand-50 transition disabled:opacity-60"
              >
                <span className="block font-medium">{a.title}</span>
                <span className="block text-xs text-slate-500">{a.desc}</span>
                <span className="block text-xs text-brand-700 mt-1 font-medium">
                  {loadingEmail === a.email ? 'Signing in…' : a.email}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
