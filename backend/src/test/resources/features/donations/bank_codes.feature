@donations
Feature: A signed-in person reads the Czech bank codes to name the bank beside an account number

  Scenario: Before the first fetch from the ČNB the list is empty
    Given a person "Jana" is registered
    When "Jana" asks for the bank codes
    Then the response status is 200
    And the bank codes were never fetched and none are listed

  Scenario: A donor reads the stored list sorted by code with the time it was fetched
    Given the bank code list fetched at "2026-11-02T04:40:00Z" holds:
      | code | name                             |
      | 2010 | Fio banka, a.s.                  |
      | 0800 | Česká spořitelna, a.s.           |
      | 0100 | Komerční banka, a.s.             |
    And a person "Jana" is registered
    When "Jana" asks for the bank codes
    Then the response status is 200
    And the bank codes fetched at "2026-11-02T04:40:00Z" are:
      | code | name                   |
      | 0100 | Komerční banka, a.s.   |
      | 0800 | Česká spořitelna, a.s. |
      | 2010 | Fio banka, a.s.        |

  Scenario: Someone without a token gets no list
    When someone without a token asks for the bank codes
    Then the response status is 401
