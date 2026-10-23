package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.ImportAlert;

public interface ImportAlertSender {

    boolean send(ImportAlert alert);
}
