package cz.novanadeje.app.donations.application.banklogo;

import cz.novanadeje.app.donations.domain.bankcode.BankCode;
import cz.novanadeje.app.donations.domain.banklogo.BankLogo;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Service
public class BankLogoRefreshService {

    private final BankLogoRepository logos;
    private final BankLogoImages images;
    private final TransactionTemplate transaction;
    private final TransactionTemplate reads;
    private final Clock clock;

    public BankLogoRefreshService(BankLogoRepository logos, BankLogoImages images, TransactionTemplate transaction, Clock clock) {
        this.logos = logos;
        this.images = images;
        this.transaction = transaction;
        this.reads = new TransactionTemplate(transaction.getTransactionManager());
        this.reads.setReadOnly(true);
        this.clock = clock;
    }

    public List<BankCode> due() {
        Instant now = clock.instant();
        return reads.execute(status -> logos.findAll().stream().filter(logo -> logo.isDue(now)).map(BankLogo::code).toList());
    }

    public BankLogoCheck refresh(BankCode code) {
        Optional<BankLogo> known = reads.execute(status -> logos.find(code));
        if (known.isEmpty() || !known.get().source().allowed()) {
            return BankLogoCheck.SKIPPED;
        }
        BankLogo checked = known.get();
        FetchedBankLogo fetched;
        try {
            fetched = images.fetch(checked.source());
        } catch (BankLogoUnavailable unavailable) {
            transaction.executeWithoutResult(status -> logos.recordFailure(checked.source(), unavailable.failure()));
            throw unavailable;
        }
        return transaction.execute(status -> record(checked, fetched));
    }

    private BankLogoCheck record(BankLogo checked, FetchedBankLogo fetched) {
        Instant now = clock.instant();
        if (checked.holds(fetched.sha256())) {
            return logos.recordUnchanged(checked.source(), now) ? BankLogoCheck.UNCHANGED : BankLogoCheck.SKIPPED;
        }
        Optional<BankLogo> locked = logos.lockForChange(checked.code()).filter(current -> current.source().equals(checked.source()));
        if (locked.isEmpty()) {
            return BankLogoCheck.SKIPPED;
        }
        BankLogoImageChanges.apply(logos, locked.get(), checked.source(), fetched, now);
        return BankLogoCheck.FETCHED;
    }
}
