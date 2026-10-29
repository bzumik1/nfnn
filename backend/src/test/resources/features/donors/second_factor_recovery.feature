@donors
Feature: A donor who lost the authenticator turns the second factor off by paying 1 Kč from a verified bank account

  Background:
    Given today is 2026-10-10
    And a person "Jana" is registered
    And the bank account has these movements:
      | id   | date       | amount | account    | bankCode | name         | variableSymbol |
      | 1001 | 2026-10-09 | 500.00 | 2000145399 | 0800     | Novakova Jana | {Jana}        |
    And the application starts the import
    And "Jana" enables the second factor

  Scenario: After the right password the donor gets payment instructions, and the payment turns the second factor off and ends every session
    Given 7 days pass
    When "Jana" asks to recover the second factor by payment
    Then the response status is 200
    And the instructions ask for 100 hellers to "5544332217/2010" with a recovery message, valid until "2026-10-31T10:00:00Z", from today
    And the instructions carry a payment QR code of 1 Kč with the recovery message and no variable symbol
    When the bank account receives "1.00" with the recovery message from "2000145399/0800" today
    And the hourly import runs
    Then "Jana" has the second factor off
    And every session of "Jana" has ended
    And "Jana" gets an e-mail with the subject "Dvoufaktorové ověření jsme vypnuli podle vaší platby – Nová naděje"
    When "Jana" signs in with the password alone
    Then the response status is 200

  Scenario: A payment from an account verified less than seven days ago or of another amount changes nothing, and the seventh day works
    When "Jana" asks to recover the second factor by payment
    Then the response status is 200
    And the instructions ask for 100 hellers to "5544332217/2010" with a recovery message, valid until "2026-10-24T10:00:00Z", from 2026-10-17
    Given 6 days pass
    When the bank account receives "1.00" with the recovery message from "2000145399/0800" today
    And the hourly import runs
    Then "Jana" has the second factor on
    Given 1 days pass
    When the bank account receives "2.00" with the recovery message from "2000145399/0800" today
    And the hourly import runs
    Then "Jana" has the second factor on
    When the bank account receives "1.00" with the recovery message from "2000145399/0800" today
    And the hourly import runs
    Then "Jana" has the second factor off

  Scenario: A payment from an account the donor never paid from or after the code expired changes nothing
    Given 7 days pass
    When "Jana" asks to recover the second factor by payment
    Then the response status is 200
    When the bank account receives "1.00" with the recovery message from "2900233333/2010" today
    And the hourly import runs
    Then "Jana" has the second factor on
    Given 15 days pass
    When the bank account receives "1.00" with the recovery message from "2000145399/0800" today
    And the hourly import runs
    Then "Jana" has the second factor on

  Scenario: Starting the recovery again while it is open returns the same message, start and expiry, and its payment still counts
    Given 7 days pass
    When "Jana" asks to recover the second factor by payment
    Then the response status is 200
    And the instructions open a new recovery started "2026-10-17T10:00:00Z"
    Given 2 days pass
    When "Jana" asks to recover the second factor by payment
    Then the response status is 200
    And the instructions repeat the open recovery started "2026-10-17T10:00:00Z"
    And the instructions ask for 100 hellers to "5544332217/2010" with a recovery message, valid until "2026-10-31T10:00:00Z", from today
    And the instructions carry a payment QR code of 1 Kč with the recovery message and no variable symbol
    When the bank account receives "1.00" with the recovery message from "2000145399/0800" today
    And the hourly import runs
    Then "Jana" has the second factor off

  Scenario: Once the recovery expired, starting it again gives a new message, and a payment with the old one changes nothing
    When "Jana" asks to recover the second factor by payment
    Then the response status is 200
    Given 15 days pass
    When "Jana" asks to recover the second factor by payment
    Then the response status is 200
    And the instructions open a new recovery started "2026-10-25T10:00:00Z" with another message
    And the instructions ask for 100 hellers to "5544332217/2010" with a recovery message, valid until "2026-11-08T10:00:00Z", from today
    When the bank account receives "1.00" with the previous recovery message from "2000145399/0800" today
    And the hourly import runs
    Then "Jana" has the second factor on
    When the bank account receives "1.00" with the recovery message from "2000145399/0800" today
    And the hourly import runs
    Then "Jana" has the second factor off

  Scenario: An administrator recovers the same way, the step is audited and the other administrators are told
    Given a person "Petr" is registered
    And "Petr" is an administrator
    And "Jana" is given the administrator role without signing in again
    And 7 days pass
    When "Jana" asks to recover the second factor by payment
    Then the response status is 200
    When the bank account receives "1.00" with the recovery message from "2000145399/0800" today
    And the hourly import runs
    Then "Jana" has the second factor off
    And the admin action "RECOVER_SECOND_FACTOR" by "Jana" on "Jana" is recorded
    And "Jana" gets an e-mail with the subject "Dvoufaktorové ověření jsme vypnuli podle vaší platby – Nová naděje"
    And "Petr" gets an e-mail with the subject "Na účtu správce se platbou 1 Kč vypnulo dvoufaktorové ověření – Nová naděje"

  Scenario: Without a verified bank account the recovery by payment is not offered
    Given a person "Petr" is registered
    And "Petr" enables the second factor
    When "Petr" asks to recover the second factor by payment
    Then the response status is 409
    And the problem type ends with "donors/second-factor-recovery-unavailable"

  Scenario: An unknown challenge is refused and the eleventh request from one address within 15 minutes is refused before it is checked
    When a recovery by payment is asked with an unknown challenge
    Then the response status is 401
    And the problem type ends with "auth/invalid-second-factor-challenge"
    Given a recovery by payment was asked with an unknown challenge 9 times
    When a recovery by payment is asked with an unknown challenge
    Then the response status is 429
    And the problem type ends with "rate-limited"
