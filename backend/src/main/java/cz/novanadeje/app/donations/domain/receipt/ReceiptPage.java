package cz.novanadeje.app.donations.domain.receipt;

import java.util.List;

public record ReceiptPage(List<DonationReceipt> items, long total) {

    public ReceiptPage {
        items = List.copyOf(items);
        if (total < items.size()) {
            throw new IllegalArgumentException("A receipt page holds at most the total");
        }
    }
}
