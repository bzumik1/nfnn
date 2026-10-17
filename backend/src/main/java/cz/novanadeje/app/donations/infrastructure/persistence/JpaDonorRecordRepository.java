package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.LearnedSenderAccount;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.Set;

@Repository
class JpaDonorRecordRepository implements DonorRecordRepository {

    private static final String ACCOUNTS_ARRIVE_LATER = "learned accounts arrive with the pairing step";

    private final DonorRecordJpaRepository jpa;

    JpaDonorRecordRepository(DonorRecordJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public void save(DonorRecord record) {
        if (!record.learnedSenderAccounts().isEmpty()) {
            throw new IllegalStateException("Donor record " + record.id() + " holds sender accounts that are not stored; "
                    + "learned accounts are written only by addSenderAccount");
        }
        jpa.save(DonorRecordJpaEntity.fromDomain(record));
    }

    @Override
    public void addSenderAccount(DonorReference donor, LearnedSenderAccount account) {
        throw new UnsupportedOperationException(ACCOUNTS_ARRIVE_LATER);
    }

    @Override
    public Optional<DonorRecord> findById(DonorReference id) {
        return jpa.findById(id.value()).map(entity -> entity.toDomain(Set.of()));
    }

    @Override
    public Optional<DonorRecord> findByVariableSymbol(VariableSymbol symbol) {
        return jpa.findByVariableSymbol(symbol.value()).map(entity -> entity.toDomain(Set.of()));
    }

    @Override
    public List<DonorRecord> findBySenderAccount(SenderAccount account) {
        throw new UnsupportedOperationException(ACCOUNTS_ARRIVE_LATER);
    }
}
