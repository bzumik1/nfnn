package cz.novanadeje.fio;

import java.util.List;

import static java.util.Objects.requireNonNull;

public record FioStatement(FioAccountInfo info, List<FioTransaction> transactions) {

    public FioStatement {
        requireNonNull(info, "info");
        transactions = List.copyOf(transactions);
    }
}
