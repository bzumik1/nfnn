@operations
Feature: The database is restored from a backup in the browser: by an administrator from a backup on the server, or on a new server from a backup uploaded in the first setup

  Background:
    Given today is 2026-10-23
    And the backup folder exists

  Scenario: Restoring a backup leaves a restore request for the backup container, is audited and restarts the backend
    Given a person "Jana" is registered
    And "Jana" is an administrator
    And these backups are in the backup folder:
      | file                          | size | createdAt            |
      | nfnn-2026-10-22_0300.dump.age | 1000 | 2026-10-22T01:00:00Z |
    When "Jana" restores the backup "nfnn-2026-10-22_0300.dump.age"
    Then the response status is 202
    And the backups answer says:
      | fileName | nfnn-2026-10-22_0300.dump.age |
    And a restore request of the backup "nfnn-2026-10-22_0300.dump.age" by "Jana" waits for the backup container
    And the admin action "RESTORE_BACKUP" by "Jana" is recorded with details containing "Vyžádána obnova ze zálohy nfnn-2026-10-22_0300.dump.age"
    And the backend restarts once
    When "Jana" asks for the backups
    Then the backups answer says:
      | pendingRequests | 1    |
      | restorePending  | true |
    When "Jana" restores the backup "nfnn-2026-10-22_0300.dump.age"
    Then the response status is 409
    And the problem type ends with "operations/restore-pending"
    And the backend restarts once

  Scenario: An unknown or odd backup name is not found and nothing restarts
    Given a person "Jana" is registered
    And "Jana" is an administrator
    When "Jana" restores the backup "nfnn-2026-10-21_0300.dump.age"
    Then the response status is 404
    And the problem type ends with "operations/backup-not-found"
    When "Jana" restores the backup "nfnn.dump.part"
    Then the response status is 404
    And no restore request waits for the backup container
    And the backend does not restart

  Scenario: Only an administrator in the browser restores; a connected application, a donor and a visitor are refused
    Given a person "Jana" is registered
    And "Jana" is an administrator
    And a person "Petr" is registered
    And these backups are in the backup folder:
      | file                          | size | createdAt            |
      | nfnn-2026-10-22_0300.dump.age | 1000 | 2026-10-22T01:00:00Z |
    And "Jana" connected the application "https://claude.ai/.well-known/oauth-client" with scope "admin:read admin:write"
    When the connector exchanges the connector token for an API token
    And the exchanged API token tries to restore the backup "nfnn-2026-10-22_0300.dump.age"
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When "Petr" restores the backup "nfnn-2026-10-22_0300.dump.age"
    Then the response status is 403
    When someone without a token restores the backup "nfnn-2026-10-22_0300.dump.age"
    Then the response status is 401
    And no restore request waits for the backup container
    And the backend does not restart

  Scenario: A finished restore is recorded in the administration history once, under the administrator who asked for it
    Given a person "Jana" is registered
    And "Jana" is an administrator
    And the backup container restored "nfnn-2026-10-22_0300.dump.age" for "Jana" under the request "019a1b2c-0000-7000-8000-000000000001"
    When the backend has started
    And the backend has started
    Then the admin action "BACKUP_RESTORED" by "Jana" is recorded with details containing "Databáze obnovena ze zálohy nfnn-2026-10-22_0300.dump.age (požadavek 019a1b2c-0000-7000-8000-000000000001)"

  Scenario: A failed restore is recorded in the administration history with its error
    Given a person "Jana" is registered
    And "Jana" is an administrator
    And the backup container failed to restore "nfnn-2026-10-22_0300.dump.age" for "Jana" under the request "019a1b2c-0000-7000-8000-000000000002" with "pg_restore: error: unexpected end of file"
    When the backend has started
    Then the admin action "BACKUP_RESTORE_FAILED" by "Jana" is recorded with details containing "pg_restore: error: unexpected end of file; data zůstala, jak byla"

  Scenario: Directly from the home network a new server takes an uploaded backup in the first setup and restarts
    Given the requests come directly from the home network
    When a backup of 4096 bytes is uploaded in the first setup
    Then the response status is 202
    And the uploaded backup waits in the restore folder with a restore request
    And the backend restarts once

  Scenario: The key of an encrypted backup may be typed as its 24 words, and waits beside it in its usual form
    Given the requests come directly from the home network
    When an encrypted backup is uploaded in the first setup with the key "divoch komora probudit najednou dekl komando nikl odebrat biograf bytovka dodnes mikrofon MOTI naiv zdaleka ekonomie jeseter azyl atlas obyvatel glazura vytesat moudrost studna"
    Then the response status is 202
    And the uploaded backup waits in the restore folder beside the key "AGE-SECRET-KEY-1R45A984EXXAFC85YZSYGY9R6XJTD4E9AKY65ZCRGPDQ89E7ANW8QKT6GWH"
    When an encrypted backup is uploaded in the first setup with the key "divoch komora probudit najednou dekl komando nikl odebrat biograf bytovka dodnes mikrofon motivace naivita zdaleka ekonomie jeseter azyl atlas obyvatel glazura vytesat studna moudrost"
    Then the response status is 400
    And the problem type ends with "operations/invalid-backup-key"

  Scenario: A file that is not a database backup is refused and nothing is stored
    Given the requests come directly from the home network
    When the file "fotka.jpg" is uploaded in the first setup
    Then the response status is 400
    And the problem type ends with "operations/not-a-backup"
    And no restore request waits for the backup container
    And the restore folder holds no upload
    And the backend does not restart

  Scenario: An encrypted backup is taken only with its key, which waits beside it for the backup container
    Given the requests come directly from the home network
    When an encrypted backup is uploaded in the first setup without its key
    Then the response status is 400
    And the problem type ends with "operations/backup-key-required"
    And the restore folder holds no upload
    When an encrypted backup is uploaded in the first setup with the key "AGE-SECRET-KEY-1R45A984EXXAFC85YZSYGY9R6XJTD4E9AKY65ZCRGPDQ89E7ANW8QKT6GWX"
    Then the response status is 400
    And the problem type ends with "operations/invalid-backup-key"
    When an encrypted backup is uploaded in the first setup with the key "AGE-SECRET-KEY-1R45A984EXXAFC85YZSYGY9R6XJTD4E9AKY65ZCRGPDQ89E7ANW8QKT6GWH"
    Then the response status is 202
    And the uploaded backup waits in the restore folder beside the key "AGE-SECRET-KEY-1R45A984EXXAFC85YZSYGY9R6XJTD4E9AKY65ZCRGPDQ89E7ANW8QKT6GWH"
    And the backend restarts once

  Scenario: Through the proxy the upload needs the code from the container log, and after the setup it is closed
    Given the requests come through the proxy
    When a backup of 4096 bytes is uploaded in the first setup
    Then the response status is 403
    And the problem type ends with "operations/setup-locked"
    When a backup of 4096 bytes is uploaded in the first setup with the code from the container log
    Then the response status is 202
    Given the first setup was completed
    And the requests come directly from the home network
    When a backup of 1024 bytes is uploaded in the first setup
    Then the response status is 409
    And the problem type ends with "operations/setup-completed"

  Scenario: While the setup is open its status names the last restore, so the browser can tell how the upload ended
    Given the requests come directly from the home network
    And the backup container failed to restore "019a1b2c.upload" for "nobody" under the request "019a1b2c-0000-7000-8000-000000000003" with "pg_restore: error: unsupported version"
    When the setup status is asked
    Then the setup status names the restore "019a1b2c-0000-7000-8000-000000000003" as "FAILED" with "pg_restore: error: unsupported version"
    Given the first setup was completed
    When the setup status is asked
    Then the setup status names no restore
