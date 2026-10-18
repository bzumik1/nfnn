package cz.novanadeje.app.donations.domain.donation;

import cz.novanadeje.app.shared.domain.Money;

import java.time.LocalDate;
import java.time.Year;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.stream.Collectors;

public final class DonationSummary {

    private final Money total;
    private final int count;
    private final LocalDate lastReceivedOn;
    private final List<YearTotal> byYear;

    private DonationSummary(Money total, int count, LocalDate lastReceivedOn, List<YearTotal> byYear) {
        this.total = total;
        this.count = count;
        this.lastReceivedOn = lastReceivedOn;
        this.byYear = List.copyOf(byYear);
    }

    public static DonationSummary of(List<Donation> donations) {
        DonationList all = DonationList.of(donations);
        List<Donation> counted = all.items().stream().filter(Donation::isReceived).toList();
        LocalDate lastReceivedOn = counted.stream().map(Donation::receivedOn).max(Comparator.naturalOrder()).orElse(null);
        return new DonationSummary(all.total(), all.count(), lastReceivedOn, yearTotals(counted));
    }

    public Money total() {
        return total;
    }

    public int count() {
        return count;
    }

    public Optional<LocalDate> lastReceivedOn() {
        return Optional.ofNullable(lastReceivedOn);
    }

    public List<YearTotal> byYear() {
        return byYear;
    }

    private static List<YearTotal> yearTotals(List<Donation> counted) {
        Map<Year, List<Donation>> perYear = counted.stream()
                .collect(Collectors.groupingBy(Donation::receivedYear, () -> new TreeMap<>(Comparator.reverseOrder()), Collectors.toList()));
        return perYear.entrySet().stream()
                .map(entry -> {
                    DonationList year = DonationList.of(entry.getValue());
                    return new YearTotal(entry.getKey(), year.count(), year.total());
                })
                .toList();
    }
}
