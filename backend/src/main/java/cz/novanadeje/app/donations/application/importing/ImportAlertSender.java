package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.ImportAlert;
import cz.novanadeje.app.donations.domain.report.ReportRecipients;

public interface ImportAlertSender {

    boolean send(ImportAlert alert, ReportRecipients recipients);
}
