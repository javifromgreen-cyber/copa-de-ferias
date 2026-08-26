import { AdminNav } from "@/components/admin/AdminNav";

// Every admin page reads live, frequently-changing data (trips, bookings,
// leads, emails) — never statically prerender or cache any page in this
// section.
export const dynamic = "force-dynamic";

export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <AdminNav />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
