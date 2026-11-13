@operations
Feature: Donors who gave in a year hear once, in January, that their yearly receipt is ready

  Background:
    Given the time is "2026-12-28T09:00:00Z"
    And a person "Jana" is registered
    And a person "Petr" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | variableSymbol | name          |
      | 1001 | 2026-12-22 | 500.00 | 2900233333 | 2010     | {Jana}         | Nováková Jana |
    And the application starts the import
    And "Jana" turned push notifications on for the device "telefon" at "https://web.push.apple.com/jana-telefon"
    And "Jana" turns push notifications on for the device "notebook" at "https://fcm.googleapis.com/fcm/send/jana-notebook" with gifts on and yearly receipts off
    And "Petr" turned push notifications on for the device "telefon" at "https://web.push.apple.com/petr-telefon"

  Scenario: On the second of January the donors who gave last year hear it once on each device that wants it, and nobody else does
    Given the time is "2027-01-02T09:00:00Z"
    When the yearly receipt announcement runs
    Then the device "telefon" of "Jana" received the push notifications:
      | kind                 | title                         | body                                                    | url             |
      | yearly-receipt-ready | Roční potvrzení je připravené | Stáhnete ho v Potvrzeních, hodí se k daňovému přiznání. | /darce/potvrzeni |
    And the device "notebook" of "Jana" received no push alert
    And the device "telefon" of "Petr" received no push alert
    When 24 hours pass
    And the yearly receipt announcement runs
    Then the device "telefon" of "Jana" received the push notifications:
      | kind                 | title                         | body                                                    | url             |
      | yearly-receipt-ready | Roční potvrzení je připravené | Stáhnete ho v Potvrzeních, hodí se k daňovému přiznání. | /darce/potvrzeni |

  Scenario: Nothing is announced on the first of January, nor after January when the server missed the whole month
    Given the time is "2027-01-01T09:00:00Z"
    When the yearly receipt announcement runs
    Given the time is "2027-02-01T09:00:00Z"
    And the yearly receipt announcement runs
    Then the device "telefon" of "Jana" received no push alert

  Scenario: A server that was down on the second of January announces the next day
    Given the time is "2027-01-05T09:00:00Z"
    When the yearly receipt announcement runs
    Then the device "telefon" of "Jana" received the push notifications:
      | kind                 | title                         | body                                                    | url             |
      | yearly-receipt-ready | Roční potvrzení je připravené | Stáhnete ho v Potvrzeních, hodí se k daňovému přiznání. | /darce/potvrzeni |
