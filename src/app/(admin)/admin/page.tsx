import { redirect } from "next/navigation";

/**
 * The legacy admin panel has been replaced by the Command Centre.
 * This route now redirects there; admins should update bookmarks.
 */
export default function AdminRedirectPage() {
  redirect("/commandcentre");
}
