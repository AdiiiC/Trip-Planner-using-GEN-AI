"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QrCode, X, Copy, Check } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

interface Props {
  url: string;
  title?: string;
}

export function QRCodeButton({ url, title = "Share trip" }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyUrl = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-white/10 text-[var(--fg-muted)] hover:text-white hover:border-white/20 transition-colors"
        title="Show QR code"
      >
        <QrCode className="w-3.5 h-3.5" />
        QR
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            />
            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 glass rounded-2xl p-6 w-72 shadow-2xl border border-emerald-500/20"
            >
              <div className="flex items-center justify-between mb-4">
                <p className="text-white font-semibold text-sm">{title}</p>
                <button onClick={() => setOpen(false)} className="text-[var(--fg-muted)] hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* QR code */}
              <div className="bg-white rounded-xl p-3 mb-4 flex justify-center">
                <QRCodeSVG value={url} size={200} bgColor="#ffffff" fgColor="var(--bg)" level="M" />
              </div>

              <p className="text-[var(--fg-muted)] text-xs text-center mb-3">Scan to open on another device</p>

              {/* Copy link */}
              <button
                onClick={copyUrl}
                className="w-full flex items-center justify-center gap-2 text-sm py-2 rounded-xl border border-white/10 text-[var(--fg-muted)] hover:text-white hover:border-emerald-500/40 transition-colors"
              >
                {copied ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy link</>}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
