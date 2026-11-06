@operations
Feature: The devices of the administrators are told by push when the bank import, the backups or the mail stop working and when they work again

  Background:
    Given today is 2026-10-23
    And a person "Jana" is registered
    And "Jana" is an administrator
    And "Jana" turned push alerts on for the device "telefon" at "https://fcm.googleapis.com/fcm/send/jana-telefon"

  Scenario: The bank import outage and its end each reach a device once, saying what happened and opening the overview
    Given the application starts the import
    And 1 days pass
    And Fio refuses the next request because Fio is unreachable
    And the hourly import runs
    And Fio refuses the next request because Fio is unreachable
    And the hourly import runs
    Then the device "telefon" of "Jana" received no push alert
    Given Fio refuses the next request because Fio is unreachable
    When the hourly import runs
    Then the device "telefon" of "Jana" received the push alerts:
      | kind               | count | title                    | url     |
      | bank-import-outage | 1     | Import z banky nefunguje | /sprava |
    When "Jana" asks for the push settings on the device "telefon"
    Then the push settings say the session names a device
    And the push settings list the open alerts:
      | area       | since                |
      | bankImport | 2026-10-24T10:00:00Z |
    And the push settings list the devices:
      | service | current |
      | google  | yes     |
    Given Fio refuses the next request because Fio is unreachable
    When the hourly import runs
    And 1 days pass
    And the hourly import runs
    Then the device "telefon" of "Jana" received the push alerts:
      | kind                  | count | title                       | url     |
      | bank-import-outage    | 1     | Import z banky nefunguje    | /sprava |
      | bank-import-recovered | 0     | Import z banky zase funguje | /sprava |
    When "Jana" asks for the push settings
    Then the push settings list no open alert
    And the push settings list the devices:
      | service | current | delivered |
      | google  | no      | yes       |

  Scenario: A backup problem and its end each reach a device once and open the backups
    Given the backup folder exists
    And the backup status says:
      | outcome     | failed                                      |
      | started_at  | 2026-10-23T01:00:00Z                        |
      | finished_at | 2026-10-23T01:00:01Z                        |
      | file        | nfnn-2026-10-23_0300.dump.age               |
      | error       | pg_dump: error: connection to server failed |
    When the backup check runs
    And the backup check runs
    Then the device "telefon" of "Jana" received the push alerts:
      | kind           | count | title               | url            |
      | backups-outage | 1     | Zálohy mají problém | /sprava/zalohy |
    Given the backup status says:
      | outcome     | ok                            |
      | started_at  | 2026-10-23T05:00:00Z          |
      | finished_at | 2026-10-23T05:00:02Z          |
      | file        | nfnn-2026-10-23_0700.dump.age |
      | size        | 1590                          |
    When the backup check runs
    And the backup check runs
    Then the device "telefon" of "Jana" received the push alerts:
      | kind              | count | title                       | url            |
      | backups-outage    | 1     | Zálohy mají problém         | /sprava/zalohy |
      | backups-recovered | 0     | Zálohy jsou zase v pořádku | /sprava/zalohy |

  Scenario: A refused e-mail and the next one sent each reach a device once, the count names every open alert, and a device with that alert off gets neither
    Given "Jana" turned push alerts on for the device "notebook" at "https://updates.push.services.mozilla.com/wpush/v2/jana-notebook"
    And "Jana" changes the push alerts of the device "notebook" to bank import on, backups on and mail off
    And the backup folder does not exist
    And the backup check runs
    And the mail server refuses the next e-mail
    When "Jana" sends the monthly report for "2026-09" again
    Then the device "telefon" of "Jana" received the push alerts:
      | kind           | count | title               | url                |
      | backups-outage | 1     | Zálohy mají problém | /sprava/zalohy     |
      | mail-outage    | 2     | E-maily neodcházejí | /sprava/nastaveni |
    And the device "notebook" of "Jana" received the push alerts:
      | kind           | count | title               | url            |
      | backups-outage | 1     | Zálohy mají problém | /sprava/zalohy |
    When "Jana" sends the monthly report for "2026-09" again
    And "Jana" sends the monthly report for "2026-09" again
    Then the device "telefon" of "Jana" received the push alerts:
      | kind           | count | title                  | url               |
      | backups-outage | 1     | Zálohy mají problém    | /sprava/zalohy    |
      | mail-outage    | 2     | E-maily neodcházejí    | /sprava/nastaveni |
      | mail-recovered | 1     | E-maily zase odcházejí | /sprava/nastaveni |
    And the device "notebook" of "Jana" received the push alerts:
      | kind           | count | title               | url            |
      | backups-outage | 1     | Zálohy mají problém | /sprava/zalohy |

  Scenario: A device the push service fails is tried again 1, 5 and 15 minutes later until it takes the alert
    Given the push service answers 500 for "https://fcm.googleapis.com/fcm/send/jana-telefon"
    And the backup folder does not exist
    When the backup check runs
    Then a push alert retry is due in 1 minute
    When the push alert retries run
    Then a push alert retry is due in 5 minutes
    When the push alert retries run
    Then a push alert retry is due in 15 minutes
    Given the push service answers 201 for "https://fcm.googleapis.com/fcm/send/jana-telefon"
    When the push alert retries run
    Then no push alert retry is due
    And the device "telefon" of "Jana" received the push alerts:
      | kind           | count | title               | url            |
      | backups-outage | 1     | Zálohy mají problém | /sprava/zalohy |
      | backups-outage | 1     | Zálohy mají problém | /sprava/zalohy |
      | backups-outage | 1     | Zálohy mají problém | /sprava/zalohy |
      | backups-outage | 1     | Zálohy mají problém | /sprava/zalohy |
    When "Jana" asks for the push settings
    Then the push settings list the devices:
      | service | failuresInARow | delivered |
      | google  | 0              | yes       |

  Scenario: Four failed tries end the retries, and a retry of an alert that has changed since is not sent
    Given the push service answers 500 for "https://fcm.googleapis.com/fcm/send/jana-telefon"
    And the backup folder does not exist
    When the backup check runs
    And the push alert retries run
    And the push alert retries run
    And the push alert retries run
    Then no push alert retry is due
    When "Jana" asks for the push settings
    Then the push settings list the devices:
      | service | failuresInARow |
      | google  | 4              |
    Given the backup folder exists
    And the backup status says:
      | outcome     | ok                            |
      | started_at  | 2026-10-23T05:00:00Z          |
      | finished_at | 2026-10-23T05:00:02Z          |
      | file        | nfnn-2026-10-23_0700.dump.age |
      | size        | 1590                          |
    When the backup check runs
    Then a push alert retry is due in 1 minute
    Given the push service answers 201 for "https://fcm.googleapis.com/fcm/send/jana-telefon"
    And the backup folder does not exist
    When the backup check runs
    And the push alert retries run
    Then no push alert retry is due
    Then the device "telefon" of "Jana" received the push alerts:
      | kind              | count | title                      | url            |
      | backups-outage    | 1     | Zálohy mají problém        | /sprava/zalohy |
      | backups-outage    | 1     | Zálohy mají problém        | /sprava/zalohy |
      | backups-outage    | 1     | Zálohy mají problém        | /sprava/zalohy |
      | backups-outage    | 1     | Zálohy mají problém        | /sprava/zalohy |
      | backups-recovered | 0     | Zálohy jsou zase v pořádku | /sprava/zalohy |
      | backups-outage    | 1     | Zálohy mají problém        | /sprava/zalohy |

  Scenario: A test alert sent while an alert is open names the open alerts, so it keeps the app's badge
    Given the backup folder does not exist
    And the backup check runs
    When "Jana" sends a test push alert
    Then the response status is 200
    And the device "telefon" of "Jana" received the push alerts:
      | kind           | count | title                 | url                |
      | backups-outage | 1     | Zálohy mají problém   | /sprava/zalohy     |
      | test           | 1     | Zkušební upozornění   | /sprava/upozorneni |
