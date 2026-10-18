package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.donations.domain.bank.SenderAccount;

import java.util.Set;

public record ExcludedSenderAccounts(Set<SenderAccount> accounts) {

    public ExcludedSenderAccounts {
        if (accounts == null) {
            throw new IllegalArgumentException("Excluded sender accounts are required");
        }
        accounts = Set.copyOf(accounts);
    }

    public static ExcludedSenderAccounts none() {
        return new ExcludedSenderAccounts(Set.of());
    }

    public boolean excludes(SenderAccount account) {
        return accounts.contains(account);
    }
}
