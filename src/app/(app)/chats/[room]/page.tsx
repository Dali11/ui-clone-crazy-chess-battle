import type { Metadata } from "next";
import RoomChatClient from "./room-client";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function RoomChatPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return <RoomChatClient room={room} />;
}
