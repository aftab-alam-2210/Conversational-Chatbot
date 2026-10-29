import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Sparkles } from 'lucide-react';

export const LauncherButton = ({ isOpen, onClick, unreadCount = 0 }) => {
  return (
    <motion.button
      onClick={onClick}
      aria-label={isOpen ? "Close VVnT SeQuor Chat" : "Open VVnT SeQuor Chat"}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
      className="relative flex items-center justify-center w-14 h-14 rounded-full bg-[#0d1322] text-[#a3e635] shadow-2xl border border-[#a3e635]/50 hover:border-[#a3e635] hover:bg-[#141c2e] focus:outline-none transition-all duration-300 z-50 cursor-pointer"
    >
      <AnimatePresence mode="wait">
        {isOpen ? (
          <motion.div
            key="close"
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <X className="w-6 h-6 text-slate-100" />
          </motion.div>
        ) : (
          <motion.div
            key="open"
            initial={{ rotate: 90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative"
          >
            <MessageSquare className="w-6 h-6 text-[#a3e635]" />
            <Sparkles className="w-3 h-3 text-[#a3e635] absolute -top-1 -right-1 animate-pulse" />
          </motion.div>
        )}
      </AnimatePresence>

      {!isOpen && unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 bg-[#a3e635] text-[#0b0f19] text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center border-2 border-[#0b0f19] shadow-md">
          {unreadCount}
        </span>
      )}
    </motion.button>
  );
};
