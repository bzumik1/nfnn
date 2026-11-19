package cz.novanadeje.app.donations.domain.receipt;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public final class ReceiptIssuePolicy {

    private ReceiptIssuePolicy() {
    }

    public static Optional<DonationReceipt> activeToReturnAgain(ReceiptIssueFacts facts) {
        if (facts instanceof ReceiptIssueFacts.ForDonation single) {
            refuseWhenAnActiveYearlyReceiptLists(single);
        }
        return facts.active().filter(active -> active.certifies(facts.requested()));
    }

    public static NewReceipt newReceipt(ReceiptIssueFacts.ForDonation facts, boolean byConnectedApplication) {
        return decideNew(facts, new YearlyReplacements(List.of(), Optional.empty()), byConnectedApplication);
    }

    public static NewReceipt newReceipt(ReceiptIssueFacts.ForYear facts, YearlyReplacements replacements, boolean byConnectedApplication) {
        return decideNew(facts, replacements, byConnectedApplication);
    }

    private static NewReceipt decideNew(ReceiptIssueFacts facts, YearlyReplacements replacements, boolean byConnectedApplication) {
        List<DonationReceipt> activeSingles = replacements.activeSingles();
        if (activeToReturnAgain(facts).isPresent()) {
            throw new IllegalStateException("The active receipt certifies the requested data and is returned again, not replaced");
        }
        Optional<DonationReceipt> active = facts.active();
        if (byConnectedApplication && (active.isPresent() || !activeSingles.isEmpty())) {
            throw new ReceiptReplacementInBrowserOnly();
        }
        List<DonationReceipt> toSupersede = new ArrayList<>();
        active.ifPresent(toSupersede::add);
        toSupersede.addAll(activeSingles);
        return new NewReceipt(active.or(replacements::latestOutdated), toSupersede);
    }

    private static void refuseWhenAnActiveYearlyReceiptLists(ReceiptIssueFacts.ForDonation single) {
        if (single.activeYearlyOfItsYear().filter(yearly -> yearly.lists(single.donation())).isPresent()) {
            throw new DonationOnYearlyReceipt(single.donation());
        }
    }
}
