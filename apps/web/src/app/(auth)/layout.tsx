import Image from "next/image";
import Link from "next/link";
import { APP_NAME } from "@/lib/brand";
import hero from "../../../public/images/friends-sunset.jpg";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="grid flex-1 grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden lg:block">
        <Image src={hero} alt="" fill priority sizes="55vw" className="object-cover" placeholder="blur" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
        <div className="absolute inset-x-12 bottom-12 text-white">
          <Link href="/" className="type-display text-2xl italic">
            {APP_NAME}
          </Link>
          <p className="type-display mt-4 max-w-lg text-5xl leading-[1.05]">
            The people you love, <em className="text-white/75">remembered.</em>
          </p>
          <p className="mt-4 max-w-md text-white/85">Birthdays, catch-ups and the little things they tell you, all in one place.</p>
        </div>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">{children}</div>
      </section>
    </main>
  );
}
