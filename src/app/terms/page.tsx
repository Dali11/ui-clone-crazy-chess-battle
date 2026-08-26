import Link from "next/link";
import Image from "next/image";

import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Terms of Service",
  description: "The terms and conditions governing your use of Crazy Chess Battles, including tournament rules, prize eligibility, and account responsibilities.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-ccb-dark text-ccb-text">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="flex items-center gap-3 mb-8">
          <Image src="/logo-badge.png" alt="Crazy Chess Battles" width={32} height={32} className="w-8 h-8 rounded-full" />
          <Link href="/" className="text-ccb-muted hover:text-ccb-primary text-sm">← Back to CCB</Link>
        </div>
        
        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-ccb-muted mb-8">Last updated: August 25, 2026</p>

        <div className="prose prose-invert max-w-none space-y-6 text-sm leading-relaxed text-ccb-muted">
          <section>
            <h2 className="text-ccb-text font-semibold text-lg mb-2">1. Acceptance of Terms</h2>
            <p>By creating an account or using Crazy Chess Battles ("CCB", "we", "us"), you agree to these Terms of Service. CCB provides online chess and draughts gameplay, competitive tournaments, league competitions, and wallet-based payment features. If you do not agree to these Terms, do not use the platform.</p>
          </section>

          <section>
            <h2 className="text-ccb-text font-semibold text-lg mb-2">2. Eligibility</h2>
            <p>You must be at least 18 years old to create an account. By using CCB, you confirm you are of legal age in your country of residence. Players under 18 are not permitted to participate in paid tournaments or handle real money on the platform.</p>
          </section>

          <section>
            <h2 className="text-ccb-text font-semibold text-lg mb-2">3. Account Registration</h2>
            <p>You must provide accurate information when registering. You are responsible for maintaining the security of your account and password. CCB is not liable for unauthorized access to your account.</p>
          </section>

          <section>
            <h2 className="text-ccb-text font-semibold text-lg mb-2">4. Wallet, Deposits, and Withdrawals</h2>
            <p className="mb-2">CCB uses Paychangu to process mobile money payments for wallet deposits and withdrawals.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Deposits are credited to your CCB wallet after payment confirmation.</li>
              <li>Entry fees for paid tournaments are debited from your wallet at registration.</li>
              <li>Withdrawals are processed to your mobile money account. Auto-approved withdrawals are sent instantly; manually reviewed withdrawals are processed within 30 minutes.</li>
              <li>Minimum withdrawal amount is MWK 10.</li>
              <li>CCB reserves the right to reject withdrawal requests suspected of fraud or violation of these Terms.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-ccb-text font-semibold text-lg mb-2">5. Tournaments, Leagues, and Prize Pools</h2>
            <p className="mb-2">CCB hosts competitive chess and draughts tournaments with optional entry fees and prize pools. The competitive pipeline includes Swiss qualifier tournaments, a Premier League with weekly fixtures, and season championships.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Entry fees are collected into a tournament prize pool before the tournament starts.</li>
              <li>Prize distribution follows the published breakdown for each tournament (default: 40% for 1st, 20% for 2nd, 18% for 3rd, 12% for 4th, 10% for 5th).</li>
              <li>If a tournament is cancelled, all entry fees are refunded to participants' wallets.</li>
              <li>Players who leave a tournament after it starts forfeit their entry fee.</li>
              <li>Prize winnings are credited to your wallet and can be withdrawn via mobile money.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-ccb-text font-semibold text-lg mb-2">6. Competitive System and Membership</h2>
            <p className="mb-2">CCB operates a structured competitive ecosystem:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Swiss qualifier tournaments determine which players advance to the Premier League.</li>
              <li>The Premier League uses football-style scoring (3 points for a win, 1 for a draw, 0 for a loss) across weekly fixtures.</li>
              <li>Season points accumulate across all competitions. The top-ranked player at season end is crowned Season Champion.</li>
              <li>Divisions may have eligibility requirements, including country, gender, or identity verification. Some divisions require verified identity for gender-restricted competitions.</li>
              <li>Membership (CrazyChess Club) is required for premium Premier League divisions. Membership pricing is configured per country. A 10-day grace period applies before membership lapse affects league spots or fixture results.</li>
              <li>Gender selected during signup is permanent and cannot be changed, to ensure competitive integrity in gender-restricted divisions.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-ccb-text font-semibold text-lg mb-2">12. Fair Play and Anti-Cheat</h2>
            <p>Cheating, including but not limited to using chess or draughts engines, receiving outside assistance, or colluding with other players, is strictly prohibited. Violators will be permanently banned, their accounts frozen, and prize winnings forfeited.</p>
          </section>

          <section>
            <h2 className="text-ccb-text font-semibold text-lg mb-2">12. Prohibited Conduct</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Creating multiple accounts to manipulate ratings or tournaments</li>
              <li>Harassing or abusing other players verbally or in chat</li>
              <li>Attempting to exploit bugs or vulnerabilities in the platform</li>
              <li>Using bots or automated tools to play games</li>
            </ul>
          </section>

          <section>
            <h2 className="text-ccb-text font-semibold text-lg mb-2">12. Limitation of Liability</h2>
            <p>CCB is provided "as is" without warranties of any kind. We are not liable for losses resulting from service interruptions, payment processing delays, or circumstances beyond our control. Our maximum liability for any claim is limited to the amount in your CCB wallet.</p>
          </section>

          <section>
            <h2 className="text-ccb-text font-semibold text-lg mb-2">12. Changes to Terms</h2>
            <p>We may update these Terms at any time. Continued use of CCB after changes constitutes acceptance of the updated Terms.</p>
          </section>

          <section>
            <h2 className="text-ccb-text font-semibold text-lg mb-2">12. Governing Law</h2>
            <p>These Terms are governed by the laws of the Republic of Malawi. Any disputes shall be resolved in the courts of Malawi.</p>
          </section>

          <section>
            <h2 className="text-ccb-text font-semibold text-lg mb-2">12. Contact</h2>
            <p>For questions about these Terms, contact us at support@ccb.mw</p>
          </section>
        </div>
      </div>
    </div>
  );
}
