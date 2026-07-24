"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem("cookie_consent")) setVisible(true);
    } catch {}
  }, []);

  const respond = (choice: "accepted" | "declined") => {
    try { localStorage.setItem("cookie_consent", choice); } catch {}
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-[#1e2540] no-print"
        >
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-xs text-[#8892b0]">
              We use session storage for caching and Sentry for anonymous error monitoring. No personal data is collected.{" "}
              <Link href="/privacy" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
                Privacy Policy
              </Link>
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => respond("accepted")}
                className="text-xs px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors font-medium"
              >
                Accept
              </button>
              <button
                onClick={() => respond("declined")}
                className="text-xs px-4 py-1.5 border border-white/10 text-[#8892b0] hover:text-white rounded-lg transition-colors"
              >
                Decline
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
