package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.domain.backup.BackupAlert;
import cz.novanadeje.app.shared.domain.EmailAddress;

import java.util.List;

public interface BackupAlertSender {

    boolean send(BackupAlert alert, LastBackupRuns lastRuns, List<EmailAddress> recipients);
}
