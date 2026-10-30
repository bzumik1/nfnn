@donors
Feature: Donor confirms the e-mail address after registering

  Scenario: Registration sends a verification link, and the account opens only once the link is used
    When a person registers
      | name       | KLIKNĚTE http://evil.example |
      | street     | Dlouhá 12                    |
      | city       | Ústí nad Labem               |
      | postalCode | 400 01                       |
      | email      | jana@example.cz              |
      | password   | correct horse battery        |
    Then the response status is 202
    And 1 verification link is stored
    And 1 e-mail is sent to "jana@example.cz" with the subject "Potvrďte svůj e-mail – Nová naděje"
    And the stored verification link expires 24 hours after it was issued
    And the last e-mail comes from "info@nfnn.cz" named "Nová naděje – nadační fond"
    And both parts of the last e-mail contain "http://localhost:4200/potvrzeni-emailu#token="
    And both parts of the last e-mail contain "jana@example.cz"
    And neither part of the last e-mail contains "KLIKNĚTE"
    And neither part of the last e-mail contains "evil.example"
    And donations keeps 0 donor records
    When the donor signs in with email "jana@example.cz" and password "correct horse battery"
    Then the response status is 401
    And the problem type ends with "auth/email-not-verified"
    And the problem has the title "E-mail ještě není potvrzený"
    When the donor confirms the e-mail with the link from the e-mail
    Then the response status is 200
    And the response carries an access token and a refresh cookie
    And the registered donor has a 10-digit variable symbol
    And the donor profile shows type "PERSON", name "KLIKNĚTE http://evil.example" and email "jana@example.cz"
    And the verification link from the e-mail is no longer stored
    And 0 verification links are stored
    And donations keeps 1 donor record
    When the donor signs in with email "jana@example.cz" and password "correct horse battery"
    Then the response status is 200

  Scenario: A registration started from the donate section links back to it, also in a new link asked for from there, and confirms as usual
    When a person registers
      | name       | Jana Nováková         |
      | street     | Dlouhá 12             |
      | city       | Ústí nad Labem        |
      | postalCode | 400 01                |
      | email      | jana@example.cz       |
      | password   | correct horse battery |
      | returnTo   | /#prispet             |
    Then the response status is 202
    And the verification link of the last e-mail returns to "/#prispet"
    And both parts of the last e-mail contain "returnTo=%2F%23prispet"
    When a verification e-mail is asked for "jana@example.cz" returning to "/#prispet"
    Then the response status is 202
    And the verification link of the last e-mail returns to "/#prispet"
    When a verification e-mail is asked for "jana@example.cz"
    Then the response status is 202
    And the verification link of the last e-mail returns nowhere
    When the donor confirms the e-mail with the link from e-mail 2
    Then the response status is 200
    And the response carries an access token and a refresh cookie

  Scenario: A registration started elsewhere links to the confirmation alone, and a return address outside the list is refused
    When a person registers
      | name       | Jana Nováková         |
      | street     | Dlouhá 12             |
      | city       | Ústí nad Labem        |
      | postalCode | 400 01                |
      | email      | jana@example.cz       |
      | password   | correct horse battery |
    Then the response status is 202
    And the verification link of the last e-mail returns nowhere
    When a person registers
      | name       | Petr Svoboda          |
      | street     | Dlouhá 12             |
      | city       | Ústí nad Labem        |
      | postalCode | 400 01                |
      | email      | petr@example.cz       |
      | password   | correct horse battery |
      | returnTo   | https://evil.example  |
    Then the response status is 400
    And the problem lists an error for field "returnTo"
    When a verification e-mail is asked for "jana@example.cz" returning to "//evil.example"
    Then the response status is 400
    And the problem lists an error for field "returnTo"
    And 1 e-mail is sent to "jana@example.cz" with the subject "Potvrďte svůj e-mail – Nová naděje"

  Scenario: A wrong password at an unconfirmed account is refused as a wrong password, not as unconfirmed
    Given a person registered with email "jana@example.cz" and password "correct horse battery" but has not confirmed the e-mail
    When the donor signs in with email "jana@example.cz" and password "wrong horse battery"
    Then the response status is 401
    And the problem type ends with "auth/invalid-credentials"

  Scenario: A used link does not work again
    Given a person registered with email "jana@example.cz" and password "correct horse battery" but has not confirmed the e-mail
    When the donor confirms the e-mail with the link from the e-mail
    Then the response status is 200
    When the donor confirms the e-mail with the link from the e-mail
    Then the response status is 400
    And the problem type ends with "donors/invalid-email-verification-token"
    And the problem has the title "Odkaz pro potvrzení e-mailu je neplatný nebo vypršel"

  Scenario: An expired link no longer confirms, and a new one asked for by the donor does
    Given a person registered with email "jana@example.cz" and password "correct horse battery" but has not confirmed the e-mail
    When 1441 minutes pass
    And the donor confirms the e-mail with the link from the e-mail
    Then the response status is 400
    And the problem type ends with "donors/invalid-email-verification-token"
    When a verification e-mail is asked for " JANA@Example.cz "
    Then the response status is 202
    And 2 e-mails are sent to "jana@example.cz" with the subject "Potvrďte svůj e-mail – Nová naděje"
    And 1 verification link is stored
    When the donor confirms the e-mail with the link from e-mail 2
    Then the response status is 200

  Scenario: A confirmed account, an unknown address and a malformed address get no new link
    Given a person registered with email "jana@example.cz" and password "correct horse battery"
    When a verification e-mail is asked for "jana@example.cz"
    Then the response status is 202
    And no email is sent
    When a verification e-mail is asked for "nobody@example.cz"
    Then the response status is 202
    And no email is sent
    When a verification e-mail is asked for "not-an-email"
    Then the response status is 400
    And the problem type ends with "validation"
    And the problem's error for field "email" says "Zadejte e-mail ve tvaru jmeno@domena.cz."

  Scenario: A donor holds at most three live links, keeps the earlier ones and loses them all on confirmation
    Given a person registered with email "jana@example.cz" and password "correct horse battery" but has not confirmed the e-mail
    When a verification e-mail is asked for "jana@example.cz" 3 times
    Then each of these requests is answered 202
    And 3 verification links are stored
    And 3 e-mails are sent to "jana@example.cz" with the subject "Potvrďte svůj e-mail – Nová naděje"
    When the donor confirms the e-mail with the link from e-mail 1
    Then the response status is 200
    And 0 verification links are stored
    When the donor confirms the e-mail with the link from e-mail 2
    Then the response status is 400
    And the problem type ends with "donors/invalid-email-verification-token"

  Scenario: Registering again with an address that is not confirmed yet replaces the first registration
    Given a person registered with email "jana@example.cz" and password "correct horse battery" but has not confirmed the e-mail
    When a person registers
      | name       | Jana Svobodová         |
      | street     | Krátká 3               |
      | city       | Most                   |
      | postalCode | 434 01                 |
      | email      | Jana@Example.cz        |
      | password   | a brand new passphrase |
    Then the response status is 202
    And 2 e-mails are sent to "jana@example.cz" with the subject "Potvrďte svůj e-mail – Nová naděje"
    And 1 verification link is stored
    When the donor confirms the e-mail with the link from e-mail 1
    Then the response status is 400
    And the problem type ends with "donors/invalid-email-verification-token"
    When the donor confirms the e-mail with the link from e-mail 2
    Then the response status is 200
    And the response carries an access token and a refresh cookie
    And the donor profile shows type "PERSON", name "Jana Svobodová" and email "jana@example.cz"
    When the donor signs in with email "jana@example.cz" and password "a brand new passphrase"
    Then the response status is 200
    When the donor signs in with email "jana@example.cz" and password "correct horse battery"
    Then the response status is 401

  Scenario: Registering with the address of a confirmed account creates nothing and tells the account's owner
    Given a person registered with email "jana@example.cz" and password "correct horse battery"
    When a person registers with email "Jana@Example.cz" and password "a brand new passphrase"
    Then the response status is 202
    And 1 e-mail is sent to "jana@example.cz" with the subject "Váš dárcovský účet už existuje – Nová naděje"
    And both parts of the last e-mail contain "jana@example.cz"
    And neither part of the last e-mail contains "token="
    And 0 verification links are stored
    And donations keeps 1 donor record
    When the donor signs in with email "jana@example.cz" and password "correct horse battery"
    Then the response status is 200
    When the donor signs in with email "jana@example.cz" and password "a brand new passphrase"
    Then the response status is 401

  Scenario: A password reset is not sent before the e-mail is confirmed
    Given a person registered with email "jana@example.cz" and password "correct horse battery" but has not confirmed the e-mail
    When a password reset is asked for "jana@example.cz"
    Then the response status is 202
    And 0 password reset links are stored
    And 1 e-mail is sent to "jana@example.cz" with the subject "Potvrďte svůj e-mail – Nová naděje"

  Scenario: The sixth verification request within an hour from one address is refused
    Given a verification e-mail is asked for "nobody1@example.cz", "nobody2@example.cz", "nobody3@example.cz", "nobody4@example.cz" and "nobody5@example.cz"
    When a verification e-mail is asked for "nobody6@example.cz"
    Then the response status is 429
    And the problem type ends with "donors/rate-limited"
    And the problem has the title "Příliš mnoho požadavků"

  Scenario: A donor who prefers English gets the e-mail in English
    When a person registers with email "john@example.com", password "correct horse battery" and preferred locale "en"
    Then the response status is 202
    And 1 e-mail is sent to "john@example.com" with the subject "Confirm your e-mail – Nová naděje"
    And both parts of the last e-mail contain "The link is valid for 24 hours and can be used once."

  Scenario: A verification token is neither a refresh token nor an access token
    Given a person registered with email "jana@example.cz" and password "correct horse battery" but has not confirmed the e-mail
    When the verification link's token is presented as the refresh cookie
    Then the response status is 401
    And the problem type ends with "auth/invalid-refresh-token"
    When the verification link's token is presented as a bearer token for the profile
    Then the response status is 401

  Scenario Outline: A malformed token is a validation error
    When the e-mail is confirmed with token "<token>"
    Then the response status is 400
    And the problem type ends with "validation"
    And the problem lists an error for field "token"

    Examples:
      | token                                        |
      | abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-_QQ |
      | abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-.Q  |
      |                                              |

  Scenario: An unknown well-formed token is refused as invalid
    When the e-mail is confirmed with an unknown well-formed token
    Then the response status is 400
    And the problem type ends with "donors/invalid-email-verification-token"

  Scenario: An unconfirmed registration gets one reminder a day after registering, with a fresh link that confirms it
    Given a person registered with email "jana@example.cz" and password "correct horse battery" but has not confirmed the e-mail
    When 1430 minutes pass
    And the registration reminder job runs
    Then 1 e-mail is sent to "jana@example.cz" with the subject "Potvrďte svůj e-mail – Nová naděje"
    When 20 minutes pass
    And the registration reminder job runs
    Then e-mail 2 goes to "jana@example.cz" with the subject "Připomínka: dokončete registraci – Nová naděje"
    And both parts of the last e-mail contain "http://localhost:4200/potvrzeni-emailu#token="
    And both parts of the last e-mail contain "jana@example.cz"
    When the registration reminder job runs
    Then 2 e-mails are sent to "jana@example.cz"
    When the donor confirms the e-mail with the link from the e-mail
    Then the response status is 200
    And the response carries an access token and a refresh cookie

  Scenario: A confirmed account and a registration older than a week get no reminder
    Given a person registered with email "jana@example.cz" and password "correct horse battery"
    And a person registered with email "petr@example.cz" and password "correct horse battery" but has not confirmed the e-mail
    When 8 days pass
    And the registration reminder job runs
    Then 1 e-mail is sent to "petr@example.cz" with the subject "Potvrďte svůj e-mail – Nová naděje"

  Scenario: A donor who prefers English gets the reminder in English
    When a person registers with email "john@example.com", password "correct horse battery" and preferred locale "en"
    Then 1 e-mail is sent to "john@example.com" with the subject "Confirm your e-mail – Nová naděje"
    When 2 days pass
    And the registration reminder job runs
    Then e-mail 2 goes to "john@example.com" with the subject "Reminder: finish your registration – Nová naděje"
