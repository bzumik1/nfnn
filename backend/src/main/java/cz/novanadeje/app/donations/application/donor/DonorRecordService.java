package cz.novanadeje.app.donations.application.donor;

import cz.novanadeje.app.donations.application.pairing.PairingLock;
import cz.novanadeje.app.donations.application.pairing.PaymentPairingService;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class DonorRecordService {

    private static final Logger log = LoggerFactory.getLogger(DonorRecordService.class);

    private final DonorRecordRepository donorRecords;
    private final SymbolClaimRepository claims;
    private final DonationRepository donations;
    private final PaymentPairingService pairing;
    private final PairingLock lock;
    private final Clock clock;

    public DonorRecordService(DonorRecordRepository donorRecords, SymbolClaimRepository claims, DonationRepository donations,
                              PaymentPairingService pairing, PairingLock lock, Clock clock) {
        this.donorRecords = donorRecords;
        this.claims = claims;
        this.donations = donations;
        this.pairing = pairing;
        this.lock = lock;
        this.clock = clock;
    }

    @Transactional
    public void register(RegisterDonorRecordCommand command) {
        DonorReference id = new DonorReference(command.donorId());
        Optional<DonorRecord> existing = donorRecords.findById(id);
        if (existing.isPresent()) {
            DonorRecord record = existing.get();
            record.changeProfile(command.name(), command.address(), command.preferredLocale(), clock.instant());
            donorRecords.save(record);
            return;
        }
        donorRecords.save(newRecord(id, command));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void pairPaymentsOf(UUID donorId) {
        Optional<DonorRecord> record = donorRecords.findById(new DonorReference(donorId));
        if (record.isEmpty()) {
            log.warn("Payments of donor {} were not paired: donations has no record of the donor", donorId);
            return;
        }
        try {
            pairing.pairPaymentsOf(record.get(), clock.instant());
        } catch (DataIntegrityViolationException | PessimisticLockingFailureException e) {
            log.warn("pairing after registration of donor {} lost a race with the import; the hourly pass completes it", donorId);
        }
    }

    @Transactional
    public void changeProfile(ChangeDonorRecordProfileCommand command) {
        Optional<DonorRecord> record = donorRecords.findById(new DonorReference(command.donorId()));
        if (record.isEmpty()) {
            log.warn("Profile change of donor {} ignored: donations has no record of the donor", command.donorId());
            return;
        }
        record.get().changeProfile(command.name(), command.address(), command.preferredLocale(), clock.instant());
        donorRecords.save(record.get());
    }

    @Transactional
    public void erase(UUID donorId, Instant at) {
        lock.acquire();
        DonorReference donor = new DonorReference(donorId);
        Optional<DonorRecord> found = donorRecords.findById(donor);
        if (found.isEmpty()) {
            log.warn("Erasure of donor {} changed nothing in donations: there is no record of the donor", donorId);
            return;
        }
        DonorRecord record = found.get();
        List<SenderAccountLink> links = record.erase(at);
        List<Donation> pairedThroughSources = donations.findByDonorNewestFirst(donor).stream()
                .filter(donation -> donation.pairedThrough().isPresent() || donation.confirmedClaim().isPresent())
                .toList();
        pairedThroughSources.forEach(donation -> donations.save(donation.withoutPairingSources()));
        donorRecords.deleteSenderAccountLinksOf(donor);
        donorRecords.save(record);
        List<SymbolClaim> answers = claims.findByDonor(donor);
        answers.forEach(claim -> claims.delete(claim.id()));
        log.info("Donor record {} erased: {} sender account link(s) and {} older-symbol answer(s) deleted, {} donation(s) keep only their pairing method",
                donorId, links.size(), answers.size(), pairedThroughSources.size());
    }

    private static DonorRecord newRecord(DonorReference id, RegisterDonorRecordCommand command) {
        return switch (command.type()) {
            case PERSON -> DonorRecord.registerPerson(id, command.name(), command.address(), command.variableSymbol(),
                    command.preferredLocale(), command.registeredAt());
            case COMPANY -> DonorRecord.registerCompany(id, command.name(), command.companyIdentifier().orElse(null), command.address(),
                    command.variableSymbol(), command.preferredLocale(), command.registeredAt());
        };
    }
}
