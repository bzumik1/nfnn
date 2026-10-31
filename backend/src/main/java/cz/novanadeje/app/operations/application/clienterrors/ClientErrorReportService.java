package cz.novanadeje.app.operations.application.clienterrors;

import cz.novanadeje.app.operations.domain.clienterrors.ClientErrorReport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class ClientErrorReportService {

    public static final String LOGGER = "cz.novanadeje.app.operations.clienterrors";
    private static final Logger log = LoggerFactory.getLogger(LOGGER);

    private final ClientErrorCap cap;

    public ClientErrorReportService(ClientErrorCap cap) {
        this.cap = cap;
    }

    public void record(ClientErrorReport report) {
        if (!cap.admits(report.kind())) {
            return;
        }
        log.warn("Browser error kind={} place={} name={} version={} browser={} os={} display={} count={}", report.kind().wire(),
                report.place().wire(), report.name().wire(), report.appVersion().value(),
                report.browser().wire() + report.browserMajor().map(major -> "/" + major).orElse(""), report.os().wire(),
                report.display().wire(), report.count());
    }
}
