package cz.novanadeje.app.donations.domain.report;

import java.util.List;

public interface ReportDeliveries {

    void record(ReportDelivery delivery);

    List<ReportDelivery> ofMonthNewestFirst(ReportMonth month);
}
