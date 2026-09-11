import type { Metadata } from "next";
import ChatsClient from "./chats-client";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function ChatsPage() {
  return <ChatsClient />;
}
