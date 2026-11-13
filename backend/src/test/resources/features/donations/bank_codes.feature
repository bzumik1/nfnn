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

  Scenario: A list the ČNB publishes is stored and served with the time it was fetched
    Given the ČNB publishes 20 bank codes last modified "Fri, 25 Sep 2026 11:10:55 GMT"
    And a person "Jana" is registered
    When the bank code list is refreshed
    And "Jana" asks for the bank codes
    Then the response status is 200
    And the bank codes fetched at "2026-11-04T09:00:00Z" are 20, from "0000" "Banka 0, a.s." to "0019" "Banka 19, a.s."

  Scenario: A list the ČNB has not changed keeps the time it was fetched
    Given the ČNB publishes 20 bank codes last modified "Fri, 25 Sep 2026 11:10:55 GMT"
    And the bank code list is refreshed
    And a person "Jana" is registered
    When 8 days pass
    And the bank code list is refreshed
    And "Jana" asks for the bank codes
    Then the ČNB was asked whether the list changed since "Fri, 25 Sep 2026 11:10:55 GMT"
    And the bank code list was last checked at "2026-11-12T09:00:00Z"
    And the bank codes fetched at "2026-11-04T09:00:00Z" are 20, from "0000" "Banka 0, a.s." to "0019" "Banka 19, a.s."

  Scenario: A failing ČNB leaves the stored list as it was
    Given the ČNB publishes 20 bank codes last modified "Fri, 25 Sep 2026 11:10:55 GMT"
    And the bank code list is refreshed
    And a person "Jana" is registered
    When 8 days pass
    And the ČNB answers the bank codes with status 503
    And the bank code list is refreshed
    And "Jana" asks for the bank codes
    Then the bank code refresh failed with status 503
    And the bank code list was last checked at "2026-11-04T09:00:00Z"
    And the bank codes fetched at "2026-11-04T09:00:00Z" are 20, from "0000" "Banka 0, a.s." to "0019" "Banka 19, a.s."
