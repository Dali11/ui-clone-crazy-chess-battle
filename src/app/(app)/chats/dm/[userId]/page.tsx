import type { Metadata } from "next";
import DmChatClient from "./dm-client";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DmChatPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <DmChatClient partnerId={userId} />;
}
