package cz.novanadeje.app.donations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

interface YearlyReceiptAnnouncementJpaRepository extends JpaRepository<YearlyReceiptAnnouncementJpaEntity, Integer> {

    @Transactional(propagation = Propagation.MANDATORY)
    @Modifying(flushAutomatically = true)
    @Query(nativeQuery = true, value = "insert into donation_yearly_receipt_announcement (receipt_year, announced_at) values (:year, :at)"
            + " on conflict (receipt_year) do nothing")
    int insertIgnoringAnnouncedYear(@Param("year") int year, @Param("at") Instant at);
}
