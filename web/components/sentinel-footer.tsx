import Link from "next/link";
import { Sun } from "lucide-react";

export default function SentinelFooter() {
  return (
    <footer id="sentinel-root-footer" className="border-t border-white/5 py-10 bg-[#0a0f1c]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
              <Sun className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-gray-400">Solar Sentinel</span>
            <span className="text-xs text-gray-600">&copy; {new Date().getFullYear()}</span>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 text-xs text-gray-500">
            <div className="flex items-center gap-6">
              <Link href="/" className="hover:text-white transition-colors">Queue Monitor</Link>
              <Link href="/risk-radar" className="hover:text-white transition-colors">Risk Radar</Link>
              <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <span>Built by Jared (ex-Tesla, Sunrun, Sunnova)</span>
              <span className="hidden sm:inline">·</span>
              <a href="mailto:jared@localmotionai.com" className="hover:text-white transition-colors">
                jared@localmotionai.com
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
