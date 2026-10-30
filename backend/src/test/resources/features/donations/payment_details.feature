@donations
Feature: Visitor gets the foundation's payment details to build a QR payment in the browser

  Scenario: A visitor gets the payment details without signing in, and the browser may keep them for five minutes
    When a visitor asks for the payment details
    Then the response status is 200
    And the payment details name the account "5544332217/2010" with IBAN "CZ2620100000005544332217" in "CZK"
    And the payment details send the recipient as "NADACNI FOND NOVA NADEJE"
    And the payment details send the donation message "DAR NADACNI FOND NOVA NADEJE" and the account verification message "OVERENI UCTU NADACNI FOND NOVA NADEJE"
    And the payment details verify an account with 100 minor CZK
    And the answer may be kept by the visitor's browser only, for 300 seconds
    And the answer's ETag is the SHA-256 of its body
    And the answer sets no cookie

  Scenario: The recipient and each message are what today's QR payment sends for its purpose
    When a visitor asks for the payment details
    And the visitor also asks for a QR payment of 500 CZK
    Then the recipient and the donation message of the payment details are the RN and MSG of that QR payment
    When the visitor asks for a QR payment that verifies an account with variable symbol "1234567890" for the verification amount of the payment details
    Then the recipient and the account verification message of the payment details are the RN and MSG of that QR payment
    And that QR payment's amount is the verification amount of the payment details

  Scenario: A signed-in donor gets the same answer as a visitor
    Given a person "Jana" is registered
    When a visitor asks for the payment details
    And "Jana" asks for the payment details
    Then the response status is 200
    And the answer is the visitor's answer with the same ETag

  Scenario: A browser that already holds the answer is told it has not changed
    When a visitor asks for the payment details
    And the visitor asks for the payment details again with the ETag it was given
    Then the response status is 304
    And the answer has no body
    And the answer carries the same ETag
    And the answer may be kept by the visitor's browser only, for 300 seconds

  Scenario: A browser that holds an older answer gets the current one
    When a visitor asks for the payment details again with the ETag "\"0000000000000000000000000000000000000000000000000000000000000000\""
    Then the response status is 200
    And the payment details name the account "5544332217/2010" with IBAN "CZ2620100000005544332217" in "CZK"
    And the answer's ETag is the SHA-256 of its body

  Scenario: The payment details are limited to 120 requests per 15 minutes from one client address
    Given a visitor asked for the payment details 120 times
    When a visitor asks for the payment details
    Then the response status is 429
    And the problem type ends with "donations/rate-limited"
    And the answer is not stored by the browser
    When the following requests come from another client address
    And a visitor asks for the payment details
    Then the response status is 200

  Scenario: The window of the limit closes 15 minutes after the address's first request
    Given a visitor asked for the payment details 120 times
    When 15 minutes pass
    And a visitor asks for the payment details
    Then the response status is 200
