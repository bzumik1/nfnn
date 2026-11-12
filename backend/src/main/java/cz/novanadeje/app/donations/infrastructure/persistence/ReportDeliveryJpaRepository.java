package cz.novanadeje.app.donations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

interface ReportDeliveryJpaRepository extends JpaRepository<ReportDeliveryJpaEntity, UUID> {

    List<ReportDeliveryJpaEntity> findByReportMonthOrderBySentAtDescIdDesc(LocalDate reportMonth);
}
