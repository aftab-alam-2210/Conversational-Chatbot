import React from 'react';
import { motion } from 'framer-motion';

export const TypingIndicator = () => {
  return (
    <div className="flex items-end space-x-2 my-2.5">
      <div className="bg-[#141c2e] border border-[#22304a] rounded-2xl rounded-bl-sm px-4 py-2.5 flex items-center space-x-2">
        <span className="text-xs text-slate-300 font-medium tracking-wide">SeQuor AI</span>
        
        {/* Website Lime Green 3 Bouncing Dots */}
        <div className="flex items-center space-x-1.5 ml-1">
          <motion.span
            className="w-1.5 h-1.5 rounded-full bg-[#a3e635]"
            animate={{ y: [0, -5, 0], scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ repeat: Infinity, duration: 0.8, delay: 0 }}
          />
          <motion.span
            className="w-1.5 h-1.5 rounded-full bg-[#a3e635]"
            animate={{ y: [0, -5, 0], scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ repeat: Infinity, duration: 0.8, delay: 0.2 }}
          />
          <motion.span
            className="w-1.5 h-1.5 rounded-full bg-[#a3e635]"
            animate={{ y: [0, -5, 0], scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ repeat: Infinity, duration: 0.8, delay: 0.4 }}
          />
        </div>
      </div>
    </div>
  );
};
