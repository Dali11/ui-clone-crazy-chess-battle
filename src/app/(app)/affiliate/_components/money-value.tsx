"use client";

import { useCurrency } from "@/hooks/use-currency";

/** Renders a wallet-settled amount in the viewer's display currency. */
export default function MoneyValue({ amount }: { amount: number }) {
  const { formatWallet } = useCurrency();
  return <>{formatWallet(amount)}</>;
}
