import { redirect } from "next/navigation";

/**
 * Coverage is merged into the Labor & coverage screen (design spec §3.7).
 * The route stays so existing links do not break.
 */
export default function CoveragePage(): never {
  redirect("/labor");
}
