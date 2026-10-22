package cz.novanadeje.app.donations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DonationJpaRepository extends JpaRepository<DonationJpaEntity, UUID> {

    boolean existsByBankPaymentId(UUID bankPaymentId);

    Optional<DonationJpaEntity> findByBankPaymentId(UUID bankPaymentId);

    List<DonationJpaEntity> findByDonorIdOrderByReceivedOnDescRecordedAtDescIdDesc(UUID donorId);

    Optional<DonationJpaEntity> findByIdAndDonorId(UUID id, UUID donorId);

    List<DonationJpaEntity> findByReceivedOnBetween(LocalDate firstDay, LocalDate lastDay);

    @Query("select distinct year(d.receivedOn) from DonationJpaEntity d order by year(d.receivedOn) desc")
    List<Integer> findReceivedYearsNewestFirst();

    List<DonationJpaEntity> findBySymbolClaimIdOrderByReceivedOnAscIdAsc(UUID symbolClaimId);

    @Query("select d.symbolClaimId, count(d) from DonationJpaEntity d where d.symbolClaimId in :claimIds group by d.symbolClaimId")
    List<Object[]> countBySymbolClaimIds(@Param("claimIds") Collection<UUID> claimIds);
}
