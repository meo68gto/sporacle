import { redirect } from "next/navigation";

// Today is the landing screen (design spec §5).
export default function Home() {
  redirect("/today");
}
