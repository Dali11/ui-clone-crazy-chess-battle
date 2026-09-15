import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Academy lesson pages are disabled while the curriculum is
 * "coming soon" — everyone lands on the Academy teaser instead.
 */
export default async function LessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  redirect(`/academy?lesson=${lessonId}`);
}
