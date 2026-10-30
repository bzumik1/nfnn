package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.shared.infrastructure.search.AccentFolding;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Collection;
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
        refuseUnstoredLinks(record);
        jpa.save(DonorRecordJpaEntity.fromDomain(record));
    }

    @Override
    public boolean saveSenderAccountLink(DonorReference donor, SenderAccountLink link) {
        Optional<DonorSenderAccountJpaEntity> stored = accounts.findById(link.id().value());
        if (stored.isPresent()) {
            if (!stored.get().donorId().equals(donor.value())) {
                throw new IllegalArgumentException("Sender account link " + link.id() + " belongs to another donor");
            }
            stored.get().updateFrom(link);
            accounts.saveAndFlush(stored.get());
            return true;
        }
        return accounts.insertIgnoringLiveDuplicate(link.id().value(), donor.value(), link.account().accountNumber(),
                link.account().bankCode(), link.status().name(), link.provedBy().map(BankPaymentId::value).orElse(null),
                link.provedAt().orElse(null), link.validFrom().orElse(null), link.validTo().orElse(null), link.createdAt(),
                link.disconnectedAt().orElse(null)) == 1;
    }

    @Override
    public void deleteSenderAccountLink(DonorReference donor, SenderAccountLinkId link) {
        DonorSenderAccountJpaEntity stored = accounts.findById(link.value())
                .filter(entity -> entity.donorId().equals(donor.value()))
                .orElseThrow(() -> new IllegalArgumentException("Sender account link " + link + " is not stored for donor " + donor));
        accounts.delete(stored);
        accounts.flush();
    }

    @Override
    public void deleteSenderAccountLinksOf(DonorReference donor) {
        accounts.deleteAll(accounts.findByDonorIdOrderByCreatedAtAscIdAsc(donor.value()));
        accounts.flush();
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

    @Override
    public List<DonorRecord> findByIds(Collection<DonorReference> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return jpa.findAllById(ids.stream().map(DonorReference::value).collect(Collectors.toSet())).stream().map(this::withAccounts).toList();
    }

    @Override
    public List<DonorRecord> searchByNameOrSymbol(String query, int limit) {
        String escaped = AccentFolding.fold(query).replace("!", "!!").replace("%", "!%").replace("_", "!_");
        return jpa.searchByNameOrSymbol(escaped, PageRequest.of(0, limit)).stream().map(this::withAccounts).toList();
    }

    @Override
    public long countRegisteredBefore(Instant end) {
        return jpa.countByRegisteredAtBefore(end);
    }

    @Override
    public long countRegisteredSince(Instant from) {
        return jpa.countByRegisteredAtGreaterThanEqual(from);
    }

    private DonorRecord withAccounts(DonorRecordJpaEntity entity) {
        return entity.toDomain(accounts.findByDonorIdOrderByCreatedAtAscIdAsc(entity.donorId()).stream()
                .map(DonorSenderAccountJpaEntity::toDomain)
                .toList());
    }

    private void refuseUnstoredLinks(DonorRecord record) {
        List<SenderAccountLink> links = record.senderAccountLinks();
        if (links.isEmpty()) {
            return;
        }
        Set<UUID> stored = accounts.findByDonorIdOrderByCreatedAtAscIdAsc(record.id().value()).stream()
                .map(DonorSenderAccountJpaEntity::id)
                .collect(Collectors.toUnmodifiableSet());
        if (links.stream().anyMatch(link -> !stored.contains(link.id().value()))) {
            throw new IllegalStateException("Donor record " + record.id() + " holds sender account links that are not stored; "
                    + "links are written only by saveSenderAccountLink");
        }
    }
}
