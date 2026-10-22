Feature: Visitor sends a contact message

  Scenario: Valid message is accepted and forwarded to the foundation
    Given the email server accepts messages
    When the visitor submits a contact message
      | fullName | Jana Nováková                   |
      | email    | jana@example.cz                 |
      | message  | Mám dotaz k projektu Dominik.   |
    Then the response status is 202
    And one email is delivered to "info@nfnn.cz"
    And the email comes from "info@nfnn.cz" named "Nová naděje – nadační fond"
    And the email can be answered to "jana@example.cz"
    And the email mentions "Jana Nováková" and "Mám dotaz k projektu Dominik."
    And the message is stored

  Scenario: Honeypot blocks a bot
    Given the email server accepts messages
    When the visitor submits a contact message with a non-empty "website" field
    Then the response status is 202
    And no email is sent
    And no message is stored

  Scenario: Incomplete message is rejected with field errors
    When the visitor submits a contact message
      | fullName |                 |
      | email    | not-an-email    |
      | message  | Dobrý den       |
    Then the response status is 400
    And the problem lists errors for fields "fullName" and "email"
    And no message is stored

  Scenario: Sixth message within an hour from one address is refused
    Given the visitor already sent 5 contact messages within the last hour
    When the visitor submits a contact message
      | fullName | Jana Nováková   |
      | email    | jana@example.cz |
      | message  | Ještě jedna.    |
    Then the response status is 429
    And the problem type ends with "contact/rate-limited"
