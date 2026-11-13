import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Navbar from './Navbar';

export default function DashboardShell({ title, subtitle, icon: Icon, children }) {
  return (
    <div className="min-h-screen bg-transparent text-[#12231B]">
      <Navbar />
      <main id="main-content" tabIndex={-1} className="pt-24 pb-16 section-padding max-w-[1200px] mx-auto">
        {/* Back + Header */}
        <div className="flex items-start gap-4 mb-10">
          <Link
            to="/dashboard"
            className="mt-1 p-2.5 rounded-xl bg-white/85 border border-[#DCD2BF] hover:border-[#065F46]/35 hover:bg-white text-[#354B40] hover:text-[#065F46] transition-colors shadow-sm"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-3 mb-1">
              {Icon && (
                <div className="w-10 h-10 rounded-xl bg-[#065F46]/10 border border-[#065F46]/20 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-[#065F46]" />
                </div>
              )}
              <h1 className="font-display text-2xl md:text-3xl font-bold text-[#12231B]">{title}</h1>
            </div>
            {subtitle && <p className="text-sm text-[#4F6358] ml-[52px]">{subtitle}</p>}
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
