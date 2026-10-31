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

  Scenario: A signed-in donor gets the same answer as a visitor
    Given a person "Jana" is registered
    When a visitor asks for the payment details
    And "Jana" asks for the payment details
    Then the response status is 200
    And the answer is the visitor's answer with the same ETag
    And the answer may be kept by the visitor's browser only, for 300 seconds
    And the answer sets no cookie

  Scenario: A request that carries a malformed bearer token is refused before the public answer applies
    When a browser that sends the bearer token "not-a-jwt" asks for the payment details
    Then the response status is 401
    And the problem type ends with "auth/unauthenticated"
    And the answer is not stored by the browser

  Scenario: A request that carries an expired bearer token is refused before the public answer applies
    Given a person "Jana" is registered
    And "Jana" asks for the payment details
    When 20 minutes pass
    And "Jana" asks for the payment details again with the access token she was given then
    Then the response status is 401
    And the problem type ends with "auth/expired-token"
    And the answer is not stored by the browser

  Scenario: A browser that already holds the answer is told it has not changed
    When a visitor asks for the payment details
    And the visitor asks for the payment details again with the ETag it was given
    Then the response status is 304
    And the answer has no body
    And the answer carries the same ETag
    And the answer may be kept by the visitor's browser only, for 300 seconds

  Scenario: A browser that holds the answer under the weak ETag the frontend's gzip gives it is told it has not changed
    When a visitor asks for the payment details
    And the visitor asks for the payment details again with the ETag it was given, marked weak
    Then the response status is 304
    And the answer carries the same ETag

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
