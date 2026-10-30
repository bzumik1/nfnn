@operations
Feature: The request line, the query string and the parameters a client chose reach no log, at any level an administrator can set

  The frontend nginx passes { } | ^ \ ` " < > in a request target on unchanged, and percent-encodings in the query or a form body
  undecoded; Tomcat refuses a target it cannot read with 400, and a parameter it cannot decode throws when the controller reads it.
  Spring logs the method, the path and the query of every request at DEBUG, so those loggers are pinned at INFO.

  Scenario Outline: A target with a character Tomcat refuses is answered 400 and no log line holds its query string
    When a client sends this request target straight to the backend
      """
      <target>
      """
    Then the response status is 400
    And the backend logged no line holding "<canary>"
    And the backend logged no error

    Examples:
      | target                     | canary   |
      | /api/x?q=Qkzw1501{}^`"<>   | Qkzw1501 |
      | /api/x{Zxqv}?q=Qkzw1502    | Qkzw1502 |
      | /api/x%ZZQkzw1610          | Qkzw1610 |

  Scenario Outline: The query string reaches no log line even while every logger an administrator can raise is at its loudest
    When a client sends this request target straight to the backend while every logger an administrator can raise is at its loudest
      """
      <target>
      """
    Then the response status is 400
    And the backend logged no line holding "<canary>"
    And the backend logged no error

    Examples:
      | target                     | canary   |
      | /api/x?q=Qkzw1503{}^`"<>   | Qkzw1503 |
      | /api/x{Zxqv}?q=Qkzw1504    | Qkzw1504 |
      | /api/x;m=%ZZ?q=Qkzw1505    | Qkzw1505 |

  Scenario Outline: A request target Tomcat refuses for an encoding it cannot decode is a validation problem, logs no error and reaches no log line
    When a client sends this request target straight to the backend
      """
      <target>
      """
    Then the response status is 400
    And the backend logged no line holding "<canary>"
    And the backend logged no error
    And the raw answer is a validation problem

    Examples:
      | case              | target                            | canary   |
      | a bad encoding    | /api/x;m=%ZZQkzw1606              | Qkzw1606 |
      | on a real path    | /api/content/news;m=%ZZQkzw1607   | Qkzw1607 |

  Scenario Outline: A request target Tomcat refuses for an encoding it cannot decode logs no error and reaches no log line while every logger an administrator can raise is at its loudest
    When a client sends this request target straight to the backend while every logger an administrator can raise is at its loudest
      """
      <target>
      """
    Then the response status is 400
    And the backend logged no line holding "<canary>"
    And the backend logged no error
    And the raw answer is a validation problem

    Examples:
      | case              | target                            | canary   |
      | a bad encoding    | /api/x;m=%ZZQkzw1608              | Qkzw1608 |
      | on a real path    | /api/content/news;m=%ZZQkzw1609   | Qkzw1609 |

  Scenario Outline: A query parameter Tomcat cannot decode is a validation problem and reaches no log line
    When a client sends this request target straight to the backend
      """
      <target>
      """
    Then the response status is 400
    And the backend logged no line holding "<canary>"
    And the raw answer is a validation problem
    And the backend logged no error

    Examples:
      | case           | target                                                                       | canary   |
      | a bad value    | /api/content/news?page=%ZZQkzw1511                                           | Qkzw1511 |
      | a bad name     | /api/content/news?Qkzw1512%ZZ=1                                              | Qkzw1512 |
      | a forged line  | /api/content/news?page=0&q=%C3%28%0D%0A2026-10-30T00:00:00Z%20ERROR%20Qkzw1513 | Qkzw1513 |

  Scenario Outline: A query parameter Tomcat cannot decode reaches no log line while every logger an administrator can raise is at its loudest
    When a client sends this request target straight to the backend while every logger an administrator can raise is at its loudest
      """
      <target>
      """
    Then the response status is 400
    And the backend logged no line holding "<canary>"
    And the raw answer is a validation problem
    And the backend logged no error

    Examples:
      | case           | target                                                                       | canary   |
      | a bad value    | /api/content/news?page=%ZZQkzw1514                                           | Qkzw1514 |
      | a bad name     | /api/content/news?Qkzw1515%ZZ=1                                              | Qkzw1515 |
      | a forged line  | /api/content/news?page=0&q=%C3%28%0D%0A2026-10-30T00:00:00Z%20ERROR%20Qkzw1516 | Qkzw1516 |

  Scenario Outline: A form body Tomcat cannot decode is a validation problem and reaches no log line
    When a client posts this form straight to "/api/donors/oauth/token"
      """
      <form>
      """
    Then the response status is 400
    And the backend logged no line holding "<canary>"
    And the raw answer is a validation problem
    And the backend logged no error

    Examples:
      | case        | form                                  | canary   |
      | a bad value | grant_type=%ZZQkzw1521                | Qkzw1521 |
      | a bad name  | grant_type=refresh_token&Qkzw1522%ZZ=1 | Qkzw1522 |

  Scenario Outline: A form body Tomcat cannot decode reaches no log line while every logger an administrator can raise is at its loudest
    When a client posts this form straight to "/api/donors/oauth/token" while every logger an administrator can raise is at its loudest
      """
      <form>
      """
    Then the response status is 400
    And the backend logged no line holding "<canary>"
    And the raw answer is a validation problem
    And the backend logged no error

    Examples:
      | case        | form                                  | canary   |
      | a bad value | grant_type=%ZZQkzw1523                | Qkzw1523 |
      | a bad name  | grant_type=refresh_token&Qkzw1524%ZZ=1 | Qkzw1524 |

  Scenario Outline: A query string and the client address reach no log line on any kind of answer while every logger an administrator can raise is at its loudest
    Given the following requests come from the client address "203.0.113.214"
    When an anonymous client asks for "<path>" while every logger an administrator can raise is at its loudest
    Then the response status is <status>
    And the backend logged no line holding "<canary>"
    And the backend logged no line holding "203.0.113.214"
    And the backend logged no error

    Examples:
      | path                              | status | canary   |
      | /api/content/news?q=Qkzw1531      | 200    | Qkzw1531 |
      | /api/donors/me?q=Qkzw1532         | 401    | Qkzw1532 |
      | /api/nowhere?q=Qkzw1533           | 401    | Qkzw1533 |

  Scenario Outline: A signed-in donor's query string, access token and address reach no log line while every logger an administrator can raise is at its loudest
    Given a person "Jana" is registered
    And the following requests come from the client address "203.0.113.215"
    When "Jana" asks for "<path>" while every logger an administrator can raise is at its loudest
    Then the response status is <status>
    And the backend logged no line holding "<canary>"
    And the backend logged no line holding the access token of "Jana"
    And the backend logged no line holding "203.0.113.215"
    And the backend logged no error

    Examples:
      | path                                       | status | canary   |
      | /api/donors/me?q=Qkzw1541                  | 200    | Qkzw1541 |
      | /api/admin/operations/diagnostics?q=Qkzw1542 | 403  | Qkzw1542 |
      | /api/donors/nowhere?q=Qkzw1543             | 404    | Qkzw1543 |

  Scenario: An administrator's query string, access token and address reach no log line while every logger an administrator can raise is at its loudest
    Given a person "Jana" is registered
    And "Jana" is an administrator
    And the following requests come from the client address "203.0.113.216"
    When "Jana" asks for "/api/admin/operations/diagnostics?q=Qkzw1551" while every logger an administrator can raise is at its loudest
    Then the response status is 200
    And the backend logged no line holding "Qkzw1551"
    And the backend logged no line holding the access token of "Jana"
    And the backend logged no line holding "203.0.113.216"
    And the backend logged no error

  Scenario Outline: The method, the path, a value and a media type a client chose reach no log line while every logger an administrator can raise is at its loudest
    When a client sends this request straight to the backend while every logger an administrator can raise is at its loudest
      """
      <request line>
      <header>

      <body>
      """
    Then the response status is <status>
    And the backend logged no line holding "<canary>"
    And the backend logged no error

    Examples:
      | case           | request line                                   | header                   | body | status | canary   |
      | a method       | QKZW1561 /api/content/news                     | Accept: application/json |      | 400    | QKZW1561 |
      | a path         | GET /api/content/news/qkzw1562                 | Accept: application/json |      | 404    | qkzw1562 |
      | a wrong type   | GET /api/content/news?page=abcQkzw1563         | Accept: application/json |      | 400    | Qkzw1563 |
      | a media type   | POST /api/contact/messages                     | Content-Type: text/qkzw1564 | x | 415    | qkzw1564 |
      | a cookie       | GET /api/content/news                          | Cookie: Qkzw1581=x y     |      | 200    | Qkzw1581 |
      | a forged cookie | GET /api/content/news                         | Cookie: a="2026-10-30T00:00:00Z ERROR Qkzw1582 | | 200 | Qkzw1582 |
      | a PUT form     | PUT /api/content/news                          | Content-Type: application/x-www-form-urlencoded | a=%ZZQkzw1583 | 401 | Qkzw1583 |
      | a PATCH form   | PATCH /api/donors/me                           | Content-Type: application/x-www-form-urlencoded | Qkzw1584%ZZ=1 | 401 | Qkzw1584 |
      | a DELETE form  | DELETE /api/content/news                       | Content-Type: application/x-www-form-urlencoded | b=%Qkzw1585 | 401 | Qkzw1585 |

  Scenario Outline: A cookie and a form body a client chose reach no log line and log no error at the configured levels
    When a client sends this request straight to the backend
      """
      <request line>
      <header>

      <body>
      """
    Then the response status is <status>
    And the backend logged no line holding "<canary>"
    And the backend logged no error

    Examples:
      | case             | request line               | header                                               | body          | status | canary   |
      | a cookie         | GET /api/content/news      | Cookie: Qkzw1587=x y                                 |               | 200    | Qkzw1587 |
      | a forged cookie  | GET /api/content/news      | Cookie: a="2026-10-30T00:00:00Z ERROR Qkzw1588       |               | 200    | Qkzw1588 |
      | a PUT form       | PUT /api/content/news      | Content-Type: application/x-www-form-urlencoded      | a=%ZZQkzw1589 | 401    | Qkzw1589 |
      | a PATCH form     | PATCH /api/donors/me       | Content-Type: application/x-www-form-urlencoded      | Qkzw1590%ZZ=1 | 401    | Qkzw1590 |
      | a DELETE form    | DELETE /api/content/news   | Content-Type: application/x-www-form-urlencoded      | b=%Qkzw1591   | 401    | Qkzw1591 |

  Scenario: A signed-in donor's undecodable form body on PATCH is refused without an error at the configured levels
    Given a person "Jana" is registered
    When "Jana" sends this request straight to the backend
      """
      PATCH /api/donors/me
      Content-Type: application/x-www-form-urlencoded

      name=%ZZQkzw1593
      """
    Then the response status is 415
    And the backend logged no line holding "Qkzw1593"
    And the backend logged no error

  Scenario: A signed-in donor's undecodable form body on PATCH is refused without an error at the loudest levels
    Given a person "Jana" is registered
    When "Jana" sends this request straight to the backend while every logger an administrator can raise is at its loudest
      """
      PATCH /api/donors/me
      Content-Type: application/x-www-form-urlencoded

      name=%ZZQkzw1594
      """
    Then the response status is 415
    And the backend logged no line holding "Qkzw1594"
    And the backend logged no error

  Scenario: A multipart body that cannot be parsed is a validation problem and logs no error
    When a client sends this request straight to the backend
      """
      POST /api/contact/messages
      Content-Type: multipart/form-data; boundary=Qkzw1595

      --Qkzw1595
      Content-Disposition: form-data; name="Qkzw1596"

      Qkzw1597
      """
    Then the response status is 400
    And the raw answer is a validation problem
    And the backend logged no line holding "Qkzw1595"
    And the backend logged no line holding "Qkzw1596"
    And the backend logged no line holding "Qkzw1597"
    And the backend logged no error

  Scenario: A multipart body that cannot be parsed logs no error and no text of it while every logger an administrator can raise is at its loudest
    When a client sends this request straight to the backend while every logger an administrator can raise is at its loudest
      """
      POST /api/contact/messages
      Content-Type: multipart/form-data; boundary=Qkzw1598

      --Qkzw1598
      Content-Disposition: form-data; name="Qkzw1599"

      Qkzw1600
      """
    Then the response status is 400
    And the raw answer is a validation problem
    And the backend logged no line holding "Qkzw1598"
    And the backend logged no line holding "Qkzw1599"
    And the backend logged no line holding "Qkzw1600"
    And the backend logged no error

  Scenario: A part over the size limit is refused and no log line holds its field name while every logger an administrator can raise is at its loudest
    When a client posts a file of 10700 kB in a part named "Qkzw1601" to "/api/contact/messages" while every logger an administrator can raise is at its loudest
    Then the response status is 413
    And the backend logged no line holding "Qkzw1601"
    And the backend logged no error

  Scenario: A method a client chose reaches no log line at the configured levels
    When a client sends this request straight to the backend
      """
      QKZW1565 /api/content/news
      """
    Then the response status is 400
    And the backend logged no line holding "QKZW1565"

