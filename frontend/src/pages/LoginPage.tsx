import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { apiErrorMessage } from '../lib/api';

export default function LoginPage() {
  const { login, user, token } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (token && user) {
      const to = (loc.state as any)?.from || '/quotes';
      nav(to, { replace: true });
    }
  }, [token, user, loc.state, nav]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  // Lightweight email validation - show a hint under the
  // field instead of waiting for the submit to fail.
  const emailLooksValid = /\S+@\S+\.\S+/.test(email);
  const showEmailHint = touched && email.length > 0 && !emailLooksValid;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!emailLooksValid) { setErr('Please enter a valid email address'); return; }
    if (password.length < 6) { setErr('Password must be at least 6 characters'); return; }
    setLoading(true);
    try {
      await login(email, password);
      const to = (loc.state as any)?.from || '/quotes';
      nav(to, { replace: true });
    } catch (e: any) {
      setErr(apiErrorMessage(e, 'Login failed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-full grid place-items-center bg-gradient-to-br from-brand-50 to-slate-100 p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white p-8 rounded-xl shadow border" noValidate>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded bg-brand-600 grid place-items-center text-white font-bold">Y</div>
          <h1 className="text-xl font-bold">Yardex</h1>
        </div>
        <p className="text-xs text-slate-500 mb-5 italic">Design To Inspire, Engineered to Endure.</p>
        <h2 className="text-lg font-semibold mb-4">Sign in</h2>
        {err && (
          <div role="alert" className="mb-3 p-2 text-sm bg-red-50 text-red-700 border border-red-200 rounded flex items-start gap-2">
            <span aria-hidden>⚠</span><span>{err}</span>
          </div>
        )}
        <label className="block text-sm font-medium mb-1" htmlFor="email">Email</label>
        <input
          id="email" type="email" value={email} autoComplete="email" autoFocus
          onChange={e => setEmail(e.target.value)} onBlur={() => setTouched(true)}
          aria-invalid={showEmailHint || undefined}
          aria-describedby={showEmailHint ? 'email-hint' : undefined}
          className={`w-full mb-1 px-3 py-2 border rounded ${showEmailHint ? 'border-red-400' : ''}`}
        />
        {showEmailHint && <div id="email-hint" className="text-xs text-red-600 mb-2">That doesn't look like a valid email</div>}
        {!showEmailHint && <div className="mb-2" />}

        <label className="block text-sm font-medium mb-1" htmlFor="password">Password</label>
        <div className="relative mb-4">
          <input
            id="password"
            type={showPw ? 'text' : 'password'}
            value={password}
            autoComplete="current-password"
            onChange={e => setPassword(e.target.value)}
            className="w-full px-3 py-2 pr-16 border rounded"
          />
          <button type="button" onClick={() => setShowPw(s => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-700 px-2 py-0.5"
            aria-label={showPw ? 'Hide password' : 'Show password'}>
            {showPw ? 'Hide' : 'Show'}
          </button>
        </div>
        <button disabled={loading} className="w-full py-2 bg-brand-600 text-white rounded disabled:opacity-50 font-medium">
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-xs text-slate-500 mt-4 leading-relaxed">
          Demo: <button type="button" onClick={() => { setEmail('owner@yardex.local'); setPassword('owner1234'); }}
            className="underline hover:text-brand-700">owner@yardex.local</button> ·
          <button type="button" onClick={() => { setEmail('admin@yardex.local'); setPassword('admin1234'); }}
            className="underline hover:text-brand-700 ml-1">admin@yardex.local</button>
        </p>
      </form>
    </div>
  );
}
