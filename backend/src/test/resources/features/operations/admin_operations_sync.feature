@operations
Feature: An administrator's device keeps a copy of the settings and the backups by downloading only the chunks that changed

  Background:
    Given today is 2026-10-23
    And the first setup was completed
    And a person "Jana" is registered
    And "Jana" is an administrator
    And the backup folder exists

  Scenario: A device gets the settings without any secret's value and the backups as the administration reads them, a failed run without its error text
    Given "Jana" changes the settings:
      | name          | value     |
      | MAIL_USERNAME | alena     |
      | MAIL_PASSWORD | right-key |
    And these backups are in the backup folder:
      | file                          | size | createdAt            |
      | nfnn-2026-10-22_0300.dump.age | 1000 | 2026-10-22T01:00:00Z |
      | nfnn-2026-10-23_0300.dump.age | 1590 | 2026-10-23T01:00:03Z |
    And the backup status says:
      | outcome     | failed                                      |
      | started_at  | 2026-10-23T01:00:00Z                        |
      | finished_at | 2026-10-23T01:00:01Z                        |
      | file        | nfnn-2026-10-23_0300.dump.age               |
      | error       | pg_dump: error: connection to server failed |
    When an administration device of "Jana" syncs the operations
    Then the administration device downloaded the chunks "backups, settings"
    And the administration device's copy names "Jana" as its subject and holds the administration
    And every chunk on the administration device hashes to its rowsSha256
    And the administration device's chunk "settings" holds what the administration reads at "/api/admin/operations/settings"
    And the administration device's chunk "backups" holds what the administration reads at "/api/admin/operations/backups", each run without its error text
    And the administration reads the error "pg_dump: error: connection to server failed" of the last backup at "/api/admin/operations/backups"
    And no chunk on the administration device holds the text "right-key"
    And no chunk on the administration device holds the text "pg_dump"

  Scenario: The copy holds the value of no secret setting, nothing that reveals the backup key and no receipt signature
    Given "Jana" changes the settings:
      | name          | value                  |
      | MAIL_PASSWORD | smtp-heslo-kopie-0042  |
      | FIO_TOKEN     | fio-token-kopie-004217 |
    And the response status is 202
    And the stored "MAIL_PASSWORD" is sealed
    And the stored "FIO_TOKEN" is sealed
    And "Jana" reveals the backup key with a fresh code
    And the answer carries the backup key of this server and no cache keeps it
    And "Jana" confirms the backup key with the asked words
    And a person of the foundation signs the receipts
    And "Jana" has uploaded a 600 by 200 pixel JPEG scan as the receipt signature of the person who signs the receipts
    When an administration device of "Jana" syncs the operations
    Then the administration device's chunk "settings" holds what the administration reads at "/api/admin/operations/settings"
    And no chunk on the administration device holds the text "smtp-heslo-kopie-0042"
    And no chunk on the administration device holds the text "fio-token-kopie-004217"
    And no chunk on any administration device holds the backup key
    And no chunk on any administration device holds any of the 1 receipt image, a receipt signature or an image's bytes

  Scenario: A changed setting changes only the settings, a new backup only the backups, and an unchanged manifest downloads nothing
    Given an administration device of "Jana" syncs the operations
    When an administration device of "Jana" syncs the operations
    Then the administration device downloaded no chunk
    When "Jana" changes the settings:
      | name                      | value           |
      | PAIRING_EXCLUDED_ACCOUNTS | 2400000002/2010 |
    And an administration device of "Jana" syncs the operations
    Then the administration device downloaded the chunks "settings"
    And the administration device removed no chunk
    When these backups are in the backup folder:
      | file                          | size | createdAt            |
      | nfnn-2026-10-23_0300.dump.age | 1590 | 2026-10-23T01:00:03Z |
    And an administration device of "Jana" syncs the operations
    Then the administration device downloaded the chunks "backups"
    And the administration device's chunk "backups" holds what the administration reads at "/api/admin/operations/backups", each run without its error text

  Scenario: An administrator whose role was removed learns it at the next sync while the token is still valid, and the device keeps nothing
    Given a person "Andrea" is registered
    And "Andrea" is an administrator
    And "Jana" holds a browser token from before the signed-in devices
    And an administration device of "Jana" syncs the operations
    When "Andrea" removes "Jana" from the administrators
    And an administration device of "Jana" syncs the operations
    Then the administration device was told that "Jana" no longer holds the administration

  Scenario: The chunks come in the asked order, a repeated chunk once, up to 64 in one request, and no cache keeps an answer
    When "Jana" asks for the administration's operations sync chunks "settings,backups,settings"
    Then the response status is 200
    And the answer is JSON that must not be cached
    And the administration's chunks answer holds "settings, backups" and lists "" as missing
    When "Jana" asks for 64 of the administration's operations sync chunks
    Then the response status is 200
    When "Jana" asks for the administration's operations sync manifest
    Then the response status is 200
    And the answer is JSON that must not be cached

  Scenario: Asking for chunks that are not chunk ids of the settings or the backups, too many or none is refused
    When "Jana" asks for the administration's operations sync chunks "settings:2026-10"
    Then the response status is 400
    And the problem type ends with "validation"
    When "Jana" asks for the administration's operations sync chunks "news"
    Then the response status is 400
    And the problem type ends with "validation"
    When "Jana" asks for 65 of the administration's operations sync chunks
    Then the response status is 400
    And the problem type ends with "validation"
    When "Jana" asks for the administration's operations sync chunks ""
    Then the response status is 400
    And the problem type ends with "validation"

  Scenario: The manifest and the chunks together answer 60 requests of one administrator in 15 minutes, from any address
    Given a person "Andrea" is registered
    And "Andrea" is an administrator
    When "Jana" asks for the administration's operations sync manifest 30 times
    And "Jana" asks for the administration's operations sync chunks "settings" 30 times
    Then the response status is 200
    When the following requests come from another client address
    And "Jana" asks for the administration's operations sync manifest
    Then the response status is 429
    And the problem type ends with "operations/rate-limited"
    When "Jana" asks for the administration's operations sync chunks "settings"
    Then the response status is 429
    When "Andrea" asks for the administration's operations sync manifest
    Then the response status is 200
    When 15 minutes pass
    And "Jana" asks for the administration's operations sync manifest
    Then the response status is 200

  Scenario: The manifest and the chunks need an administrator
    Given a person "Petr" is registered
    When someone without a token asks for the administration's operations sync manifest
    Then the response status is 401
    When someone without a token asks for the administration's operations sync chunks "settings"
    Then the response status is 401
    When "Petr" asks for the administration's operations sync manifest
    Then the response status is 403
    When "Petr" asks for the administration's operations sync chunks "settings"
    Then the response status is 403
