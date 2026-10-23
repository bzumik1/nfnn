Feature: Visitor gets a QR payment for a donation

  Scenario: Donor's QR payment carries their variable symbol
    When the visitor asks for a QR payment of 500 CZK with variable symbol "1234567890"
    Then the response status is 200
    And the QR payment reads "SPD*1.0*ACC:CZ2620100000005544332217*AM:500.00*CC:CZK*X-VS:1234567890*RN:NADACNI FOND NOVA NADEJE*MSG:DAR NADACNI FOND NOVA NADEJE"
    And the QR code modules encode the QR payment
    And the foundation's bank account is "5544332217/2010" with IBAN "CZ2620100000005544332217" held by "Nadační fond Nová naděje"

  Scenario: Anonymous visitor's QR payment has no variable symbol
    When the visitor asks for a QR payment of 1000 CZK
    Then the response status is 200
    And the QR payment contains "ACC:CZ2620100000005544332217*AM:1000.00*CC:CZK"
    And the QR payment has no variable symbol

  Scenario: The QR payment that verifies a donor's account says so in the message
    When the visitor asks for a QR payment with parameters "amount=1&variableSymbol=1234567890&purpose=ACCOUNT_VERIFICATION"
    Then the response status is 200
    And the QR payment reads "SPD*1.0*ACC:CZ2620100000005544332217*AM:1.00*CC:CZK*X-VS:1234567890*RN:NADACNI FOND NOVA NADEJE*MSG:OVERENI UCTU NADACNI FOND NOVA NADEJE"
    And the QR code modules encode the QR payment

  Scenario: A QR payment that verifies an account needs the donor's variable symbol
    When the visitor asks for a QR payment with parameters "amount=1&purpose=ACCOUNT_VERIFICATION"
    Then the response status is 400
    And the problem type ends with "donations/verification-needs-variable-symbol"

  Scenario: A purpose the foundation does not know is rejected
    When the visitor asks for a QR payment with parameters "amount=1&purpose=GIFT"
    Then the response status is 400
    And the problem lists an error for field "purpose"

  Scenario Outline: Amount that is not a whole number of crowns from 1 to 1 000 000 is rejected
    When the visitor asks for a QR payment with amount "<amount>"
    Then the response status is 400
    And the problem lists an error for field "amount"

    Examples:
      | amount  |
      | 0       |
      | 1000001 |
      | abc     |
      | 12.50   |

  Scenario: Missing amount is rejected
    When the visitor asks for a QR payment without an amount
    Then the response status is 400
    And the problem lists an error for field "amount"

  Scenario: Variable symbol that is not up to ten digits is rejected
    When the visitor asks for a QR payment of 500 CZK with variable symbol "12345678901"
    Then the response status is 400
    And the problem lists an error for field "variableSymbol"
