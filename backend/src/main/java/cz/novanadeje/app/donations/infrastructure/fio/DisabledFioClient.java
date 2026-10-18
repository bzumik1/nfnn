package cz.novanadeje.app.donations.infrastructure.fio;

import cz.novanadeje.fio.FioClient;
import cz.novanadeje.fio.FioStatement;

import java.time.LocalDate;

final class DisabledFioClient implements FioClient {

    @Override
    public FioStatement newTransactions() {
        throw disabled();
    }

    @Override
    public FioStatement transactionsBetween(LocalDate from, LocalDate to) {
        throw disabled();
    }

    @Override
    public void setLastDownloadedId(long transactionId) {
        throw disabled();
    }

    @Override
    public void setLastDownloadedDate(LocalDate date) {
        throw disabled();
    }

    private static IllegalStateException disabled() {
        return new IllegalStateException("Fio import is disabled: FIO_TOKEN is not set");
    }
}
