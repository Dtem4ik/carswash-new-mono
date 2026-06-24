import { redirect } from "next/navigation";

/** The admin index lands on the first sub-section. */
export default function AdminIndexPage() {
  redirect("/admin/services");
}
