package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.shared.application.audit.AdminActionTrail;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

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
        if (donors.findById(subject).filter(Donor::isAdministrator).isEmpty()) {
            return AdminAccountsSyncSnapshot.withoutAdministration(subject);
        }
        Set<DonorId> enabled = secondFactors.findDonorsWithEnabledFactor();
        Map<DonorId, Integer> counts = passkeys.countByDonors();
        List<Donor> everyone = donors.findAll();
        Map<UUID, Donor> donorsById = everyone.stream().collect(Collectors.toMap(donor -> donor.id().value(), Function.identity()));
        List<DonorAccountView> accounts = everyone.stream()
                .map(donor -> new DonorAccountView(donor, enabled.contains(donor.id()), counts.getOrDefault(donor.id(), 0)))
                .toList();
        List<AdminActionView> actions = trail.findAllNewestFirst().stream()
                .map(entry -> AdminActionView.of(entry, AdminActionFacts.read(entry.action(), entry.details()), donorsById))
                .toList();
        return new AdminAccountsSyncSnapshot(subject, true, accounts, actions);
    }
}
