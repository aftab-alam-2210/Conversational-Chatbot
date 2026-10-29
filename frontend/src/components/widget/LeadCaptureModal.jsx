import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, CheckCircle2, User, Mail, Phone, Building, Briefcase } from 'lucide-react';
import { SERVICE_OPTIONS } from '../../utils/constants';

export const LeadCaptureModal = ({ isOpen, onClose, sessionId, initialEmail = '', initialPhone = '' }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: initialEmail || '',
    phone: initialPhone || '',
    company: '',
    serviceInterest: SERVICE_OPTIONS[0],
    notes: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email) {
      setErrorMsg('Please provide your name and work email.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, sessionId }),
      });

      const data = await res.json();
      if (data.success) {
        setIsSuccess(true);
        setTimeout(() => {
          setIsSuccess(false);
          onClose();
        }, 2200);
      } else {
        setErrorMsg(data.error || 'Failed to submit inquiry.');
      }
    } catch (err) {
      setErrorMsg('Network error. Please try again or email us directly.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="absolute inset-0 z-50 bg-[#0b0f19]/85 backdrop-blur-md flex items-center justify-center p-4 rounded-2xl">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 10 }}
          className="w-full bg-[#141c2e] border border-[#22304a] rounded-xl p-4 text-slate-100 shadow-2xl relative"
        >
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-slate-400 hover:text-white p-1 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {isSuccess ? (
            <div className="py-8 text-center flex flex-col items-center">
              <CheckCircle2 className="w-12 h-12 text-[#a3e635] mb-2 animate-bounce" />
              <h4 className="font-semibold text-white text-base">Inquiry Received!</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                A VVnT SeQuor Solutions Architect will connect with you within 2 business hours.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-2.5">
              <div>
                <h4 className="font-semibold text-white text-sm flex items-center gap-1.5">
                  <Briefcase className="w-4 h-4 text-[#a3e635]" />
                  Schedule Enterprise Consultation
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Connect directly with a Senior Solutions Architect.
                </p>
              </div>

              {errorMsg && (
                <div className="p-2 text-xs bg-red-500/10 border border-red-500/30 text-red-400 rounded-md">
                  {errorMsg}
                </div>
              )}

              {/* Name */}
              <div className="relative">
                <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Your Full Name *"
                  required
                  className="w-full pl-8 pr-3 py-1.5 bg-[#0b0f19] border border-[#22304a] rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#a3e635] transition-colors"
                />
              </div>

              {/* Email */}
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="Work Email Address *"
                  required
                  className="w-full pl-8 pr-3 py-1.5 bg-[#0b0f19] border border-[#22304a] rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#a3e635] transition-colors"
                />
              </div>

              {/* Phone & Company */}
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2.5" />
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="Phone Number"
                    className="w-full pl-7 pr-2 py-1.5 bg-[#0b0f19] border border-[#22304a] rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#a3e635] transition-colors"
                  />
                </div>
                <div className="relative">
                  <Building className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2.5" />
                  <input
                    type="text"
                    name="company"
                    value={formData.company}
                    onChange={handleChange}
                    placeholder="Company Name"
                    className="w-full pl-7 pr-2 py-1.5 bg-[#0b0f19] border border-[#22304a] rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#a3e635] transition-colors"
                  />
                </div>
              </div>

              {/* Service Interest */}
              <div>
                <select
                  name="serviceInterest"
                  value={formData.serviceInterest}
                  onChange={handleChange}
                  className="w-full px-2.5 py-1.5 bg-[#0b0f19] border border-[#22304a] rounded-lg text-xs text-white focus:outline-none focus:border-[#a3e635] transition-colors"
                >
                  {SERVICE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt} className="bg-[#141c2e] text-white">
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2 bg-[#a3e635] hover:bg-[#8ece25] text-[#0b0f19] font-bold rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-md active:scale-[0.98]"
              >
                {isSubmitting ? (
                  'Submitting Details...'
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    Request Immediate Callback
                  </>
                )}
              </button>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
