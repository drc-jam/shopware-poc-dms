import type { Metadata } from "next";
import { B2BNotice } from "@/components/b2b/B2BNotice";
import { getActivePersona } from "@/lib/session";
import { getCompany } from "@/lib/shopware/b2b";
import type { B2bRole } from "@/lib/shopware/types";

export const metadata: Metadata = { title: "Company" };

/** Human summary of a role's permissions, grouped by area (read-only in the POC). */
function summarizePermissions(r: B2bRole): string {
  const perms = r.permissions ?? [];
  if (!perms.length) return "Shop, cart, quick order, shopping lists, request approval";
  const groups = new Map<string, string[]>();
  for (const p of perms) {
    const [area, ...rest] = p.split(".");
    groups.set(area!, [...(groups.get(area!) ?? []), rest.join(".")]);
  }
  return [...groups].map(([area, acts]) => `${area.replace(/_/g, " ")}: ${acts.join(", ")}`).join(" · ");
}

/** S9 · Company: employees and roles (company admin only; read-only in the POC). */
export default async function CompanyPage() {
  const persona = await getActivePersona();
  const company = await getCompany();
  if (!company.ok) return <B2BNotice persona={persona} message={company.status === 403 ? company.message : `Company data could not be loaded (${company.message}).`} />;
  const { employees, roles } = company.data;
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-4xl font-semibold" data-testid="company-title">Company</h1>
        <p className="text-black/70">Employees, roles and permissions from Shopware B2B Employee Management. Read-only in this demo.</p>
      </header>
      <section className="space-y-2">
        <h2 className="text-2xl font-semibold">Employees</h2>
        <table className="w-full rounded-[var(--brand-radius)] bg-white text-sm" data-testid="employees">
          <thead>
            <tr className="border-b border-black/15 text-left text-black/60">
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">E-mail</th>
              <th className="p-3 font-medium">Role</th>
              <th className="p-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} className="border-b border-black/5" data-testid="employee-row">
                <td className="p-3">{e.firstName} {e.lastName}</td>
                <td className="p-3">{e.email}</td>
                <td className="p-3" data-testid="employee-role">{e.role?.name ?? "—"}</td>
                <td className="p-3 capitalize">{e.status ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="space-y-2">
        <h2 className="text-2xl font-semibold">Roles</h2>
        <ul className="space-y-2" data-testid="roles">
          {roles.map((r) => (
            <li key={r.id} className="rounded-[var(--brand-radius)] border border-black/10 bg-white p-4" data-testid="role-row" data-role={r.name}>
              <p className="font-semibold">{r.name} <span className="text-sm font-normal text-black/60">({(r.permissions ?? []).length} permissions)</span></p>
              <p className="mt-1 text-sm text-black/70">{summarizePermissions(r)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
