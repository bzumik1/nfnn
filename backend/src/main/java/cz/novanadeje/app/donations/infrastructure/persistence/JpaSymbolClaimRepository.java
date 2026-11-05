package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimAnswer;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import cz.novanadeje.app.shared.application.event.LiveFeed;
import cz.novanadeje.app.shared.application.event.StoredDataChanged;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
class JpaSymbolClaimRepository implements SymbolClaimRepository {

    private final SymbolClaimJpaRepository jpa;
    private final ApplicationEventPublisher events;

    JpaSymbolClaimRepository(SymbolClaimJpaRepository jpa, ApplicationEventPublisher events) {
        this.jpa = jpa;
        this.events = events;
    }

    @Override
    public boolean saveIfAbsent(SymbolClaim claim) {
        boolean saved = jpa.insertIgnoringAnswered(claim.id().value(), claim.donor().value(), claim.account().accountNumber(), claim.account().bankCode(),
                claim.symbol().value(), claim.answer().name(), claim.answeredAt()) == 1;
        if (saved) {
            changed(claim.donor());
        }
        return saved;
    }

    @Override
    public List<SymbolClaim> findByDonor(DonorReference donor) {
        return toDomain(jpa.findByDonorIdOrderByAnsweredAtAscIdAsc(donor.value()));
    }

    @Override
    public List<SymbolClaim> findByAccount(SenderAccount account) {
        return toDomain(jpa.findByAccountNumberAndBankCodeOrderByAnsweredAtAscIdAsc(account.accountNumber(), account.bankCode()));
    }

    @Override
    public List<SymbolClaim> findConfirmed() {
        return toDomain(jpa.findByAnswerOrderByAnsweredAtAscIdAsc(SymbolClaimAnswer.CONFIRMED));
    }

    @Override
    public Optional<SymbolClaim> findById(SymbolClaimId id) {
        return jpa.findById(id.value()).map(SymbolClaimJpaEntity::toDomain);
    }

    @Override
    public List<SymbolClaim> findAllNewestFirst() {
        return toDomain(jpa.findAllByOrderByAnsweredAtDescIdDesc());
    }

    @Override
    public void save(SymbolClaim claim) {
        jpa.saveAndFlush(SymbolClaimJpaEntity.fromDomain(claim));
        changed(claim.donor());
    }

    @Override
    public void delete(SymbolClaimId id) {
        Optional<DonorReference> donor = jpa.findById(id.value()).map(entity -> entity.toDomain().donor());
        jpa.deleteById(id.value());
        jpa.flush();
        donor.ifPresent(this::changed);
    }

    private void changed(DonorReference donor) {
        events.publishEvent(StoredDataChanged.ofDonor(LiveFeed.BANK_ACCOUNTS, donor.value()));
    }

    private static List<SymbolClaim> toDomain(List<SymbolClaimJpaEntity> entities) {
        return entities.stream().map(SymbolClaimJpaEntity::toDomain).toList();
    }
}
