@donors
Feature: Visitor registering a company gets its name and seat from the business register

  Scenario: A company the register knows comes back with its name and seat, without signing in
    Given the business register knows the company "45274649" named "ČEZ, a. s." seated at "Duhová 1444/2", "140 00" "Praha 4"
    When a visitor looks up the company "452 746 49"
    Then the response status is 200
    And the looked-up company is "45274649" named "ČEZ, a. s." seated at "Duhová 1444/2", "140 00" "Praha 4"

  Scenario: A company the register knows without a usable seat comes back with its name only
    Given the business register knows the company "45274649" named "ČEZ, a. s." without a seat
    When a visitor looks up the company "45274649"
    Then the response status is 200
    And the looked-up company is "45274649" named "ČEZ, a. s." without an address

  Scenario: A valid identifier the register does not know answers with no content
    When a visitor looks up the company "10000011"
    Then the response status is 204
    And the business register was asked 1 time

  Scenario: A register that is down answers exactly like an unknown company
    Given the business register knows the company "45274649" named "ČEZ, a. s." seated at "Duhová 1444/2", "140 00" "Praha 4"
    And the business register is down
    When a visitor looks up the company "45274649"
    Then the response status is 204

  Scenario: After three failures in a row the register is left alone for five minutes
    Given the business register knows the company "45274649" named "ČEZ, a. s." seated at "Duhová 1444/2", "140 00" "Praha 4"
    And the business register is down
    And a visitor looked up the company "45274649" 3 times
    When the business register is up again
    And a visitor looks up the company "45274649"
    Then the response status is 204
    And the business register was asked 3 times
    When 5 minutes pass
    And a visitor looks up the company "45274649"
    Then the response status is 200
    And the business register was asked 4 times

  Scenario Outline: An identifier that cannot exist is refused before the register is asked
    When a visitor looks up the company "<identifier>"
    Then the response status is 400
    And the problem lists an error for field "companyIdentifier"
    And the business register was asked 0 times

    Examples:
      | identifier |
      | 45274648   |
      | 4527464    |
      | 4527464A   |
      |            |

  Scenario: The twenty-first lookup within 15 minutes from one address is refused before the register is asked
    Given the business register knows the company "45274649" named "ČEZ, a. s." seated at "Duhová 1444/2", "140 00" "Praha 4"
    And a visitor looked up the company "45274649" 20 times
    When a visitor looks up the company "45274649"
    Then the response status is 429
    And the problem type ends with "donors/rate-limited"
    And the business register was asked 20 times
    When the following requests come from another client address
    And a visitor looks up the company "45274649"
    Then the response status is 200
