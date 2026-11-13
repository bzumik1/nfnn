package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.SecondFactorCodesPaused;
import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
import cz.novanadeje.app.donors.application.event.DonorSecondFactorDisabled;
import cz.novanadeje.app.donors.application.event.DonorSecondFactorEnabled;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorNotFound;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorAlreadyEnabled;
import cz.novanadeje.app.donors.domain.SecondFactorCodeRejected;
import cz.novanadeje.app.donors.domain.SecondFactorNotEnabled;
import cz.novanadeje.app.donors.domain.SecondFactorNotPending;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.donors.domain.TotpSecret;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

@Service
public class DonorSecondFactorService {

    private static final Logger log = LoggerFactory.getLogger(DonorSecondFactorService.class);

    private final DonorRepository donors;
    private final SecondFactorRepository secondFactors;
    private final DonorConfirmations confirmations;
    private final DonorSessionService sessions;
    private final DonorViews views;
    private final SecondFactorSessionGuard sessionGuard;
    private final DonorSecondFactorProperties properties;
    private final ApplicationEventPublisher events;
    private final Clock clock;
    private final DeviceSignOuts signOuts;
    private final SecondFactorCodes codes;
    private final TransactionTemplate reads;
    private final TransactionTemplate writes;
    private final CommittedRefusals codeChecks;

    public DonorSecondFactorService(DonorRepository donors, SecondFactorRepository secondFactors, DonorConfirmations confirmations, DonorSessionService sessions, DonorViews views,
                                    SecondFactorSessionGuard sessionGuard, DonorSecondFactorProperties properties, ApplicationEventPublisher events,
                                    Clock clock, DeviceSignOuts signOuts, SecondFactorCodes codes, PlatformTransactionManager transactions) {
        this.signOuts = signOuts;
        this.codes = codes;
        this.donors = donors;
        this.secondFactors = secondFactors;
        this.confirmations = confirmations;
        this.sessions = sessions;
        this.views = views;
        this.sessionGuard = sessionGuard;
        this.properties = properties;
        this.events = events;
        this.clock = clock;
        this.reads = new TransactionTemplate(transactions);
        this.reads.setReadOnly(true);
        this.writes = new TransactionTemplate(transactions);
        this.codeChecks = new CommittedRefusals(transactions, List.of(SecondFactorCodeRejected.class, SecondFactorCodesPaused.class));
    }

    public SecondFactorEnrolment begin(DonorId donorId, boolean secondFactorVerified, Confirmation confirmation) {
        ConfirmedCredentials confirmed = confirmations.confirm(read(donorId), confirmation);
        return writes.execute(status -> {
            Donor donor = load(donorId);
            confirmed.requireUnchangedIn(donor);
            sessionGuard.requireForFactorChange(donor, secondFactorVerified);
            if (secondFactors.findByDonor(donorId).filter(SecondFactor::isEnabled).isPresent()) {
                throw new SecondFactorAlreadyEnabled();
            }
            TotpSecret secret = TotpSecret.generate();
            secondFactors.save(SecondFactor.enrol(donorId, secret, clock.instant()));
            String otpauthUri = secret.otpauthUri(properties.issuer(), donor.email().value());
            log.info("Second factor set-up started for donor {}", donorId);
            return new SecondFactorEnrolment(secret.value(), otpauthUri);
        });
    }

    @Transactional(noRollbackFor = {SecondFactorCodeRejected.class, SecondFactorCodesPaused.class})
    public AuthenticatedDonor confirm(DonorId donorId, String code, RequestingDevice device) {
        Donor donor = load(donorId);
        SecondFactor factor = secondFactors.findByDonor(donorId).orElseThrow(SecondFactorNotPending::new);
        if (factor.isEnabled()) {
            throw new SecondFactorAlreadyEnabled();
        }
        Instant now = clock.instant();
        codes.confirm(factor, code, now);
        sessions.requireLasting(donor, device);
        secondFactors.save(factor);
        signOuts.endAllOf(donorId, device.session(), DeviceSignOutReason.CREDENTIALS_CHANGED, now);
        events.publishEvent(new DonorSecondFactorEnabled(donorId.value(), donor.email(), donor.preferredLocale()));
        log.info("Second factor enabled for donor {}, every session revoked", donorId);
        return views.authenticated(donor, sessions.continueOn(donor, true, device));
    }

    public AuthenticatedDonor disable(DonorId donorId, Confirmation confirmation, String code, RequestingDevice device) {
        ConfirmedCredentials confirmed = confirmations.confirm(read(donorId), confirmation);
        return codeChecks.execute(() -> {
            Donor donor = load(donorId);
            confirmed.requireUnchangedIn(donor);
            SecondFactor factor = secondFactors.findByDonor(donorId).filter(SecondFactor::isEnabled).orElseThrow(SecondFactorNotEnabled::new);
            Instant now = clock.instant();
            codes.check(factor, code, now);
            sessions.requireLasting(donor, device);
            secondFactors.delete(donorId);
            signOuts.endAllOf(donorId, device.session(), DeviceSignOutReason.CREDENTIALS_CHANGED, now);
            events.publishEvent(new DonorSecondFactorDisabled(donorId.value(), donor.email(), donor.preferredLocale()));
            log.info("Second factor disabled for donor {}, every session revoked", donorId);
            return views.authenticated(donor, sessions.continueOn(donor, false, device));
        });
    }

    private Donor read(DonorId donorId) {
        return reads.execute(status -> load(donorId));
    }

    private Donor load(DonorId donorId) {
        return donors.findById(donorId).orElseThrow(() -> new DonorNotFound(donorId));
    }
}
