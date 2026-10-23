package cz.novanadeje.app.donations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;

interface MonthlyReportJpaRepository extends JpaRepository<MonthlyReportJpaEntity, LocalDate> {

    @Transactional
    @Modifying(flushAutomatically = true)
    @Query(nativeQuery = true, value = "insert into donation_monthly_report (report_month, sent_at) values (:month, :sentAt)"
            + " on conflict (report_month) do nothing")
    int insertIgnoringRecordedMonth(@Param("month") LocalDate month, @Param("sentAt") Instant sentAt);
}
