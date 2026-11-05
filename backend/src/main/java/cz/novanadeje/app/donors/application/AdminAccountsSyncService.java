package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.shared.application.audit.AdminActionTrail;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdminAccountsSyncService {

    private final DonorRepository donors;
    private final SecondFactorRepository secondFactors;
    private final PasskeyRepository passkeys;
    private final AdminActionTrail trail;

    public AdminAccountsSyncService(DonorRepository donors, SecondFactorRepository secondFactors, PasskeyRepository passkeys, AdminActionTrail trail) {
        this.donors = donors;
        this.secondFactors = secondFactors;
        this.passkeys = passkeys;
        this.trail = trail;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public AdminAccountsSyncSnapshot snapshotFor(DonorId subject) {
        return AdminAccountsSyncSnapshot.withoutAdministration(subject);
    }
}
