export default function AuroraBackground({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden aurora-sky">

      {/* stars */}
      <div className="stars" />

      {/* aurora ribbons */}
      <div className="aurora-ribbon ribbon1"></div>
      <div className="aurora-ribbon ribbon2"></div>
      <div className="aurora-ribbon ribbon3"></div>

      {/* glow atmosphere */}
      <div className="aurora-glow"></div>

      <div className="relative z-10">{children}</div>
    </div>
  );
}