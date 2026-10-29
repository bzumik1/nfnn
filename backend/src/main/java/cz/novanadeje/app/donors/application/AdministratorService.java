package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorNotFound;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.EmailNotRegistered;
import cz.novanadeje.app.donors.domain.NoPasskeys;
import cz.novanadeje.app.donors.domain.OwnAdministrationRevoked;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.donors.application.event.DonorPasskeysRemoved;
import cz.novanadeje.app.donors.application.event.DonorSecondFactorReset;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorNotEnabled;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.domain.EmailAddress;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Service
public class AdministratorService {

    static final String GRANT_ACTION = "GRANT_ADMINISTRATION";
    static final String REVOKE_ACTION = "REVOKE_ADMINISTRATION";
    static final String RESET_SECOND_FACTOR_ACTION = "RESET_SECOND_FACTOR";
    static final String REMOVE_PASSKEYS_ACTION = "REMOVE_PASSKEYS";

    private static final Logger log = LoggerFactory.getLogger(AdministratorService.class);

    private final DonorRepository donors;
    private final SecondFactorRepository secondFactors;
    private final PasskeyRepository passkeys;
    private final RefreshTokenRepository refreshTokens;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public AdministratorService(DonorRepository donors, SecondFactorRepository secondFactors, PasskeyRepository passkeys,
                                RefreshTokenRepository refreshTokens, ApplicationEventPublisher events, Clock clock) {
        this.donors = donors;
        this.secondFactors = secondFactors;
        this.passkeys = passkeys;
        this.refreshTokens = refreshTokens;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<AdministratorView> list() {
        return donors.findAdministrators().stream().map(this::view).toList();
    }

    @Transactional(readOnly = true)
    public List<AdministratorContact> contacts() {
        return donors.findAdministrators().stream()
                .map(administrator -> new AdministratorContact(administrator.id(), administrator.email(), administrator.preferredLocale()))
                .toList();
    }

    @Transactional
    public AdministratorView grant(DonorId adminId, EmailAddress email) {
        Donor donor = donors.findByEmail(email).orElseThrow(EmailNotRegistered::new);
        donor.grantAdministration();
        donors.save(donor);
        events.publishEvent(new AdminActionPerformed(adminId.value(), GRANT_ACTION, Optional.of(donor.id().value()),
                "Role správce udělena dárci " + donor.id(), clock.instant()));
        log.info("Administrator {} granted the administrator role to donor {}", adminId, donor.id());
        return view(donor);
    }

    @Transactional
    public void revoke(DonorId adminId, DonorId donorId) {
        if (adminId.equals(donorId)) {
            throw new OwnAdministrationRevoked();
        }
        Donor donor = donors.findById(donorId).orElseThrow(() -> new DonorNotFound(donorId));
        donor.revokeAdministration();
        donors.save(donor);
        Instant now = clock.instant();
        refreshTokens.revokeAllOf(donorId, now);
        events.publishEvent(new AdminActionPerformed(adminId.value(), REVOKE_ACTION, Optional.of(donorId.value()),
                "Role správce odebrána dárci " + donorId + "; všechna přihlášení dárce ukončena", now));
        log.info("Administrator {} took the administrator role from donor {}", adminId, donorId);
    }

    @Transactional
    public void resetSecondFactor(DonorId adminId, DonorId donorId) {
        Donor donor = donors.findById(donorId).orElseThrow(() -> new DonorNotFound(donorId));
        if (secondFactors.findByDonor(donorId).filter(SecondFactor::isEnabled).isEmpty()) {
            throw new SecondFactorNotEnabled();
        }
        secondFactors.delete(donorId);
        Instant now = clock.instant();
        refreshTokens.revokeAllOf(donorId, now);
        events.publishEvent(new AdminActionPerformed(adminId.value(), RESET_SECOND_FACTOR_ACTION, Optional.of(donorId.value()),
                "Dvoufaktorové ověření dárce " + donorId + " vypnuto; všechna přihlášení dárce ukončena", now));
        events.publishEvent(new DonorSecondFactorReset(donorId.value(), donor.email(), donor.preferredLocale()));
        log.info("Administrator {} turned off the second factor of donor {}", adminId, donorId);
    }

    @Transactional
    public void removePasskeys(DonorId adminId, DonorId donorId) {
        Donor donor = donors.findById(donorId).orElseThrow(() -> new DonorNotFound(donorId));
        int removed = passkeys.deleteAllOf(donorId);
        if (removed == 0) {
            throw new NoPasskeys();
        }
        Instant now = clock.instant();
        refreshTokens.revokeAllOf(donorId, now);
        events.publishEvent(new AdminActionPerformed(adminId.value(), REMOVE_PASSKEYS_ACTION, Optional.of(donorId.value()),
                "Odebrané přístupové klíče dárce " + donorId + ": " + removed + "; všechna přihlášení dárce ukončena", now));
        events.publishEvent(new DonorPasskeysRemoved(donorId.value(), donor.email(), donor.preferredLocale()));
        log.info("Administrator {} removed {} passkeys of donor {}", adminId, removed, donorId);
    }

    @Transactional
    public StartupGrant grantAtStartup(EmailAddress email) {
        Optional<Donor> found = donors.findByEmail(email);
        if (found.isEmpty()) {
            return StartupGrant.NOT_REGISTERED;
        }
        Donor donor = found.get();
        if (donor.isAdministrator()) {
            return StartupGrant.ALREADY_ADMINISTRATOR;
        }
        if (!donors.findAdministrators().isEmpty()) {
            return StartupGrant.SITE_HAS_ADMINISTRATOR;
        }
        if (!donor.isEmailVerified()) {
            return StartupGrant.NOT_CONFIRMED;
        }
        donor.grantAdministration();
        donors.save(donor);
        log.info("Administrator role granted at startup to donor {}", donor.id());
        return StartupGrant.GRANTED;
    }

    private AdministratorView view(Donor donor) {
        boolean secondFactorEnabled = secondFactors.findByDonor(donor.id()).filter(SecondFactor::isEnabled).isPresent();
        return new AdministratorView(donor.id(), donor.name(), donor.email(), secondFactorEnabled);
    }
}
