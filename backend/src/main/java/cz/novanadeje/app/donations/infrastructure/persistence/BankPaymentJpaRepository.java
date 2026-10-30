package cz.novanadeje.app.donations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.UUID;

interface BankPaymentJpaRepository extends JpaRepository<BankPaymentJpaEntity, UUID> {

    String UNPAIRED = "select p from BankPaymentJpaEntity p"
            + " where not exists (select 1 from DonationJpaEntity d where d.bankPaymentId = p.id)";
    String AUTOMATIC = UNPAIRED + " and p.unpairedByAdminAt is null";
    String BY_BOOKING = " order by p.bookedOn, p.transactionId";
    String NEWEST_FIRST = " order by p.bookedOn desc, p.transactionId desc";

    @Query("select p.transactionId from BankPaymentJpaEntity p where p.transactionId in :ids")
    Set<Long> findTransactionIdsIn(@Param("ids") Collection<Long> ids);

    @Query(AUTOMATIC + BY_BOOKING)
    List<BankPaymentJpaEntity> findUnpairedOrderByBooking();

    @Query(UNPAIRED + NEWEST_FIRST)
    List<BankPaymentJpaEntity> findUnpairedNewestFirst();

    @Query(AUTOMATIC + " and p.matchingVariableSymbol = :symbol" + BY_BOOKING)
    List<BankPaymentJpaEntity> findUnpairedByMatchingVariableSymbol(@Param("symbol") String symbol);

    @Query(AUTOMATIC + " and p.matchingVariableSymbol is null and p.senderAccountNumber = :number and p.senderBankCode = :code" + BY_BOOKING)
    List<BankPaymentJpaEntity> findUnpairedWithoutSymbolBySenderAccount(@Param("number") String number, @Param("code") String code);

    @Query(AUTOMATIC + " and p.senderAccountNumber = :number and p.senderBankCode = :code and p.matchingVariableSymbol = :symbol" + BY_BOOKING)
    List<BankPaymentJpaEntity> findUnpairedBySenderAccountAndMatchingVariableSymbol(@Param("number") String number, @Param("code") String code,
                                                                                    @Param("symbol") String symbol);

    List<BankPaymentJpaEntity> findBySenderAccountNumberAndSenderBankCodeOrderByBookedOnAscTransactionIdAsc(String number, String code);

    @Query(UNPAIRED + " and p.bookedOn between :firstDay and :lastDay" + BY_BOOKING)
    List<BankPaymentJpaEntity> findUnpairedBookedBetween(@Param("firstDay") LocalDate firstDay, @Param("lastDay") LocalDate lastDay);

    @Query("select distinct year(p.bookedOn) from BankPaymentJpaEntity p order by year(p.bookedOn) desc")
    List<Integer> findBookedYearsNewestFirst();

    List<BankPaymentJpaEntity> findByImportedAtGreaterThanEqual(Instant from);

    @Query(UNPAIRED + " and p.importedAt >= :from")
    List<BankPaymentJpaEntity> findUnpairedImportedSince(@Param("from") Instant from);
}
