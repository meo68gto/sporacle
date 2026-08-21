import { redirect } from "next/navigation";

/**
 * Feed adapters are merged into the Data health screen (design spec §3.8).
 * The route stays so existing links do not break.
 */
export default function FeedsPage(): never {
  redirect("/health");
}
