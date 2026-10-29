import React, { useState, useEffect } from 'react';
import { ChatWidget } from './components/widget/ChatWidget';
import { AdminDashboard } from './components/admin/AdminDashboard';
import {
  ShieldCheck,
  Cloud,
  Cpu,
  Server,
  Zap,
  Lock,
  ArrowRight,
  PhoneCall,
  Mail,
} from 'lucide-react';

export default function App() {
  const [isAdminRoute, setIsAdminRoute] = useState(window.location.hash === '#admin');

  useEffect(() => {
    const handleHashChange = () => setIsAdminRoute(window.location.hash === '#admin');
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (isAdminRoute) {
    return <AdminDashboard />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-sequor-cyan selection:text-slate-950">
      {/* Navigation Header */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-slate-950/80 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sequor-cyan to-sequor-blue flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-sequor-cyan/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-white">VVnT SeQuor</span>
              <span className="block text-[10px] uppercase tracking-wider text-sequor-cyan font-semibold">Enterprise AI & Cloud</span>
            </div>
          </div>

          <nav className="hidden md:flex items-center space-x-8 text-sm font-medium text-slate-300">
            <a href="#services" className="hover:text-sequor-cyan transition-colors">Services</a>
            <a href="#architecture" className="hover:text-sequor-cyan transition-colors">Architecture</a>
            <a href="#compliance" className="hover:text-sequor-cyan transition-colors">Compliance</a>
            <a href="#contact" className="hover:text-sequor-cyan transition-colors">Contact</a>
          </nav>

          <div className="flex items-center space-x-3">
            <a
              href="#contact"
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-sequor-navy/60 hover:bg-sequor-navy text-slate-200 border border-slate-700 hover:border-sequor-cyan/50 transition-all"
            >
              Client Portal
            </a>
            <button
              onClick={() => {
                const btn = document.querySelector('button[aria-label*="VVnT SeQuor Chat"]');
                btn?.click();
              }}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-sequor-cyan to-sequor-blue text-slate-950 hover:brightness-110 shadow-md shadow-sequor-cyan/20 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" />
              Ask AI Consultant
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-16 pb-20 lg:pt-24 lg:pb-32 border-b border-slate-800/80">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(0,173,181,0.15),rgba(255,255,255,0))]" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-sequor-cyan/30 text-sequor-cyan text-xs font-medium mb-6 animate-fade-in">
              <span className="w-2 h-2 rounded-full bg-sequor-cyan animate-pulse"></span>
              Autonomous AI Agents & Cloud Engineering
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-tight">
              Engineering Resilient <br />
              <span className="bg-gradient-to-r from-sequor-cyan via-sky-400 to-blue-500 bg-clip-text text-transparent">
                Digital Backbones for Enterprise
              </span>
            </h1>

            <p className="mt-6 text-base sm:text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto">
              VVnT SeQuor provides enterprise-grade AI transformations, next-gen cybersecurity, multi-cloud architecture, and 24/7 proactive NOC management for global leaders.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <button
                onClick={() => {
                  const btn = document.querySelector('button[aria-label*="VVnT SeQuor Chat"]');
                  btn?.click();
                }}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-sequor-cyan to-sequor-blue text-slate-950 font-bold text-sm hover:brightness-110 shadow-lg shadow-sequor-cyan/25 flex items-center gap-2 cursor-pointer transition-transform active:scale-95"
              >
                Launch AI Assistant
                <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href="#services"
                className="px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-semibold text-sm transition-all"
              >
                Explore Solutions
              </a>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
            {[
              { label: 'Uptime SLA', value: '99.99%' },
              { label: 'P1 Incident Response', value: '< 15 Mins' },
              { label: 'Security Standards', value: 'SOC 2 / ISO' },
              { label: 'Global NOC/SOC', value: '24/7/365' },
            ].map((stat, i) => (
              <div key={i} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                <div className="text-2xl font-bold text-white">{stat.value}</div>
                <div className="text-xs text-slate-400 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services Grid */}
      <section id="services" className="py-20 bg-slate-900/40 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-xs uppercase tracking-widest text-sequor-cyan font-bold">Enterprise Capabilities</h2>
            <p className="text-3xl font-bold text-white mt-2">Mission-Critical Services Tailored for Scale</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: Cloud,
                title: 'Cloud & DevOps',
                desc: 'Multi-cloud architectures (AWS/Azure/GCP), Kubernetes containerization, automated CI/CD pipelines, and FinOps optimization.',
              },
              {
                icon: Lock,
                title: 'Cybersecurity & SOC',
                desc: 'Zero Trust enforcement, 24/7 AI-powered MDR/SOC, penetration testing, and compliance readiness for SOC 2 and GDPR.',
              },
              {
                icon: Cpu,
                title: 'Enterprise AI & RAG',
                desc: 'Custom LLMs, autonomous LangChain agents, high-precision RAG vector engines, and private VPC model hosting.',
              },
              {
                icon: Server,
                title: '24/7 Managed IT',
                desc: 'Proactive infrastructure monitoring, disaster recovery as a service (DRaaS), automated patching, and tier 1-3 helpdesk.',
              },
            ].map((svc, idx) => (
              <div
                key={idx}
                className="p-6 rounded-2xl bg-slate-900 border border-slate-800 hover:border-sequor-cyan/50 transition-all group hover:-translate-y-1 duration-200"
              >
                <div className="w-12 h-12 rounded-xl bg-sequor-navy/60 border border-sequor-cyan/30 flex items-center justify-center text-sequor-cyan mb-4 group-hover:scale-110 transition-transform">
                  <svc.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{svc.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{svc.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="mt-auto py-10 bg-slate-950 border-t border-slate-800 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2 text-slate-400">
            <ShieldCheck className="w-4 h-4 text-sequor-cyan" />
            <span>&copy; {new Date().getFullYear()} VVnT SeQuor. All rights reserved.</span>
          </div>
          <div className="flex items-center space-x-6 text-slate-400">
            <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5 text-sequor-cyan" /> contact@vvntsequor.com</span>
            <span className="flex items-center gap-1"><PhoneCall className="w-3.5 h-3.5 text-sequor-cyan" /> +1 (800) 555-VVNT</span>
          </div>
        </div>
      </footer>

      {/* Live Enterprise AI Chatbot Widget */}
      <ChatWidget />
    </div>
  );
}
