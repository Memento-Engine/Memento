export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-dvh w-full flex items-center justify-center">
      {children}
    </div>
  );
}