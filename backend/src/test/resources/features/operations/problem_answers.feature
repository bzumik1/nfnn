@operations
Feature: A refused request is answered in the client's language without exception text or what the client sent

  Background:
    Given today is 2026-10-23
    And a person "Jana" is registered

  Scenario Outline: <case> is answered with the site's own texts
    When "Jana" sends <method> "<path>" as "<content type>" with the body '<body>'
    Then the response status is <status>
    And the problem says "<title>": "<detail>"
    And the problem does not repeat "<sent>"

    Examples:
      | case                                     | method | path                       | content type                  | body               | status | title                    | detail                                                                                 | sent                      |
      | A body of a type the address cannot read | POST   | /api/contact/messages      | text/x-nfnn-client-value      | {}                 | 415    | Nepodporovaný formát dat | Tato adresa data v tomto formátu nepřijímá.                                            | nfnn-client-value         |
      | A method the address does not take       | DELETE | /api/content/news          |                               |                    | 405    | Nepovolená metoda        | Tato adresa takový požadavek nepřijímá.                                                | DELETE                    |
      | An address with nothing behind it        | GET    | /api/donors/nfnn-client-value |                            |                    | 404    | Nenalezeno               | Na této adrese nic není.                                                               | nfnn-client-value         |

  Scenario Outline: <case> is refused before any endpoint, with the site's own texts and without the address
    When "Jana" sends <method> "<path>" as "" with the body ''
    Then the response status is 400
    And the problem type ends with "validation"
    And the problem says "Neplatné údaje": "Požadavek má tvar, který web nepřijímá. Zkontrolujte prosím adresu a způsob odeslání."
    And the answer is stored nowhere and not sniffed
    And the problem does not repeat "nfnn-client-value"

    Examples:
      | case                              | method            | path                                 |
      | A semicolon in the address        | GET               | /api/content/news;nfnn-client-value  |
      | A double slash in the address     | GET               | /api/content//nfnn-client-value      |
      | An encoded percent in the address | GET               | /api/content/news%25nfnn-client-value |
