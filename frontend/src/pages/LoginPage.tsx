import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function LoginPage() {
  const { login, user, token } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  // If the user is already signed in, bounce them to the dashboard
  // (or to the page they came from). This avoids the awkward state
  // where a logged-in user sees the login form after a page refresh.
  useEffect(() => {
    if (token && user) {
      const to = (loc.state as any)?.from || '/';
      nav(to, { replace: true });
    }
  }, [token, user, loc.state, nav]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setLoading(true);
    try {
      await login(email, password);
      const to = (loc.state as any)?.from || '/';
      nav(to, { replace: true });
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-full grid place-items-center bg-gradient-to-br from-brand-50 to-slate-100">
      <form onSubmit={submit} className="w-full max-w-sm bg-white p-8 rounded-xl shadow border">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded bg-brand-600 grid place-items-center text-white font-bold">F</div>
          <h1 className="text-xl font-bold">FenceVisionPro</h1>
        </div>
        <h2 className="text-lg font-semibold mb-4">Sign in</h2>
        {err && <div className="mb-3 p-2 text-sm bg-red-50 text-red-700 border border-red-200 rounded">{err}</div>}
        <label className="block text-sm font-medium mb-1">Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
          className="w-full mb-3 px-3 py-2 border rounded" />
        <label className="block text-sm font-medium mb-1">Password</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
          className="w-full mb-4 px-3 py-2 border rounded" />
        <button disabled={loading} className="w-full py-2 bg-brand-600 text-white rounded disabled:opacity-50">
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-xs text-slate-500 mt-4">
          Demo: owner@demofence.example / owner1234 &middot; admin@fencevisionpro.local / admin1234
        </p>
      </form>
    </div>
  );
}
