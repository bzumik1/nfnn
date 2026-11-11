package cz.novanadeje.app.donations.application.banklogo;

import cz.novanadeje.app.donations.domain.ChangedMeanwhile;
import cz.novanadeje.app.donations.domain.bankcode.BankCode;
import cz.novanadeje.app.donations.domain.bankcode.BankCodeRepository;
import cz.novanadeje.app.donations.domain.bankcode.BankName;
import cz.novanadeje.app.donations.domain.bankcode.CzechBank;
import cz.novanadeje.app.donations.domain.banklogo.BankLogo;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoNotFound;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoRepository;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoSource;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoSourceInvalid;
import cz.novanadeje.app.donations.domain.banklogo.StoredBankLogoImage;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.application.version.ExpectedVersion;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.stream.Collectors;

@Service
public class BankLogoAdminService {

    static final String SET_ACTION = "SET_BANK_LOGO_SOURCE";
    static final String REFRESH_ACTION = "REFRESH_BANK_LOGO";
    static final String REMOVE_ACTION = "REMOVE_BANK_LOGO";

    private final BankLogoRepository logos;
    private final BankCodeRepository banks;
    private final BankLogoImages images;
    private final BankLogoVersions versions;
    private final ApplicationEventPublisher events;
    private final TransactionTemplate transaction;
    private final TransactionTemplate reads;
    private final Clock clock;

    public BankLogoAdminService(BankLogoRepository logos, BankCodeRepository banks, BankLogoImages images, BankLogoVersions versions,
                                ApplicationEventPublisher events, TransactionTemplate transaction, Clock clock) {
        this.logos = logos;
        this.banks = banks;
        this.images = images;
        this.versions = versions;
        this.events = events;
        this.transaction = transaction;
        this.reads = new TransactionTemplate(transaction.getTransactionManager());
        this.reads.setReadOnly(true);
        this.clock = clock;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public List<BankLogoAdminRow> list() {
        Map<BankCode, BankName> names = bankNames();
        return logos.findAll().stream().map(logo -> row(logo, names)).toList();
    }

    public BankLogoAdminRow set(UUID adminId, BankLogoSource source, BankLogoPrecondition precondition) {
        reads.executeWithoutResult(status -> admit(logos.find(source.bank()), precondition));
        FetchedBankLogo fetched = images.fetch(source);
        return inTransaction(() -> {
            Optional<BankLogo> current = logos.lockForChange(source.bank());
            admit(current, precondition);
            BankLogo locked = current.orElseGet(() -> createAndLock(source, precondition));
            Instant now = clock.instant();
            BankLogo changed = BankLogoImageChanges.apply(logos, locked, source, fetched, now);
            audit(adminId, SET_ACTION, "Logo banky " + source.bank().value() + " nastaveno z " + source.host() + ", obrázek " + fetched.sha256(), now);
            return row(changed, bankNames());
        });
    }

    public BankLogoAdminRow refresh(UUID adminId, BankCode code) {
        BankLogo known = reads.execute(status -> logos.find(code).orElseThrow(BankLogoNotFound::new));
        if (!known.source().allowed()) {
            throw new BankLogoSourceInvalid();
        }
        FetchedBankLogo fetched = images.fetch(known.source());
        return inTransaction(() -> {
            BankLogo locked = logos.lockForChange(code).orElseThrow(BankLogoNotFound::new);
            if (!locked.source().equals(known.source())) {
                return row(locked, bankNames());
            }
            Instant now = clock.instant();
            BankLogo changed = BankLogoImageChanges.apply(logos, locked, locked.source(), fetched, now);
            audit(adminId, REFRESH_ACTION, "Logo banky " + code.value() + " znovu staženo z " + locked.source().host() + ", obrázek " + fetched.sha256(), now);
            return row(changed, bankNames());
        });
    }

    @Transactional
    public void remove(UUID adminId, BankCode code, ExpectedVersion expected) {
        BankLogo locked = logos.lockForChange(code).orElseThrow(BankLogoNotFound::new);
        requireVersion(locked, expected);
        logos.delete(code);
        locked.image().map(StoredBankLogoImage::id).ifPresent(logos::deleteImage);
        audit(adminId, REMOVE_ACTION, "Logo banky " + code.value() + " odebráno", clock.instant());
    }

    private BankLogo createAndLock(BankLogoSource source, BankLogoPrecondition precondition) {
        boolean inserted = logos.insertIfAbsent(source);
        BankLogo locked = logos.lockForChange(source.bank()).orElseThrow(ChangedMeanwhile::andRemovedSince);
        if (!inserted) {
            admit(Optional.of(locked), precondition);
        }
        return locked;
    }

    private void admit(Optional<BankLogo> current, BankLogoPrecondition precondition) {
        switch (precondition) {
            case BankLogoPrecondition.Anything ignored -> {
            }
            case BankLogoPrecondition.Absent ignored -> current.ifPresent(existing -> {
                throw changedMeanwhile(existing);
            });
            case BankLogoPrecondition.Matching matching -> requireVersion(current.orElseThrow(BankLogoNotFound::new), matching.expected());
        }
    }

    private void requireVersion(BankLogo current, ExpectedVersion expected) {
        if (!expected.admits(versions.of(current))) {
            throw changedMeanwhile(current);
        }
    }

    private ChangedMeanwhile changedMeanwhile(BankLogo current) {
        return new ChangedMeanwhile(versions.of(current), row(current, bankNames()));
    }

    private void audit(UUID adminId, String action, String details, Instant at) {
        events.publishEvent(new AdminActionPerformed(adminId, action, Optional.empty(), details, at));
    }

    private BankLogoAdminRow row(BankLogo logo, Map<BankCode, BankName> names) {
        return BankLogoAdminRow.of(logo, Optional.ofNullable(names.get(logo.code())), versions.of(logo));
    }

    private Map<BankCode, BankName> bankNames() {
        return banks.findAll().stream().collect(Collectors.toMap(CzechBank::code, CzechBank::name));
    }

    private <T> T inTransaction(Supplier<T> work) {
        return transaction.execute(status -> work.get());
    }
}
