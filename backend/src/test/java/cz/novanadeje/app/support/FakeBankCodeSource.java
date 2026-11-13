package cz.novanadeje.app.support;

import cz.novanadeje.app.donations.application.bankcode.BankCodeFetch;
import cz.novanadeje.app.donations.application.bankcode.BankCodeSource;
import cz.novanadeje.app.donations.application.bankcode.BankCodeSourceUnavailable;
import cz.novanadeje.app.donations.domain.bankcode.BankCodeList;
import cz.novanadeje.app.donations.domain.bankcode.BankCodeListState;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicReference;

public class FakeBankCodeSource implements BankCodeSource {

    private static final int NOT_FOUND = 404;

    private final AtomicReference<BankCodeList> published = new AtomicReference<>();
    private final AtomicReference<String> lastModified = new AtomicReference<>();
    private final AtomicReference<BankCodeSourceUnavailable> failure = new AtomicReference<>();
    private final List<Optional<String>> askedIfModifiedSince = new CopyOnWriteArrayList<>();

    @Override
    public BankCodeFetch fetch(BankCodeListState known) {
        askedIfModifiedSince.add(known.sourceLastModified());
        BankCodeSourceUnavailable unavailable = failure.get();
        if (unavailable != null) {
            throw unavailable;
        }
        BankCodeList list = published.get();
        if (list == null) {
            throw BankCodeSourceUnavailable.status(NOT_FOUND);
        }
        Optional<String> modified = Optional.ofNullable(lastModified.get());
        if (modified.isPresent() && modified.equals(known.sourceLastModified())) {
            return new BankCodeFetch.Unchanged();
        }
        return new BankCodeFetch.Fetched(list, modified);
    }

    public void publish(BankCodeList list, String modifiedAt) {
        published.set(list);
        lastModified.set(modifiedAt);
        failure.set(null);
    }

    public void failWith(BankCodeSourceUnavailable unavailable) {
        failure.set(unavailable);
    }

    public List<Optional<String>> askedIfModifiedSince() {
        return List.copyOf(askedIfModifiedSince);
    }

    public void reset() {
        published.set(null);
        lastModified.set(null);
        failure.set(null);
        askedIfModifiedSince.clear();
    }
}
