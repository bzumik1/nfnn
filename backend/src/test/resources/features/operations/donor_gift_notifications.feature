@operations
Feature: A donor's devices hear that a gift arrived, only when a regular import pairs it and only where they want it

  Background:
    Given today is 2026-11-12
    And a person "Jana" is registered
    And a person "Petr" is registered
    And "Petr" is an administrator

  Scenario: An hourly import that pairs two gifts of a donor tells each device that wants it once, without a name, amount or count
    Given "Jana" turned push notifications on for the device "telefon" at "https://web.push.apple.com/jana-telefon"
    And "Jana" turns push notifications on for the device "notebook" at "https://fcm.googleapis.com/fcm/send/jana-notebook" with gifts off and yearly receipts on
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | variableSymbol | name          |
      | 1001 | 2026-11-12 | 500.00 | 2900233333 | 2010     | {Jana}         | Nováková Jana |
      | 1002 | 2026-11-12 | 300.00 | 2900233333 | 2010     | {Jana}         | Nováková Jana |
    When the hourly import runs
    Then the device "telefon" of "Jana" received the push notifications:
      | kind         | title           | body                                | url         |
      | gift-arrived | Váš dar dorazil | Děkujeme. Najdete ho v Mých darech. | /darce/dary |
    And the device "notebook" of "Jana" received no push alert
    And no push alert retry is due

  Scenario: A gift booked more than a week ago, gifts found among older payments and a gift paired by hand tell nobody
    Given "Jana" turned push notifications on for the device "telefon" at "https://web.push.apple.com/jana-telefon"
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | variableSymbol | name          |
      | 2001 | 2026-02-10 | 300.00 | 2900233333 | 2010     | {Jana}         | Nováková Jana |
      | 1004 | 2026-11-04 | 400.00 | 2900233333 | 2010     | {Jana}         | Nováková Jana |
      | 1003 | 2026-11-12 | 200.00 | 2900299999 | 0800     |                | Nováková Jana |
    When the application starts the import
    Then "Jana" has 1 donation
    Given 60 seconds pass
    And the bank history is unlocked
    When "Petr" asks for older bank payments from 2026-01-01
    Then the response status is 202
    And "Jana" has 2 donations
    When "Petr" pairs payment 1003 with "Jana"
    Then the response status is 200
    And "Jana" has 3 donations
    And the device "telefon" of "Jana" received no push alert

  Scenario: A device signed out while an older version of the site ran loses its leftover subscription instead of hearing of the gift
    Given "Jana" turned push notifications on for the device "telefon" at "https://web.push.apple.com/jana-telefon"
    And "Jana" turned push notifications on for the device "notebook" at "https://fcm.googleapis.com/fcm/send/jana-notebook"
    And the device "notebook" of "Jana" was signed out while an older version of the site ran
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | variableSymbol | name          |
      | 1001 | 2026-11-12 | 500.00 | 2900233333 | 2010     | {Jana}         | Nováková Jana |
    When the hourly import runs
    Then the device "telefon" of "Jana" received the push notifications:
      | kind         | title           | body                                | url         |
      | gift-arrived | Váš dar dorazil | Děkujeme. Najdete ho v Mých darech. | /darce/dary |
    And the device "notebook" of "Jana" received no push alert
    And the push notifications list the devices "telefon" of "Jana"

  Scenario: A device whose push service fails hears of the gift on a later try
    Given "Jana" turned push notifications on for the device "telefon" at "https://web.push.apple.com/jana-telefon"
    And the push service answers 500 for "https://web.push.apple.com/jana-telefon"
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | variableSymbol | name          |
      | 1001 | 2026-11-12 | 500.00 | 2900233333 | 2010     | {Jana}         | Nováková Jana |
    When the hourly import runs
    Then a push alert retry is due in 1 minute
    Given the push service answers 201 for "https://web.push.apple.com/jana-telefon"
    When the push alert retries run
    Then no push alert retry is due
    And the device "telefon" of "Jana" received the push notifications:
      | kind         | title           | body                                | url         |
      | gift-arrived | Váš dar dorazil | Děkujeme. Najdete ho v Mých darech. | /darce/dary |
      | gift-arrived | Váš dar dorazil | Děkujeme. Najdete ho v Mých darech. | /darce/dary |
