import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Navbar from './Navbar';

export default function DashboardShell({ title, subtitle, icon: Icon, children }) {
  return (
    <div className="min-h-screen bg-transparent text-white">
      <Navbar />
      <main className="pt-24 pb-16 section-padding max-w-[1200px] mx-auto">
        {/* Back + Header */}
        <div className="flex items-start gap-4 mb-10">
          <Link
            to="/dashboard"
            className="mt-1 p-2 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] text-dark-300 hover:text-white transition-colors"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-3 mb-1">
              {Icon && (
                <div className="w-10 h-10 rounded-xl bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-accent-cyan" />
                </div>
              )}
              <h1 className="font-display text-2xl md:text-3xl font-bold text-white">{title}</h1>
            </div>
            {subtitle && <p className="text-sm text-dark-300 ml-[52px]">{subtitle}</p>}
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
