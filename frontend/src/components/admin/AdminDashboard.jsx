import React, { useState, useEffect } from 'react';
import { ShieldCheck, LogOut, Loader2, Users, Calendar, Mail, Phone, Building } from 'lucide-react';
import axios from 'axios';

// Ensure axios sends cookies
axios.defaults.withCredentials = true;

export const AdminDashboard = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  const [leads, setLeads] = useState([]);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await axios.get('/api/admin/leads');
      if (res.data.success) {
        setLeads(res.data.leads);
        setIsAuthenticated(true);
      }
    } catch (err) {
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const res = await axios.post('/api/admin/login', { username, password });
      if (res.data.success) {
        setIsAuthenticated(true);
        checkAuth(); // Fetch leads immediately
      }
    } catch (err) {
      setLoginError(err.response?.data?.error || 'Login failed');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post('/api/admin/logout');
      setIsAuthenticated(false);
      setLeads([]);
    } catch (err) {
      console.error('Logout error', err);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-sequor-cyan">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sequor-cyan to-sequor-blue flex items-center justify-center text-slate-950 shadow-lg shadow-sequor-cyan/20">
              <ShieldCheck className="w-7 h-7" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-center text-white mb-2">SeQuor Admin Panel</h2>
          <p className="text-sm text-slate-400 text-center mb-8">Secure access to enterprise leads</p>
          
          {loginError && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-3 rounded-lg mb-4 text-center">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Username or Email</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-200 focus:border-sequor-cyan focus:outline-none transition-colors"
                placeholder="Default: admin"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-200 focus:border-sequor-cyan focus:outline-none transition-colors"
                placeholder="Default: vvntsequor_secure"
              />
            </div>
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-2.5 bg-gradient-to-r from-sequor-cyan to-sequor-blue text-slate-950 font-bold rounded-lg hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-4"
            >
              {isLoggingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Secure Login'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Top Navbar */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sequor-cyan to-sequor-blue flex items-center justify-center text-slate-950">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <span className="font-bold text-white tracking-wide">SeQuor Leads Dashboard</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-800"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Callback Requests</h1>
            <p className="text-sm text-slate-400 mt-1">Manage enterprise prospects and consultation requests.</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-lg flex items-center gap-2">
            <Users className="w-4 h-4 text-sequor-cyan" />
            <span className="font-medium text-white">{leads.length} Total</span>
          </div>
        </div>

        {/* Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-950/50 text-xs text-slate-400 uppercase font-medium border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">Contact Details</th>
                  <th className="px-6 py-4">Company</th>
                  <th className="px-6 py-4">Service Interest</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-slate-500">
                      No leads found yet.
                    </td>
                  </tr>
                ) : (
                  leads.map((lead) => (
                    <tr key={lead._id} className="hover:bg-slate-800/30 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-white mb-1">{lead.name}</div>
                        <div className="flex flex-col gap-1 text-slate-400 text-[11px]">
                          <span className="flex items-center gap-1.5"><Mail className="w-3 h-3 text-slate-500" /> {lead.email}</span>
                          {lead.phone && <span className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-slate-500" /> {lead.phone}</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-slate-300">
                          {lead.company ? (
                            <>
                              <Building className="w-3.5 h-3.5 text-slate-500" />
                              {lead.company}
                            </>
                          ) : (
                            <span className="text-slate-600 italic">Not provided</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-1 rounded bg-sequor-navy/30 text-sequor-blue border border-sequor-blue/20 text-xs font-medium">
                          {lead.serviceInterest}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(lead.createdAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                          New
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};
