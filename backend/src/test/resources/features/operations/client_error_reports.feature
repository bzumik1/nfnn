@operations
Feature: A browser reports a failure as closed values only, which reach the log as one line

  Scenario: A report is accepted without a token and logged as one line of its values
    When a browser reports an error
      | kind        | pdf-render |
      | place       | global     |
      | name        | TypeError  |
      | appVersion  | dev        |
      | browser     | safari     |
      | browserMajor | 18        |
      | os          | ios        |
      | display     | standalone |
      | count       | 2          |
    Then the response status is 204
    And the browser error log holds exactly the line "Browser error kind=pdf-render place=global name=TypeError version=dev browser=safari/18 os=ios display=standalone count=2"

  Scenario: A browser without a known major version is logged by its family alone
    When a browser reports an error
      | kind       | unexpected |
      | place      | global     |
      | name       | Error      |
      | appVersion | dev        |
      | browser    | other      |
      | os         | other      |
      | display    | browser    |
      | count      | 1          |
    Then the response status is 204
    And the browser error log holds exactly the line "Browser error kind=unexpected place=global name=Error version=dev browser=other os=other display=browser count=1"

  Scenario Outline: A value outside its list or range is refused at its field and logs nothing
    When a browser reports an error with "<field>" set to "<value>"
    Then the response status is 400
    And the problem type ends with "validation"
    And the problem lists an error for field "<field>"
    And the browser error log holds no line

    Examples:
      | field        | value                     |
      | kind         | pdf                       |
      | kind         | PDF-RENDER                |
      | place        | receipt.draw              |
      | place        | Zxqv Kanárek              |
      | name         | Error: 7781,77 Kč         |
      | appVersion   | 1A2B3C4                   |
      | appVersion   | 1a2b3c                    |
      | appVersion   | 2099-778177               |
      | browser      | chromium                  |
      | browserMajor | 0                         |
      | browserMajor | 1000                      |
      | os           | ubuntu                    |
      | display      | fullscreen                |
      | count        | 0                         |
      | count        | 101                       |

  Scenario Outline: A required value that is missing is refused at its field
    When a browser reports an error without "<field>"
    Then the response status is 400
    And the problem lists an error for field "<field>"
    And the browser error log holds no line

    Examples:
      | field      |
      | kind       |
      | place      |
      | name       |
      | appVersion |
      | browser    |
      | os         |
      | display    |
      | count      |

  Scenario: A line break inside a value is refused, so no forged line can enter the log
    When a browser sends the raw report '{"kind":"unexpected\r\nWARN forged line","place":"global","name":"Error","appVersion":"dev","browser":"chrome","browserMajor":131,"os":"android","display":"browser","count":1}'
    Then the response status is 400
    And the raw refusal lists an error for field "kind"
    And the browser error log holds no line

  Scenario: A field the report does not know is never logged
    When a browser sends the raw report '{"kind":"unexpected","place":"global","name":"Error","appVersion":"dev","browser":"chrome","browserMajor":131,"os":"android","display":"browser","count":1,"message":"Zxqv Kanárek 7781,77 Kč 2099-778177"}'
    Then the response status is 204
    And the browser error log holds exactly the line "Browser error kind=unexpected place=global name=Error version=dev browser=chrome/131 os=android display=browser count=1"

  Scenario: A report sent as a form is refused, so a page on another site cannot post one
    When a browser sends the report as a form
    Then the response status is 415
    And the browser error log holds no line

  Scenario: The 31st report within 15 minutes from one client address is refused
    When 30 browser errors of kind "unexpected" arrive from this client address
    And a browser reports an error of kind "unexpected"
    Then the response status is 429
    And the problem type ends with "operations/rate-limited"
    And the browser error log holds 30 lines

  Scenario: The per-address window opens again after 15 minutes
    When 30 browser errors of kind "unexpected" arrive from this client address
    And 15 minutes pass
    And a browser reports an error of kind "unexpected"
    Then the response status is 204
    And the browser error log holds 31 lines

  Scenario: Over the hourly cap a report is dropped quietly, a protected kind keeps its own bucket and the hour ends with one count
    When 100 browser errors of kind "unexpected" arrive from 4 client addresses
    And the following requests come from another client address
    And a browser reports an error of kind "unexpected"
    And a browser reports an error of kind "chunk-load"
    Then the response status is 204
    And the browser error log holds 100 lines
    When a browser reports an error of kind "pdf-render"
    And a browser reports an error of kind "pdf-load"
    And a browser reports an error of kind "verify-signature"
    Then the response status is 204
    And the browser error log holds 103 lines
    When the hour of the browser error cap ends
    Then the browser error log ends with the line "Browser error reports over the hourly cap bucket=general dropped=2"

  Scenario: A protected bucket fills on its own and leaves the general bucket open
    When 30 browser errors of kind "pdf-render" arrive from this client address
    And the following requests come from another client address
    And a browser reports an error of kind "pdf-render"
    And a browser reports an error of kind "unexpected"
    Then the response status is 204
    And the browser error log holds 31 lines
    When the hour of the browser error cap ends
    Then the browser error log ends with the line "Browser error reports over the hourly cap bucket=pdf-render dropped=1"

  Scenario: A new hour opens the cap again
    When 100 browser errors of kind "unexpected" arrive from 4 client addresses
    And the hour of the browser error cap ends
    And the following requests come from another client address
    And a browser reports an error of kind "unexpected"
    Then the response status is 204
    And the browser error log holds 101 lines
