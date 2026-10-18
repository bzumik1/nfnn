Feature: Contact messages are deleted from the database a year after they were received

  Scenario: The retention job deletes a message older than a year and keeps a recent one
    Given a contact message from "Jana Nováková" received 366 days ago
    And a contact message from "Petr Svoboda" received 1 day ago
    When the contact message retention job runs
    Then the stored contact messages are only from "Petr Svoboda"

  Scenario: A message received just under a year ago is kept
    Given a contact message from "Jana Nováková" received 364 days ago
    When the contact message retention job runs
    Then the stored contact messages are only from "Jana Nováková"
