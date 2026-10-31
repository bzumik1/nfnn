package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.donor.DonorReference;

import java.time.Year;
import java.util.Optional;

public record ReceiptQuery(Optional<DonorReference> donor, Optional<Year> issuedIn, int page, int limit) {

    public static final int MAX_LIMIT = 100;
    public static final int MAX_PAGE = 100_000;

    public ReceiptQuery {
        if (donor == null || issuedIn == null) {
            throw new IllegalArgumentException("A receipt query names its donor and year, even when absent");
        }
        if (page < 0 || page > MAX_PAGE || limit < 1 || limit > MAX_LIMIT) {
            throw new IllegalArgumentException("A receipt query asks for a page from 0 to " + MAX_PAGE + " of 1 to " + MAX_LIMIT + " receipts");
        }
    }
}
