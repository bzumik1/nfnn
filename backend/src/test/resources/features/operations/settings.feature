@operations
Feature: An administrator changes the settings of the site in the administration

  Background:
    Given today is 2026-10-23
    And the first setup was completed
    And a person "Jana" is registered
    And "Jana" is an administrator
    And a person "Petr" is registered

  Scenario: The settings show plain values and only whether a secret is set; the first administrator's e-mail is not among them
    When "Jana" reads the settings
    Then the response status is 200
    And the setting "MAIL_HOST" reads "localhost"
    And the setting "FIO_TOKEN" reads "hidden, unset"
    And the settings do not list "ADMIN_EMAILS"

  Scenario: An administrator changes settings, they are stored and audited by name and the backend restarts
    When "Jana" changes the settings:
      | name                      | value           |
      | RECEIPT_SIGNATORY_NAME    | Andrea Znamenáčková |
      | PAIRING_EXCLUDED_ACCOUNTS | 2400000002/2010 |
      | MAIL_PASSWORD             | right-key       |
      | MAIL_HOST                 |                 |
    Then the response status is 202
    And the backend restarts once
    And the stored "RECEIPT_SIGNATORY_NAME" is "Andrea Znamenáčková"
    And the stored "MAIL_PASSWORD" is sealed
    And the stored settings are "PUBLIC_URL, MAIL_PORT, MAIL_FROM, CONTACT_RECIPIENT, ADMIN_EMAILS, RECEIPT_SIGNATORY_NAME, PAIRING_EXCLUDED_ACCOUNTS, MAIL_PASSWORD"
    And the administration history records "CHANGE_SETTINGS" by "Jana"

  Scenario: A malformed value is named first; a well-formed value the backend would not start with is refused before anything is stored
    When "Jana" changes the settings:
      | name                      | value          |
      | PAIRING_EXCLUDED_ACCOUNTS | not-an-account |
      | RECEIPT_FIRST_YEAR        | 26             |
    Then the response status is 400
    And the problem names the settings "RECEIPT_FIRST_YEAR"
    When "Jana" changes the settings:
      | name                      | value          |
      | PAIRING_EXCLUDED_ACCOUNTS | not-an-account |
    Then the response status is 400
    And the problem names the settings "PAIRING_EXCLUDED_ACCOUNTS"
    And the backend does not restart

  Scenario: An administrator sends a test e-mail to their own address through the typed values before saving, and it is audited
    When "Jana" sends a test e-mail through "smtp.example.cz" with the password "right-key" from "info@nfnn.cz"
    Then the test e-mail says "SENT" to the e-mail of "Jana"
    And the administration history records "SEND_TEST_EMAIL" by "Jana"
    When "Jana" sends a test e-mail through "smtp.example.cz" with the password "wrong-key" from "info@nfnn.cz"
    Then the test e-mail says "SIGN_IN_REFUSED" to the e-mail of "Jana"
    When "Jana" sends a test e-mail through "smtp.example.cz" with the password "right-key" from "neovereny@example.cz"
    Then the test e-mail says "SENDER_REFUSED" to the e-mail of "Jana"
    And the stored settings are "PUBLIC_URL, MAIL_HOST, MAIL_PORT, MAIL_FROM, CONTACT_RECIPIENT, ADMIN_EMAILS"
    And the backend does not restart

  Scenario: Only an administrator sends a test e-mail, at most 10 an hour from one address
    When someone without a token sends a test e-mail through "smtp.example.cz"
    Then the response status is 401
    When "Petr" sends a test e-mail through "smtp.example.cz" with the password "right-key" from "info@nfnn.cz"
    Then the response status is 403
    When "Jana" sends a test e-mail through "smtp.example.cz" with the password "right-key" from "not-an-address"
    Then the response status is 400
    When the following requests come from another client address
    And "Jana" sent 10 test e-mails
    And "Jana" sends a test e-mail through "smtp.example.cz" with the password "right-key" from "info@nfnn.cz"
    Then the response status is 429
    And the problem type ends with "operations/rate-limited"

  Scenario: Only an administrator reads or changes the settings
    When someone without a token reads the settings
    Then the response status is 401
    When "Petr" reads the settings
    Then the response status is 403
    When "Petr" changes the settings:
      | name               | value |
      | RECEIPT_FIRST_YEAR | 2025  |
    Then the response status is 403
    And the backend does not restart

  Scenario: A connected application changes plain settings but never a password, a token, the site's address or the mail server
    Given "Jana" connected the application "https://claude.ai/.well-known/oauth-client" with scope "admin:read admin:write"
    When "Jana" changes the settings:
      | name          | value     |
      | MAIL_PASSWORD | right-key |
    And the connector exchanges the connector token for an API token
    And the exchanged API token changes the setting "FIO_TOKEN" to "token"
    Then the response status is 403
    And the problem type ends with "operations/secret-settings-in-browser-only"
    When the connector exchanges the connector token for an API token
    And the exchanged API token changes the setting "PUBLIC_URL" to "https://nfnn.attacker.example"
    Then the response status is 403
    And the problem type ends with "operations/secret-settings-in-browser-only"
    When the connector exchanges the connector token for an API token
    And the exchanged API token changes the setting "MAIL_HOST" to "smtp.attacker.example"
    Then the response status is 400
    And the problem names the settings "MAIL_PASSWORD"
    When the connector exchanges the connector token for an API token
    And the exchanged API token changes the setting "RECEIPT_FIRST_YEAR" to "2025"
    Then the response status is 202

  Scenario: A connected application sends a test e-mail through the running server but never with a password
    Given "Jana" connected the application "https://claude.ai/.well-known/oauth-client" with scope "admin:read admin:write"
    When the connector exchanges the connector token for an API token
    And the exchanged API token sends a test e-mail with the password "right-key"
    Then the response status is 403
    And the problem type ends with "operations/secret-settings-in-browser-only"
    When the connector exchanges the connector token for an API token
    And the exchanged API token sends a test e-mail through the running mail server
    Then the test e-mail says "SENT" to the e-mail of "Jana"
