package cz.novanadeje.app.donations.infrastructure.fio;

import io.github.bzumik1.fio.FioClient;

final class DisabledFioClient implements FioClient {

    @Override
    public Transactions transactions() {
        throw disabled();
    }

    @Override
    public Statements statements() {
        throw disabled();
    }

    @Override
    public Merchant merchant() {
        throw disabled();
    }

    @Override
    public Bookmark bookmark() {
        throw disabled();
    }

    @Override
    public Payments payments() {
        throw disabled();
    }

    private static IllegalStateException disabled() {
        return new IllegalStateException("Fio import is disabled: FIO_TOKEN is not set");
    }
}
