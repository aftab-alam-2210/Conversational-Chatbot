import React, { useEffect, useRef, useState } from 'react';
import { Clock3, MessageSquarePlus, MoreHorizontal, PhoneCall, PhoneOff, X } from 'lucide-react';

export const Header = ({ onReset, onClose, onEndChat, onViewRecentChat, onOpenLeadForm }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeMenu = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, [menuOpen]);

  const runMenuAction = (action) => {
    setMenuOpen(false);
    action?.();
  };

  return (
    <div className="bg-[#0b0f19] px-4 py-3.5 border-b border-[#22304a] flex items-center justify-between text-white rounded-t-2xl select-none">
      {/* Brand & Status */}
      <div className="flex items-center">
        <div>
          <div className="flex items-center space-x-1.5">
            <h3 className="font-semibold text-sm text-slate-100 tracking-wide">VVnT SeQuor AI</h3>
          </div>
        </div>
      </div>

      {/* Header Actions */}
      <div className="relative flex items-center space-x-1 text-slate-400" ref={menuRef}>
        <button type="button" onClick={onOpenLeadForm}
          title="Schedule Consultation / Speak to Human" aria-label="Schedule consultation or speak to a human"
          className="rounded-lg p-1.5 hover:bg-[#141c2e] hover:text-[#a3e635] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a3e635]">
          <PhoneCall className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-haspopup="menu"
          title="Chat options" aria-label="Chat options"
          className="rounded-lg p-1.5 hover:bg-[#141c2e] hover:text-[#a3e635] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a3e635]">
          <MoreHorizontal className="h-4 w-4" />
        </button>
        <button
          type="button" onClick={onClose}
          title="Close chat"
          aria-label="Close chat"
          className="rounded-lg p-1.5 hover:bg-[#141c2e] hover:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a3e635]"
        >
          <X className="h-4 w-4" />
        </button>
        {menuOpen && (
          <div role="menu" aria-label="Chat options" className="absolute right-0 top-9 z-20 w-48 rounded-xl border border-[#22304a] bg-[#101827] p-1.5 shadow-2xl">
            <button type="button" role="menuitem" onClick={() => runMenuAction(onReset)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-200 hover:bg-[#19273c] hover:text-[#a3e635] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a3e635]">
              <MessageSquarePlus className="h-4 w-4" /> Start new chat
            </button>
            <button type="button" role="menuitem" onClick={() => runMenuAction(onEndChat || onClose)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-200 hover:bg-[#19273c] hover:text-rose-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a3e635]">
              <PhoneOff className="h-4 w-4" /> End chat
            </button>
            <button type="button" role="menuitem" onClick={() => runMenuAction(onViewRecentChat)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-200 hover:bg-[#19273c] hover:text-[#a3e635] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a3e635]">
              <Clock3 className="h-4 w-4" /> View recent chat
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
