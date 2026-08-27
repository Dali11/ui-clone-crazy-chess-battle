import os
import re

SRC_DIR = "src"

def fix_file(content):
    # === 1. Fix formatMKK / formatMWK functions ===
    # battle-helpers.ts: Math.floor(cents / 100) → Math.floor(amount)
    content = content.replace('Math.floor(cents / 100).toLocaleString("en-US")', 'Math.floor(amount).toLocaleString("en-US")')
    # battles-client.tsx local formatMKK
    content = content.replace('Math.floor(cents / 100).toLocaleString("en-US")', 'Math.floor(amount).toLocaleString("en-US")')
    # email.ts formatMWK
    content = content.replace('(cents / 100).toLocaleString()', 'amount.toLocaleString()')
    # wallet-client.tsx formatMWK
    content = content.replace('Math.floor((cents || 0) / 100).toLocaleString()', 'Math.floor((amount || 0)).toLocaleString()')
    # admin-client.tsx formatMWK
    content = content.replace('Math.floor((cents || 0) / 100).toLocaleString()', 'Math.floor((amount || 0)).toLocaleString()')
    
    # Rename 'cents' parameter to 'amount' in format functions
    content = re.sub(r'function formatMKK\(cents:', 'function formatMKK(amount:', content)
    content = re.sub(r'function formatMWK\(cents:', 'function formatMWK(amount:', content)
    content = re.sub(r'const formatMWK = \(cents:', 'const formatMWK = (amount:', content)
    
    # === 2. Remove * 100 money conversion (user input → cents for storage) ===
    # These are patterns where user enters MWK and code multiplies by 100 to store as cents
    money_mult_patterns = [
        ('stakeValue * 100', 'stakeValue'),
        ('depositAmount * 100', 'depositAmount'),
        ('withdrawAmount * 100', 'withdrawAmount'),
        ('parseInt(customStake) * 100', 'parseInt(customStake)'),
        ('parseInt(val) * 100', 'parseInt(val)'),
        ('Number(e.target.value) * 100', 'Number(e.target.value)'),
        ('Number(configEdit.min_withdrawal) * 100', 'Number(configEdit.min_withdrawal)'),
        ('Number(configEdit.max_withdrawal) * 100', 'Number(configEdit.max_withdrawal)'),
        ('Number(configEdit.min_deposit) * 100', 'Number(configEdit.min_deposit)'),
        ('Number(configEdit.daily_withdrawal_limit) * 100', 'Number(configEdit.daily_withdrawal_limit)'),
        ('Number(configEdit.withdrawal_fee) * 100', 'Number(configEdit.withdrawal_fee)'),
        ('Number(createForm.entry_fee) || 0) * 100', 'Number(createForm.entry_fee) || 0)'),
        ('Number(createForm.prize_pool) || 0) * 100', 'Number(createForm.prize_pool) || 0)'),
    ]
    for old, new in money_mult_patterns:
        content = content.replace(old, new)
    
    # Admin panel: Number(v) * 100 → Number(v) (generic pattern for config fields)
    content = re.sub(r'Number\(v\) \* 100', 'Number(v)', content)
    # Admin panel: Number(value) * 100 → Number(value) (platform settings)
    content = re.sub(r'Number\(value\) \* 100', 'Number(value)', content)
    
    # === 3. Remove / 100 money conversion (cents → MWK for display) ===
    # Pattern: Math.floor(SOMETHING / 100) where SOMETHING is a money field
    # We need to NOT touch percentage calculations
    
    # Specific safe replacements (field names that are clearly money)
    money_div_patterns = [
        # Display conversions
        ('Math.floor(deposit.amount / 100)', 'deposit.amount'),
        ('Math.floor(withdrawal.amount / 100)', 'withdrawal.amount'),
        ('Math.floor(battle.stake / 100)', 'battle.stake'),
        ('Math.floor(stake / 100)', 'stake'),
        ('Math.floor(wallet_balance / 100)', 'wallet_balance'),
        ('Math.floor(entryFee / 100)', 'entryFee'),
        ('Math.floor(entry_fee / 100)', 'entry_fee'),
        ('Math.floor(prize_pool / 100)', 'prize_pool'),
        ('Math.floor(currentBalance / 100)', 'currentBalance'),
        ('Math.floor(minAmount / 100)', 'minAmount'),
        ('Math.floor(maxAmount / 100)', 'maxAmount'),
        ('Math.floor(minAmount / 100)', 'minAmount'),
        ('Math.floor(maxAmount / 100)', 'maxAmount'),
        ('Math.floor(depWallet.wallet_balance / 100)', 'depWallet.wallet_balance'),
        ('Math.floor(membershipPrice / 100)', 'membershipPrice'),
        ('Math.floor(price / 100)', 'price'),
        ('Math.floor((price / 100))', 'price'),
        ('Math.floor(amount / 100)', 'amount'),
        ('Math.floor(payout / 100)', 'payout'),
        ('Math.floor((payout.amount ?? 0) / 100)', '(payout.amount ?? 0)'),
        ('Math.floor((league.prize_pool || 0) / 100)', '(league.prize_pool || 0)'),
        ('Math.floor((prizeEditTournament.prize_pool * (payout.percentage || 0)) / 100)', 
         'Math.floor(prizeEditTournament.prize_pool * (payout.percentage || 0) / 100)'),
        # Keep the percentage / 100 for the actual percentage calculation!
        # Actually this one is a mixed case: prize_pool * percentage / 100 — the / 100 is for percentage, not cents
        # So we should keep it as: Math.floor(prizeEditTournament.prize_pool * (payout.percentage || 0) / 100)
        # Wait, but prize_pool is now in MWK (not cents), so the calculation is:
        # MWK_amount * percentage / 100 = MWK payout — this is correct!
        # So actually we should NOT change this line at all.
    ]
    
    # Revert the last one — it's a percentage calculation, not a cents conversion
    money_div_patterns[-1] = (
        'Math.floor((prizeEditTournament.prize_pool * (payout.percentage || 0)) / 100)',
        'Math.floor(prizeEditTournament.prize_pool * (payout.percentage || 0) / 100)'
    )
    
    for old, new in money_div_patterns:
        content = content.replace(old, new)
    
    # Generic patterns for / 100 in display contexts
    # (X / 100).toLocaleString() → X.toLocaleString()
    def replace_div_100_tls(match):
        inner = match.group(1)
        # Skip if it contains percentage/pct (percentage calculation)
        if any(x in inner.lower() for x in ['percentage', 'pct', 'percent', 'fee_pct']):
            return match.group(0)
        return f'{inner}.toLocaleString()'
    
    content = re.sub(r'\(([^()]+?) / 100\)\.toLocaleString\(\)', replace_div_100_tls, content)
    
    # Math.floor((X) / 100).toLocaleString() → X.toLocaleString()
    # e.g., Math.floor((dailyLimit - todayTotal) / 100).toLocaleString()
    def replace_mathfloor_div_100_tls(match):
        inner = match.group(1)
        if any(x in inner.lower() for x in ['percentage', 'pct', 'percent', 'fee_pct']):
            return match.group(0)
        return f'Math.floor({inner}).toLocaleString()'
    
    content = re.sub(r'Math\.floor\(\(([^()]+?)\) / 100\)\.toLocaleString\(\)', replace_mathfloor_div_100_tls, content)
    
    # entry_fee / 100 in tournament display
    content = content.replace('t.entry_fee / 100', 't.entry_fee')
    content = content.replace('t.entry_fee ? ` · MK ${t.entry_fee}`', 't.entry_fee ? ` · MK ${t.entry_fee}`')
    
    # berry_value / 100 in admin display  
    content = content.replace('(berryConfig.berry_value ?? 1000) / 100', '(berryConfig.berry_value ?? 10)')
    
    # Math.floor(value / 100) in app-nav.tsx
    content = re.sub(r'Math\.floor\(value / 100\)', 'Math.floor(value)', content)
    
    # Math.floor(cents / 100) in home-stats.tsx
    content = re.sub(r'Math\.floor\(cents / 100\)', 'Math.floor(cents)', content)
    
    # (cents / 100) * rate in currency conversion
    content = re.sub(r'\(cents / 100\) \* rate', 'cents * rate', content)
    content = re.sub(r'\(cents / 100\) \* currency\.rate', 'cents * currency.rate', content)
    
    # profile.wallet_balance / 100 in dashboard
    content = content.replace('Math.floor(profile.wallet_balance / 100)', 'profile.wallet_balance')
    
    # === 4. Fix remaining _cents / Cents variable names ===
    content = content.replace('cashCents', 'cashAmount')
    content = content.replace('fee_cents', 'fee')
    content = content.replace('net_amount_cents', 'net_amount')
    content = content.replace('initialBalanceCents', 'initialBalance')
    content = content.replace('convertedPrizePoolCents', 'convertedPrizePool')
    content = re.sub(r'\bconvertCents\b', 'convertAmount', content)
    content = re.sub(r'\bwholeUnits\b', 'wholeAmount', content)
    
    # Fix formatCurrency parameter (cents / 100) * rate → cents * rate
    # Already handled above
    
    # Fix admin-client.tsx Math.floor((X || default) / 100) patterns
    content = re.sub(
        r'Math\.floor\(\(withdrawalConfig\.(\w+) \|\| (\d+)\) / 100\)',
        r'withdrawalConfig.\1 || \2',
        content
    )
    
    # Fix: Math.floor((marketEdits[...] ?? config.X) / 100).toLocaleString()
    content = re.sub(
        r'Math\.floor\(\(marketEdits\[config\.country_code\]\??\.(\w+) \?\? config\.\1\) / 100\)\.toLocaleString\(\)',
        r'(marketEdits[config.country_code]?.\1 ?? config.\1).toLocaleString()',
        content
    )
    
    # Fix remaining (amount / 100) in withdrawal display
    content = re.sub(r'Math\.floor\(\(netAmount \|\| withdrawal\.amount\) / 100\)', '(netAmount || withdrawal.amount)', content)
    
    # Fix formatMoney(convertedPrizePool, ...) — already renamed
    
    # Fix the leagues prize pool display
    content = re.sub(r'Math\.floor\(\((\w+\.\w+ \|\| 0)\) / 100\)', r'\1', content)
    
    return content

def process_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content = fix_file(content)
    
    if new_content != content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        return True
    return False

def main():
    updated = []
    for root, dirs, files in os.walk(SRC_DIR):
        for file in files:
            if file.endswith('.ts') or file.endswith('.tsx'):
                path = os.path.join(root, file)
                if process_file(path):
                    updated.append(path)
    
    for p in updated:
        print(f"Fixed: {p}")
    print(f"\nTotal: {len(updated)} files updated")

if __name__ == "__main__":
    main()
