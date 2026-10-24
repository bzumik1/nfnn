@operations
Feature: An administrator reads the server logs, raises a log level for a while and sees the diagnostics

  Background:
    Given today is 2026-10-23
    And a person "Jana" is registered
    And "Jana" is an administrator
    And the log folder holds "backend.log" with the lines:
      """
      2026-10-23T10:00:00 INFO first line
      2026-10-23T10:00:01 WARN second line about Fio
      2026-10-23T10:00:02 INFO third line
      """

  Scenario: The log files are listed and a log is read as a window of whole lines, the end by default
    Given the log folder holds "backend.log.2026-10-22.0.gz" compressed with the lines:
      """
      older first
      older second
      """
    When "Jana" asks for the log files
    Then the response status is 200
    And the logs answer says:
      | available          | true                        |
      | files.0.name       | backend.log                 |
      | files.0.compressed | false                       |
      | files.1.name       | backend.log.2026-10-22.0.gz |
      | files.1.compressed | true                        |
    When "Jana" reads the log "backend.log"
    Then the response status is 200
    And the logs answer says:
      | from     | 0     |
      | to       | 119   |
      | hasOlder | false |
      | hasNewer | false |
    And the log text holds "first line" and "third line"
    When "Jana" reads the log "backend.log" from byte 10 for 50 bytes
    Then the response status is 200
    And the logs answer says:
      | from     | 36   |
      | to       | 83   |
      | hasOlder | true |
      | hasNewer | true |
    And the log text holds "second line about Fio" and not "third line"
    When "Jana" reads the log "backend.log.2026-10-22.0.gz" from byte 12 for 100 bytes
    Then the response status is 200
    And the logs answer says:
      | sizeBytes | 25 |
      | from      | 12 |
    And the log text holds "older second" and not "older first"

  Scenario: A search answers the newest matches first with their positions and pages towards the older ones
    When "Jana" searches the log "backend.log" for "LINE"
    Then the response status is 200
    And the logs answer says:
      | matches.0.offset | 83    |
      | matches.1.offset | 36    |
      | matches.2.offset | 0     |
      | moreOlder        | false |
    When "Jana" searches the log "backend.log" for "line" with at most 1 match
    Then the logs answer says:
      | matches.0.offset | 83   |
      | moreOlder        | true |
      | scannedFrom      | 83   |
    When "Jana" searches the log "backend.log" for "line" before byte 83
    Then the logs answer says:
      | matches.0.offset | 36    |
      | matches.1.offset | 0     |
      | moreOlder        | false |
    When "Jana" searches the log "backend.log" for "("
    Then the response status is 400
    And the problem type ends with "operations/invalid-log-pattern"

  Scenario: An unknown or odd log name is not found and a missing folder is reported
    When "Jana" reads the log "missing.log"
    Then the response status is 404
    And the problem type ends with "operations/log-not-found"
    When "Jana" reads the log "odd name.log"
    Then the response status is 404
    Given the log folder does not exist
    When "Jana" asks for the log files
    Then the response status is 200
    And the logs answer says:
      | available | false |
    When "Jana" reads the log "backend.log"
    Then the response status is 409
    And the problem type ends with "operations/logs-unavailable"

  Scenario: A raised level is audited, listed, goes back when its time is up and can be reset earlier
    When "Jana" sets the logger "org.springframework.security" to "DEBUG" for 5 minutes
    Then the response status is 200
    And the logs answer says:
      | logger | org.springframework.security |
      | level  | DEBUG                        |
    And the logs answer has no "configuredBefore"
    And the admin action "CHANGE_LOG_LEVEL" by "Jana" is recorded with details containing "org.springframework.security nastaven na DEBUG"
    When "Jana" asks for the log levels
    Then the response status is 200
    And the logger "org.springframework.security" is listed at "DEBUG" with a temporary level
    And the diagnostics list the temporary level of "org.springframework.security"
    When the temporary levels run out
    Then the logger "org.springframework.security" is listed at "INFO" without a temporary level
    When "Jana" sets the logger "org.springframework.security" to "DEBUG" for 5 minutes
    And "Jana" resets the logger "org.springframework.security"
    Then the response status is 204
    And the admin action "RESET_LOG_LEVEL" by "Jana" is recorded with details containing "org.springframework.security vrácen na zděděnou úroveň"
    And the logger "org.springframework.security" is listed at "INFO" without a temporary level
    When "Jana" resets the logger "org.springframework.security"
    Then the response status is 404
    And the problem type ends with "operations/log-override-not-found"
    When "Jana" sets the logger "not a logger!" to "DEBUG" for 5 minutes
    Then the response status is 400
    And the problem type ends with "operations/invalid-logger-name"
    When "Jana" sets the logger "org.springframework.security" to "TRACE" for 5 minutes
    Then the response status is 400
    And the problem type ends with "operations/protected-logger"
    When "Jana" sets the logger "org.hibernate.orm.jdbc.bind" to "DEBUG" for 5 minutes
    Then the response status is 400
    And the problem type ends with "operations/protected-logger"
    When "Jana" sets the logger "org.springframework.security" to "DEBUG" for 0 minutes
    Then the response status is 400
    And the problem lists an error for field "minutes"

  Scenario: The diagnostics describe the JVM, the database, the disks and a thread dump
    When "Jana" asks for the diagnostics
    Then the response status is 200
    And the diagnostics say the database is reachable, the JVM has threads and the log folder is mounted
    When "Jana" asks for the thread dump
    Then the response status is 200
    And the thread dump names a thread

  Scenario: A donor without the administrator role and a visitor without a token are refused
    Given a person "Petr" is registered
    When "Petr" asks for the log files
    Then the response status is 403
    When "Petr" sets the logger "cz.novanadeje.app" to "DEBUG" for 5 minutes
    Then the response status is 403
    When someone without a token asks for the diagnostics
    Then the response status is 401
