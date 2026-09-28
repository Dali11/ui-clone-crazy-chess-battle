import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The legacy admin panel has been replaced by the Command Centre.
 * This route now redirects there; admins should update bookmarks.
 */
export default function AdminRedirectPage() {
  redirect("/commandcentre");
}
