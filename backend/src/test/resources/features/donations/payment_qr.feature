Feature: Visitor gets a QR payment for a donation

  Scenario: Donor's QR payment carries their variable symbol
    When the visitor asks for a QR payment of 500 CZK with variable symbol "1234567890"
    Then the response status is 200
    And the QR payment reads "SPD*1.0*ACC:CZ2620100000005544332217*AM:500.00*CC:CZK*X-VS:1234567890*RN:NADACNI FOND NOVA NADEJE*MSG:DAR NOVA NADEJE"
    And the QR code is a PNG image that encodes the QR payment
    And the foundation's bank account is "5544332217/2010" with IBAN "CZ2620100000005544332217" held by "Nadační fond Nová naděje"

  Scenario: Anonymous visitor's QR payment has no variable symbol
    When the visitor asks for a QR payment of 1000 CZK
    Then the response status is 200
    And the QR payment contains "ACC:CZ2620100000005544332217*AM:1000.00*CC:CZK"
    And the QR payment has no variable symbol

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
