package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.CompanyIdentifier;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.EmailAlreadyRegistered;
import cz.novanadeje.app.donors.domain.PasswordHasher;
import cz.novanadeje.app.donors.domain.RawPassword;
import cz.novanadeje.app.shared.application.event.DonorRegistered;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;

@Service
public class DonorRegistrationService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final DonorRepository donors;
    private final PasswordHasher passwordHasher;
    private final DonorSessionService sessions;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public DonorRegistrationService(DonorRepository donors, PasswordHasher passwordHasher, DonorSessionService sessions,
                                    ApplicationEventPublisher events, Clock clock) {
        this.donors = donors;
        this.passwordHasher = passwordHasher;
        this.sessions = sessions;
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public AuthenticatedDonor register(RegisterDonorCommand command) {
        EmailAddress email = new EmailAddress(command.email());
        if (donors.existsByEmail(email)) {
            throw new EmailAlreadyRegistered();
        }
        Instant now = clock.instant();
        Donor donor = Donor.register(
                DonorId.newId(now),
                command.type(),
                command.name(),
                command.companyIdentifier() == null || command.companyIdentifier().isBlank() ? null : new CompanyIdentifier(command.companyIdentifier()),
                new PostalAddress(command.street(), command.city(), command.postalCode()),
                email,
                passwordHasher.hash(new RawPassword(command.password())),
                unusedVariableSymbol(),
                LocaleCode.fromTag(command.preferredLocale()),
                now
        );
        donors.save(donor);
        events.publishEvent(new DonorRegistered(
                donor.id().value(), donor.type(), donor.name(), donor.companyIdentifier().map(CompanyIdentifier::value),
                donor.address(), donor.email(), donor.variableSymbol(), donor.preferredLocale(), donor.registeredAt()
        ));
        return new AuthenticatedDonor(DonorView.of(donor), sessions.open(donor.id(), donor.roles()));
    }

    private VariableSymbol unusedVariableSymbol() {
        VariableSymbol candidate;
        do {
            candidate = VariableSymbol.random(RANDOM);
        } while (donors.existsByVariableSymbol(candidate));
        return candidate;
    }
}
