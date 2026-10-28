@operations
Feature: An administrator sees the database backups, starts one, downloads one and is told when they fail

  Background:
    Given today is 2026-10-23
    And a person "Jana" is registered
    And "Jana" is an administrator
    And the backup folder exists

  Scenario: The backups answer lists the dumps newest first with the last backup, the last test restore and the restore folder
    Given these backups are in the backup folder:
      | file                                | size | createdAt            |
      | nfnn-2026-10-22_0300.dump.age       | 1000 | 2026-10-22T01:00:00Z |
      | nfnn-2026-10-23_0300.dump.age       | 1590 | 2026-10-23T01:00:03Z |
      | nfnn-2026-10-23_0633-rucni.dump.age | 1590 | 2026-10-23T04:33:00Z |
    And the backup status says:
      | outcome     | ok                            |
      | started_at  | 2026-10-23T01:00:00Z          |
      | finished_at | 2026-10-23T01:00:03Z          |
      | file        | nfnn-2026-10-23_0300.dump.age |
      | size        | 1590                          |
    And the test restore status says:
      | outcome     | ok                            |
      | started_at  | 2026-10-18T02:00:00Z          |
      | finished_at | 2026-10-18T02:00:05Z          |
      | file        | nfnn-2026-10-18_0300.dump.age |
      | tables      | 37                            |
    And the restore folder holds "zaloha.dump.done"
    When "Jana" asks for the backups
    Then the response status is 200
    And the backups answer says:
      | available               | true                                |
      | backups.0.fileName      | nfnn-2026-10-23_0633-rucni.dump.age |
      | backups.0.kind          | REQUESTED                           |
      | backups.0.sizeBytes     | 1590                                |
      | backups.1.fileName      | nfnn-2026-10-23_0300.dump.age       |
      | backups.2.fileName      | nfnn-2026-10-22_0300.dump.age       |
      | backups.2.kind          | DAILY                               |
      | lastBackup.outcome      | OK                                  |
      | lastBackup.fileName     | nfnn-2026-10-23_0300.dump.age       |
      | lastTestRestore.tables  | 37                                  |
      | restoreFiles.0.fileName | zaloha.dump.done                    |
      | restoreFiles.0.state    | DONE                                |
      | pendingRequests         | 0                                   |
    And the backups answer lists no problem

  Scenario: An old backup and a failed test restore are named as problems
    Given these backups are in the backup folder:
      | file                          | size | createdAt            |
      | nfnn-2026-10-21_0300.dump.age | 1000 | 2026-10-21T01:00:00Z |
    And the backup status says:
      | outcome     | ok                            |
      | started_at  | 2026-10-21T01:00:00Z          |
      | finished_at | 2026-10-21T01:00:03Z          |
      | file        | nfnn-2026-10-21_0300.dump.age |
      | size        | 1000                          |
    And the test restore status says:
      | outcome     | failed                                    |
      | started_at  | 2026-10-18T02:00:00Z                      |
      | finished_at | 2026-10-18T02:00:05Z                      |
      | file        | nfnn-2026-10-18_0300.dump.age             |
      | error       | pg_restore: error: unexpected end of file |
    When "Jana" asks for the backups
    Then the response status is 200
    And the backups answer lists the problems "BACKUP_STALE, TEST_RESTORE_FAILED"

  Scenario: Asking for a backup now leaves a request for the backup container and is audited
    When "Jana" asks for a backup now
    Then the response status is 202
    And the backups answer says:
      | kind | BACKUP |
    And a request file for the backup waits for the backup container
    And the admin action "REQUEST_BACKUP" by "Jana" is recorded with details containing "Záloha databáze vyžádána"
    When "Jana" asks for the backups
    Then the backups answer says:
      | pendingRequests | 1 |

  Scenario: Asking for a test restore leaves its own request and is audited
    When "Jana" asks for a test restore now
    Then the response status is 202
    And the backups answer says:
      | kind | TEST_RESTORE |
    And a request file for the test restore waits for the backup container
    And the admin action "REQUEST_TEST_RESTORE" by "Jana" is recorded with details containing "Zkušební obnova nejnovější zálohy vyžádána"

  Scenario: A backup is downloaded as a file and the download is audited; an unknown or odd name is not found
    Given these backups are in the backup folder:
      | file                          | size | createdAt            |
      | nfnn-2026-10-23_0300.dump.age | 1590 | 2026-10-23T01:00:03Z |
    When "Jana" downloads the backup "nfnn-2026-10-23_0300.dump.age"
    Then the response status is 200
    And the downloaded backup is 1590 bytes named "nfnn-2026-10-23_0300.dump.age"
    And the admin action "DOWNLOAD_BACKUP" by "Jana" is recorded with details containing "nfnn-2026-10-23_0300.dump.age (1590 B) stažena"
    When "Jana" downloads the backup "nfnn-2026-10-22_0300.dump.age"
    Then the response status is 404
    And the problem type ends with "operations/backup-not-found"
    When "Jana" downloads the backup "nfnn.dump.part"
    Then the response status is 404
    And the problem type ends with "operations/backup-not-found"

  Scenario: Without the backup folder the administration says so and a backup cannot be requested
    Given the backup folder does not exist
    When "Jana" asks for the backups
    Then the response status is 200
    And the backups answer says:
      | available | false |
    And the backups answer lists the problems "BACKUPS_UNAVAILABLE"
    When "Jana" asks for a backup now
    Then the response status is 409
    And the problem type ends with "operations/backups-unavailable"

  Scenario: A donor without the administrator role and a visitor without a token are refused
    Given a person "Petr" is registered
    When "Petr" asks for the backups
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When "Petr" asks for a backup now
    Then the response status is 403
    When someone without a token asks for the backups
    Then the response status is 401

  Scenario: A failed backup is reported by e-mail once and the recovery once more
    Given the backup status says:
      | outcome     | failed                                      |
      | started_at  | 2026-10-23T01:00:00Z                        |
      | finished_at | 2026-10-23T01:00:01Z                        |
      | file        | nfnn-2026-10-23_0300.dump.age               |
      | error       | pg_dump: error: connection to server failed |
    When the backup check runs
    Then 1 e-mail is sent to "info@nfnn.cz" with the subject "Zálohování databáze má problém – Nová naděje"
    And both parts of the alert e-mail say:
      | denní kontrola 23. 10. 2026 12:00 zjistila, že zálohování databáze webu Nová naděje nefunguje, jak má |
      | Poslední záloha 23. 10. 2026 3:00 selhala: pg_dump: error: connection to server failed                |
    When the backup check runs
    Then 1 e-mail is sent to "info@nfnn.cz" with the subject "Zálohování databáze má problém – Nová naděje"
    Given the backup status says:
      | outcome     | ok                            |
      | started_at  | 2026-10-23T05:00:00Z          |
      | finished_at | 2026-10-23T05:00:02Z          |
      | file        | nfnn-2026-10-23_0700.dump.age |
      | size        | 1590                          |
    When the backup check runs
    Then 2 e-mails are sent to "info@nfnn.cz"
    And alert e-mail 2 has the subject "Zálohování databáze zase funguje – Nová naděje"
    And both parts of the alert e-mail say:
      | Skončilo: selhání zálohy.                                                  |
      | Poslední záloha: nfnn-2026-10-23_0700.dump.age z 23. 10. 2026 7:00 (2 kB). |
      | Poslední zkušební obnova: zatím žádná.                                     |
    When the backup check runs
    Then 2 e-mails are sent to "info@nfnn.cz"

  Scenario: Backup alerts go to the monthly report recipients
    Given "Jana" changes the monthly report settings:
      | recipients | pavel@example.cz |
      | sendDay    | 1                |
      | sections   | donors           |
    And the backup folder does not exist
    When the backup check runs
    Then 1 e-mail is sent to "pavel@example.cz" with the subject "Zálohování databáze má problém – Nová naděje"
    And both parts of the alert e-mail say:
      | Backend nevidí složku se zálohami. |
