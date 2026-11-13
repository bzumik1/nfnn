package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.application.event.DonorRegistrationRepeated;
import cz.novanadeje.app.donors.domain.CompanyIdentifier;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.PasswordHasher;
import cz.novanadeje.app.donors.domain.RawPassword;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Optional;

@Service
public class DonorRegistrationService {

    private static final Logger log = LoggerFactory.getLogger(DonorRegistrationService.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final DonorRepository donors;
    private final PasswordHasher passwordHasher;
    private final DonorEmailVerificationService emailVerification;
    private final ApplicationEventPublisher events;
    private final Clock clock;
    private final TransactionTemplate writes;

    public DonorRegistrationService(DonorRepository donors, PasswordHasher passwordHasher, DonorEmailVerificationService emailVerification,
                                    ApplicationEventPublisher events, Clock clock, PlatformTransactionManager transactions) {
        this.donors = donors;
        this.passwordHasher = passwordHasher;
        this.emailVerification = emailVerification;
        this.events = events;
        this.clock = clock;
        this.writes = new TransactionTemplate(transactions);
    }

    public void register(RegisterDonorCommand command) {
        EmailAddress email = new EmailAddress(command.email());
        Instant now = clock.instant();
        Optional<CompanyIdentifier> companyIdentifier = command.companyIdentifier() == null || command.companyIdentifier().isBlank()
                ? Optional.empty()
                : Optional.of(new CompanyIdentifier(command.companyIdentifier()));
        PostalAddress address = new PostalAddress(command.street(), command.city(), command.postalCode());
        Optional<PasswordHash> passwordHash = hashOf(command.password());
        writes.executeWithoutResult(status -> register(command, email, companyIdentifier, address, passwordHash, now));
    }

    private Optional<PasswordHash> hashOf(String password) {
        return Optional.ofNullable(password).map(given -> passwordHasher.hash(new RawPassword(given)));
    }

    private void register(RegisterDonorCommand command, EmailAddress email, Optional<CompanyIdentifier> companyIdentifier, PostalAddress address,
                          Optional<PasswordHash> passwordHash, Instant now) {
        Donor donor = Donor.register(
                DonorId.newId(now),
                command.type(),
                command.name(),
                companyIdentifier.orElse(null),
                address,
                email,
                passwordHash.orElse(null),
                unusedVariableSymbol(),
                LocaleCode.fromTag(command.preferredLocale()),
                now
        );
        donors.lockEmail(email);
        Donor existing = donors.findByEmailForUpdate(email).orElse(null);
        if (existing != null && existing.isEmailVerified()) {
            events.publishEvent(new DonorRegistrationRepeated(existing.id().value(), existing.email(), existing.preferredLocale()));
            log.info("Registration repeated for verified donor {}", existing.id());
            return;
        }
        if (existing != null) {
            donors.delete(existing.id());
            log.info("Unverified donor {} replaced by a new registration", existing.id());
        }
        donors.save(donor);
        command.returnTo().ifPresentOrElse(returnTo -> emailVerification.issueLink(donor, returnTo), () -> emailVerification.issueLink(donor));
    }

    private VariableSymbol unusedVariableSymbol() {
        VariableSymbol candidate;
        do {
            candidate = VariableSymbol.random(RANDOM);
        } while (donors.existsByVariableSymbol(candidate));
        return candidate;
    }
}
