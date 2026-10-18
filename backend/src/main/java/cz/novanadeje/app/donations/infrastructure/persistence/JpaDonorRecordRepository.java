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
import java.util.UUID;
import java.util.stream.Collectors;

@Repository
class JpaDonorRecordRepository implements DonorRecordRepository {

    private final DonorRecordJpaRepository jpa;
    private final DonorSenderAccountJpaRepository accounts;

    JpaDonorRecordRepository(DonorRecordJpaRepository jpa, DonorSenderAccountJpaRepository accounts) {
        this.jpa = jpa;
        this.accounts = accounts;
    }

    @Override
    public void save(DonorRecord record) {
        refuseUnstoredAccounts(record);
        jpa.save(DonorRecordJpaEntity.fromDomain(record));
    }

    @Override
    public void addSenderAccount(DonorReference donor, LearnedSenderAccount account) {
        accounts.insertIgnoringDuplicate(donor.value(), account.account().accountNumber(), account.account().bankCode(),
                account.learnedFrom().value(), account.learnedAt());
    }

    @Override
    public Optional<DonorRecord> findById(DonorReference id) {
        return jpa.findById(id.value()).map(this::withAccounts);
    }

    @Override
    public Optional<DonorRecord> findByVariableSymbol(VariableSymbol symbol) {
        return jpa.findByVariableSymbol(symbol.value()).map(this::withAccounts);
    }

    @Override
    public List<DonorRecord> findBySenderAccount(SenderAccount account) {
        List<UUID> owners = accounts.findByAccountNumberAndBankCode(account.accountNumber(), account.bankCode()).stream()
                .map(DonorSenderAccountJpaEntity::donorId)
                .distinct()
                .toList();
        return jpa.findAllById(owners).stream().map(this::withAccounts).toList();
    }

    private DonorRecord withAccounts(DonorRecordJpaEntity entity) {
        return entity.toDomain(accounts.findByDonorId(entity.donorId()).stream()
                .map(DonorSenderAccountJpaEntity::toDomain)
                .collect(Collectors.toUnmodifiableSet()));
    }

    private void refuseUnstoredAccounts(DonorRecord record) {
        Set<LearnedSenderAccount> learned = record.learnedSenderAccounts();
        if (learned.isEmpty()) {
            return;
        }
        Set<DonorSenderAccountKey> stored = accounts.findByDonorId(record.id().value()).stream()
                .map(DonorSenderAccountJpaEntity::key)
                .collect(Collectors.toUnmodifiableSet());
        boolean unstored = learned.stream()
                .map(account -> new DonorSenderAccountKey(record.id().value(), account.account().accountNumber(), account.account().bankCode()))
                .anyMatch(key -> !stored.contains(key));
        if (unstored) {
            throw new IllegalStateException("Donor record " + record.id() + " holds sender accounts that are not stored; "
                    + "learned accounts are written only by addSenderAccount");
        }
    }
}
