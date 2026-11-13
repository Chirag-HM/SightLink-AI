export default function StaticHeroOrbFallback({ isPulsing = false }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center lg:justify-end lg:pr-[10%] pointer-events-none select-none overflow-hidden z-[1]"
      aria-hidden="true"
    >
      <div className="relative flex items-center justify-center">
        <div
          className={`w-[320px] h-[320px] md:w-[440px] md:h-[440px] rounded-full border transition-all duration-500 ${
            isPulsing
              ? 'border-[#065F46]/65 scale-105'
              : 'border-[#065F46]/30'
          }`}
          style={{
            background:
              'radial-gradient(circle at 42% 40%, rgba(197,155,66,0.22), rgba(6,95,70,0.18) 40%, rgba(16,185,129,0.09) 66%, rgba(250,247,240,0) 76%)',
          }}
        />
        <div className="absolute w-[235px] h-[235px] md:w-[320px] md:h-[320px] rounded-full border border-[#C59B42]/45 rotate-12" />
        <div className="absolute w-[145px] h-[145px] md:w-[195px] md:h-[195px] rounded-full border border-[#065F46]/45 bg-gradient-to-br from-[#065F46]/20 via-[#059669]/15 to-[#C59B42]/20 shadow-glow-md" />
      </div>
    </div>
  );
}
