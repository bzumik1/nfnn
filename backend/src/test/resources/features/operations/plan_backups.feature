@operations
Feature: An administrator chooses when the database is backed up and when the backup is test-restored

  Background:
    Given today is 2026-10-24
    And a person "Jana" is registered
    And "Jana" is an administrator
    And the backup folder exists

  Scenario: Without a chosen plan the backups run at the defaults
    When "Jana" asks for the backups
    Then the response status is 200
    And the backups answer says:
      | schedule.backupTime      | 03:00 |
      | schedule.testRestoreDay  | 7     |
      | schedule.testRestoreTime | 04:00 |
    And the backups answer names no plan applied by the backup container

  Scenario: A changed plan is handed to the backup container, shown and audited
    When "Jana" plans the daily backup at "02:30" and the test restore on day 6 at "05:15"
    Then the response status is 200
    And the backups answer says:
      | backupTime      | 02:30 |
      | testRestoreDay  | 6     |
      | testRestoreTime | 05:15 |
    And the plan file for the backup container says:
      """
      backup_time=02:30
      test_restore_day=6
      test_restore_time=05:15

      """
    And the admin action "CHANGE_BACKUP_SCHEDULE" by "Jana" is recorded with details containing "na „denní záloha 02:30, zkušební obnova v sobotu 05:15“"
    Given the backup container reports the plan:
      | backup_time       | 02:30 |
      | test_restore_day  | 6     |
      | test_restore_time | 05:15 |
    When "Jana" asks for the backups
    Then the backups answer says:
      | schedule.backupTime              | 02:30 |
      | schedule.testRestoreDay          | 6     |
      | schedule.applied.backupTime      | 02:30 |
      | schedule.applied.testRestoreDay  | 6     |
      | schedule.applied.testRestoreTime | 05:15 |

  Scenario: A time or a day that does not exist is refused at its field
    When "Jana" plans the daily backup at "24:00" and the test restore on day 7 at "04:00"
    Then the response status is 400
    And the problem lists an error for field "backupTime"
    When "Jana" plans the daily backup at "03:00" and the test restore on day 8 at "04:00"
    Then the response status is 400
    And the problem lists an error for field "testRestoreDay"
    When "Jana" plans the daily backup at "03:00" and the test restore on day 7 at "4:00"
    Then the response status is 400
    And the problem lists an error for field "testRestoreTime"
    And no plan file waits for the backup container

  Scenario: Without the backup folder the plan is not changed
    Given the backup folder does not exist
    When "Jana" plans the daily backup at "02:30" and the test restore on day 6 at "05:15"
    Then the response status is 409
    And the problem type ends with "operations/backups-unavailable"
    When "Jana" asks for the backups
    Then the backups answer says:
      | schedule.backupTime | 03:00 |

  Scenario: A donor without the administrator role and a visitor without a token cannot change the plan
    Given a person "Petr" is registered
    When "Petr" plans the daily backup at "02:30" and the test restore on day 6 at "05:15"
    Then the response status is 403
    And the problem type ends with "auth/forbidden"
    When someone without a token plans the daily backup at "02:30" and the test restore on day 6 at "05:15"
    Then the response status is 401
