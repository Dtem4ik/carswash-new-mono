import { redirect } from "next/navigation";

// The authenticated landing is the live boxes board.
export default function RootPage() {
  redirect("/board");
}
