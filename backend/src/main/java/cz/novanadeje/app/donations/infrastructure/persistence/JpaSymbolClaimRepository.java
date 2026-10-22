package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimAnswer;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
class JpaSymbolClaimRepository implements SymbolClaimRepository {

    private final SymbolClaimJpaRepository jpa;

    JpaSymbolClaimRepository(SymbolClaimJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public boolean saveIfAbsent(SymbolClaim claim) {
        return jpa.insertIgnoringAnswered(claim.id().value(), claim.donor().value(), claim.account().accountNumber(), claim.account().bankCode(),
                claim.symbol().value(), claim.answer().name(), claim.answeredAt()) == 1;
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

    private static List<SymbolClaim> toDomain(List<SymbolClaimJpaEntity> entities) {
        return entities.stream().map(SymbolClaimJpaEntity::toDomain).toList();
    }
}
