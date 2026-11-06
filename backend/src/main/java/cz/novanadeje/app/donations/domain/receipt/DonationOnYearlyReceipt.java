package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.shared.domain.error.Conflict;

public class DonationOnYearlyReceipt extends Conflict {

    public static final String CODE = "donations/donation-on-yearly-receipt";

    public DonationOnYearlyReceipt(DonationId donation, ReceiptNumber yearly) {
        super(CODE, "Donation " + donation + " is listed by the active yearly receipt " + yearly + ", so it gets no single receipt");
    }
}
