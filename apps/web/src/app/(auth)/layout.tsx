export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="bg-gridlines grid flex-1 grid-cols-1 lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-[var(--espresso-900)] p-12 text-[var(--oat-100)] lg:flex">
        <p className="type-label text-[var(--espresso-300)]">Life CRM</p>
        <h1 className="type-display text-6xl xl:text-7xl">
          Remember what <em className="text-mint">matters</em> about the people you love.
        </h1>
        <p className="type-label text-[var(--espresso-300)]">Birthdays · Stories · Photos · Check-ins</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">{children}</div>
      </section>
    </main>
  );
}
