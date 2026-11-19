package cz.novanadeje.app.donations.domain.receipt;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public final class ReceiptIssuePolicy {

    private ReceiptIssuePolicy() {
    }

    public static Optional<DonationReceipt> activeToReturnAgain(ReceiptIssueFacts facts) {
        if (facts instanceof ReceiptIssueFacts.ForGift single) {
            refuseWhenAnActiveYearlyReceiptLists(single);
        }
        return facts.active().filter(active -> active.certifies(facts.requested()));
    }

    public static NewReceipt newReceipt(ReceiptIssueFacts facts, List<DonationReceipt> activeSingles, Optional<DonationReceipt> outdated,
                                        boolean byConnectedApplication) {
        if (facts instanceof ReceiptIssueFacts.ForGift && (!activeSingles.isEmpty() || outdated.isPresent())) {
            throw new IllegalArgumentException("A single receipt supersedes no other single receipt and replaces no outdated yearly receipt");
        }
        if (activeToReturnAgain(facts).isPresent()) {
            throw new IllegalStateException("The active receipt certifies the requested data and is returned again, not replaced");
        }
        Optional<DonationReceipt> active = facts.active();
        if (byConnectedApplication && (active.isPresent() || !activeSingles.isEmpty())) {
            throw new ReceiptReplacementInBrowserOnly();
        }
        List<DonationReceipt> supersedes = new ArrayList<>();
        active.ifPresent(supersedes::add);
        supersedes.addAll(activeSingles);
        return new NewReceipt(active.or(() -> outdated), supersedes);
    }

    private static void refuseWhenAnActiveYearlyReceiptLists(ReceiptIssueFacts.ForGift single) {
        if (single.activeYearlyOfItsYear().filter(yearly -> yearly.lists(single.gift())).isPresent()) {
            throw new DonationOnYearlyReceipt(single.gift());
        }
    }
}
