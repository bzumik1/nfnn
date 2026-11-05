package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.receipt.YearlyReceiptOutcome;
import cz.novanadeje.app.donations.application.receipt.YearlyReceiptResult;
import cz.novanadeje.app.donations.application.receipt.YearlyReceiptsRun;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;

import java.util.List;
import java.util.UUID;

record YearlyReceiptsResponse(int year, List<Result> results, long issued, long replaced, long unchanged, long skipped) {

    static YearlyReceiptsResponse from(YearlyReceiptsRun run) {
        return new YearlyReceiptsResponse(run.year().getValue(), run.results().stream().map(Result::from).toList(),
                run.count(YearlyReceiptOutcome.ISSUED), run.count(YearlyReceiptOutcome.REPLACED), run.count(YearlyReceiptOutcome.UNCHANGED),
                run.count(YearlyReceiptOutcome.SKIPPED));
    }

    record Result(UUID donorId, YearlyReceiptOutcome outcome, String problem, String replacedNumber, AdminReceiptResponse receipt) {

        static Result from(YearlyReceiptResult result) {
            return new Result(result.donor().value(), result.outcome(), result.problem().orElse(null),
                    result.replaced().map(ReceiptNumber::value).orElse(null), result.receipt().map(AdminReceiptResponse::ofLiveDonor).orElse(null));
        }
    }
}
