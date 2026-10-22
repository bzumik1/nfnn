package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.donor.SymbolClaimAnswer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface SymbolClaimJpaRepository extends JpaRepository<SymbolClaimJpaEntity, UUID> {

    List<SymbolClaimJpaEntity> findByDonorIdOrderByAnsweredAtAscIdAsc(UUID donorId);

    List<SymbolClaimJpaEntity> findByAccountNumberAndBankCodeOrderByAnsweredAtAscIdAsc(String accountNumber, String bankCode);

    List<SymbolClaimJpaEntity> findByAnswerOrderByAnsweredAtAscIdAsc(SymbolClaimAnswer answer);

    @Transactional
    @Modifying(flushAutomatically = true)
    @Query(nativeQuery = true, value = "insert into donor_symbol_claim (id, donor_id, account_number, bank_code, variable_symbol, answer,"
            + " answered_at) values (:id, :donorId, :number, :code, :symbol, :answer, :answeredAt)"
            + " on conflict (donor_id, account_number, bank_code, variable_symbol) do nothing")
    int insertIgnoringAnswered(@Param("id") UUID id, @Param("donorId") UUID donorId, @Param("number") String number, @Param("code") String code,
                               @Param("symbol") String symbol, @Param("answer") String answer, @Param("answeredAt") Instant answeredAt);
}
