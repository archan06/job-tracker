import { redirect } from "next/navigation";

// The proxy sends "/" to /board or /login; this covers requests it doesn't see.
export default function Home() {
  redirect("/board");
}
