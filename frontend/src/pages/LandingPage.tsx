import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useEffect } from 'react';

/**
 * Yardex company website landing page. The single public entry point
 * that unauthenticated visitors see at "/". Authenticated users
 * (staff/dealers) are auto-redirected to their workspace at /quotes
 * because they've already logged in and don't need marketing.
 *
 * Three sections:
 *   1. Hero: company tagline + primary CTAs ("Try the AI generator",
 *      "Staff login")
 *   2. AI Generate feature highlight: the public /ai-generate wizard
 *      with the actual 18-photo gallery preview (live data)
 *   3. Why Yardex / How it works: B2B flow explanation
 *   4. Footer: company info + login link
 *
 * All copy matches the rest of the system ("Design To Inspire,
 * Engineered to Endure.") and routes through the existing wizard
 * (PublicAiStepYard) so the user lands directly on the same UX.
 */
export default function LandingPage() {
  const { user, token } = useAuth();
  const nav = useNavigate();

  // Authenticated visitors don't need a marketing site - send them
  // straight to their workspace. Done with replace:true so the
  // back button doesn't bounce them back to the marketing page.
  useEffect(() => {
    if (token && user) nav('/quotes', { replace: true });
  }, [token, user, nav]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-brand-50/30 to-white">
      {/* ===== Top nav ===== */}
      <header className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex items-center gap-3">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-brand-600 grid place-items-center text-white font-bold">Y</div>
          <div className="flex flex-col leading-tight">
            <span className="font-bold text-lg">Yardex</span>
            <span className="text-[10px] text-slate-500 italic hidden sm:block">Design To Inspire, Engineered to Endure.</span>
          </div>
        </Link>
        <nav className="ml-auto flex items-center gap-2 sm:gap-4 text-sm">
          <a href="#ai-generate" className="hidden sm:inline text-slate-600 hover:text-brand-700 transition">AI Visualizer</a>
          <a href="#how-it-works" className="hidden sm:inline text-slate-600 hover:text-brand-700 transition">How it works</a>
          <a href="#contact" className="hidden sm:inline text-slate-600 hover:text-brand-700 transition">Contact</a>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-slate-200 bg-white hover:bg-brand-50 text-slate-700 transition"
          >
            <span aria-hidden>🔒</span> Staff login
          </Link>
        </nav>
      </header>

      {/* ===== Hero ===== */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-16 text-center">
        <div className="inline-block px-3 py-1 rounded-full bg-brand-100 text-brand-800 text-xs font-medium mb-5">
          AI-powered fence design, in seconds
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-slate-900 leading-tight">
          See your yard with a new fence
          <br className="hidden sm:block" />
          <span className="text-brand-600"> before you commit.</span>
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Upload a photo of your property or pick one of our curated homes.
          Our AI renders your new fence in seconds — then a Yardex specialist
          follows up with a tailored quote within one business day.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/ai-generate"
            className="inline-flex items-center gap-2 px-7 py-3 rounded-lg bg-brand-600 text-white font-semibold shadow-lg shadow-brand-600/20 hover:bg-brand-700 transition"
          >
            <span aria-hidden>✨</span>
            Try the AI Yard Visualizer
            <span aria-hidden>→</span>
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-7 py-3 rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50 transition"
          >
            Staff login
          </Link>
        </div>
        <div className="mt-6 text-xs text-slate-500">
          Free preview · No credit card · Reply within 1 business day
        </div>
      </section>

      {/* ===== AI Generator feature highlight ===== */}
      <section id="ai-generate" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 scroll-mt-20">
        <div className="text-center mb-10">
          <div className="text-xs font-semibold text-brand-600 uppercase tracking-wider">AI Yard Visualizer</div>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mt-2">Your fence, rendered in 30 seconds</h2>
          <p className="mt-3 text-slate-600 max-w-2xl mx-auto">
            Three quick steps. Pick a yard side, choose or upload a photo, share how to reach you.
            We'll show you the result and a Yardex rep will follow up with a quote.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Step 1 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-lg transition">
            <div className="w-10 h-10 rounded-full bg-brand-100 grid place-items-center text-brand-700 font-bold mb-4">1</div>
            <h3 className="text-lg font-semibold text-slate-900">Pick your yard</h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Front yard for curb appeal and street-facing fences, or back yard for privacy and entertaining.
            </p>
            <div className="mt-4 h-32 rounded-lg bg-gradient-to-br from-emerald-50 to-emerald-100 grid grid-cols-2 gap-1 p-2">
              <div className="rounded bg-white grid place-items-center text-2xl">🏡</div>
              <div className="rounded bg-white grid place-items-center text-2xl">🌳</div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-lg transition">
            <div className="w-10 h-10 rounded-full bg-brand-100 grid place-items-center text-brand-700 font-bold mb-4">2</div>
            <h3 className="text-lg font-semibold text-slate-900">Add a photo</h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Upload your own photo or pick from 18+ curated AI-generated homes
              covering craftsman, modern, ranch, colonial and more.
            </p>
            <div className="mt-4 h-32 rounded-lg bg-slate-100 grid grid-cols-3 gap-1 p-2">
              <div className="rounded bg-gradient-to-br from-amber-100 to-orange-200" />
              <div className="rounded bg-gradient-to-br from-emerald-100 to-emerald-200" />
              <div className="rounded bg-gradient-to-br from-sky-100 to-blue-200" />
              <div className="rounded bg-gradient-to-br from-rose-100 to-pink-200" />
              <div className="rounded bg-gradient-to-br from-violet-100 to-purple-200" />
              <div className="rounded bg-gradient-to-br from-yellow-100 to-amber-200" />
            </div>
          </div>

          {/* Step 3 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-lg transition">
            <div className="w-10 h-10 rounded-full bg-brand-100 grid place-items-center text-brand-700 font-bold mb-4">3</div>
            <h3 className="text-lg font-semibold text-slate-900">Get your preview</h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Our AI renders the fence onto your yard in 30 seconds. A Yardex
              sales rep then emails a tailored quote with materials and timing.
            </p>
            <div className="mt-4 h-32 rounded-lg bg-gradient-to-br from-brand-100 to-brand-50 grid place-items-center text-4xl">✨</div>
          </div>
        </div>

        <div className="mt-10 text-center">
          <Link
            to="/ai-generate"
            className="inline-flex items-center gap-2 px-7 py-3 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 transition"
          >
            Start the visualizer
            <span aria-hidden>→</span>
          </Link>
        </div>
      </section>

      {/* ===== How it works ===== */}
      <section id="how-it-works" className="bg-slate-900 text-white scroll-mt-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="text-center mb-12">
            <div className="text-xs font-semibold text-brand-300 uppercase tracking-wider">From preview to project</div>
            <h2 className="text-3xl sm:text-4xl font-bold mt-2">How Yardex works</h2>
            <p className="mt-3 text-slate-300 max-w-2xl mx-auto">
              We combine AI rendering with traditional sales follow-up so you
              get the speed of self-service and the confidence of a real quote.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <Step n={1} title="AI preview" body="Generate a fence rendering on your actual yard photo, free, in 30 seconds." />
            <Step n={2} title="Sales review" body="A Yardex rep reviews the design and emails a tailored quote within 1 business day." />
            <Step n={3} title="Confirm" body="Reply by email or phone to lock in materials, schedule and price." />
            <Step n={4} title="Build" body="Our installation team measures, fabricates, and installs — typically within 2-4 weeks." />
          </div>
        </div>
      </section>

      {/* ===== Why Yardex ===== */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="text-xs font-semibold text-brand-600 uppercase tracking-wider">Why Yardex</div>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mt-2">A fence is a 20-year decision. See it first.</h2>
            <p className="mt-4 text-slate-600 leading-relaxed">
              Choosing a fence isn't just about price — it's about how it looks on
              <em> your</em> house, how it changes your curb appeal, and how it holds up over decades.
              Yardex uses AI to put the answer in front of you before you spend a cent, then
              pairs every design with a real person to make it happen.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-slate-700">
              {[
                'Privacy, picket, wrought iron, chain link, vinyl — all rendered on your photo',
                'Materials rated for Malaysian tropical climate (UV, rain, salt air)',
                'In-house installation teams, not subcontractors',
                '20-year structural warranty on every Yardex fence',
              ].map(t => (
                <li key={t} className="flex items-start gap-2">
                  <span className="text-brand-600 flex-shrink-0 mt-0.5">✓</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-gradient-to-br from-brand-100 via-brand-50 to-white rounded-2xl p-8 border border-brand-200">
            <div className="text-xs font-semibold text-brand-700 uppercase tracking-wider">Ready to start?</div>
            <h3 className="text-2xl font-bold text-slate-900 mt-2">Get your free AI preview</h3>
            <p className="text-slate-600 mt-2 text-sm">
              No signup required. We'll have a fence rendering on your yard in under a minute.
            </p>
            <Link
              to="/ai-generate"
              className="mt-5 inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 transition"
            >
              Start the AI visualizer <span aria-hidden>→</span>
            </Link>
            <div className="mt-6 pt-6 border-t border-brand-200 text-xs text-slate-500">
              Already a Yardex customer or staff?{' '}
              <Link to="/login" className="text-brand-700 hover:underline">Log in here</Link>.
            </div>
          </div>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer id="contact" className="bg-slate-900 text-slate-400 scroll-mt-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 md:grid-cols-4 gap-8 text-sm">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded bg-brand-600 grid place-items-center text-white font-bold text-xs">Y</div>
              <span className="font-bold text-white">Yardex</span>
            </div>
            <p className="leading-relaxed">Design To Inspire, Engineered to Endure.</p>
          </div>
          <div>
            <div className="font-semibold text-white mb-3">Product</div>
            <ul className="space-y-1.5">
              <li><Link to="/ai-generate" className="hover:text-white transition">AI Yard Visualizer</Link></li>
              <li><Link to="/login" className="hover:text-white transition">Staff login</Link></li>
              <li><a href="#how-it-works" className="hover:text-white transition">How it works</a></li>
            </ul>
          </div>
          <div>
            <div className="font-semibold text-white mb-3">Fences</div>
            <ul className="space-y-1.5">
              <li>Privacy</li>
              <li>Picket</li>
              <li>Wrought Iron</li>
              <li>Chain Link</li>
              <li>Vinyl</li>
            </ul>
          </div>
          <div>
            <div className="font-semibold text-white mb-3">Contact</div>
            <ul className="space-y-1.5">
              <li>info@yardex.com.my</li>
              <li>Kuala Lumpur · Malaysia</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-800">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 text-xs flex flex-col sm:flex-row items-center justify-between gap-2">
            <div>© {new Date().getFullYear()} Yardex. All rights reserved.</div>
            <div className="flex gap-4">
              <Link to="/login" className="hover:text-white transition">Staff login</Link>
              <a href="#contact" className="hover:text-white transition">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Small helper for the dark How-It-Works step cards. */
function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="relative bg-slate-800/50 rounded-xl p-5 border border-slate-700">
      <div className="absolute -top-3 -left-3 w-9 h-9 rounded-full bg-brand-500 grid place-items-center text-white font-bold text-sm">{n}</div>
      <div className="font-semibold text-white mt-2">{title}</div>
      <div className="text-sm text-slate-300 mt-2 leading-relaxed">{body}</div>
    </div>
  );
}