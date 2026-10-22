package cz.novanadeje.app.donations.application.admin;

import java.time.Year;
import java.util.List;
import java.util.Optional;

public record AdminPaymentList(Optional<Year> year, List<Year> availableYears, List<AdminPaymentView> items) {

    public AdminPaymentList {
        if (year == null || availableYears == null || items == null) {
            throw new IllegalArgumentException("An admin payment list needs the year (even when absent), the available years and the items");
        }
        availableYears = List.copyOf(availableYears);
        items = List.copyOf(items);
    }
}
