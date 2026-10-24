@operations
Feature: The first setup asks for the settings in the browser and stores them without env files

  Background:
    Given today is 2026-10-23

  Scenario: Directly from the home network the setup opens without a code, stores the settings, seals the secrets and restarts once
    Given the requests come directly from the home network
    When the setup status is asked
    Then the setup is required: true, with a code: false
    When the setup is unlocked without a code
    Then the response status is 204
    When the first setup is completed with:
      | name              | value                      |
      | PUBLIC_URL        | https://nfnn.cz            |
      | MAIL_HOST         | smtp-relay.brevo.com       |
      | MAIL_PORT         | 587                        |
      | MAIL_USERNAME     | bebb0c001@smtp-brevo.com   |
      | MAIL_PASSWORD     | xsmtpsib-key               |
      | MAIL_FROM         | info@nfnn.cz               |
      | CONTACT_RECIPIENT | info@nfnn.cz               |
      | FIO_TOKEN         | fio-read-only-token        |
      | ADMIN_EMAILS      | spravce@example.cz         |
    Then the response status is 202
    And the backend restarts once
    And the stored settings are "PUBLIC_URL, MAIL_HOST, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD, MAIL_FROM, CONTACT_RECIPIENT, FIO_TOKEN, ADMIN_EMAILS"
    And the stored "MAIL_HOST" is "smtp-relay.brevo.com"
    And the stored "MAIL_PASSWORD" is sealed
    And the stored "FIO_TOKEN" is sealed
    When the setup status is asked
    Then the setup is required: false, with a code: false

  Scenario: Through the proxy the setup needs the code from the container log
    Given the requests come through the proxy
    When the setup status is asked
    Then the setup is required: true, with a code: true
    When the setup is unlocked without a code
    Then the response status is 403
    And the problem type ends with "operations/setup-locked"
    When the setup is unlocked with the code "AAAA-BBBB-CCCC"
    Then the response status is 403
    When the setup is unlocked with the code from the container log
    Then the response status is 204
    When the first setup is completed with the code from the container log and:
      | name              | value                |
      | PUBLIC_URL        | https://nfnn.cz      |
      | MAIL_HOST         | smtp-relay.brevo.com |
      | MAIL_PORT         | 587                  |
      | MAIL_FROM         | info@nfnn.cz         |
      | CONTACT_RECIPIENT | info@nfnn.cz         |
      | ADMIN_EMAILS      | spravce@example.cz   |
    Then the response status is 202
    And the backend restarts once

  Scenario: A request that claims to be direct but comes from a public address needs the code
    Given the requests come directly from a public address
    When the setup status is asked
    Then the setup is required: true, with a code: true
    When the first setup is completed with:
      | name       | value           |
      | PUBLIC_URL | https://nfnn.cz |
    Then the response status is 403
    And the stored settings are ""

  Scenario: Malformed and missing values are refused with every problem named, nothing is stored and nothing restarts
    Given the requests come directly from the home network
    When the first setup is completed with:
      | name              | value              |
      | PUBLIC_URL        | nfnn.cz            |
      | MAIL_HOST         | smtp-relay.brevo.com |
      | MAIL_PORT         | 70000              |
      | MAIL_FROM         | info@nfnn.cz       |
      | CONTACT_RECIPIENT | ${JWT_SECRET}      |
    Then the response status is 400
    And the problem type ends with "operations/invalid-settings"
    And the problem names the settings "PUBLIC_URL, MAIL_PORT, CONTACT_RECIPIENT, ADMIN_EMAILS"
    And the stored settings are ""
    And the backend does not restart
    When the setup status is asked
    Then the setup is required: true, with a code: false

  Scenario: Settings that belong only to the administration are refused in the setup
    Given the requests come directly from the home network
    When the first setup is completed with:
      | name               | value |
      | RECEIPT_FIRST_YEAR | 2026  |
    Then the response status is 400
    And the stored settings are ""

  Scenario: A test e-mail goes through the typed server to the typed first administrator before anything is saved
    Given the requests come directly from the home network
    When a test e-mail is sent in the setup through "smtp.example.cz" with the password "right-key" from "info@nfnn.cz" to "spravce@example.cz"
    Then the test e-mail says "SENT" to "spravce@example.cz"
    When a test e-mail is sent in the setup through "smtp.example.cz" with the password "wrong-key" from "info@nfnn.cz" to "spravce@example.cz"
    Then the test e-mail says "SIGN_IN_REFUSED" to "spravce@example.cz"
    When a test e-mail is sent in the setup through "smtp.example.cz" with the password "right-key" from "neovereny@example.cz" to "spravce@example.cz"
    Then the test e-mail says "SENDER_REFUSED" to "spravce@example.cz"
    When a test e-mail is sent in the setup through "smtp.nowhere.example" with the password "right-key" from "info@nfnn.cz" to "spravce@example.cz"
    Then the test e-mail says "UNREACHABLE" to "spravce@example.cz"
    And the stored settings are ""
    And the backend does not restart

  Scenario: A test e-mail in the setup needs the code through the proxy and a valid sender and recipient
    Given the requests come through the proxy
    When a test e-mail is sent in the setup through "smtp.example.cz" with the password "right-key" from "info@nfnn.cz" to "spravce@example.cz"
    Then the response status is 403
    And the problem type ends with "operations/setup-locked"
    When a test e-mail is sent in the setup with the code from the container log through "smtp.example.cz" from "info@nfnn.cz" to "spravce@example.cz"
    Then the test e-mail says "SENT" to "spravce@example.cz"
    When a test e-mail is sent in the setup with the code from the container log through "smtp.example.cz" from "info@nfnn.cz" to "not-an-address"
    Then the response status is 400

  Scenario: Test e-mails in the setup are limited to 10 an hour from one address
    Given the requests come directly from the home network
    And 10 test e-mails were sent in the setup from this address
    When a test e-mail is sent in the setup through "smtp.example.cz" with the password "right-key" from "info@nfnn.cz" to "spravce@example.cz"
    Then the response status is 429
    And the problem type ends with "operations/rate-limited"
    When 60 minutes pass
    And a test e-mail is sent in the setup through "smtp.example.cz" with the password "right-key" from "info@nfnn.cz" to "spravce@example.cz"
    Then the test e-mail says "SENT" to "spravce@example.cz"

  Scenario: Once the setup is done, the setup answers that it is done to everyone
    Given the first setup was completed
    When the setup is unlocked without a code
    Then the response status is 409
    And the problem type ends with "operations/setup-completed"
    When a test e-mail is sent in the setup through "smtp.example.cz" with the password "right-key" from "info@nfnn.cz" to "spravce@example.cz"
    Then the response status is 409
    When the first setup is completed with:
      | name       | value                  |
      | PUBLIC_URL | https://evil.example.cz |
    Then the response status is 409
    And the stored "PUBLIC_URL" is "https://nfnn.cz"
    And the backend does not restart

  Scenario: Setup requests are limited to 20 per 15 minutes from one address
    Given the requests come through the proxy
    And 20 setup requests were made from this address
    When the setup is unlocked with the code from the container log
    Then the response status is 429
    When 15 minutes pass
    And the setup is unlocked with the code from the container log
    Then the response status is 204
