package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.report.ReportDeliveries;
import cz.novanadeje.app.donations.domain.report.ReportDelivery;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import cz.novanadeje.app.shared.domain.UuidV7;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
class JpaReportDeliveries implements ReportDeliveries {

    private final ReportDeliveryJpaRepository jpa;

    JpaReportDeliveries(ReportDeliveryJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public void record(ReportDelivery delivery) {
        jpa.saveAndFlush(ReportDeliveryJpaEntity.of(UuidV7.generate(delivery.sentAt()), delivery));
    }

    @Override
    public List<ReportDelivery> ofMonthNewestFirst(ReportMonth month) {
        return jpa.findByReportMonthOrderBySentAtDescIdDesc(month.firstDay()).stream().map(ReportDeliveryJpaEntity::toDomain).toList();
    }
}
