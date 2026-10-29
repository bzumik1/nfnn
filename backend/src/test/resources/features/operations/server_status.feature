@operations
Feature: Anyone reads whether the server is up and which revision it runs, as the connector's status does

  Scenario: The health answers without a token
    When an anonymous client asks for the server's health
    Then the response status is 200
    And the server reports its status "UP"

  Scenario: The info names the running revision without a token
    When an anonymous client asks for the server's info
    Then the response status is 200
    And the info names the revision "dev"
