package cz.novanadeje.app.donations.application.donor;

import cz.novanadeje.app.donations.application.pairing.PaymentPairingService;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Optional;
import java.util.UUID;

@Service
public class DonorRecordService {

    private static final Logger LOG = LoggerFactory.getLogger(DonorRecordService.class);

    private final DonorRecordRepository donorRecords;
    private final PaymentPairingService pairing;
    private final Clock clock;

    public DonorRecordService(DonorRecordRepository donorRecords, PaymentPairingService pairing, Clock clock) {
        this.donorRecords = donorRecords;
        this.pairing = pairing;
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
            LOG.warn("Payments of donor {} were not paired: donations has no record of the donor", donorId);
            return;
        }
        try {
            pairing.pairPaymentsOf(record.get(), clock.instant());
        } catch (DataIntegrityViolationException e) {
            LOG.warn("pairing after registration of donor {} lost a race with the import; the hourly pass completes it", donorId);
        }
    }

    @Transactional
    public void changeProfile(ChangeDonorRecordProfileCommand command) {
        Optional<DonorRecord> record = donorRecords.findById(new DonorReference(command.donorId()));
        if (record.isEmpty()) {
            LOG.warn("Profile change of donor {} ignored: donations has no record of the donor", command.donorId());
            return;
        }
        record.get().changeProfile(command.name(), command.address(), command.preferredLocale(), clock.instant());
        donorRecords.save(record.get());
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
