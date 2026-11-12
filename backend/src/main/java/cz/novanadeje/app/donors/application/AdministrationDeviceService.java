package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.SecondFactorCodesPaused;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorNotFound;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorCodeRejected;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;

@Service
public class AdministrationDeviceService {

    public static final String STORE_ADMINISTRATION_COPY_ACTION = "STORE_ADMINISTRATION_COPY";

    private final DonorRepository donors;
    private final SecondFactorRepository secondFactors;
    private final DonorConfirmations confirmations;
    private final SecondFactorCodes codes;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public AdministrationDeviceService(DonorRepository donors, SecondFactorRepository secondFactors, DonorConfirmations confirmations,
                                       SecondFactorCodes codes, ApplicationEventPublisher events, Clock clock) {
        this.donors = donors;
        this.secondFactors = secondFactors;
        this.confirmations = confirmations;
        this.codes = codes;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(noRollbackFor = {SecondFactorCodeRejected.class, SecondFactorCodesPaused.class})
    public void unlock(DonorId adminId, String password, String code) {
        Donor admin = donors.findById(adminId).orElseThrow(() -> new DonorNotFound(adminId));
        confirmations.confirm(admin, Confirmation.withPassword(password));
        SecondFactor factor = secondFactors.findByDonor(adminId).filter(SecondFactor::isEnabled).orElseThrow(SecondFactorCodeRejected::new);
        codes.check(factor, code, clock.instant());
    }

    @Transactional
    public void unlockWithPasskey(DonorId adminId, PasskeyProof passkey) {
        Donor admin = donors.findById(adminId).orElseThrow(() -> new DonorNotFound(adminId));
        confirmations.confirm(admin, Confirmation.withPasskey(passkey));
    }

    @Transactional
    public void storedCopy(DonorId adminId, RequestingDevice device) {
        Instant now = clock.instant();
        String described = device.description().platform().name() + " " + device.description().browser().name();
        String details = device.session()
                .map(session -> "Kopie správy uložena do zařízení " + described + " (zařízení " + session.value() + ")")
                .orElse("Kopie správy uložena do zařízení " + described);
        events.publishEvent(new AdminActionPerformed(adminId.value(), STORE_ADMINISTRATION_COPY_ACTION, Optional.empty(), details, now));
    }
}
