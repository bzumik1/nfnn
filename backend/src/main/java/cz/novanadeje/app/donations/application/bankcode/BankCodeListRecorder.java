package cz.novanadeje.app.donations.application.bankcode;

import cz.novanadeje.app.donations.domain.bankcode.BankCodeListState;
import cz.novanadeje.app.donations.domain.bankcode.BankCodeRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;

@Service
public class BankCodeListRecorder {

    private final BankCodeRepository repository;
    private final Clock clock;

    public BankCodeListRecorder(BankCodeRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public BankCodeListState state() {
        return repository.state();
    }

    @Transactional
    public BankCodeRefresh recordFetched(BankCodeFetch.Fetched fetched) {
        Instant now = clock.instant();
        BankCodeListState state = repository.state();
        repository.store(fetched.list(), fetched.lastModified().map(value -> state.fetched(now, value)).orElseGet(() -> state.fetched(now)));
        return BankCodeRefresh.fetched(fetched.list().banks().size());
    }

    @Transactional
    public BankCodeRefresh recordUnchanged() {
        repository.save(repository.state().unchanged(clock.instant()));
        return BankCodeRefresh.unchanged();
    }
}
