import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Risk Radar — AI Document Diligence | Solar Sentinel",
  description:
    "Upload PPAs, ICAs, and offtake docs — get a full risk matrix with queue cross-referencing in 24 hours. First report free.",
};

export default function RiskRadarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="risk-radar-root">
      {children}
    </div>
  );
}
