package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.application.event.DonorRegistrationRepeated;
import cz.novanadeje.app.donors.domain.CompanyIdentifier;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
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
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;

@Service
public class DonorRegistrationService {

    private static final Logger log = LoggerFactory.getLogger(DonorRegistrationService.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final DonorRepository donors;
    private final PasswordHasher passwordHasher;
    private final DonorEmailVerificationService emailVerification;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public DonorRegistrationService(DonorRepository donors, PasswordHasher passwordHasher, DonorEmailVerificationService emailVerification,
                                    ApplicationEventPublisher events, Clock clock) {
        this.donors = donors;
        this.passwordHasher = passwordHasher;
        this.emailVerification = emailVerification;
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public void register(RegisterDonorCommand command) {
        EmailAddress email = new EmailAddress(command.email());
        Donor existing = donors.findByEmail(email).orElse(null);
        if (existing != null && existing.isEmailVerified()) {
            events.publishEvent(new DonorRegistrationRepeated(existing.id().value(), existing.email(), existing.preferredLocale()));
            log.info("Registration repeated for verified donor {}", existing.id());
            return;
        }
        if (existing != null) {
            donors.delete(existing.id());
            log.info("Unverified donor {} replaced by a new registration", existing.id());
        }
        Instant now = clock.instant();
        Donor donor = Donor.register(
                DonorId.newId(now),
                command.type(),
                command.name(),
                command.companyIdentifier() == null || command.companyIdentifier().isBlank() ? null : new CompanyIdentifier(command.companyIdentifier()),
                new PostalAddress(command.street(), command.city(), command.postalCode()),
                email,
                command.password() == null ? null : passwordHasher.hash(new RawPassword(command.password())),
                unusedVariableSymbol(),
                LocaleCode.fromTag(command.preferredLocale()),
                now
        );
        donors.save(donor);
        emailVerification.issueLink(donor);
    }

    private VariableSymbol unusedVariableSymbol() {
        VariableSymbol candidate;
        do {
            candidate = VariableSymbol.random(RANDOM);
        } while (donors.existsByVariableSymbol(candidate));
        return candidate;
    }
}
