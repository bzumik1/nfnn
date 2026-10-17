package cz.novanadeje.app.donations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public interface BankPaymentJpaRepository extends JpaRepository<BankPaymentJpaEntity, UUID> {

    @Query("select p.transactionId from BankPaymentJpaEntity p where p.transactionId in :ids")
    Set<Long> findTransactionIdsIn(@Param("ids") Collection<Long> ids);

    @Query("select p from BankPaymentJpaEntity p order by p.bookedOn, p.transactionId")
    List<BankPaymentJpaEntity> findUnpairedOrderByBooking();

    @Query("select p from BankPaymentJpaEntity p where p.matchingVariableSymbol = :symbol order by p.bookedOn, p.transactionId")
    List<BankPaymentJpaEntity> findUnpairedByMatchingVariableSymbol(@Param("symbol") String symbol);

    @Query("select p from BankPaymentJpaEntity p where p.matchingVariableSymbol is null"
            + " and p.senderAccountNumber = :number and p.senderBankCode = :code order by p.bookedOn, p.transactionId")
    List<BankPaymentJpaEntity> findUnpairedWithoutSymbolBySenderAccount(@Param("number") String number, @Param("code") String code);
}
