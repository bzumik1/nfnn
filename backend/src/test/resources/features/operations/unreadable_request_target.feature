@operations
Feature: A request target the backend cannot read is refused without its query string reaching a log

  The frontend nginx passes { } | ^ \ ` " < > in a request target on unchanged; Tomcat refuses such a target with 400.

  Scenario Outline: A target with a character Tomcat refuses is answered 400 and no log line holds its query string
    When a client sends this request target straight to the backend
      """
      <target>
      """
    Then the response status is 400
    And the backend logged no line holding "<canary>"

    Examples:
      | target                     | canary   |
      | /api/x?q=Qkzw1501{}^`"<>   | Qkzw1501 |
      | /api/x{Zxqv}?q=Qkzw1502    | Qkzw1502 |

  Scenario Outline: The query string reaches no log line even while every logger an administrator can raise is at its loudest
    When a client sends this request target straight to the backend while every logger an administrator can raise is at its loudest
      """
      <target>
      """
    Then the response status is 400
    And the backend logged no line holding "<canary>"

    Examples:
      | target                     | canary   |
      | /api/x?q=Qkzw1503{}^`"<>   | Qkzw1503 |
      | /api/x{Zxqv}?q=Qkzw1504    | Qkzw1504 |
