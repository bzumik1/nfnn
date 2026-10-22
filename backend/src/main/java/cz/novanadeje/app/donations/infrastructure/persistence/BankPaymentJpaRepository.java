package cz.novanadeje.app.donations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public interface BankPaymentJpaRepository extends JpaRepository<BankPaymentJpaEntity, UUID> {

    String UNPAIRED = "select p from BankPaymentJpaEntity p"
            + " where not exists (select 1 from DonationJpaEntity d where d.bankPaymentId = p.id)";
    String BY_BOOKING = " order by p.bookedOn, p.transactionId";

    @Query("select p.transactionId from BankPaymentJpaEntity p where p.transactionId in :ids")
    Set<Long> findTransactionIdsIn(@Param("ids") Collection<Long> ids);

    @Query(UNPAIRED + BY_BOOKING)
    List<BankPaymentJpaEntity> findUnpairedOrderByBooking();

    @Query(UNPAIRED + " and p.matchingVariableSymbol = :symbol" + BY_BOOKING)
    List<BankPaymentJpaEntity> findUnpairedByMatchingVariableSymbol(@Param("symbol") String symbol);

    @Query(UNPAIRED + " and p.matchingVariableSymbol is null and p.senderAccountNumber = :number and p.senderBankCode = :code" + BY_BOOKING)
    List<BankPaymentJpaEntity> findUnpairedWithoutSymbolBySenderAccount(@Param("number") String number, @Param("code") String code);

    @Query(UNPAIRED + " and p.senderAccountNumber = :number and p.senderBankCode = :code and p.matchingVariableSymbol = :symbol" + BY_BOOKING)
    List<BankPaymentJpaEntity> findUnpairedBySenderAccountAndMatchingVariableSymbol(@Param("number") String number, @Param("code") String code,
                                                                                    @Param("symbol") String symbol);

    List<BankPaymentJpaEntity> findBySenderAccountNumberAndSenderBankCodeOrderByBookedOnAscTransactionIdAsc(String number, String code);

    @Query(UNPAIRED + " and p.bookedOn between :firstDay and :lastDay" + BY_BOOKING)
    List<BankPaymentJpaEntity> findUnpairedBookedBetween(@Param("firstDay") LocalDate firstDay, @Param("lastDay") LocalDate lastDay);
}
