import os
import re

SRC_DIR = "src"

# Word replacements (ordered by specificity to prevent partial matches)
# Snake case replacements
SNAKE_REPLACEMENTS = [
    ("daily_withdrawal_limit_cents", "daily_withdrawal_limit"),
    ("membership_price_cents", "membership_price"),
    ("winner_payout_cents", "winner_payout"),
    ("platform_fee_cents", "platform_fee"),
    ("wallet_balance_cents", "wallet_balance"),
    ("withdrawal_fee_cents", "withdrawal_fee"),
    ("min_withdrawal_cents", "min_withdrawal"),
    ("max_withdrawal_cents", "max_withdrawal"),
    ("min_deposit_cents", "min_deposit"),
    ("deposit_fee_cents", "deposit_fee"),
    ("berry_value_cents", "berry_value"),
    ("prize_pool_cents", "prize_pool"),
    ("entry_fee_cents", "entry_fee"),
    ("amount_cents", "amount"),
    ("stake_cents", "stake"),
    ("pot_cents", "pot"),
    ("p_amount_cents", "p_amount"),
    ("min_amount_cents", "min_amount"),
    ("max_amount_cents", "max_amount"),
    ("daily_limit_cents", "daily_limit"),
    ("require_approval_above_cents", "require_approval_above"),
    ("min_stake_cents", "min_stake"),
    ("max_stake_cents", "max_stake"),
]

# CamelCase replacements
CAMEL_REPLACEMENTS = [
    ("BATTLE_STAKE_CENTS", "BATTLE_STAKE"),
    ("dailyWithdrawalLimitCents", "dailyWithdrawalLimit"),
    ("membershipPriceCents", "membershipPrice"),
    ("winnerPayoutCents", "winnerPayout"),
    ("platformFeeCents", "platformFee"),
    ("walletBalanceCents", "walletBalance"),
    ("withdrawalFeeCents", "withdrawalFee"),
    ("minWithdrawalCents", "minWithdrawal"),
    ("maxWithdrawalCents", "maxWithdrawal"),
    ("minDepositCents", "minDeposit"),
    ("depositFeeCents", "depositFee"),
    ("berryValueCents", "berryValue"),
    ("monthlyPriceCents", "monthlyPrice"),
    ("yearlyPriceCents", "yearlyPrice"),
    ("unitPriceCents", "unitPrice"),
    ("prizePoolCents", "prizePool"),
    ("entryFeeCents", "entryFee"),
    ("minAmountCents", "minAmount"),
    ("maxAmountCents", "maxAmount"),
    ("totalCents", "totalAmount"),
    ("priceCents", "price"),
    ("amountCents", "amount"),
    ("stakeCents", "stake"),
    ("potCents", "pot"),
    ("payoutCents", "payout"),
    ("requiredCents", "requiredAmount"),
    ("balanceCents", "balance"),
]

def apply_replacements(content):
    # 1. Snake case
    for old_val, new_val in SNAKE_REPLACEMENTS:
        content = re.sub(r'\b' + re.escape(old_val) + r'\b', new_val, content)
    
    # 2. Camel case
    for old_val, new_val in CAMEL_REPLACEMENTS:
        content = re.sub(r'\b' + re.escape(old_val) + r'\b', new_val, content)
        
    return content

def process_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    new_content = apply_replacements(content)

    if new_content != content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated field names in: {file_path}")

def main():
    for root, dirs, files in os.walk(SRC_DIR):
        for file in files:
            if file.endswith('.ts') or file.endswith('.tsx'):
                process_file(os.path.join(root, file))

if __name__ == "__main__":
    main()
