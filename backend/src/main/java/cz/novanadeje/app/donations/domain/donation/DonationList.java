package cz.novanadeje.app.donations.domain.donation;

import cz.novanadeje.app.shared.domain.Currency;
import cz.novanadeje.app.shared.domain.Money;

import java.time.Year;
import java.util.List;

public final class DonationList {

    private final List<Donation> items;
    private final Money total;
    private final int count;

    private DonationList(List<Donation> items) {
        this.items = List.copyOf(items);
        List<Donation> counted = this.items.stream().filter(Donation::isReceived).toList();
        this.total = counted.stream().map(Donation::amount).reduce(Money.zero(Currency.CZK), Money::plus);
        this.count = counted.size();
    }

    public static DonationList of(List<Donation> donations) {
        if (donations == null) {
            throw new IllegalArgumentException("Donations are required");
        }
        return new DonationList(donations);
    }

    public DonationList inYear(Year year) {
        if (year == null) {
            throw new IllegalArgumentException("Year is required");
        }
        return new DonationList(items.stream().filter(donation -> donation.receivedIn(year)).toList());
    }

    public List<Donation> items() {
        return items;
    }

    public Money total() {
        return total;
    }

    public int count() {
        return count;
    }
}
