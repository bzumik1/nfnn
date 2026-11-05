package cz.novanadeje.app.donations.application.receipt;

import java.time.Year;
import java.util.List;

public record YearlyReceiptsRun(Year year, List<YearlyReceiptResult> results) {

    public YearlyReceiptsRun {
        results = List.copyOf(results);
    }

    public long count(YearlyReceiptOutcome outcome) {
        return results.stream().filter(result -> result.outcome() == outcome).count();
    }

    boolean tookNewNumbers() {
        return count(YearlyReceiptOutcome.ISSUED) + count(YearlyReceiptOutcome.REPLACED) > 0;
    }
}
